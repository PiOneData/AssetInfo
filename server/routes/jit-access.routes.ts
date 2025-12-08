/**
 * JIT Access API Routes (Phase 6.2)
 * Just-In-Time access management for temporary privilege elevation
 */

import { Router } from "express";
import { storage } from "../storage";
import { JitAccessService } from "../services/advanced/jit-access";
import type { Request, Response } from "express";

const router = Router();

/**
 * GET /api/jit-access
 * Get all JIT access sessions (with optional filters)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, appId, status } = req.query;

    const sessions = await storage.getJitAccessSessions(tenantId, {
      userId: userId as string,
      appId: appId as string,
      status: status as string,
    });

    res.json(sessions);
  } catch (error) {
    console.error("[JitAccess] Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch JIT access sessions" });
  }
});

/**
 * GET /api/jit-access/:id
 * Get a specific JIT access session
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const session = await storage.getJitAccessSession(req.params.id, tenantId);

    if (!session) {
      return res.status(404).json({ error: "JIT access session not found" });
    }

    res.json(session);
  } catch (error) {
    console.error("[JitAccess] Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch JIT access session" });
  }
});

/**
 * GET /api/jit-access/active/all
 * Get all active JIT sessions
 */
router.get("/active/all", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sessions = await storage.getActiveJitSessions(tenantId);

    res.json(sessions);
  } catch (error) {
    console.error("[JitAccess] Error fetching active sessions:", error);
    res.status(500).json({ error: "Failed to fetch active sessions" });
  }
});

/**
 * GET /api/jit-access/user/:userId/active
 * Get active sessions for a user
 */
router.get("/user/:userId/active", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    const sessions = await service.getUserActiveSessions(req.params.userId);

    res.json(sessions);
  } catch (error) {
    console.error("[JitAccess] Error fetching user sessions:", error);
    res.status(500).json({ error: "Failed to fetch user sessions" });
  }
});

/**
 * GET /api/jit-access/pending/approver/:approverId
 * Get pending approvals for an approver
 */
router.get("/pending/approver/:approverId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    const sessions = await service.getPendingApprovals(req.params.approverId);

    res.json(sessions);
  } catch (error) {
    console.error("[JitAccess] Error fetching pending approvals:", error);
    res.status(500).json({ error: "Failed to fetch pending approvals" });
  }
});

/**
 * POST /api/jit-access
 * Request temporary elevated access
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    const result = await service.requestAccess(req.body);

    res.status(201).json(result);
  } catch (error) {
    console.error("[JitAccess] Error requesting access:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to request JIT access"
    });
  }
});

/**
 * POST /api/jit-access/:id/review
 * Approve or deny a JIT access request
 */
router.post("/:id/review", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    await service.reviewRequest({
      sessionId: req.params.id,
      ...req.body,
    });

    res.json({ message: "JIT access request reviewed successfully" });
  } catch (error) {
    console.error("[JitAccess] Error reviewing request:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to review JIT access request"
    });
  }
});

/**
 * POST /api/jit-access/:id/verify-mfa
 * Verify MFA and activate JIT session
 */
router.post("/:id/verify-mfa", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    await service.verifyMfaAndActivate(req.params.id, userId);

    res.json({ message: "MFA verified, JIT session activated" });
  } catch (error) {
    console.error("[JitAccess] Error verifying MFA:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to verify MFA"
    });
  }
});

/**
 * POST /api/jit-access/:id/extend
 * Extend a JIT session
 */
router.post("/:id/extend", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { additionalHours, justification } = req.body;

    const service = new JitAccessService(tenantId);
    await service.extendSession(req.params.id, userId, additionalHours, justification);

    res.json({ message: "JIT session extended successfully" });
  } catch (error) {
    console.error("[JitAccess] Error extending session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to extend JIT session"
    });
  }
});

/**
 * POST /api/jit-access/:id/revoke
 * Manually revoke a JIT session
 */
router.post("/:id/revoke", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { reason } = req.body;

    const service = new JitAccessService(tenantId);
    await service.revokeSession(req.params.id, userId, reason);

    res.json({ message: "JIT session revoked successfully" });
  } catch (error) {
    console.error("[JitAccess] Error revoking session:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to revoke JIT session"
    });
  }
});

/**
 * POST /api/jit-access/revoke-expired
 * Revoke all expired JIT sessions (admin only, typically called by scheduler)
 */
router.post("/revoke-expired", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new JitAccessService(tenantId);
    await service.revokeExpiredSessions();

    res.json({ message: "Expired sessions revoked successfully" });
  } catch (error) {
    console.error("[JitAccess] Error revoking expired sessions:", error);
    res.status(500).json({ error: "Failed to revoke expired sessions" });
  }
});

export default router;
