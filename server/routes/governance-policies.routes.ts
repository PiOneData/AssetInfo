import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { insertGovernancePolicySchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * /api/governance-policies:
 *   get:
 *     summary: Get all governance policies
 *     tags: [Governance Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: policyType
 *         schema:
 *           type: string
 *       - in: query
 *         name: enabled
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Policies retrieved successfully
 */
router.get("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const { policyType, enabled } = req.query;

    const policies = await storage.getGovernancePolicies(req.user!.tenantId, {
      policyType: policyType as string,
      enabled: enabled ? enabled === 'true' : undefined
    });

    res.json(policies);
  } catch (error) {
    console.error('Failed to fetch governance policies:', error);
    res.status(500).json({ message: "Failed to fetch governance policies" });
  }
});

/**
 * @swagger
 * /api/governance-policies/{id}:
 *   get:
 *     summary: Get a single governance policy
 *     tags: [Governance Policies]
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
 *         description: Policy retrieved successfully
 *       404:
 *         description: Policy not found
 */
router.get("/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const policy = await storage.getGovernancePolicy(req.params.id, req.user!.tenantId);

    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json(policy);
  } catch (error) {
    console.error('Failed to fetch governance policy:', error);
    res.status(500).json({ message: "Failed to fetch governance policy" });
  }
});

/**
 * @swagger
 * /api/governance-policies:
 *   post:
 *     summary: Create a new governance policy
 *     tags: [Governance Policies]
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
 *         description: Policy created successfully
 */
router.post("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const policyData = insertGovernancePolicySchema.parse({
      ...req.body,
      tenantId: req.user!.tenantId,
      createdBy: req.user!.id,
    });

    const policy = await storage.createGovernancePolicy(policyData);

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.CREATE,
        resourceType: ResourceTypes.GOVERNANCE_POLICY,
        resourceId: policy.id,
        description: `Created governance policy: ${policy.name}`,
        afterState: auditLogger.sanitizeForLogging(policy)
      },
      req
    );

    res.status(201).json(policy);
  } catch (error) {
    console.error('Failed to create governance policy:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to create governance policy" });
  }
});

/**
 * @swagger
 * /api/governance-policies/{id}:
 *   put:
 *     summary: Update a governance policy
 *     tags: [Governance Policies]
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
 *         description: Policy updated successfully
 *       404:
 *         description: Policy not found
 */
router.put("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const originalPolicy = await storage.getGovernancePolicy(req.params.id, req.user!.tenantId);

    const policyData = insertGovernancePolicySchema.partial().parse(req.body);
    const policy = await storage.updateGovernancePolicy(req.params.id, req.user!.tenantId, policyData);

    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.GOVERNANCE_POLICY,
        resourceId: policy.id,
        description: `Updated governance policy: ${policy.name}`,
        beforeState: originalPolicy,
        afterState: policy
      },
      req
    );

    res.json(policy);
  } catch (error) {
    console.error('Failed to update governance policy:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to update governance policy" });
  }
});

/**
 * @swagger
 * /api/governance-policies/{id}/toggle:
 *   patch:
 *     summary: Enable or disable a governance policy
 *     tags: [Governance Policies]
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
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Policy toggle updated successfully
 */
router.patch("/:id/toggle", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }

    const policy = await storage.toggleGovernancePolicy(req.params.id, req.user!.tenantId, enabled);

    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.GOVERNANCE_POLICY,
        resourceId: policy.id,
        description: `${enabled ? 'Enabled' : 'Disabled'} governance policy: ${policy.name}`,
        metadata: { enabled }
      },
      req
    );

    res.json(policy);
  } catch (error) {
    console.error('Failed to toggle governance policy:', error);
    res.status(500).json({ message: "Failed to toggle policy" });
  }
});

/**
 * @swagger
 * /api/governance-policies/{id}:
 *   delete:
 *     summary: Delete a governance policy
 *     tags: [Governance Policies]
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
 *         description: Policy deleted successfully
 *       404:
 *         description: Policy not found
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const policy = await storage.getGovernancePolicy(req.params.id, req.user!.tenantId);
    const success = await storage.deleteGovernancePolicy(req.params.id, req.user!.tenantId);

    if (!success) {
      return res.status(404).json({ message: "Policy not found" });
    }

    // Audit log
    if (policy) {
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.DELETE,
          resourceType: ResourceTypes.GOVERNANCE_POLICY,
          resourceId: req.params.id,
          description: `Deleted governance policy: ${policy.name}`,
          beforeState: policy
        },
        req
      );
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete governance policy:', error);
    res.status(500).json({ message: "Failed to delete governance policy" });
  }
});

export default router;
