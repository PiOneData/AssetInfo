import { Router } from "express";
import { getSyncStatus } from "../utils/syncHeartbeat";

const router = Router();

/**
 * @swagger
 * /api/sync/status:
 *   get:
 *     summary: Get sync status heartbeat
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 */
router.get("/status", (_req, res) => {
  res.json(getSyncStatus());
});

export default router;
