import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { insertSaasContractSchema } from "@shared/schema";
import { z } from "zod";
import { policyEngine } from "../services/policy/engine";

const router = Router();

/**
 * @swagger
 * /api/saas-contracts:
 *   get:
 *     summary: Get all SaaS contracts
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, expired, cancelled, pending]
 *       - in: query
 *         name: appId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contracts retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { status, appId } = req.query;

    const contracts = await storage.getSaasContracts(req.user!.tenantId, {
      status: status as string,
      appId: appId as string
    });

    res.json(contracts);
  } catch (error) {
    console.error('Failed to fetch SaaS contracts:', error);
    res.status(500).json({ message: "Failed to fetch SaaS contracts" });
  }
});

/**
 * @swagger
 * /api/saas-contracts/renewals:
 *   get:
 *     summary: Get upcoming contract renewals
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Upcoming renewals retrieved successfully
 */
router.get("/renewals", authenticateToken, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const renewals = await storage.getUpcomingRenewals(req.user!.tenantId, days);

    // Emit policy events for approaching renewals
    const eventSystem = policyEngine.getEventSystem();
    for (const renewal of renewals) {
      if (renewal.renewalDate) {
        const daysUntilRenewal = Math.ceil(
          (new Date(renewal.renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        eventSystem.emit('contract.renewal_approaching', {
          tenantId: req.user!.tenantId,
          contractId: renewal.id,
          appId: renewal.appId || '',
          appName: renewal.vendor || 'Unknown',
          daysUntilRenewal,
          contractValue: renewal.annualValue || 0,
          autoRenew: renewal.autoRenew || false
        });
      }
    }

    res.json(renewals);
  } catch (error) {
    console.error('Failed to fetch upcoming renewals:', error);
    res.status(500).json({ message: "Failed to fetch renewals" });
  }
});

/**
 * @swagger
 * /api/saas-contracts/{id}:
 *   get:
 *     summary: Get a single SaaS contract
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contract retrieved successfully
 *       404:
 *         description: Contract not found
 */
router.get("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const contract = await storage.getSaasContract(req.params.id, req.user!.tenantId);

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    console.error('Failed to fetch contract:', error);
    res.status(500).json({ message: "Failed to fetch contract" });
  }
});

/**
 * @swagger
 * /api/saas-contracts:
 *   post:
 *     summary: Create a new SaaS contract
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Contract created successfully
 */
router.post("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const contractData = insertSaasContractSchema.parse({
      ...req.body,
      tenantId: req.user!.tenantId,
    });

    const contract = await storage.createSaasContract(contractData);

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.CREATE,
        resourceType: ResourceTypes.SAAS_CONTRACT,
        resourceId: contract.id,
        description: `Created SaaS contract for: ${contract.vendor}`,
        afterState: auditLogger.sanitizeForLogging(contract)
      },
      req
    );

    res.status(201).json(contract);
  } catch (error) {
    console.error('Failed to create contract:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to create contract" });
  }
});

/**
 * @swagger
 * /api/saas-contracts/{id}:
 *   put:
 *     summary: Update a SaaS contract
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Contract updated successfully
 *       404:
 *         description: Contract not found
 */
router.put("/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const originalContract = await storage.getSaasContract(req.params.id, req.user!.tenantId);

    const contractData = insertSaasContractSchema.partial().parse(req.body);
    const contract = await storage.updateSaasContract(req.params.id, req.user!.tenantId, contractData);

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.SAAS_CONTRACT,
        resourceId: contract.id,
        description: `Updated SaaS contract for: ${contract.vendor}`,
        beforeState: originalContract,
        afterState: contract
      },
      req
    );

    res.json(contract);
  } catch (error) {
    console.error('Failed to update contract:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to update contract" });
  }
});

/**
 * @swagger
 * /api/saas-contracts/{id}/renewal-alert:
 *   patch:
 *     summary: Mark contract renewal as alerted
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Renewal alert updated successfully
 */
router.patch("/:id/renewal-alert", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const contract = await storage.updateRenewalAlerted(req.params.id, req.user!.tenantId);

    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    console.error('Failed to update renewal alert:', error);
    res.status(500).json({ message: "Failed to update renewal alert" });
  }
});

/**
 * @swagger
 * /api/saas-contracts/{id}:
 *   delete:
 *     summary: Delete a SaaS contract
 *     tags: [SaaS Contracts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Contract deleted successfully
 *       404:
 *         description: Contract not found
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const contract = await storage.getSaasContract(req.params.id, req.user!.tenantId);
    const success = await storage.deleteSaasContract(req.params.id, req.user!.tenantId);

    if (!success) {
      return res.status(404).json({ message: "Contract not found" });
    }

    // Audit log
    if (contract) {
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.DELETE,
          resourceType: ResourceTypes.SAAS_CONTRACT,
          resourceId: req.params.id,
          description: `Deleted SaaS contract for: ${contract.vendor}`,
          beforeState: contract
        },
        req
      );
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete contract:', error);
    res.status(500).json({ message: "Failed to delete contract" });
  }
});

export default router;
