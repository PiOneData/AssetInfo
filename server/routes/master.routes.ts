import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { insertMasterDataSchema } from "@shared/schema";

const router = Router();

/**
 * @swagger
 * /api/master:
 *   get:
 *     summary: Get master data by type
 *     tags: [Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Master data retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { type, query } = req.query;
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ message: "Master data type is required" });
    }

    const masterData = await storage.getMasterData(
      req.user!.tenantId,
      type,
      query as string | undefined
    );
    res.json(masterData);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch master data" });
  }
});

/**
 * @swagger
 * /api/master:
 *   post:
 *     summary: Add master data (Manager only)
 *     tags: [Master Data]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Master data created successfully
 */
router.post("/", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
  try {
    const masterDataInput = insertMasterDataSchema.parse({
      ...req.body,
      tenantId: req.user!.tenantId,
    });

    const masterData = await storage.addMasterData(masterDataInput);
    res.status(201).json(masterData);
  } catch (error) {
    res.status(400).json({ message: "Invalid master data" });
  }
});

/**
 * @swagger
 * /api/master/distinct:
 *   get:
 *     summary: Get distinct values from assets
 *     tags: [Master Data]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: field
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Distinct values retrieved successfully
 */
router.get("/distinct", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { field } = req.query;
    if (!field || typeof field !== 'string') {
      return res.status(400).json({ message: "Field parameter is required" });
    }

    const distinctValues = await storage.getDistinctFromAssets(
      req.user!.tenantId,
      field
    );
    res.json(distinctValues);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch distinct values" });
  }
});

export default router;
