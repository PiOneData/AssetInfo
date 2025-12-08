/**
 * Access Requests API Routes (Phase 6.1)
 * Self-service access request workflow with risk assessment
 * @swagger
 * tags:
 *   name: Access Requests
 *   description: Self-service access request workflow with risk assessment and approval
 */

import { Router } from "express";
import { storage } from "../storage";
import { AccessRequestService } from "../services/advanced/access-request";
import type { Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/access-requests:
 *   get:
 *     tags: [Access Requests]
 *     summary: Get all access requests
 *     description: Retrieve access requests with optional filtering by status, requester, or approver
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, denied, provisioned, failed]
 *         description: Filter by request status
 *       - in: query
 *         name: requesterId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by requester ID
 *       - in: query
 *         name: approverId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by approver ID
 *     responses:
 *       200:
 *         description: List of access requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AccessRequest'
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

    const { status, requesterId, approverId } = req.query;

    const requests = await storage.getAccessRequests(tenantId, {
      status: status as string,
      requesterId: requesterId as string,
      approverId: approverId as string,
    });

    res.json(requests);
  } catch (error) {
    console.error("[AccessRequests] Error fetching requests:", error);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
});

/**
 * @swagger
 * /api/access-requests/{id}:
 *   get:
 *     tags: [Access Requests]
 *     summary: Get a specific access request
 *     description: Retrieve details of a single access request by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access request ID
 *     responses:
 *       200:
 *         description: Access request details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccessRequest'
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

    const request = await storage.getAccessRequest(req.params.id, tenantId);

    if (!request) {
      return res.status(404).json({ error: "Access request not found" });
    }

    res.json(request);
  } catch (error) {
    console.error("[AccessRequests] Error fetching request:", error);
    res.status(500).json({ error: "Failed to fetch access request" });
  }
});

/**
 * @swagger
 * /api/access-requests/pending/approver/{approverId}:
 *   get:
 *     tags: [Access Requests]
 *     summary: Get pending requests for an approver
 *     description: Retrieve all pending access requests assigned to a specific approver
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
 *         description: List of pending requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AccessRequest'
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

    const requests = await storage.getAccessRequestsPendingForApprover(
      req.params.approverId,
      tenantId
    );

    res.json(requests);
  } catch (error) {
    console.error("[AccessRequests] Error fetching pending requests:", error);
    res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

/**
 * @swagger
 * /api/access-requests/user/{userId}:
 *   get:
 *     tags: [Access Requests]
 *     summary: Get requests submitted by a user
 *     description: Retrieve all access requests submitted by a specific user
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
 *         description: List of user requests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AccessRequest'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const requests = await storage.getAccessRequestsByRequester(
      req.params.userId,
      tenantId
    );

    res.json(requests);
  } catch (error) {
    console.error("[AccessRequests] Error fetching user requests:", error);
    res.status(500).json({ error: "Failed to fetch user requests" });
  }
});

/**
 * @swagger
 * /api/access-requests:
 *   post:
 *     tags: [Access Requests]
 *     summary: Submit a new access request
 *     description: Submit a new access request with automatic risk assessment and SoD conflict detection
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requesterId
 *               - appId
 *               - accessType
 *               - justification
 *               - durationType
 *             properties:
 *               requesterId:
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
 *               durationType:
 *                 type: string
 *                 enum: [permanent, temporary]
 *               durationHours:
 *                 type: integer
 *                 description: Required if durationType is temporary
 *     responses:
 *       201:
 *         description: Request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requestId:
 *                   type: string
 *                   format: uuid
 *                 status:
 *                   type: string
 *                 riskScore:
 *                   type: integer
 *                 riskLevel:
 *                   type: string
 *                 sodConflicts:
 *                   type: array
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

    const service = new AccessRequestService(tenantId);
    const result = await service.submitRequest(req.body);

    res.status(201).json(result);
  } catch (error) {
    console.error("[AccessRequests] Error submitting request:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to submit access request"
    });
  }
});

/**
 * @swagger
 * /api/access-requests/{id}/review:
 *   post:
 *     tags: [Access Requests]
 *     summary: Approve or deny an access request
 *     description: Review an access request and approve or deny it with notes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access request ID
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
 *         description: Request reviewed successfully
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

    const service = new AccessRequestService(tenantId);
    await service.reviewRequest({
      requestId: req.params.id,
      ...req.body,
    });

    res.json({ message: "Request reviewed successfully" });
  } catch (error) {
    console.error("[AccessRequests] Error reviewing request:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to review access request"
    });
  }
});

/**
 * @swagger
 * /api/access-requests/{id}/cancel:
 *   post:
 *     tags: [Access Requests]
 *     summary: Cancel a pending access request
 *     description: Cancel an access request that is still pending approval
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Access request ID
 *     responses:
 *       200:
 *         description: Request cancelled successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new AccessRequestService(tenantId);
    await service.cancelRequest(req.params.id, userId);

    res.json({ message: "Request cancelled successfully" });
  } catch (error) {
    console.error("[AccessRequests] Error cancelling request:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to cancel access request"
    });
  }
});

/**
 * @swagger
 * /api/access-requests/check-overdue:
 *   post:
 *     tags: [Access Requests]
 *     summary: Check and mark overdue requests
 *     description: Check for requests past their SLA due date and mark them (admin/scheduler use)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue check completed
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/check-overdue", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new AccessRequestService(tenantId);
    await service.checkOverdueRequests();

    res.json({ message: "Overdue check completed" });
  } catch (error) {
    console.error("[AccessRequests] Error checking overdue requests:", error);
    res.status(500).json({ error: "Failed to check overdue requests" });
  }
});

export default router;
