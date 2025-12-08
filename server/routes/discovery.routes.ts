/**
 * Discovery Dashboard Routes
 *
 * Provides endpoints for Shadow IT discovery dashboard
 * Includes stats, Shadow IT apps, high-risk permissions, and sync status
 */

import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { idpSyncScheduler } from "../services/idp/sync-scheduler";

const router = Router();

/**
 * @swagger
 * /api/discovery/stats:
 *   get:
 *     summary: Get discovery statistics
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Discovery stats retrieved successfully
 */
router.get("/stats", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    // Get base SaaS app stats
    const baseStats = await storage.getSaasAppStats(req.user!.tenantId);

    // Get apps by approval status
    const allApps = await storage.getSaasApps(req.user!.tenantId, {});

    const pendingApps = allApps.filter(app => app.approvalStatus === 'pending');
    const approvedApps = allApps.filter(app => app.approvalStatus === 'approved');
    const deniedApps = allApps.filter(app => app.approvalStatus === 'denied');

    // Calculate high-risk apps (risk score >= 70)
    const highRiskApps = allApps.filter(app => (app.riskScore || 0) >= 70);

    // Get discovery method breakdown
    const discoveredViaIdP = allApps.filter(app => app.discoveryMethod === 'idp');

    // Get identity provider stats
    const identityProviders = await storage.getIdentityProviders(req.user!.tenantId);
    const activeProviders = identityProviders.filter(p => p.status === 'active');
    const syncingProviders = identityProviders.filter(p => p.syncStatus === 'syncing');

    res.json({
      ...baseStats,
      totalApps: allApps.length,
      pendingApproval: pendingApps.length,
      approved: approvedApps.length,
      denied: deniedApps.length,
      highRiskApps: highRiskApps.length,
      shadowITDetected: pendingApps.length, // Pending apps are considered Shadow IT
      discoveredViaIdP: discoveredViaIdP.length,
      identityProviders: {
        total: identityProviders.length,
        active: activeProviders.length,
        syncing: syncingProviders.length
      }
    });
  } catch (error) {
    console.error('Failed to fetch discovery stats:', error);
    res.status(500).json({ message: "Failed to fetch discovery stats" });
  }
});

/**
 * @swagger
 * /api/discovery/shadow-it:
 *   get:
 *     summary: Get Shadow IT apps (unapproved apps)
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Shadow IT apps retrieved successfully
 */
router.get("/shadow-it", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    // Get all pending apps (Shadow IT candidates)
    const shadowITApps = await storage.getSaasApps(req.user!.tenantId, {
      approvalStatus: 'pending'
    });

    // Sort by risk score descending
    shadowITApps.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

    res.json(shadowITApps);
  } catch (error) {
    console.error('Failed to fetch Shadow IT apps:', error);
    res.status(500).json({ message: "Failed to fetch Shadow IT apps" });
  }
});

/**
 * @swagger
 * /api/discovery/high-risk:
 *   get:
 *     summary: Get high-risk applications
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: integer
 *           default: 70
 *     responses:
 *       200:
 *         description: High-risk apps retrieved successfully
 */
router.get("/high-risk", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 70;

    // Get all apps
    const allApps = await storage.getSaasApps(req.user!.tenantId, {});

    // Filter by risk score threshold
    const highRiskApps = allApps.filter(app => (app.riskScore || 0) >= threshold);

    // Sort by risk score descending
    highRiskApps.sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

    res.json(highRiskApps);
  } catch (error) {
    console.error('Failed to fetch high-risk apps:', error);
    res.status(500).json({ message: "Failed to fetch high-risk apps" });
  }
});

/**
 * @swagger
 * /api/discovery/recent:
 *   get:
 *     summary: Get recently discovered apps
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: Recent apps retrieved successfully
 */
router.get("/recent", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get all apps
    const allApps = await storage.getSaasApps(req.user!.tenantId, {});

    // Filter by discovery date
    const recentApps = allApps.filter(app =>
      app.discoveryDate && new Date(app.discoveryDate) >= cutoffDate
    );

    // Sort by discovery date descending
    recentApps.sort((a, b) => {
      const dateA = a.discoveryDate ? new Date(a.discoveryDate).getTime() : 0;
      const dateB = b.discoveryDate ? new Date(b.discoveryDate).getTime() : 0;
      return dateB - dateA;
    });

    res.json(recentApps);
  } catch (error) {
    console.error('Failed to fetch recent apps:', error);
    res.status(500).json({ message: "Failed to fetch recent apps" });
  }
});

/**
 * @swagger
 * /api/discovery/sync-status:
 *   get:
 *     summary: Get sync status for all identity providers
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 */
router.get("/sync-status", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const identityProviders = await storage.getIdentityProviders(req.user!.tenantId);

    // Get scheduler status
    const schedulerStatus = idpSyncScheduler.getStatus();

    // Combine provider data with scheduler status
    const statusData = identityProviders.map(provider => {
      const scheduled = schedulerStatus.find(s =>
        s.tenantId === req.user!.tenantId && s.providerId === provider.id
      );

      return {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        status: provider.status,
        syncStatus: provider.syncStatus,
        syncEnabled: provider.syncEnabled,
        lastSyncAt: provider.lastSyncAt,
        nextSyncAt: scheduled?.nextRun,
        syncError: provider.syncError,
        isCurrentlySyncing: scheduled?.isRunning || false,
        totalApps: provider.totalApps || 0,
        totalUsers: provider.totalUsers || 0
      };
    });

    res.json({
      providers: statusData,
      scheduler: {
        activeSchedules: idpSyncScheduler.getActiveCount(),
        runningSyncs: idpSyncScheduler.getRunningCount()
      }
    });
  } catch (error) {
    console.error('Failed to fetch sync status:', error);
    res.status(500).json({ message: "Failed to fetch sync status" });
  }
});

/**
 * @swagger
 * /api/discovery/trends:
 *   get:
 *     summary: Get discovery trends over time
 *     tags: [Discovery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Trends retrieved successfully
 */
router.get("/trends", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    // Get all apps
    const allApps = await storage.getSaasApps(req.user!.tenantId, {});

    // Group by discovery date
    const trends: Record<string, { discovered: number; shadowIT: number; highRisk: number }> = {};

    allApps.forEach(app => {
      if (!app.discoveryDate) return;

      const date = new Date(app.discoveryDate).toISOString().split('T')[0];
      if (!trends[date]) {
        trends[date] = { discovered: 0, shadowIT: 0, highRisk: 0 };
      }

      trends[date].discovered++;

      if (app.approvalStatus === 'pending') {
        trends[date].shadowIT++;
      }

      if ((app.riskScore || 0) >= 70) {
        trends[date].highRisk++;
      }
    });

    // Convert to array format
    const trendData = Object.entries(trends)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-days); // Last N days

    res.json(trendData);
  } catch (error) {
    console.error('Failed to fetch discovery trends:', error);
    res.status(500).json({ message: "Failed to fetch discovery trends" });
  }
});

export default router;
