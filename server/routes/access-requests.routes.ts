/**
 * Access Requests API Routes (Phase 6.1)
 * Self-service access request workflow
 */

import { Router } from "express";
import { storage } from "../storage";
import { AccessRequestService } from "../services/advanced/access-request";
import type { Request, Response } from "express";

const router = Router();

/**
 * GET /api/access-requests
 * Get all access requests (with optional filters)
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
 * GET /api/access-requests/:id
 * Get a specific access request
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
 * GET /api/access-requests/pending/approver/:approverId
 * Get pending requests for an approver
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
 * GET /api/access-requests/user/:userId
 * Get requests submitted by a user
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
 * POST /api/access-requests
 * Submit a new access request
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
 * POST /api/access-requests/:id/review
 * Approve or deny an access request
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
 * POST /api/access-requests/:id/cancel
 * Cancel a pending access request
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
 * POST /api/access-requests/check-overdue
 * Check and mark overdue requests (admin only, typically called by scheduler)
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
