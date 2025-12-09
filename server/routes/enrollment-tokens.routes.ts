import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/enrollment-tokens/active:
 *   get:
 *     summary: Get active enrollment token for tenant
 *     tags: [Enrollment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active enrollment token
 */
router.get("/active", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const token = await storage.getActiveEnrollmentToken(tenantId);

    if (!token) {
      return res.json({ token: null });
    }

    return res.json({
      token: token.token,
      name: token.name,
      expiresAt: token.expiresAt,
    });
  } catch (error: any) {
    console.error("Error fetching enrollment token:", error);
    return res.status(500).json({
      message: "Failed to fetch enrollment token",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/enrollment-tokens/ensure-default:
 *   post:
 *     summary: Ensure a default enrollment token exists for tenant
 *     tags: [Enrollment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enrollment token ensured
 */
router.post("/ensure-default", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const token = await storage.ensureDefaultEnrollmentToken(tenantId, userId);

    return res.json({
      token: token.token,
      name: token.name,
      expiresAt: token.expiresAt,
    });
  } catch (error: any) {
    console.error("Error ensuring enrollment token:", error);
    return res.status(500).json({
      message: "Failed to create enrollment token",
      error: error.message
    });
  }
});

export default router;
