/**
 * Spend Management Routes
 *
 * Provides endpoints for spend analytics, license optimization,
 * and cost management features
 */

import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { LicenseOptimizer } from "../services/license-optimizer";
import { policyEngine } from "../services/policy/engine";

const router = Router();

/**
 * @swagger
 * /api/spend/overview:
 *   get:
 *     summary: Get spend overview metrics
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Spend overview retrieved successfully
 */
router.get("/overview", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Get all invoices
    const invoices = await storage.getSaasInvoices(tenantId, {});

    // Get all contracts
    const contracts = await storage.getSaasContracts(tenantId, {});
    const activeContracts = contracts.filter(c => c.status === 'active');

    // Calculate total annual spend from contracts
    const totalAnnualSpend = activeContracts.reduce((sum, c) => sum + (c.annualValue || 0), 0);
    const totalMonthlySpend = totalAnnualSpend / 12;

    // Calculate spend from invoices (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const recentInvoices = invoices.filter(inv =>
      inv.invoiceDate && new Date(inv.invoiceDate) >= twelveMonthsAgo
    );

    const actualSpendLast12Months = recentInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    // Get license optimization data
    const optimizer = new LicenseOptimizer(tenantId);
    const optimizationSummary = await optimizer.calculateTotalSavings();

    // Calculate upcoming renewals (next 90 days)
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const upcomingRenewals = activeContracts.filter(c =>
      c.renewalDate && new Date(c.renewalDate) <= ninetyDaysFromNow
    );

    const upcomingRenewalValue = upcomingRenewals.reduce((sum, c) => sum + (c.annualValue || 0), 0);

    // Paid vs pending invoices
    const paidInvoices = recentInvoices.filter(inv => inv.status === 'paid');
    const pendingInvoices = recentInvoices.filter(inv => inv.status === 'pending');
    const overdueInvoices = recentInvoices.filter(inv => inv.status === 'overdue');

    const totalPaid = paidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    res.json({
      totalAnnualSpend,
      totalMonthlySpend,
      actualSpendLast12Months,
      activeContracts: activeContracts.length,
      upcomingRenewals: upcomingRenewals.length,
      upcomingRenewalValue,
      optimization: {
        potentialAnnualSavings: optimizationSummary.totalAnnualWaste,
        potentialMonthlySavings: optimizationSummary.totalMonthlyWaste,
        averageUtilization: optimizationSummary.averageUtilization,
        appsWithWaste: optimizationSummary.appsWithWaste
      },
      invoices: {
        total: recentInvoices.length,
        paid: paidInvoices.length,
        pending: pendingInvoices.length,
        overdue: overdueInvoices.length,
        totalPaid,
        totalPending,
        totalOverdue
      },
      currency: 'USD' // TODO: Multi-currency support
    });
  } catch (error) {
    console.error('Failed to fetch spend overview:', error);
    res.status(500).json({ message: "Failed to fetch spend overview" });
  }
});

/**
 * @swagger
 * /api/spend/by-app:
 *   get:
 *     summary: Get spending breakdown by application
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Spending by app retrieved successfully
 */
router.get("/by-app", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Get all apps and contracts
    const apps = await storage.getSaasApps(tenantId, {});
    const contracts = await storage.getSaasContracts(tenantId, { status: 'active' });
    const invoices = await storage.getSaasInvoices(tenantId, {});

    // Calculate spend per app
    const spendByApp = apps.map(app => {
      // Get active contract for this app
      const appContracts = contracts.filter(c => c.appId === app.id);
      const annualValue = appContracts.reduce((sum, c) => sum + (c.annualValue || 0), 0);

      // Get invoices for this app (last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const appInvoices = invoices.filter(inv =>
        inv.appId === app.id &&
        inv.invoiceDate &&
        new Date(inv.invoiceDate) >= twelveMonthsAgo
      );

      const actualSpend = appInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

      // Get license count
      const totalLicenses = appContracts.reduce((sum, c) => sum + (c.totalLicenses || 0), 0);

      // Get user count
      const userCount = app.userCount || 0;

      // Calculate utilization
      const utilizationRate = totalLicenses > 0 ? (userCount / totalLicenses) * 100 : 0;

      return {
        appId: app.id,
        appName: app.name,
        vendor: app.vendor,
        annualValue,
        monthlyValue: annualValue / 12,
        actualSpend,
        totalLicenses,
        userCount,
        utilizationRate,
        costPerLicense: totalLicenses > 0 ? annualValue / totalLicenses : 0,
        category: app.category,
        approvalStatus: app.approvalStatus
      };
    });

    // Sort by annual value descending
    spendByApp.sort((a, b) => b.annualValue - a.annualValue);

    res.json(spendByApp);
  } catch (error) {
    console.error('Failed to fetch spending by app:', error);
    res.status(500).json({ message: "Failed to fetch spending by app" });
  }
});

