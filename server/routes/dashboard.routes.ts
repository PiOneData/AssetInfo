import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/dashboard/metrics:
 *   get:
 *     summary: Get dashboard metrics
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved successfully
 */
router.get("/metrics", authenticateToken, async (req: Request, res: Response) => {
  try {
    const metrics = await storage.getDashboardMetrics(req.user!.tenantId);
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard metrics" });
  }
});

export default router;
