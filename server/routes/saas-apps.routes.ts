import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { insertSaasAppSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * /api/saas-apps:
 *   get:
 *     summary: Get all SaaS applications
 *     tags: [SaaS Apps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: approvalStatus
 *         schema:
 *           type: string
 *           enum: [pending, approved, denied]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SaaS apps retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { approvalStatus, category, search } = req.query;

    const apps = await storage.getSaasApps(req.user!.tenantId, {
      approvalStatus: approvalStatus as string,
      category: category as string,
      search: search as string
    });

    res.json(apps);
  } catch (error) {
    console.error('Failed to fetch SaaS apps:', error);
    res.status(500).json({ message: "Failed to fetch SaaS apps" });
  }
});

/**
 * @swagger
 * /api/saas-apps/stats:
 *   get:
 *     summary: Get SaaS app statistics
 *     tags: [SaaS Apps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
 */
router.get("/stats", authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getSaasAppStats(req.user!.tenantId);
    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch SaaS app stats:', error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

/**
 * @swagger
 * /api/saas-apps/{id}:
 *   get:
 *     summary: Get a single SaaS app
 *     tags: [SaaS Apps]
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
 *         description: SaaS app retrieved successfully
 *       404:
 *         description: SaaS app not found
 */
router.get("/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const app = await storage.getSaasApp(req.params.id, req.user!.tenantId);

    if (!app) {
      return res.status(404).json({ message: "SaaS app not found" });
    }

    res.json(app);
  } catch (error) {
    console.error('Failed to fetch SaaS app:', error);
    res.status(500).json({ message: "Failed to fetch SaaS app" });
  }
});

/**
 * @swagger
 * /api/saas-apps/{id}/users:
 *   get:
 *     summary: Get users with access to a SaaS app
 *     tags: [SaaS Apps]
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
 *         description: Users retrieved successfully
 */
router.get("/:id/users", authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await storage.getSaasAppUsers(req.params.id, req.user!.tenantId);
    res.json(users);
  } catch (error) {
    console.error('Failed to fetch SaaS app users:', error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/**
 * @swagger
 * /api/saas-apps:
 *   post:
 *     summary: Create a new SaaS app
 *     tags: [SaaS Apps]
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
 *         description: SaaS app created successfully
 */
router.post("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const appData = insertSaasAppSchema.parse({
      ...req.body,
      tenantId: req.user!.tenantId,
    });

    const app = await storage.createSaasApp(appData);

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.CREATE,
        resourceType: ResourceTypes.SAAS_APP,
        resourceId: app.id,
        description: `Created SaaS app: ${app.name}`,
        afterState: auditLogger.sanitizeForLogging(app)
      },
      req
    );

    res.status(201).json(app);
  } catch (error) {
    console.error('Failed to create SaaS app:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to create SaaS app" });
  }
});

/**
 * @swagger
 * /api/saas-apps/{id}:
 *   put:
 *     summary: Update a SaaS app
 *     tags: [SaaS Apps]
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
 *         description: SaaS app updated successfully
 *       404:
 *         description: SaaS app not found
 */
router.put("/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const originalApp = await storage.getSaasApp(req.params.id, req.user!.tenantId);

    const appData = insertSaasAppSchema.partial().parse(req.body);
    const app = await storage.updateSaasApp(req.params.id, req.user!.tenantId, appData);

    if (!app) {
      return res.status(404).json({ message: "SaaS app not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.SAAS_APP,
        resourceId: app.id,
        description: `Updated SaaS app: ${app.name}`,
        beforeState: originalApp,
        afterState: app
      },
      req
    );

    res.json(app);
  } catch (error) {
    console.error('Failed to update SaaS app:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to update SaaS app" });
  }
});

/**
 * @swagger
 * /api/saas-apps/{id}/approval-status:
 *   patch:
 *     summary: Update SaaS app approval status
 *     tags: [SaaS Apps]
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
 *               status:
 *                 type: string
 *                 enum: [pending, approved, denied]
 *     responses:
 *       200:
 *         description: Approval status updated successfully
 */
router.patch("/:id/approval-status", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!status || !['pending', 'approved', 'denied'].includes(status)) {
      return res.status(400).json({ message: "Invalid approval status" });
    }

    const app = await storage.updateSaasAppApprovalStatus(req.params.id, req.user!.tenantId, status);

    if (!app) {
      return res.status(404).json({ message: "SaaS app not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.SAAS_APP,
        resourceId: app.id,
        description: `Changed SaaS app approval status to: ${status}`,
        metadata: { previousStatus: req.body.previousStatus, newStatus: status }
      },
      req
    );

    res.json(app);
  } catch (error) {
    console.error('Failed to update approval status:', error);
    res.status(500).json({ message: "Failed to update approval status" });
  }
});

/**
 * @swagger
 * /api/saas-apps/{id}:
 *   delete:
 *     summary: Delete a SaaS app
 *     tags: [SaaS Apps]
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
 *         description: SaaS app deleted successfully
 *       404:
 *         description: SaaS app not found
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const app = await storage.getSaasApp(req.params.id, req.user!.tenantId);
    const success = await storage.deleteSaasApp(req.params.id, req.user!.tenantId);

    if (!success) {
      return res.status(404).json({ message: "SaaS app not found" });
    }

    // Audit log
    if (app) {
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.DELETE,
          resourceType: ResourceTypes.SAAS_APP,
          resourceId: req.params.id,
          description: `Deleted SaaS app: ${app.name}`,
          beforeState: app
        },
        req
      );
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete SaaS app:', error);
    res.status(500).json({ message: "Failed to delete SaaS app" });
  }
});

export default router;
