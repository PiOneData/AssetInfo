/**
 * Overprivileged Account Detection Service
 *
 * Detects users with excessive admin access:
 * - Admin access to 5+ apps
 * - Stale admin accounts (not used in 90+ days)
 * - Cross-department admin access
 * - Admin without business justification
 *
 * Target: 80% remediation within 30 days
 */

import { storage } from '../../storage';
import type { InsertOverprivilegedAccount } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface OverprivilegedDetectionResult {
  userId: string;
  userName: string;
  userDepartment: string;
  adminAppCount: number;
  adminApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    grantedAt: string;
    lastUsedAt: string;
    daysSinceLastUse: number;
  }>;
  staleAdminCount: number;
  crossDeptAdminCount: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  recommendedAction: string;
}

export interface RemediationRecommendation {
  accountId: string;
  appsToDowngrade: Array<{
    appId: string;
    appName: string;
    currentAccess: string;
    recommendedAccess: string;
    reason: string;
  }>;
  leastPrivilegeAlternative: string;
  estimatedRiskReduction: number;
}

/**
 * Overprivileged Account Detector
 */
export class OverprivilegedAccountDetector {
  constructor(private tenantId: string) {}

  /**
   * Scan all users for overprivileged accounts
   */
  async scanAll(): Promise<OverprivilegedDetectionResult[]> {
    console.log(`[Overprivileged] Scanning all users in tenant ${this.tenantId}`);

    const allUsers = await storage.getUsers(this.tenantId);
    const results: OverprivilegedDetectionResult[] = [];

    for (const user of allUsers) {
      if (!user.isActive) continue;

      try {
        const result = await this.scanUser(user.id);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`[Overprivileged] Error scanning user ${user.id}:`, error);
      }
    }

    // Sort by risk score descending
    results.sort((a, b) => b.riskScore - a.riskScore);

    console.log(`[Overprivileged] Found ${results.length} overprivileged accounts`);

