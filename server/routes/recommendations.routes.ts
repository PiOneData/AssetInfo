import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { generateAssetRecommendations } from "../services/openai";

const router = Router();

/**
 * @swagger
 * /api/recommendations:
 *   get:
 *     summary: Get AI recommendations
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Recommendations retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const recommendations = await storage.getRecommendations(
      req.user!.tenantId,
      status as string
    );
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recommendations" });
  }
});

/**
 * @swagger
 * /api/recommendations/generate:
 *   post:
 *     summary: Generate new AI recommendations (Manager only)
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recommendations generated successfully
 */
router.post("/generate", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
  try {
    const assets = await storage.getAssets(req.user!.tenantId);
    const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);

    // Get utilization data for all assets
    const utilizationPromises = assets.map(asset =>
      storage.getAssetUtilization(asset.id, req.user!.tenantId)
    );
    const utilizationResults = await Promise.all(utilizationPromises);
    const utilization = utilizationResults.flat();

    const aiRecommendations = await generateAssetRecommendations({
      assets,
      licenses,
      utilization,
    });

    // Save recommendations to storage
    const savedRecommendations = await Promise.all(
      aiRecommendations.map(rec =>
        storage.createRecommendation({
          ...rec,
          potentialSavings: rec.potentialSavings.toString(),
          tenantId: req.user!.tenantId,
        })
      )
    );

    res.json(savedRecommendations);
  } catch (error) {
    console.error("Error generating recommendations:", error);
    res.status(500).json({ message: "Failed to generate recommendations" });
  }
});

/**
 * @swagger
 * /api/recommendations/{id}:
 *   put:
 *     summary: Update recommendation status (Manager only)
 *     tags: [Recommendations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Recommendation updated successfully
 */
router.put("/:id", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!["pending", "accepted", "dismissed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const recommendation = await storage.updateRecommendation(
      req.params.id,
      req.user!.tenantId,
      { status }
    );

    if (!recommendation) {
      return res.status(404).json({ message: "Recommendation not found" });
    }

    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ message: "Failed to update recommendation" });
  }
});

export default router;
