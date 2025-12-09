import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Store active SSE connections
const sseClients = new Map<string, Set<Response>>();

/**
 * @swagger
 * /api/network/presence/live:
 *   get:
 *     summary: Get live WiFi device presence
 *     tags: [Network Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active WiFi devices
 */
router.get("/presence/live", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const devices = await storage.getActiveWifiDevices(tenantId);

    return res.json({ devices });
  } catch (error: any) {
    console.error("Error fetching WiFi devices:", error);
    return res.status(500).json({
      message: "Failed to fetch WiFi devices",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/network/alerts:
 *   get:
 *     summary: Get network security alerts
 *     tags: [Network Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by alert status (new, acknowledged, resolved)
 *     responses:
 *       200:
 *         description: List of network alerts
 */
router.get("/alerts", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const status = req.query.status as string | undefined;

    const alerts = await storage.getNetworkAlerts(tenantId, status);

    return res.json({ alerts });
  } catch (error: any) {
    console.error("Error fetching network alerts:", error);
    return res.status(500).json({
      message: "Failed to fetch network alerts",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/network/agent/generate-key:
 *   post:
 *     summary: Generate API key for network monitoring agent
 *     tags: [Network Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               agentName:
 *                 type: string
 *     responses:
 *       201:
 *         description: API key generated successfully
 */
router.post("/agent/generate-key", authenticateToken, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const { agentName } = req.body;

    if (!agentName) {
      return res.status(400).json({ message: "agentName is required" });
    }

    const key = await storage.generateNetworkAgentKey(tenantId, agentName, userId);

    return res.status(201).json({
      apiKey: key.apiKey,
      agentName: key.agentName,
      createdAt: key.createdAt,
    });
  } catch (error: any) {
    console.error("Error generating network agent key:", error);
    return res.status(500).json({
      message: "Failed to generate API key",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/network/alerts/{alertId}/acknowledge:
 *   post:
 *     summary: Acknowledge a network alert
 *     tags: [Network Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged successfully
 */
router.post("/alerts/:alertId/acknowledge", authenticateToken, async (req: Request, res: Response) => {
  try {
    const alertId = parseInt(req.params.alertId);
    const userId = req.user!.userId;
    const { notes } = req.body;

    if (isNaN(alertId)) {
      return res.status(400).json({ message: "Invalid alert ID" });
    }

    const alert = await storage.acknowledgeNetworkAlert(alertId, userId, notes);

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    return res.json({
      message: "Alert acknowledged successfully",
      alert,
    });
  } catch (error: any) {
    console.error("Error acknowledging alert:", error);
    return res.status(500).json({
      message: "Failed to acknowledge alert",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/network/presence/stream:
 *   get:
 *     summary: Server-Sent Events stream for real-time WiFi device presence
 *     tags: [Network Monitoring]
 *     responses:
 *       200:
 *         description: SSE stream of device presence updates
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get("/presence/stream", async (req: Request, res: Response) => {
  // For SSE, we need to bypass normal authentication since browsers don't support custom headers in EventSource
  // Instead, we'll accept a token query parameter
  const token = req.query.token as string;

  if (!token) {
    return res.status(401).json({ message: "Authentication token required in query parameter" });
  }

  // TODO: Validate token and get tenant ID
  // For now, we'll use a placeholder tenant ID
  const tenantId = "demo-tenant";

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Add this client to the set for this tenant
  if (!sseClients.has(tenantId)) {
    sseClients.set(tenantId, new Set());
  }
  sseClients.get(tenantId)!.add(res);

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Connected to network presence stream"}\n\n');

  // Send periodic updates (every 5 seconds)
  const intervalId = setInterval(async () => {
    try {
      const devices = await storage.getActiveWifiDevices(tenantId);
      const data = JSON.stringify({
        type: 'update',
        devices,
        timestamp: new Date().toISOString(),
      });
      res.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending SSE update:', error);
    }
  }, 5000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(intervalId);
    const clients = sseClients.get(tenantId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(tenantId);
      }
    }
  });
});

/**
 * Broadcast device update to all connected SSE clients for a tenant
 */
export function broadcastDeviceUpdate(tenantId: string, devices: any[]) {
  const clients = sseClients.get(tenantId);
  if (!clients || clients.size === 0) return;

  const data = JSON.stringify({
    type: 'update',
    devices,
    timestamp: new Date().toISOString(),
  });

  clients.forEach(client => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('Error broadcasting to SSE client:', error);
      clients.delete(client);
    }
  });
}

export default router;