/**
 * @swagger
 * /api/spend/by-department:
 *   get:
 *     summary: Get spending breakdown by department
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Spending by department retrieved successfully
 */
router.get("/by-department", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    // Get all contracts
    const contracts = await storage.getSaasContracts(tenantId, { status: 'active' });

    // Group by department
    const departmentMap = new Map<string, { annualSpend: number; contracts: number; apps: Set<string> }>();

    for (const contract of contracts) {
      const department = contract.department || 'Unassigned';

      if (!departmentMap.has(department)) {
        departmentMap.set(department, {
          annualSpend: 0,
          contracts: 0,
          apps: new Set()
        });
      }

      const deptData = departmentMap.get(department)!;
      deptData.annualSpend += contract.annualValue || 0;
      deptData.contracts += 1;
      if (contract.appId) {
        deptData.apps.add(contract.appId);
      }
    }

    // Convert to array
    const spendByDepartment = Array.from(departmentMap.entries()).map(([department, data]) => ({
      department,
      annualSpend: data.annualSpend,
      monthlySpend: data.annualSpend / 12,
      contracts: data.contracts,
      uniqueApps: data.apps.size
    }));

    // Sort by annual spend descending
    spendByDepartment.sort((a, b) => b.annualSpend - a.annualSpend);

    // Emit budget.exceeded events for departments with high spending
    // Note: This uses a simple heuristic. In production, integrate with actual budget system.
    const eventSystem = policyEngine.getEventSystem();
    const avgSpend = spendByDepartment.reduce((sum, d) => sum + d.annualSpend, 0) / Math.max(spendByDepartment.length, 1);
    const threshold = 80; // 80% threshold

    for (const dept of spendByDepartment) {
      // Assume budget is 120% of average spend (simple heuristic)
      const estimatedBudget = avgSpend * 1.2;
      const percentageUsed = (dept.annualSpend / estimatedBudget) * 100;

      // Emit event if department spending exceeds threshold
      if (percentageUsed >= threshold) {
        eventSystem.emit('budget.exceeded', {
          tenantId,
          department: dept.department,
          threshold,
          currentSpend: dept.annualSpend,
          budgetAmount: estimatedBudget,
          percentageUsed
        });
      }
    }

    res.json(spendByDepartment);
  } catch (error) {
    console.error('Failed to fetch spending by department:', error);
    res.status(500).json({ message: "Failed to fetch spending by department" });
  }
});

/**
 * @swagger
 * /api/spend/license-optimization:
 *   get:
 *     summary: Get license optimization recommendations
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: License optimization data retrieved successfully
 */
router.get("/license-optimization", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const optimizer = new LicenseOptimizer(tenantId);
    const results = await optimizer.analyzeAll();
    const summary = await optimizer.calculateTotalSavings();

    res.json({
      summary,
      results
    });
  } catch (error) {
    console.error('Failed to fetch license optimization data:', error);
    res.status(500).json({ message: "Failed to fetch license optimization data" });
  }
});

/**
 * @swagger
 * /api/spend/renewals:
 *   get:
 *     summary: Get upcoming contract renewals
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 90
 *     responses:
 *       200:
 *         description: Upcoming renewals retrieved successfully
 */
