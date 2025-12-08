import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get role-specific notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const notifications = await storage.getRoleNotifications(req.user!.tenantId, req.user!.role);
    res.json(notifications);
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

export default router;
