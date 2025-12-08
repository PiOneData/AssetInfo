import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { processITAMQuery, type ITAMQueryContext } from "../services/openai";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * /api/ai/query:
 *   post:
 *     summary: Submit an AI query (Admin only)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Query processed successfully
 */
router.post("/query", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const aiQuerySchema = z.object({
      prompt: z.string().min(1, "Prompt is required").max(2000, "Prompt too long")
    });

    const validation = aiQuerySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: "Invalid request",
        errors: validation.error.issues
      });
    }

    const { prompt } = validation.data;

    // Get current ITAM context
    const assets = await storage.getAllAssets(req.user!.tenantId);
    const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);

    // Get utilization data for all assets
    const utilizationPromises = assets.map(asset =>
      storage.getAssetUtilization(asset.id, req.user!.tenantId)
    );
    const utilizationResults = await Promise.all(utilizationPromises);
    const utilization = utilizationResults.flat();

    // Get dashboard metrics for context
    const metrics = await storage.getDashboardMetrics(req.user!.tenantId);

    const context: ITAMQueryContext = {
      assets,
      licenses,
      utilization,
      totalAssets: metrics.totalAssets || assets.length,
      activeLicenses: metrics.activeLicenses || licenses.length,
      userQuery: prompt
    };

    // Process query with AI
    const aiResponse = await processITAMQuery(context);

    // Save the response to database with proper scoping
    const savedResponse = await storage.createAIResponse({
      prompt,
      response: aiResponse,
      userId: req.user!.userId,
      tenantId: req.user!.tenantId
    });

    // Log the AI query activity
    await storage.logActivity({
      action: "ai_query",
      resourceType: "ai_assistant",
      resourceId: savedResponse.id,
      details: `AI query: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
      userId: req.user!.userId,
      userEmail: req.user!.email,
      userRole: req.user!.role,
      tenantId: req.user!.tenantId
    });

    res.json({ sessionId: savedResponse.id });
  } catch (error) {
    console.error("AI query error:", error);
    res.status(500).json({ message: "Failed to process AI query" });
  }
});

/**
 * @swagger
 * /api/ai/response/{sessionId}:
 *   get:
 *     summary: Get AI query response (Admin only)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Response retrieved successfully
 */
router.get("/response/:sessionId", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const response = await storage.getAIResponse(sessionId, req.user!.tenantId);

    if (!response) {
      return res.status(404).json({ message: "AI response not found" });
    }

    // Additional security: ensure the response belongs to this user
    if (response.userId !== req.user!.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(response);
  } catch (error) {
    console.error("Error fetching AI response:", error);
    res.status(500).json({ message: "Failed to fetch AI response" });
  }
});

export default router;
