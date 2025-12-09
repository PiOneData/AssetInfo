/**
 * Anomaly Detection API Routes (Phase 6.5)
 * Behavioral anomaly detection and investigation
 * @swagger
 * tags:
 *   name: Anomaly Detection
 *   description: Behavioral anomaly detection and investigation
 */

import { Router } from "express";
import { storage } from "../storage";
import { AnomalyDetectionService } from "../services/advanced/anomaly-detection";
import type { Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/anomalies:
 *   get:
 *     tags: [Anomaly Detection]
 *     summary: Get all anomaly detections
 *     description: Retrieve anomaly detections with optional filtering by user, status, or severity
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, investigating, resolved, false_positive]
 *         description: Filter by anomaly status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *     responses:
 *       200:
 *         description: List of anomaly detections
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AnomalyDetection'
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

    const { userId, status, severity } = req.query;

    const anomalies = await storage.getAnomalyDetections(tenantId, {
      userId: userId as string,
      status: status as string,
      severity: severity as string,
    });

    res.json(anomalies);
  } catch (error) {
    console.error("[Anomalies] Error fetching anomalies:", error);
    res.status(500).json({ error: "Failed to fetch anomaly detections" });
  }
});

/**
 * @swagger
 * /api/anomalies/{id}:
 *   get:
 *     tags: [Anomaly Detection]
 *     summary: Get a specific anomaly detection
 *     description: Retrieve details of a single anomaly detection by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Anomaly detection ID
 *     responses:
 *       200:
 *         description: Anomaly detection details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnomalyDetection'
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

    const anomaly = await storage.getAnomalyDetection(req.params.id, tenantId);

    if (!anomaly) {
      return res.status(404).json({ error: "Anomaly detection not found" });
    }

    res.json(anomaly);
  } catch (error) {
    console.error("[Anomalies] Error fetching anomaly:", error);
    res.status(500).json({ error: "Failed to fetch anomaly detection" });
  }
});

/**
 * @swagger
 * /api/anomalies/user/{userId}:
 *   get:
 *     tags: [Anomaly Detection]
 *     summary: Get anomalies for a specific user
 *     description: Retrieve all anomaly detections associated with a specific user
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
 *         description: List of user anomalies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AnomalyDetection'
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

    const service = new AnomalyDetectionService(tenantId);
    const anomalies = await service.getUserAnomalies(req.params.userId);

    res.json(anomalies);
  } catch (error) {
    console.error("[Anomalies] Error fetching user anomalies:", error);
    res.status(500).json({ error: "Failed to fetch user anomalies" });
  }
});

/**
 * @swagger
 * /api/anomalies/open/all:
 *   get:
 *     tags: [Anomaly Detection]
 *     summary: Get all open anomalies
 *     description: Retrieve all open anomaly detections with optional severity filtering
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *     responses:
 *       200:
 *         description: List of open anomalies
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AnomalyDetection'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/open/all", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { severity } = req.query;

    const service = new AnomalyDetectionService(tenantId);
    const anomalies = await service.getOpenAnomalies(severity as string);

    res.json(anomalies);
  } catch (error) {
    console.error("[Anomalies] Error fetching open anomalies:", error);
    res.status(500).json({ error: "Failed to fetch open anomalies" });
  }
});

/**
 * @swagger
 * /api/anomalies/analyze:
 *   post:
 *     tags: [Anomaly Detection]
 *     summary: Analyze a user activity event
 *     description: Analyze a user activity event for anomalous behavior patterns
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - eventType
 *               - eventData
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: User ID who performed the activity
 *               eventType:
 *                 type: string
 *                 description: Type of event (login, access, data_export, etc.)
 *               eventData:
 *                 type: object
 *                 description: Event-specific data for analysis
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 description: Event timestamp
 *     responses:
 *       200:
 *         description: Event analyzed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new AnomalyDetectionService(tenantId);
    await service.analyzeEvent(req.body);

    res.json({ message: "Event analyzed successfully" });
  } catch (error) {
    console.error("[Anomalies] Error analyzing event:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to analyze event"
    });
  }
});

/**
 * @swagger
 * /api/anomalies/{id}/investigate:
 *   post:
 *     tags: [Anomaly Detection]
 *     summary: Start investigating an anomaly
 *     description: Mark an anomaly as under investigation and add investigation notes
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Anomaly detection ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Investigation notes or initial findings
 *     responses:
 *       200:
 *         description: Investigation started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/:id/investigate", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { notes } = req.body;

    const service = new AnomalyDetectionService(tenantId);
    await service.investigateAnomaly(req.params.id, userId, notes);

    res.json({ message: "Anomaly investigation started" });
  } catch (error) {
    console.error("[Anomalies] Error investigating anomaly:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to investigate anomaly"
    });
  }
});

/**
 * @swagger
 * /api/anomalies/{id}/resolve:
 *   post:
 *     tags: [Anomaly Detection]
 *     summary: Resolve an anomaly
 *     description: Resolve an anomaly and mark it as confirmed threat or false positive
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Anomaly detection ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isFalsePositive
 *             properties:
 *               isFalsePositive:
 *                 type: boolean
 *                 description: Whether the anomaly is a false positive or confirmed threat
 *               notes:
 *                 type: string
 *                 description: Resolution notes or findings
 *     responses:
 *       200:
 *         description: Anomaly resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/:id/resolve", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isFalsePositive, notes } = req.body;

    const service = new AnomalyDetectionService(tenantId);
    await service.resolveAnomaly(req.params.id, userId, isFalsePositive, notes);

    res.json({ message: "Anomaly resolved successfully" });
  } catch (error) {
    console.error("[Anomalies] Error resolving anomaly:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to resolve anomaly"
    });
  }
});

/**
 * @swagger
 * /api/anomalies/statistics/{days}:
 *   get:
 *     tags: [Anomaly Detection]
 *     summary: Get anomaly statistics
 *     description: Retrieve anomaly detection statistics for the last N days
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: days
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to retrieve statistics for
 *     responses:
 *       200:
 *         description: Anomaly statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalAnomalies:
 *                   type: integer
 *                   description: Total number of anomalies detected
 *                 bySeverity:
 *                   type: object
 *                   properties:
 *                     low:
 *                       type: integer
 *                     medium:
 *                       type: integer
 *                     high:
 *                       type: integer
 *                     critical:
 *                       type: integer
 *                 byStatus:
 *                   type: object
 *                   properties:
 *                     open:
 *                       type: integer
 *                     investigating:
 *                       type: integer
 *                     resolved:
 *                       type: integer
 *                     false_positive:
 *                       type: integer
 *                 falsePositiveRate:
 *                   type: number
 *                   format: float
 *                   description: Percentage of anomalies marked as false positive
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/statistics/:days", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const days = parseInt(req.params.days) || 30;

    const service = new AnomalyDetectionService(tenantId);
    const statistics = await service.getStatistics(days);

    res.json(statistics);
  } catch (error) {
    console.error("[Anomalies] Error fetching statistics:", error);
    res.status(500).json({ error: "Failed to fetch anomaly statistics" });
  }
});

export default router;
