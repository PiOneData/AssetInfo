/**
 * Policy Automation Routes
 *
 * Provides endpoints for self-healing IT policies:
 * - Create and manage IF-THEN policies
 * - View policy execution history
 * - Use pre-built templates
 * - Test policies with sample data
 * - Manage policy approvals
 *
 * Target: 50% reduction in IT toil through automation
 */

import { Router, Request, Response } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { policyEngine } from "../services/policy/engine";
import { storage } from "../storage";

const router = Router();

/**
 * @swagger
 * /api/policies:
 *   get:
 *     summary: List all policies
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policies retrieved successfully
 */
router.get("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const policies = await storage.getAutomatedPolicies(req.user!.tenantId);
    res.json(policies);
  } catch (error) {
    console.error('Failed to fetch policies:', error);
    res.status(500).json({ message: "Failed to fetch policies" });
  }
});

/**
 * @swagger
 * /api/policies:
 *   post:
 *     summary: Create new policy
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Policy created successfully
 */
router.post("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      triggerType,
      triggerConfig,
      conditions,
      actions,
      cooldownMinutes,
      maxExecutionsPerDay,
      requireApproval
    } = req.body;

    if (!name || !triggerType || !triggerConfig || !actions) {
      return res.status(400).json({ message: "name, triggerType, triggerConfig, and actions are required" });
    }

    // Validate trigger type
    const validTriggers = [
      'app_discovered',
      'license_unused',
      'oauth_risky_permission',
      'user_offboarded',
      'renewal_approaching',
      'budget_exceeded'
    ];

    if (!validTriggers.includes(triggerType)) {
      return res.status(400).json({ message: `Invalid trigger type. Must be one of: ${validTriggers.join(', ')}` });
    }

    // Validate actions
    const validActions = [
      'send_alert',
      'create_ticket',
      'block_app',
      'revoke_access',
      'reclaim_license',
      'notify_department_head'
    ];

    for (const action of actions) {
      if (!validActions.includes(action.type)) {
        return res.status(400).json({ message: `Invalid action type: ${action.type}` });
      }
    }

    const policy = await storage.createAutomatedPolicy({
      tenantId: req.user!.tenantId,
      name,
      description,
      triggerType,
      triggerConfig,
      conditions,
      actions,
      cooldownMinutes,
      maxExecutionsPerDay,
      requireApproval,
      createdBy: req.user!.id
    });

    res.status(201).json(policy);
  } catch (error) {
    console.error('Failed to create policy:', error);
    res.status(500).json({ message: "Failed to create policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}:
 *   get:
 *     summary: Get policy by ID
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy retrieved successfully
 */
router.get("/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const policy = await storage.getAutomatedPolicy(req.params.id, req.user!.tenantId);

    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json(policy);
  } catch (error) {
    console.error('Failed to fetch policy:', error);
    res.status(500).json({ message: "Failed to fetch policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}:
 *   put:
 *     summary: Update policy
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy updated successfully
 */
router.put("/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const updated = await storage.updateAutomatedPolicy(req.params.id, req.user!.tenantId, req.body);

    if (!updated) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error('Failed to update policy:', error);
    res.status(500).json({ message: "Failed to update policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}:
 *   delete:
 *     summary: Delete policy
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy deleted successfully
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const deleted = await storage.deleteAutomatedPolicy(req.params.id, req.user!.tenantId);

    if (!deleted) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json({ message: "Policy deleted successfully" });
  } catch (error) {
    console.error('Failed to delete policy:', error);
    res.status(500).json({ message: "Failed to delete policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}/enable:
 *   post:
 *     summary: Enable policy
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy enabled successfully
 */
router.post("/:id/enable", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const updated = await storage.updateAutomatedPolicy(req.params.id, req.user!.tenantId, { enabled: true });

    if (!updated) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json({ message: "Policy enabled successfully", policy: updated });
  } catch (error) {
    console.error('Failed to enable policy:', error);
    res.status(500).json({ message: "Failed to enable policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}/disable:
 *   post:
 *     summary: Disable policy
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy disabled successfully
 */
router.post("/:id/disable", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const updated = await storage.updateAutomatedPolicy(req.params.id, req.user!.tenantId, { enabled: false });

    if (!updated) {
      return res.status(404).json({ message: "Policy not found" });
    }

    res.json({ message: "Policy disabled successfully", policy: updated });
  } catch (error) {
    console.error('Failed to disable policy:', error);
    res.status(500).json({ message: "Failed to disable policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}/test:
 *   post:
 *     summary: Test policy with sample data
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy test completed
 */
router.post("/:id/test", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const { testData } = req.body;

    const result = await policyEngine.triggerPolicy(req.params.id, req.user!.tenantId, testData);

    res.json(result);
  } catch (error) {
    console.error('Failed to test policy:', error);
    res.status(500).json({ message: "Failed to test policy" });
  }
});

/**
 * @swagger
 * /api/policies/{id}/executions:
 *   get:
 *     summary: Get policy execution history
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Execution history retrieved
 */
router.get("/:id/executions", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const executions = await storage.getPolicyExecutions(req.user!.tenantId, { policyId: req.params.id });
    res.json(executions);
  } catch (error) {
    console.error('Failed to fetch executions:', error);
    res.status(500).json({ message: "Failed to fetch executions" });
  }
});

/**
 * @swagger
 * /api/policies/{id}/stats:
 *   get:
 *     summary: Get policy statistics
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get("/:id/stats", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const policy = await storage.getAutomatedPolicy(req.params.id, req.user!.tenantId);

    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    const successRate = policy.executionCount && policy.executionCount > 0
      ? Math.round((policy.successCount || 0) / policy.executionCount * 100)
      : 0;

    res.json({
      executionCount: policy.executionCount || 0,
      successCount: policy.successCount || 0,
      failureCount: policy.failureCount || 0,
      successRate,
      lastExecutedAt: policy.lastExecutedAt
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

/**
 * @swagger
 * /api/policy-templates:
 *   get:
 *     summary: List policy templates
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get("/templates", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const templates = await storage.getPolicyTemplates(category ? { category } : undefined);
    res.json(templates);
  } catch (error) {
    console.error('Failed to fetch templates:', error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

/**
 * @swagger
 * /api/policy-templates/{id}/use:
 *   post:
 *     summary: Create policy from template
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Policy created from template
 */
router.post("/templates/:id/use", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const { name, ...overrides } = req.body;

    const template = await storage.getPolicyTemplate(req.params.id);

    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    const policy = await storage.createAutomatedPolicy({
      tenantId: req.user!.tenantId,
      name: name || template.name,
      description: template.description,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      conditions: template.conditions,
      actions: template.actions,
      ...overrides,
      createdBy: req.user!.id
    });

    // Increment template popularity
    await storage.incrementTemplatePopularity(req.params.id);

    res.status(201).json(policy);
  } catch (error) {
    console.error('Failed to create policy from template:', error);
    res.status(500).json({ message: "Failed to create policy from template" });
  }
});

/**
 * @swagger
 * /api/policies/test-event:
 *   post:
 *     summary: Emit test event to trigger policies
 *     tags: [Policies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Event emitted successfully
 */
router.post("/test-event", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { eventType, eventData } = req.body;

    const eventSystem = policyEngine.getEventSystem();
    eventSystem.emit(eventType, { ...eventData, tenantId: req.user!.tenantId });

    res.json({ message: "Event emitted successfully" });
  } catch (error) {
    console.error('Failed to emit event:', error);
    res.status(500).json({ message: "Failed to emit event" });
  }
});

export default router;
