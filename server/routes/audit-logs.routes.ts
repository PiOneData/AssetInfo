import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger } from "../audit-logger";

const router = Router();

/**
 * @swagger
 * /api/audit-logs:
 *   get:
 *     summary: Get audit logs with filters (Admin only)
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 */
router.get("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const {
      action,
      resourceType,
      userId,
      limit = "100",
      offset = "0",
      startDate,
      endDate
    } = req.query;

    // Get basic audit logs
    let logs = await storage.getAuditLogs(req.user!.tenantId);

    // Apply filters
    if (action) {
      logs = logs.filter(log => log.action === action);
    }
    if (resourceType) {
      logs = logs.filter(log => log.resourceType === resourceType);
    }
    if (userId) {
      logs = logs.filter(log => log.userId === userId);
    }
    if (startDate) {
      const start = new Date(startDate as string);
      logs = logs.filter(log => log.createdAt >= start);
    }
    if (endDate) {
      const end = new Date(endDate as string);
      logs = logs.filter(log => log.createdAt <= end);
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000); // Max 1000
    const offsetNum = parseInt(offset as string) || 0;
    const paginatedLogs = logs.slice(offsetNum, offsetNum + limitNum);

    // Log the audit log viewing activity
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: "audit_logs_viewed",
        resourceType: "audit_log",
        description: `Viewed audit logs with filters: ${JSON.stringify({ action, resourceType, userId, startDate, endDate })}`,
        metadata: {
          resultCount: paginatedLogs.length,
          totalCount: logs.length,
          filters: { action, resourceType, userId, startDate, endDate }
        }
      },
      req
    );

    res.json({
      logs: paginatedLogs,
      pagination: {
        total: logs.length,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < logs.length
      }
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

/**
 * @swagger
 * /api/audit-logs/stats:
 *   get:
 *     summary: Get audit log statistics (Admin only)
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
router.get("/stats", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const logs = await storage.getAuditLogs(req.user!.tenantId);

    // Calculate statistics
    const stats = {
      totalLogs: logs.length,
      actionBreakdown: logs.reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      resourceTypeBreakdown: logs.reduce((acc, log) => {
        acc[log.resourceType] = (acc[log.resourceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      userActivityBreakdown: logs.reduce((acc, log) => {
        const userKey = `${log.userEmail} (${log.userRole})`;
        acc[userKey] = (acc[userKey] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentActivity: logs.slice(0, 10), // Last 10 activities
      dailyActivity: logs.reduce((acc, log) => {
        const date = log.createdAt.toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };

    // Log the statistics viewing
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: "audit_stats_viewed",
        resourceType: "audit_log",
        description: "Viewed audit log statistics",
        metadata: { statsGenerated: true, totalLogs: stats.totalLogs }
      },
      req
    );

    res.json(stats);
  } catch (error) {
    console.error("Error generating audit log stats:", error);
    res.status(500).json({ message: "Failed to generate audit log statistics" });
  }
});

export default router;
