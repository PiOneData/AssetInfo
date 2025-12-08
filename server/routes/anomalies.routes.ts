/**
 * Anomaly Detection API Routes (Phase 6.5)
 * Behavioral anomaly detection and investigation
 */

import { Router } from "express";
import { storage } from "../storage";
import { AnomalyDetectionService } from "../services/advanced/anomaly-detection";
import type { Request, Response } from "express";

const router = Router();

/**
 * GET /api/anomalies
 * Get all anomaly detections (with optional filters)
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
 * GET /api/anomalies/:id
 * Get a specific anomaly detection
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
 * GET /api/anomalies/user/:userId
 * Get anomalies for a specific user
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
 * GET /api/anomalies/open/all
 * Get all open anomalies
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
 * POST /api/anomalies/analyze
 * Analyze a user activity event for anomalies
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
 * POST /api/anomalies/:id/investigate
 * Start investigating an anomaly
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
 * POST /api/anomalies/:id/resolve
 * Resolve an anomaly (confirmed or false positive)
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
 * GET /api/anomalies/statistics/:days
 * Get anomaly statistics for the last N days
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
