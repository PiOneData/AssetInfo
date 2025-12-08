import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Global search across assets, users, tickets
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { query, type, limit = 10 } = req.query;
    const user = req.user!;
    const tenantId = user.tenantId;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const searchLimit = Math.min(parseInt(limit as string) || 10, 50); // Max 50 results
    const searchResults = await storage.performGlobalSearch(
      tenantId,
      query,
      type as string,
      user.role,
      searchLimit
    );

    res.json(searchResults);
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

export default router;
