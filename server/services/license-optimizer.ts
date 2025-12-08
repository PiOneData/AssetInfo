/**
 * License Optimization Engine
 *
 * Analyzes SaaS licenses to identify:
 * - Unused licenses
 * - Inactive users
 * - Underutilized applications
 * - Cost-saving opportunities
 *
 * Target: Achieve 15-30% cost savings for customers
 */

import { storage } from '../storage';
import { policyEngine } from './policy/engine';

export interface LicenseOptimizationResult {
  appId: string;
  appName: string;
  vendor?: string;
  totalLicenses: number;
  usedLicenses: number;
  unusedLicenses: number;
  utilizationRate: number;
  costPerLicense: number;
  totalAnnualCost: number;
  wastedCost: number;
  inactiveUsers: Array<{
    userId: string;
    userName: string;
    email?: string;
    lastActive?: Date;
    daysSinceLastActive?: number;
  }>;
  recommendations: string[];
  potentialMonthlySavings: number;
  potentialAnnualSavings: number;
}

export interface OptimizationSummary {
  totalAppsAnalyzed: number;
  appsWithWaste: number;
  totalLicenses: number;
  totalUnusedLicenses: number;
  totalMonthlyWaste: number;
  totalAnnualWaste: number;
  currency: string;
  averageUtilization: number;
  topWastefulApps: Array<{
    appName: string;
    wastedCost: number;
    unusedLicenses: number;
  }>;
}

/**
 * License Optimizer
 */
export class LicenseOptimizer {
  constructor(private tenantId: string) {}

  /**
   * Analyze all SaaS apps for license optimization opportunities
   */
  async analyzeAll(): Promise<LicenseOptimizationResult[]> {
    const apps = await storage.getSaasApps(this.tenantId, {});
    const results: LicenseOptimizationResult[] = [];

    console.log(`[License Optimizer] Analyzing ${apps.length} apps for tenant ${this.tenantId}`);

    for (const app of apps) {
      try {
        const result = await this.analyzeApp(app.id);
        // Only include apps with actual waste or data
        if (result.unusedLicenses > 0 || result.inactiveUsers.length > 0) {
          results.push(result);
        }
      } catch (error) {
        console.error(`[License Optimizer] Error analyzing app ${app.id}:`, error);
      }
    }

    // Sort by wasted cost descending (highest waste first)
    results.sort((a, b) => b.wastedCost - a.wastedCost);

    console.log(`[License Optimizer] Found ${results.length} apps with optimization opportunities`);

    return results;
  }

