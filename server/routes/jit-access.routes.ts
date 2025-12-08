/**
 * JIT Access API Routes (Phase 6.2)
 * Just-In-Time access management for temporary privilege elevation
 * @swagger
 * tags:
 *   name: JIT Access
 *   description: Just-In-Time temporary privilege elevation with auto-revocation
 */

import { Router } from "express";
import { storage } from "../storage";
import { JitAccessService } from "../services/advanced/jit-access";
import type { Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/jit-access:
 *   get:
 *     tags: [JIT Access]
 *     summary: Get all JIT access sessions
 *     description: Retrieve JIT sessions with optional filtering
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: appId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by application ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_approval, pending_mfa, active, expired, revoked, denied]
 *         description: Filter by session status
 *     responses:
 *       200:
 *         description: List of JIT sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JitAccessSession'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/{id}:
 *   get:
 *     tags: [JIT Access]
 *     summary: Get a specific JIT access session
 *     description: Retrieve details of a single JIT session by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: JIT session ID
 *     responses:
 *       200:
 *         description: JIT session details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/JitAccessSession'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/active/all:
 *   get:
 *     tags: [JIT Access]
 *     summary: Get all active JIT sessions
 *     description: Retrieve all currently active JIT sessions
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of active JIT sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JitAccessSession'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/user/{userId}/active:
 *   get:
 *     tags: [JIT Access]
 *     summary: Get active sessions for a user
 *     description: Retrieve all active JIT sessions for a specific user
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user's active sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JitAccessSession'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/pending/approver/{approverId}:
 *   get:
 *     tags: [JIT Access]
 *     summary: Get pending approvals for an approver
 *     description: Retrieve JIT sessions pending approval from a specific approver
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: approverId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Approver user ID
 *     responses:
 *       200:
 *         description: List of pending JIT sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/JitAccessSession'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access:
 *   post:
 *     tags: [JIT Access]
 *     summary: Request temporary elevated access
 *     description: Request JIT access for temporary privilege elevation (4/8/24/72 hours)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - appId
 *               - accessType
 *               - justification
 *               - durationHours
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               appId:
 *                 type: string
 *                 format: uuid
 *               accessType:
 *                 type: string
 *                 enum: [viewer, member, admin, owner]
 *               justification:
 *                 type: string
 *               durationHours:
 *                 type: integer
 *                 enum: [4, 8, 24, 72]
 *                 description: Duration in hours (4, 8, 24, or 72)
 *               requiresMfa:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: JIT access request created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                 requiresMfa:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/{id}/review:
 *   post:
 *     tags: [JIT Access]
 *     summary: Approve or deny a JIT access request
 *     description: Review a JIT access request and approve or deny it
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: JIT session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decision
 *               - approverId
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approved, denied]
 *               approverId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: JIT request reviewed successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/{id}/verify-mfa:
 *   post:
 *     tags: [JIT Access]
 *     summary: Verify MFA and activate JIT session
 *     description: Verify multi-factor authentication and activate the JIT session
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: JIT session ID
 *     responses:
 *       200:
 *         description: MFA verified and session activated
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/{id}/extend:
 *   post:
 *     tags: [JIT Access]
 *     summary: Extend a JIT session
 *     description: Extend the duration of an active JIT session
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: JIT session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - additionalHours
 *               - justification
 *             properties:
 *               additionalHours:
 *                 type: integer
 *                 description: Additional hours to extend
 *               justification:
 *                 type: string
 *     responses:
 *       200:
 *         description: JIT session extended successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/{id}/revoke:
 *   post:
 *     tags: [JIT Access]
 *     summary: Manually revoke a JIT session
 *     description: Revoke an active JIT session before expiration
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: JIT session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: JIT session revoked successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
 * @swagger
 * /api/jit-access/revoke-expired:
 *   post:
 *     tags: [JIT Access]
 *     summary: Revoke all expired JIT sessions
 *     description: Auto-revoke expired sessions and restore previous access (admin/scheduler use)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Expired sessions revoked successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
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
