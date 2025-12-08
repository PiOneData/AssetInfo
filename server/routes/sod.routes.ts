/**
 * Segregation of Duties (SoD) API Routes (Phase 6.3)
 * SoD rule management and violation detection
 */

import { Router } from "express";
import { storage } from "../storage";
import { SodService } from "../services/advanced/sod";
import type { Request, Response } from "express";

const router = Router();

// ============================================================================
// SoD Rules
// ============================================================================

/**
 * GET /api/sod/rules
 * Get all SoD rules (with optional filters)
 */
router.get("/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive, severity } = req.query;

    const rules = await storage.getSodRules(tenantId, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      severity: severity as string,
    });

    res.json(rules);
  } catch (error) {
    console.error("[SoD] Error fetching rules:", error);
    res.status(500).json({ error: "Failed to fetch SoD rules" });
  }
});

/**
 * GET /api/sod/rules/:id
 * Get a specific SoD rule
 */
router.get("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rule = await storage.getSodRule(req.params.id, tenantId);

    if (!rule) {
      return res.status(404).json({ error: "SoD rule not found" });
    }

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error fetching rule:", error);
    res.status(500).json({ error: "Failed to fetch SoD rule" });
  }
});

/**
 * POST /api/sod/rules
 * Create a new SoD rule
 */
router.post("/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const rule = await service.createRule(req.body);

    res.status(201).json(rule);
  } catch (error) {
    console.error("[SoD] Error creating rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create SoD rule"
    });
  }
});

/**
 * PATCH /api/sod/rules/:id
 * Update an SoD rule
 */
router.patch("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const rule = await service.updateRule(req.params.id, req.body);

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error updating rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update SoD rule"
    });
  }
});

/**
 * DELETE /api/sod/rules/:id
 * Delete an SoD rule
 */
router.delete("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    await service.deleteRule(req.params.id);

    res.json({ message: "SoD rule deleted successfully" });
  } catch (error) {
    console.error("[SoD] Error deleting rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete SoD rule"
    });
  }
});

/**
 * POST /api/sod/rules/:id/toggle
 * Toggle SoD rule active status
 */
router.post("/rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive } = req.body;

    const service = new SodService(tenantId);
    const rule = await service.toggleRule(req.params.id, isActive);

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error toggling rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to toggle SoD rule"
    });
  }
});

// ============================================================================
// SoD Violations
// ============================================================================

/**
 * GET /api/sod/violations
 * Get all SoD violations (with optional filters)
 */
router.get("/violations", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, status, severity } = req.query;

    const violations = await storage.getSodViolations(tenantId, {
      userId: userId as string,
      status: status as string,
      severity: severity as string,
    });

    res.json(violations);
  } catch (error) {
    console.error("[SoD] Error fetching violations:", error);
    res.status(500).json({ error: "Failed to fetch SoD violations" });
  }
});

/**
 * GET /api/sod/violations/:id
 * Get a specific SoD violation
 */
router.get("/violations/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const violation = await storage.getSodViolation(req.params.id, tenantId);

    if (!violation) {
      return res.status(404).json({ error: "SoD violation not found" });
    }

    res.json(violation);
  } catch (error) {
    console.error("[SoD] Error fetching violation:", error);
    res.status(500).json({ error: "Failed to fetch SoD violation" });
  }
});

/**
 * GET /api/sod/violations/user/:userId
 * Get violations for a specific user
 */
router.get("/violations/user/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const violations = await service.getUserViolations(req.params.userId);

    res.json(violations);
  } catch (error) {
    console.error("[SoD] Error fetching user violations:", error);
    res.status(500).json({ error: "Failed to fetch user violations" });
  }
});

/**
 * POST /api/sod/violations/:id/remediate
 * Remediate a violation (revoke one of the conflicting accesses)
 */
router.post("/violations/:id/remediate", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { revokeAppId, notes } = req.body;

    const service = new SodService(tenantId);
    await service.remediateViolation(req.params.id, revokeAppId, userId, notes);

    res.json({ message: "Violation remediated successfully" });
  } catch (error) {
    console.error("[SoD] Error remediating violation:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to remediate violation"
    });
  }
});

/**
 * POST /api/sod/violations/:id/accept
 * Accept a violation with justification
 */
router.post("/violations/:id/accept", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { justification } = req.body;

    const service = new SodService(tenantId);
    await service.acceptViolation(req.params.id, userId, justification);

    res.json({ message: "Violation accepted successfully" });
  } catch (error) {
    console.error("[SoD] Error accepting violation:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to accept violation"
    });
  }
});

// ============================================================================
// SoD Checks & Scanning
// ============================================================================

/**
 * POST /api/sod/check
 * Check if a user-app combination would violate any SoD rules
 */
router.post("/check", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, appId } = req.body;

    const service = new SodService(tenantId);
    const violations = await service.checkViolation(userId, appId);

    res.json({ violations, hasViolations: violations.length > 0 });
  } catch (error) {
    console.error("[SoD] Error checking violations:", error);
    res.status(500).json({ error: "Failed to check SoD violations" });
  }
});

/**
 * POST /api/sod/scan
 * Scan all users for SoD violations
 */
router.post("/scan", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ruleId } = req.body;

    const service = new SodService(tenantId);
    const result = await service.scanForViolations(ruleId);

    res.json(result);
  } catch (error) {
    console.error("[SoD] Error scanning for violations:", error);
    res.status(500).json({ error: "Failed to scan for violations" });
  }
});

/**
 * GET /api/sod/compliance-report
 * Get compliance report
 */
router.get("/compliance-report", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { framework } = req.query;

    const service = new SodService(tenantId);
    const report = await service.getComplianceReport(framework as string);

    res.json(report);
  } catch (error) {
    console.error("[SoD] Error generating compliance report:", error);
    res.status(500).json({ error: "Failed to generate compliance report" });
  }
});

export default router;