router.get("/renewals", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const days = parseInt(req.query.days as string) || 90;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    // Get all active contracts
    const contracts = await storage.getSaasContracts(tenantId, { status: 'active' });

    // Filter by renewal date
    const upcomingRenewals = contracts.filter(c =>
      c.renewalDate && new Date(c.renewalDate) <= cutoffDate
    );

    // Get app details for each contract
    const renewalsWithDetails = await Promise.all(
      upcomingRenewals.map(async (contract) => {
        const app = contract.appId ? await storage.getSaasApp(contract.appId, tenantId) : undefined;

        // Calculate days until renewal
        const daysUntilRenewal = contract.renewalDate
          ? Math.ceil((new Date(contract.renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        // Get optimization data for this app
        let optimizationData = null;
        if (contract.appId) {
          try {
            const optimizer = new LicenseOptimizer(tenantId);
            optimizationData = await optimizer.analyzeApp(contract.appId);
          } catch (error) {
            console.warn(`Could not get optimization data for app ${contract.appId}:`, error);
          }
        }

        return {
          contractId: contract.id,
          appId: contract.appId,
          appName: app?.name || contract.vendor || 'Unknown',
          vendor: contract.vendor,
          renewalDate: contract.renewalDate,
          daysUntilRenewal,
          annualValue: contract.annualValue,
          totalLicenses: contract.totalLicenses,
          status: contract.status,
          autoRenew: contract.autoRenew,
          optimization: optimizationData ? {
            utilizationRate: optimizationData.utilizationRate,
            unusedLicenses: optimizationData.unusedLicenses,
            potentialSavings: optimizationData.potentialAnnualSavings,
            recommendations: optimizationData.recommendations
          } : null
        };
      })
    );

    // Sort by days until renewal (soonest first)
    renewalsWithDetails.sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);

    res.json(renewalsWithDetails);
  } catch (error) {
    console.error('Failed to fetch upcoming renewals:', error);
    res.status(500).json({ message: "Failed to fetch upcoming renewals" });
  }
});

/**
 * @swagger
 * /api/spend/trends:
 *   get:
 *     summary: Get spending trends over time
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 12
 *     responses:
 *       200:
 *         description: Spending trends retrieved successfully
 */
router.get("/trends", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const months = parseInt(req.query.months as string) || 12;

    // Get all invoices
    const invoices = await storage.getSaasInvoices(tenantId, {});

    // Group by month
    const monthlySpend = new Map<string, { total: number; paid: number; pending: number; overdue: number; count: number }>();

    invoices.forEach(invoice => {
      if (!invoice.invoiceDate) return;

      // Format as YYYY-MM
      const month = new Date(invoice.invoiceDate).toISOString().substring(0, 7);

      if (!monthlySpend.has(month)) {
        monthlySpend.set(month, { total: 0, paid: 0, pending: 0, overdue: 0, count: 0 });
      }

      const data = monthlySpend.get(month)!;
      const amount = invoice.amount || 0;

      data.total += amount;
      data.count += 1;

      if (invoice.status === 'paid') {
        data.paid += amount;
      } else if (invoice.status === 'pending') {
        data.pending += amount;
      } else if (invoice.status === 'overdue') {
        data.overdue += amount;
      }
    });

    // Convert to array and sort by date
    const trends = Array.from(monthlySpend.entries())
      .map(([month, data]) => ({
        month,
        ...data
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-months); // Last N months

    res.json(trends);
  } catch (error) {
    console.error('Failed to fetch spending trends:', error);
    res.status(500).json({ message: "Failed to fetch spending trends" });
  }
});

/**
 * @swagger
 * /api/spend/executive-summary:
 *   get:
 *     summary: Generate executive summary report
 *     tags: [Spend]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Executive summary generated successfully
 */
router.get("/executive-summary", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const optimizer = new LicenseOptimizer(tenantId);
    const summary = await optimizer.generateExecutiveSummary();

    res.json({ report: summary });
  } catch (error) {
    console.error('Failed to generate executive summary:', error);
    res.status(500).json({ message: "Failed to generate executive summary" });
  }
});

export default router;