    return results;
  }

  /**
   * Scan a specific user for overprivileged access
   */
  async scanUser(userId: string): Promise<OverprivilegedDetectionResult | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    // Get all user's app access
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);

    // Filter for admin/owner access
    const adminAccess = userAccess.filter(
      a => a.accessType === 'admin' || a.accessType === 'owner' || a.accessType === 'super-admin'
    );

    // Not overprivileged if less than 5 admin apps
    if (adminAccess.length < 5) {
      return null;
    }

    // Get detailed admin app info
    const adminApps = await Promise.all(
      adminAccess.map(async (access) => {
        const app = await storage.getSaasApp(access.appId, this.tenantId);
        const daysSinceLastUse = access.lastAccessDate
          ? Math.floor((Date.now() - new Date(access.lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return {
          appId: access.appId,
          appName: app?.name || 'Unknown',
          accessType: access.accessType,
          grantedAt: access.grantedDate?.toISOString() || '',
          lastUsedAt: access.lastAccessDate?.toISOString() || '',
          daysSinceLastUse,
          appCategory: app?.category,
        };
      })
    );

    // Detect stale admin accounts (not used in 90+ days)
    const staleAdminApps = adminApps.filter(a => a.daysSinceLastUse >= 90);

    // Detect cross-department admin access
    const crossDeptAdminApps = adminApps.filter(a => {
      if (!a.appCategory || !user.department) return false;
      return !this.isAppRelevantToDepartment(a.appCategory, user.department);
    });

    // Detect long-running admin privileges (> 1 year without review)
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const longRunningAdminApps = adminApps.filter(a => {
      if (!a.grantedAt) return false;
      const grantedTime = new Date(a.grantedAt).getTime();
      return grantedTime < oneYearAgo;
    });

    // Calculate risk score
    const { score, riskLevel, factors } = this.calculateOverprivilegedRisk(
      adminApps.length,
      staleAdminApps.length,
      crossDeptAdminApps.length,
      longRunningAdminApps.length
    );

    // Get recommended action
    const recommendedAction = this.getRecommendedAction(score, adminApps.length, staleAdminApps.length);

    return {
      userId: user.id,
      userName: user.name,
      userDepartment: user.department || 'Unknown',
      adminAppCount: adminApps.length,
      adminApps: adminApps.map(a => ({
        appId: a.appId,
        appName: a.appName,
        accessType: a.accessType,
        grantedAt: a.grantedAt,
        lastUsedAt: a.lastUsedAt,
        daysSinceLastUse: a.daysSinceLastUse,
      })),
      staleAdminCount: staleAdminApps.length,
      crossDeptAdminCount: crossDeptAdminApps.length,
      riskScore: score,
      riskLevel,
      riskFactors: factors,
      recommendedAction,
    };
  }

  /**
   * Check if an app category is relevant to a department
   */
  private isAppRelevantToDepartment(appCategory: string, userDepartment: string): boolean {
    const relevanceMap: Record<string, string[]> = {
      Engineering: ['development', 'infrastructure', 'devops', 'version-control'],
      Sales: ['crm', 'sales', 'marketing'],
      Marketing: ['marketing', 'design', 'social-media'],
      Finance: ['finance', 'accounting', 'erp'],
      'Human Resources': ['hr', 'recruiting', 'payroll'],
      IT: ['it', 'security', 'infrastructure'],
    };

    const relevantCategories = relevanceMap[userDepartment] || [];
    return relevantCategories.includes(appCategory.toLowerCase());
  }

  /**
   * Calculate risk score for overprivileged account
   */
  private calculateOverprivilegedRisk(
    adminAppCount: number,
    staleAdminCount: number,
    crossDeptAdminCount: number,
    longRunningAdminCount: number
  ): { score: number; riskLevel: string; factors: string[] } {
    let score = 0;
    const factors: string[] = [];

    // Admin app count
    if (adminAppCount >= 10) {
      score += 40;
      factors.push(`Admin access to ${adminAppCount} apps (excessive)`);
    } else if (adminAppCount >= 7) {
      score += 30;
      factors.push(`Admin access to ${adminAppCount} apps (high)`);
    } else if (adminAppCount >= 5) {
      score += 20;
      factors.push(`Admin access to ${adminAppCount} apps`);
    }

    // Stale admin accounts
    if (staleAdminCount > 0) {
      score += staleAdminCount * 10;
      factors.push(`${staleAdminCount} stale admin account${staleAdminCount > 1 ? 's' : ''} (90+ days unused)`);
    }

    // Cross-department admin
    if (crossDeptAdminCount > 0) {
      score += crossDeptAdminCount * 15;
      factors.push(`${crossDeptAdminCount} cross-department admin access${crossDeptAdminCount > 1 ? 'es' : ''}`);
    }

    // Long-running admin privileges (> 1 year)
    if (longRunningAdminCount > 0) {
      score += longRunningAdminCount * 12;
      factors.push(`${longRunningAdminCount} long-running admin privilege${longRunningAdminCount > 1 ? 's' : ''} (> 1 year)`);
    }

    // Cap at 100
    score = Math.min(score, 100);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (score >= 75) riskLevel = 'critical';
    else if (score >= 50) riskLevel = 'high';
    else if (score >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    return { score, riskLevel, factors };
  }

  /**
   * Get recommended action based on risk
   */
  private getRecommendedAction(score: number, adminCount: number, staleCount: number): string {
    if (score >= 75) {
      return 'Critical: Immediately revoke stale admin access and review all admin permissions';
    } else if (score >= 50) {
      return 'High priority: Downgrade to standard user for unused apps, implement JIT access';
    } else if (score >= 25) {
      return 'Review admin access justification and downgrade where appropriate';
    } else {
      return 'Monitor during next access review cycle';
    }
  }

  /**
   * Create overprivileged account alert
   */
  async createOverprivilegedAlert(result: OverprivilegedDetectionResult): Promise<string> {
    console.log(`[Overprivileged] Creating alert for ${result.userName}`);

    const user = await storage.getUser(result.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const alert: InsertOverprivilegedAccount = {
      tenantId: this.tenantId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userDepartment: user.department,
      userTitle: user.jobTitle,
      adminAppCount: result.adminAppCount,
      adminApps: result.adminApps,
      staleAdminCount: result.staleAdminCount,
      staleAdminApps: result.adminApps
        .filter(a => a.daysSinceLastUse >= 90)
        .map(a => ({
          appId: a.appId,
          appName: a.appName,
          daysSinceLastUse: a.daysSinceLastUse,
        })),
      crossDeptAdminCount: result.crossDeptAdminCount,
      crossDeptAdminApps: [], // Would be calculated based on app categories
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      riskFactors: result.riskFactors,
      recommendedAction: result.recommendedAction,
      recommendedAppsToDowngrade: this.generateDowngradeRecommendations(result.adminApps),
      leastPrivilegeAlternative: this.getLeastPrivilegeAlternative(result.adminApps.length),
      status: 'open',
    };

    const created = await storage.createOverprivilegedAccount(alert);

    // Emit policy event for high/critical accounts
    if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
      const eventSystem = policyEngine.getEventSystem();
      eventSystem.emit('overprivileged_account.detected', {
        tenantId: this.tenantId,
        userId: user.id,
        userName: user.name,
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        adminAppCount: result.adminAppCount,
        staleAdminCount: result.staleAdminCount,
      });
    }

    console.log(`[Overprivileged] Created alert ${created.id}`);

    return created.id;
  }

  /**
   * Generate downgrade recommendations
   */
  private generateDowngradeRecommendations(adminApps: any[]): Array<{
    appId: string;
    appName: string;
    currentAccess: string;
    recommendedAccess: string;
  }> {
    return adminApps
      .filter(a => a.daysSinceLastUse >= 90)
      .map(a => ({
        appId: a.appId,
        appName: a.appName,
        currentAccess: a.accessType,
        recommendedAccess: 'member',
      }));
  }

  /**
   * Get least privilege alternative suggestion
   */
  private getLeastPrivilegeAlternative(adminCount: number): string {
    if (adminCount >= 10) {
      return 'Implement Just-In-Time (JIT) access with 8-hour admin sessions instead of permanent admin rights';
    } else if (adminCount >= 7) {
      return 'Use approval workflows for admin actions instead of permanent admin access';
    } else {
      return 'Downgrade to standard user and elevate on-demand with MFA verification';
    }
  }

  /**
   * Remediate overprivileged account
   */
  async remediateAccount(
    accountId: string,
    action: 'downgrade' | 'implement_jit' | 'require_mfa' | 'accept_risk',
    remediationPlan: string,
    remediatedBy: string
  ): Promise<void> {
    console.log(`[Overprivileged] Remediating account ${accountId}: ${action}`);

    const account = await storage.getOverprivilegedAccount(accountId, this.tenantId);
    if (!account) {
      throw new Error('Overprivileged account alert not found');
    }

    // Update alert status
    await storage.updateOverprivilegedAccount(accountId, this.tenantId, {
      status: action === 'accept_risk' ? 'accepted_risk' : 'in_remediation',
      remediationPlan,
      remediationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Execute remediation action
    if (action === 'downgrade' && account.recommendedAppsToDowngrade) {
      for (const app of account.recommendedAppsToDowngrade) {
        try {
          await storage.updateUserAppAccessType(
            account.userId,
            app.appId,
            this.tenantId,
            app.recommendedAccess
          );
          console.log(`[Overprivileged] Downgraded ${app.appName} to ${app.recommendedAccess}`);
        } catch (error) {
          console.error(`[Overprivileged] Failed to downgrade ${app.appName}:`, error);
        }
      }

      // Mark as resolved
      await storage.updateOverprivilegedAccount(accountId, this.tenantId, {
        status: 'resolved',
        resolvedBy: remediatedBy,
        resolvedAt: new Date(),
        resolutionNotes: `Downgraded ${account.recommendedAppsToDowngrade.length} apps to standard user access`,
      });
    }
  }

  /**
   * Add business justification for admin access
   */
  async addJustification(
    accountId: string,
    justification: string,
    approvedBy: string,
    expiresAt: Date
  ): Promise<void> {
    console.log(`[Overprivileged] Adding justification for account ${accountId}`);

    await storage.updateOverprivilegedAccount(accountId, this.tenantId, {
      hasJustification: true,
      justificationText: justification,
      justificationApprovedBy: approvedBy,
      justificationExpiresAt: expiresAt,
      status: 'accepted_risk',
    });
  }

  /**
   * Get remediation recommendation for an account
   */
  async getRemediationRecommendation(accountId: string): Promise<RemediationRecommendation> {
    const account = await storage.getOverprivilegedAccount(accountId, this.tenantId);
    if (!account) {
      throw new Error('Overprivileged account alert not found');
    }

    const appsToDowngrade = (account.recommendedAppsToDowngrade || []).map(app => ({
      appId: app.appId,
      appName: app.appName,
      currentAccess: app.currentAccess,
      recommendedAccess: app.recommendedAccess,
      reason: 'Unused for 90+ days - downgrade to reduce risk',
    }));

    // Calculate estimated risk reduction
    const currentRisk = account.riskScore;
    const estimatedReduction = Math.min(
      Math.floor(appsToDowngrade.length * 10),
      currentRisk
    );

    return {
      accountId: account.id,
      appsToDowngrade,
      leastPrivilegeAlternative: account.leastPrivilegeAlternative || 'Standard user access with approval workflow',
      estimatedRiskReduction: estimatedReduction,
    };
  }

  /**
   * Get statistics for overprivileged accounts
   */
  async getStatistics(): Promise<{
    totalOverprivileged: number;
    byRiskLevel: Record<string, number>;
    averageAdminApps: number;
    totalStaleAdmin: number;
    remediationProgress: number;
  }> {
    const accounts = await storage.getOverprivilegedAccounts(this.tenantId);

    const byRiskLevel = {
      critical: accounts.filter(a => a.riskLevel === 'critical').length,
      high: accounts.filter(a => a.riskLevel === 'high').length,
      medium: accounts.filter(a => a.riskLevel === 'medium').length,
      low: accounts.filter(a => a.riskLevel === 'low').length,
    };

    const averageAdminApps =
      accounts.length > 0
        ? accounts.reduce((sum, a) => sum + (a.adminAppCount || 0), 0) / accounts.length
        : 0;

    const totalStaleAdmin = accounts.reduce((sum, a) => sum + (a.staleAdminCount || 0), 0);

    const resolvedAccounts = accounts.filter(a => a.status === 'resolved').length;
    const remediationProgress = accounts.length > 0 ? (resolvedAccounts / accounts.length) * 100 : 0;

    return {
      totalOverprivileged: accounts.length,
      byRiskLevel,
      averageAdminApps: Math.round(averageAdminApps * 10) / 10,
      totalStaleAdmin,
      remediationProgress: Math.round(remediationProgress),
    };
  }
}