  /**
   * Analyze a specific app for license optimization
   */
  async analyzeApp(appId: string): Promise<LicenseOptimizationResult> {
    // Get app details
    const app = await storage.getSaasApp(appId, this.tenantId);
    if (!app) {
      throw new Error('App not found');
    }

    // Get contract details to determine license count and costs
    const contracts = await storage.getSaasContracts(this.tenantId, { appId });
    const activeContract = contracts.find(c => c.status === 'active');

    const totalLicenses = activeContract?.totalLicenses || 0;
    const totalAnnualCost = activeContract?.annualValue || 0;
    const costPerLicense = totalLicenses > 0 ? totalAnnualCost / totalLicenses : 0;

    // Get user access data
    const users = await storage.getSaasAppUsers(appId, this.tenantId);
    const activeUsers = users.filter(u => u.status === 'active');
    const usedLicenses = activeUsers.length;

    // Find inactive users (no activity in 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactiveUsers = activeUsers
      .filter(u => !u.lastAccessDate || new Date(u.lastAccessDate) < thirtyDaysAgo)
      .map(u => {
        const lastActive = u.lastAccessDate ? new Date(u.lastAccessDate) : undefined;
        const daysSinceLastActive = lastActive
          ? Math.floor((Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24))
          : undefined;

        return {
          userId: u.userId,
          userName: u.userName || 'Unknown',
          email: u.userEmail,
          lastActive,
          daysSinceLastActive
        };
      });

    // Calculate metrics
    const unusedLicenses = Math.max(0, totalLicenses - usedLicenses);
    const utilizationRate = totalLicenses > 0 ? (usedLicenses / totalLicenses) * 100 : 0;
    const wastedCost = unusedLicenses * costPerLicense;
    const potentialAnnualSavings = wastedCost + (inactiveUsers.length * costPerLicense);
    const potentialMonthlySavings = potentialAnnualSavings / 12;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      totalLicenses,
      usedLicenses,
      unusedLicenses,
      utilizationRate,
      inactiveUsers: inactiveUsers.length,
      costPerLicense,
      wastedCost
    });

    // Emit policy events for unused licenses (inactive users)
    const eventSystem = policyEngine.getEventSystem();
    for (const inactiveUser of inactiveUsers) {
      eventSystem.emit('license.unused', {
        tenantId: this.tenantId,
        userId: inactiveUser.userId,
        appId: app.id,
        appName: app.name,
        unusedDays: inactiveUser.daysSinceLastActive || 0,
        cost: costPerLicense
      });
    }

    return {
      appId: app.id,
      appName: app.name,
      vendor: app.vendor,
      totalLicenses,
      usedLicenses,
      unusedLicenses,
      utilizationRate,
      costPerLicense,
      totalAnnualCost,
      wastedCost,
      inactiveUsers,
      recommendations,
      potentialMonthlySavings,
      potentialAnnualSavings
    };
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(metrics: {
    totalLicenses: number;
    usedLicenses: number;
    unusedLicenses: number;
    utilizationRate: number;
    inactiveUsers: number;
    costPerLicense: number;
    wastedCost: number;
  }): string[] {
    const recommendations: string[] = [];

    // Unused licenses
    if (metrics.unusedLicenses > 0) {
      const savingsPerYear = metrics.unusedLicenses * metrics.costPerLicense;
      recommendations.push(
        `Remove ${metrics.unusedLicenses} unused license${metrics.unusedLicenses > 1 ? 's' : ''} to save $${savingsPerYear.toFixed(2)}/year`
      );
    }

    // Inactive users
    if (metrics.inactiveUsers > 0) {
      const savingsPerYear = metrics.inactiveUsers * metrics.costPerLicense;
      recommendations.push(
        `${metrics.inactiveUsers} user${metrics.inactiveUsers > 1 ? 's have' : ' has'} not used the app in 30+ days - potential savings: $${savingsPerYear.toFixed(2)}/year`
      );
    }

    // Low utilization
    if (metrics.utilizationRate < 50) {
      recommendations.push(
        `Low utilization (${metrics.utilizationRate.toFixed(1)}%) - consider downgrading to a lower tier or switching to usage-based pricing`
      );
    }

    // Critical underutilization
    if (metrics.utilizationRate < 25) {
      recommendations.push(
        `CRITICAL: Only ${metrics.utilizationRate.toFixed(1)}% of licenses are used - evaluate if this app is still needed or if users need training`
      );
    }

    // Moderate utilization
    if (metrics.utilizationRate >= 50 && metrics.utilizationRate < 75) {
      recommendations.push(
        `Moderate utilization - monitor regularly and right-size during next renewal`
      );
    }

    // Good utilization
    if (metrics.utilizationRate >= 75 && metrics.utilizationRate < 90) {
      recommendations.push(
        `Good utilization - maintain current license count`
      );
    }

    // Near capacity
    if (metrics.utilizationRate >= 90) {
      recommendations.push(
        `Near capacity (${metrics.utilizationRate.toFixed(1)}%) - may need additional licenses soon`
      );
    }

    return recommendations;
  }

  /**
   * Calculate total savings opportunity across all apps
   */
  async calculateTotalSavings(): Promise<OptimizationSummary> {
    const results = await this.analyzeAll();

    const totalLicenses = results.reduce((sum, r) => sum + r.totalLicenses, 0);
    const totalUnusedLicenses = results.reduce((sum, r) => sum + r.unusedLicenses, 0);
    const totalAnnualWaste = results.reduce((sum, r) => sum + r.potentialAnnualSavings, 0);
    const totalMonthlyWaste = totalAnnualWaste / 12;
    const averageUtilization =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.utilizationRate, 0) / results.length
        : 0;

    // Top 5 wasteful apps
    const topWastefulApps = results
      .slice(0, 5)
      .map(r => ({
        appName: r.appName,
        wastedCost: r.wastedCost,
        unusedLicenses: r.unusedLicenses
      }));

    return {
      totalAppsAnalyzed: results.length,
      appsWithWaste: results.filter(r => r.wastedCost > 0).length,
      totalLicenses,
      totalUnusedLicenses,
      totalMonthlyWaste,
      totalAnnualWaste,
      currency: 'USD', // TODO: Support multi-currency
      averageUtilization,
      topWastefulApps
    };
  }

  /**
   * Get apps approaching renewal that need review
   */
  async getAppsNeedingReview(daysUntilRenewal: number = 60): Promise<LicenseOptimizationResult[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysUntilRenewal);

    const contracts = await storage.getSaasContracts(this.tenantId, {});
    const renewingSoon = contracts.filter(
      c => c.renewalDate && new Date(c.renewalDate) <= cutoffDate && c.status === 'active'
    );

    const results: LicenseOptimizationResult[] = [];

    for (const contract of renewingSoon) {
      if (contract.appId) {
        try {
          const result = await this.analyzeApp(contract.appId);
          results.push(result);
        } catch (error) {
          console.error(`Error analyzing app ${contract.appId}:`, error);
        }
      }
    }

    return results.sort((a, b) => b.wastedCost - a.wastedCost);
  }

  /**
   * Generate executive summary report
   */
  async generateExecutiveSummary(): Promise<string> {
    const summary = await this.calculateTotalSavings();

    const report = `
LICENSE OPTIMIZATION EXECUTIVE SUMMARY
=====================================

Overall Metrics:
- Apps Analyzed: ${summary.totalAppsAnalyzed}
- Apps with Waste: ${summary.appsWithWaste}
- Total Licenses: ${summary.totalLicenses}
- Unused Licenses: ${summary.totalUnusedLicenses}
- Average Utilization: ${summary.averageUtilization.toFixed(1)}%

Financial Impact:
- Monthly Waste: $${summary.totalMonthlyWaste.toFixed(2)}
- Annual Waste: $${summary.totalAnnualWaste.toFixed(2)}
- Potential Annual Savings: $${summary.totalAnnualWaste.toFixed(2)}

Top 5 Opportunities:
${summary.topWastefulApps
  .map(
    (app, i) =>
      `${i + 1}. ${app.appName}: $${app.wastedCost.toFixed(2)}/year (${app.unusedLicenses} unused licenses)`
  )
  .join('\n')}

Action Items:
1. Review and remove ${summary.totalUnusedLicenses} unused licenses
2. Contact vendors for tier downgrades on underutilized apps
3. Schedule renewal negotiations for apps approaching renewal
4. Implement user training for low-adoption apps

Estimated ROI: 15-30% reduction in SaaS spend
`.trim();

    return report;
  }
}
