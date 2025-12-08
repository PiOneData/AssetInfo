/**
 * Privilege Drift Detection Service
 *
 * Detects when users have permissions beyond their assigned role:
 * - Compare actual access vs role template
 * - Calculate drift score
 * - Generate alerts for excess permissions
 * - Recommend corrective actions
 *
 * Target: Detect and resolve 80% of drift within 30 days
 */

import { storage } from '../../storage';
import type { InsertPrivilegeDriftAlert, InsertRoleTemplate } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface DriftDetectionResult {
  userId: string;
  userName: string;
  roleId: string;
  roleName: string;
  excessApps: Array<{ appId: string; appName: string }>;
  missingApps: Array<{ appId: string; appName: string }>;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  recommendedAction: string;
}

export interface RoleTemplateDefinition {
  name: string;
  description: string;
  department?: string;
  level?: 'individual_contributor' | 'manager' | 'director' | 'executive';
  expectedApps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    required: boolean;
  }>;
}

/**
 * Privilege Drift Detector
 */
export class PrivilegeDriftDetector {
  constructor(private tenantId: string) {}

  /**
   * Scan all users for privilege drift
   */
  async scanAll(): Promise<DriftDetectionResult[]> {
    console.log(`[PrivilegeDrift] Scanning all users for drift in tenant ${this.tenantId}`);

    const userRoleAssignments = await storage.getUserRoleAssignments(this.tenantId);
    const results: DriftDetectionResult[] = [];

    for (const assignment of userRoleAssignments) {
      if (!assignment.isActive) continue;

      try {
        const result = await this.scanUser(assignment.userId, assignment.roleTemplateId);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`[PrivilegeDrift] Error scanning user ${assignment.userId}:`, error);
      }
    }

    console.log(`[PrivilegeDrift] Found ${results.length} users with privilege drift`);

