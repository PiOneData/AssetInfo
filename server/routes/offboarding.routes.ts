/**
 * Offboarding Automation Routes
 *
 * Provides endpoints for automated user offboarding:
 * - Create and execute offboarding requests
 * - Manage playbook templates
 * - Generate audit reports
 * - Preview offboarding actions
 *
 * Target: Reduce offboarding from 2 hours to 5 minutes
 */

import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { OffboardingOrchestrator } from "../services/offboarding/orchestrator";
import { PlaybookEngine } from "../services/offboarding/playbook-engine";
import { AuditReportGenerator } from "../services/offboarding/audit-report";

const router = Router();

/**
 * @swagger
 * /api/offboarding/preview/{userId}:
 *   post:
 *     summary: Preview offboarding for a user
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offboarding preview generated
 */
router.post("/preview/:userId", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const orchestrator = new OffboardingOrchestrator(req.user!.tenantId);
    const preview = await orchestrator.previewOffboarding(req.params.userId);

    res.json(preview);
  } catch (error) {
    console.error('Failed to preview offboarding:', error);
    res.status(500).json({ message: "Failed to preview offboarding" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests:
 *   post:
 *     summary: Create offboarding request
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Offboarding request created
 */
router.post("/requests", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { userId, playbookId, reason, transferToUserId, notes } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const orchestrator = new OffboardingOrchestrator(req.user!.tenantId);
    const requestId = await orchestrator.createRequest({
      userId,
      playbookId,
      reason,
      transferToUserId,
      notes,
      initiatedBy: req.user!.id
    });

    res.status(201).json({ requestId, message: "Offboarding request created successfully" });
  } catch (error) {
    console.error('Failed to create offboarding request:', error);
    res.status(500).json({ message: "Failed to create offboarding request" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests:
 *   get:
 *     summary: List all offboarding requests
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offboarding requests retrieved
 */
router.get("/requests", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    // This would need a storage method - for now return empty array
    res.json([]);
  } catch (error) {
    console.error('Failed to fetch offboarding requests:', error);
    res.status(500).json({ message: "Failed to fetch offboarding requests" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests/{id}:
 *   get:
 *     summary: Get offboarding request details
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offboarding request details retrieved
 */
router.get("/requests/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const orchestrator = new OffboardingOrchestrator(req.user!.tenantId);
    const status = await orchestrator.getStatus(req.params.id);

    res.json(status);
  } catch (error) {
    console.error('Failed to fetch offboarding request:', error);
    res.status(500).json({ message: "Failed to fetch offboarding request" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests/{id}/execute:
 *   post:
 *     summary: Execute offboarding workflow
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offboarding execution started
 */
router.post("/requests/:id/execute", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const orchestrator = new OffboardingOrchestrator(req.user!.tenantId);

    // Execute async (don't wait for completion)
    orchestrator.executeOffboarding(req.params.id).catch(error => {
      console.error('Offboarding execution failed:', error);
    });

    res.json({ message: "Offboarding execution started" });
  } catch (error) {
    console.error('Failed to execute offboarding:', error);
    res.status(500).json({ message: "Failed to execute offboarding" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests/{id}/cancel:
 *   post:
 *     summary: Cancel offboarding request
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Offboarding cancelled
 */
router.post("/requests/:id/cancel", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const orchestrator = new OffboardingOrchestrator(req.user!.tenantId);
    await orchestrator.cancelOffboarding(req.params.id);

    res.json({ message: "Offboarding cancelled successfully" });
  } catch (error) {
    console.error('Failed to cancel offboarding:', error);
    res.status(500).json({ message: "Failed to cancel offboarding" });
  }
});

/**
 * @swagger
 * /api/offboarding/requests/{id}/audit:
 *   get:
 *     summary: Get audit report
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit report retrieved
 */
router.get("/requests/:id/audit", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const generator = new AuditReportGenerator(req.user!.tenantId);
    const report = await generator.getReportAsJSON(req.params.id);

    res.json(report);
  } catch (error) {
    console.error('Failed to generate audit report:', error);
    res.status(500).json({ message: "Failed to generate audit report" });
  }
});

/**
 * @swagger
 * /api/offboarding/playbooks:
 *   get:
 *     summary: List all playbooks
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Playbooks retrieved
 */
router.get("/playbooks", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const engine = new PlaybookEngine(req.user!.tenantId);
    const playbooks = await engine.getAllPlaybooks();

    res.json(playbooks);
  } catch (error) {
    console.error('Failed to fetch playbooks:', error);
    res.status(500).json({ message: "Failed to fetch playbooks" });
  }
});

/**
 * @swagger
 * /api/offboarding/playbooks:
 *   post:
 *     summary: Create new playbook
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Playbook created
 */
router.post("/playbooks", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { name, type, description, steps, isDefault } = req.body;

    if (!name || !type || !steps) {
      return res.status(400).json({ message: "name, type, and steps are required" });
    }

    const engine = new PlaybookEngine(req.user!.tenantId);

    // Validate steps
    const validation = engine.validatePlaybook(steps);
    if (!validation.valid) {
      return res.status(400).json({ message: "Invalid playbook", errors: validation.errors });
    }

    const playbook = await engine.createPlaybook(
      name,
      type,
      steps,
      description,
      isDefault || false,
      req.user!.id
    );

    res.status(201).json(playbook);
  } catch (error) {
    console.error('Failed to create playbook:', error);
    res.status(500).json({ message: "Failed to create playbook" });
  }
});

/**
 * @swagger
 * /api/offboarding/playbooks/{id}:
 *   get:
 *     summary: Get playbook by ID
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Playbook retrieved
 */
router.get("/playbooks/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const engine = new PlaybookEngine(req.user!.tenantId);
    const playbook = await engine.getPlaybook(req.params.id);

    if (!playbook) {
      return res.status(404).json({ message: "Playbook not found" });
    }

    res.json(playbook);
  } catch (error) {
    console.error('Failed to fetch playbook:', error);
    res.status(500).json({ message: "Failed to fetch playbook" });
  }
});

/**
 * @swagger
 * /api/offboarding/playbooks/{id}:
 *   put:
 *     summary: Update playbook
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Playbook updated
 */
router.put("/playbooks/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { name, description, steps, isDefault } = req.body;

    const engine = new PlaybookEngine(req.user!.tenantId);

    // Validate steps if provided
    if (steps) {
      const validation = engine.validatePlaybook(steps);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid playbook", errors: validation.errors });
      }
    }

    const playbook = await engine.updatePlaybook(req.params.id, {
      name,
      description,
      steps,
      isDefault
    });

    if (!playbook) {
      return res.status(404).json({ message: "Playbook not found" });
    }

    res.json(playbook);
  } catch (error) {
    console.error('Failed to update playbook:', error);
    res.status(500).json({ message: "Failed to update playbook" });
  }
});

/**
 * @swagger
 * /api/offboarding/playbooks/{id}:
 *   delete:
 *     summary: Delete playbook
 *     tags: [Offboarding]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Playbook deleted
 */
router.delete("/playbooks/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const engine = new PlaybookEngine(req.user!.tenantId);
    const deleted = await engine.deletePlaybook(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Playbook not found" });
    }

    res.json({ message: "Playbook deleted successfully" });
  } catch (error) {
    console.error('Failed to delete playbook:', error);
    res.status(500).json({ message: "Failed to delete playbook" });
  }
});

export default router;
