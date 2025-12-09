import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { complianceService } from "../services/compliance.service";

const router = Router();

/**
 * @swagger
 * /api/compliance/overview:
 *   get:
 *     summary: Get comprehensive compliance overview
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance overview with score, issues, and risk assets
 */
router.get("/overview", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const overview = await complianceService.calculateComplianceOverview(tenantId);
    return res.json(overview);
  } catch (error: any) {
    console.error("Error calculating compliance overview:", error);
    return res.status(500).json({
      message: "Failed to calculate compliance overview",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/compliance/score:
 *   get:
 *     summary: Get compliance score with detailed breakdown
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed compliance score breakdown
 */
router.get("/score", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const scoreDetails = await complianceService.calculateScoreDetails(tenantId);
    return res.json(scoreDetails);
  } catch (error: any) {
    console.error("Error calculating compliance score:", error);
    return res.status(500).json({
      message: "Failed to calculate compliance score",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/compliance/score-details:
 *   get:
 *     summary: Get detailed compliance score information
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed compliance score with recommendations
 */
router.get("/score-details", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const scoreDetails = await complianceService.calculateScoreDetails(tenantId);
    return res.json(scoreDetails);
  } catch (error: any) {
    console.error("Error calculating compliance score details:", error);
    return res.status(500).json({
      message: "Failed to calculate compliance score details",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/compliance/license:
 *   get:
 *     summary: Get license compliance details
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: License compliance information
 */
router.get("/license", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const licenseCompliance = await complianceService.getLicenseCompliance(tenantId);
    return res.json(licenseCompliance);
  } catch (error: any) {
    console.error("Error calculating license compliance:", error);
    return res.status(500).json({
      message: "Failed to calculate license compliance",
      error: error.message
    });
  }
});

export default router;