    return results;
  }

  /**
   * Scan a specific user for privilege drift
   */
  async scanUser(userId: string, roleTemplateId: string): Promise<DriftDetectionResult | null> {
    const user = await storage.getUser(userId);
    if (!user) return null;

    const roleTemplate = await storage.getRoleTemplate(roleTemplateId, this.tenantId);
    if (!roleTemplate) return null;

    // Get user's actual app access
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
    const actualApps = userAccess.map(a => ({ appId: a.appId, appName: a.appName }));

    // Get expected apps from role template
    const expectedApps = roleTemplate.expectedApps.map(a => ({
      appId: a.appId,
      appName: a.appName,
    }));

    // Calculate drift
    const excessApps = actualApps.filter(
      actual => !expectedApps.some(expected => expected.appId === actual.appId)
    );

    const missingApps = expectedApps.filter(
      expected =>
        roleTemplate.expectedApps.find(e => e.appId === expected.appId)?.required &&
        !actualApps.some(actual => actual.appId === expected.appId)
    );

    // No drift if no excess apps
    if (excessApps.length === 0) {
      return null;
    }

    // Calculate risk score
    const { score, riskLevel, factors } = await this.calculateDriftRisk(
      userId,
      excessApps,
      userAccess
    );

    // Determine recommended action
    const recommendedAction = this.getRecommendedAction(score, excessApps.length);

    return {
      userId: user.id,
      userName: user.name,
      roleId: roleTemplate.id,
      roleName: roleTemplate.name,
      excessApps,
      missingApps,
      riskScore: score,
      riskLevel,
      riskFactors: factors,
      recommendedAction,
    };
  }

  /**
   * Calculate risk score for privilege drift
   */
  private async calculateDriftRisk(
    userId: string,
    excessApps: any[],
    userAccess: any[]
  ): Promise<{ score: number; riskLevel: string; factors: string[] }> {
    let score = 0;
    const factors: string[] = [];

    // Base points for number of excess apps
    score += excessApps.length * 5;
    factors.push(`${excessApps.length} excess app${excessApps.length > 1 ? 's' : ''}`);

    // Check if any excess apps are high-risk
    for (const excessApp of excessApps) {
      const app = await storage.getSaasApp(excessApp.appId, this.tenantId);
      if (app) {
        if (app.riskScore >= 75) {
          score += 20;
          factors.push(`High-risk app: ${app.name}`);
        } else if (app.riskScore >= 50) {
          score += 10;
          factors.push(`Medium-risk app: ${app.name}`);
        }
      }
    }

    // Check for admin access not in role
    const adminAccess = userAccess.filter(
      a =>
        (a.accessType === 'admin' || a.accessType === 'owner') &&
        excessApps.some(ea => ea.appId === a.appId)
    );

    if (adminAccess.length > 0) {
      score += adminAccess.length * 15;
      factors.push(`${adminAccess.length} admin access(es) not in role`);
    }

    // Check for unused access
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const unusedAccess = userAccess.filter(
      a =>
        excessApps.some(ea => ea.appId === a.appId) &&
        (!a.lastAccessDate || new Date(a.lastAccessDate) < ninetyDaysAgo)
    );

    if (unusedAccess.length > 0) {
      score += unusedAccess.length * 10;
      factors.push(`${unusedAccess.length} unused excess access(es) (90+ days)`);
    }

    // Cap score at 100
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
   * Get recommended action based on drift severity
   */
  private getRecommendedAction(score: number, excessCount: number): string {
    if (score >= 75) {
      return 'Immediate action required: Revoke all excess apps and review role assignment';
    } else if (score >= 50) {
      return 'High priority: Create access review campaign for this user';
    } else if (score >= 25) {
      return 'Review and update role template if access is legitimate, otherwise revoke';
    } else {
      return 'Low priority: Monitor and review during next quarterly certification';
    }
  }

  /**
   * Create drift alert for a user
   */
  async createDriftAlert(driftResult: DriftDetectionResult): Promise<string> {
    console.log(`[PrivilegeDrift] Creating alert for ${driftResult.userName}`);

    const user = await storage.getUser(driftResult.userId);
    const role = await storage.getRoleTemplate(driftResult.roleId, this.tenantId);

    if (!user || !role) {
      throw new Error('User or role template not found');
    }

    // Get current user access for actual apps list
    const userAccess = await storage.getUserAppAccessList(user.id, this.tenantId);
    const actualApps = userAccess.map(a => ({ appId: a.appId, appName: a.appName }));
    const expectedApps = role.expectedApps.map(a => ({ appId: a.appId, appName: a.appName }));

    const alert: InsertPrivilegeDriftAlert = {
      tenantId: this.tenantId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userDepartment: user.department,
      roleTemplateId: role.id,
      roleName: role.name,
      expectedApps,
      actualApps,
      excessApps: driftResult.excessApps,
      missingApps: driftResult.missingApps,
      riskScore: driftResult.riskScore,
      riskLevel: driftResult.riskLevel,
      riskFactors: driftResult.riskFactors,
      recommendedAction: driftResult.recommendedAction,
      recommendedAppsToRevoke: driftResult.excessApps,
      status: 'open',
    };

    const created = await storage.createPrivilegeDriftAlert(alert);

    // Emit policy event for high/critical drift
    if (driftResult.riskLevel === 'high' || driftResult.riskLevel === 'critical') {
      const eventSystem = policyEngine.getEventSystem();
      eventSystem.emit('privilege_drift.detected', {
        tenantId: this.tenantId,
        userId: user.id,
        userName: user.name,
        riskLevel: driftResult.riskLevel,
        riskScore: driftResult.riskScore,
        excessAppCount: driftResult.excessApps.length,
      });
    }

    console.log(`[PrivilegeDrift] Created alert ${created.id}`);

    return created.id;
  }

  /**
   * Resolve a drift alert
   */
  async resolveDriftAlert(
    alertId: string,
    resolution: 'revoked' | 'role_updated' | 'false_positive',
    notes: string,
    resolvedBy: string
  ): Promise<void> {
    console.log(`[PrivilegeDrift] Resolving alert ${alertId}: ${resolution}`);

    const alert = await storage.getPrivilegeDriftAlert(alertId, this.tenantId);
    if (!alert) {
      throw new Error('Drift alert not found');
    }

    // Update alert status
    await storage.updatePrivilegeDriftAlert(alertId, this.tenantId, {
      status: resolution === 'false_positive' ? 'false_positive' : 'resolved',
      resolutionNotes: notes,
      resolvedBy,
      resolvedAt: new Date(),
    });

    // If revoked, actually revoke the excess apps
    if (resolution === 'revoked' && alert.excessApps) {
      for (const app of alert.excessApps) {
        try {
          await storage.revokeUserAppAccess(alert.userId, app.appId, this.tenantId);
          console.log(`[PrivilegeDrift] Revoked ${app.appName} for ${alert.userName}`);
        } catch (error) {
          console.error(`[PrivilegeDrift] Failed to revoke ${app.appName}:`, error);
        }
      }
    }
  }

  /**
   * Create a role template
   */
  async createRoleTemplate(
    template: RoleTemplateDefinition,
    createdBy: string
  ): Promise<string> {
    console.log(`[PrivilegeDrift] Creating role template: ${template.name}`);

    const roleTemplate: InsertRoleTemplate = {
      tenantId: this.tenantId,
      name: template.name,
      description: template.description,
      department: template.department,
      level: template.level,
      expectedApps: template.expectedApps,
      createdBy,
      isActive: true,
    };

    const created = await storage.createRoleTemplate(roleTemplate);

    console.log(`[PrivilegeDrift] Created role template ${created.id}`);

    return created.id;
  }

  /**
   * Assign a role template to a user
   */
  async assignRoleToUser(
    userId: string,
    roleTemplateId: string,
    assignedBy: string,
    reason?: string
  ): Promise<void> {
    console.log(`[PrivilegeDrift] Assigning role ${roleTemplateId} to user ${userId}`);

    // Check if user already has an active role assignment
    const existingAssignments = await storage.getUserRoleAssignments(this.tenantId, {
      userId,
      isActive: true,
    });

    // Deactivate existing active assignments
    for (const assignment of existingAssignments) {
      await storage.updateUserRoleAssignment(assignment.id, this.tenantId, {
        isActive: false,
      });
    }

    // Create new assignment
    const assignment = await storage.createUserRoleAssignment({
      tenantId: this.tenantId,
      userId,
      roleTemplateId,
      assignedBy,
      assignmentReason: reason,
      isActive: true,
    });

    // Update role template user count
    const roleTemplate = await storage.getRoleTemplate(roleTemplateId, this.tenantId);
    if (roleTemplate) {
      await storage.updateRoleTemplate(roleTemplateId, this.tenantId, {
        userCount: (roleTemplate.userCount || 0) + 1,
      });
    }

    console.log(`[PrivilegeDrift] Assigned role to user (assignment ID: ${assignment.id})`);
  }

  /**
   * Get pre-built role templates
   */
  getPrebuiltTemplates(): RoleTemplateDefinition[] {
    // These would typically come from a library or be seeded in the database
    return [
      {
        name: 'Software Engineer',
        description: 'Standard access for software engineers',
        department: 'Engineering',
        level: 'individual_contributor',
        expectedApps: [
          { appId: 'github', appName: 'GitHub', accessType: 'member', required: true },
          { appId: 'jira', appName: 'Jira', accessType: 'member', required: true },
          { appId: 'slack', appName: 'Slack', accessType: 'member', required: true },
          { appId: 'figma', appName: 'Figma', accessType: 'viewer', required: false },
        ],
      },
      {
        name: 'Sales Representative',
        description: 'Standard access for sales reps',
        department: 'Sales',
        level: 'individual_contributor',
        expectedApps: [
          { appId: 'salesforce', appName: 'Salesforce', accessType: 'member', required: true },
          { appId: 'hubspot', appName: 'HubSpot', accessType: 'member', required: true },
          { appId: 'linkedin', appName: 'LinkedIn Sales Navigator', accessType: 'member', required: true },
          { appId: 'slack', appName: 'Slack', accessType: 'member', required: true },
        ],
      },
      {
        name: 'Marketing Manager',
        description: 'Standard access for marketing managers',
        department: 'Marketing',
        level: 'manager',
        expectedApps: [
          { appId: 'hubspot', appName: 'HubSpot', accessType: 'admin', required: true },
          { appId: 'google-ads', appName: 'Google Ads', accessType: 'admin', required: true },
          { appId: 'mailchimp', appName: 'Mailchimp', accessType: 'admin', required: true },
          { appId: 'canva', appName: 'Canva', accessType: 'member', required: true },
        ],
      },
      {
        name: 'Finance Analyst',
        description: 'Standard access for finance analysts',
        department: 'Finance',
        level: 'individual_contributor',
        expectedApps: [
          { appId: 'quickbooks', appName: 'QuickBooks', accessType: 'member', required: true },
          { appId: 'excel', appName: 'Microsoft Excel', accessType: 'member', required: true },
          { appId: 'netsuite', appName: 'NetSuite', accessType: 'member', required: false },
        ],
      },
      {
        name: 'HR Manager',
        description: 'Standard access for HR managers',
        department: 'Human Resources',
        level: 'manager',
        expectedApps: [
          { appId: 'bamboohr', appName: 'BambooHR', accessType: 'admin', required: true },
          { appId: 'greenhouse', appName: 'Greenhouse', accessType: 'admin', required: true },
          { appId: 'slack', appName: 'Slack', accessType: 'member', required: true },
        ],
      },
    ];
  }
}
