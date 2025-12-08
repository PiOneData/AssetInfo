/**
 * Segregation of Duties (SoD) Service (Phase 6.3)
 *
 * Detects and prevents conflicting access combinations:
 * - Define SoD rules (conflicting app pairs)
 * - Scan users for violations
 * - Auto-detect on access grants
 * - Block requests that violate SoD
 * - Exemption management
 * - Compliance reporting (SOX, GDPR, HIPAA)
 *
 * Target: 100% SoD violation detection, zero critical violations after 90 days
 */

import { storage } from '../../storage';
import type { InsertSodRule, InsertSodViolation } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface SodRuleDefinition {
  name: string;
  appId1: string;
  appId2: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  rationale: string;
  complianceFramework?: string; // 'SOX', 'GDPR', 'HIPAA', etc.
  exemptedUsers?: string[]; // User IDs who are exempt
}

export interface SodScanResult {
  totalUsers: number;
  violationsFound: number;
  criticalViolations: number;
  highViolations: number;
  mediumViolations: number;
  lowViolations: number;
}

/**
 * Pre-built SoD Rules (from PHASE_6_DESIGN.md)
 */
export const PREBUILT_SOD_RULES: Omit<SodRuleDefinition, 'appId1' | 'appId2'>[] = [
  {
    name: 'Financial Controls: Accounting & Payments',
    severity: 'critical',
    rationale: 'Same user should not manage both accounting records and payment processing',
    complianceFramework: 'SOX',
  },
  {
    name: 'Code & Production: Development & Production Access',
    severity: 'high',
    rationale: 'Developers should not have direct production access without approval',
    complianceFramework: 'SOX',
  },
  {
    name: 'HR Data: Employee Records & Payroll',
    severity: 'high',
    rationale: 'Same user should not manage both HR records and payroll',
    complianceFramework: 'SOX',
  },
  {
    name: 'Audit Independence: Audit Tools & Operational Access',
    severity: 'critical',
    rationale: 'Auditors should not have access to systems they audit',
    complianceFramework: 'SOX',
  },
  {
    name: 'Procurement: PO Approval & Vendor Management',
    severity: 'medium',
    rationale: 'Same user should not both approve POs and manage vendors',
    complianceFramework: 'SOX',
  },
];

/**
 * Segregation of Duties Service
 */
export class SodService {
  constructor(private tenantId: string) {}

  /**
   * Create a new SoD rule
   */
  async createRule(ruleDefinition: SodRuleDefinition): Promise<any> {
    console.log(`[SoD] Creating rule: ${ruleDefinition.name}`);

    // Get app details
    const app1 = await storage.getSaasApp(ruleDefinition.appId1, this.tenantId);
    const app2 = await storage.getSaasApp(ruleDefinition.appId2, this.tenantId);

    if (!app1 || !app2) {
      throw new Error('One or both applications not found');
    }

    // Create rule
    const rule: InsertSodRule = {
      tenantId: this.tenantId,
      name: ruleDefinition.name,
      severity: ruleDefinition.severity,
      appId1: ruleDefinition.appId1,
      appName1: app1.name,
      appId2: ruleDefinition.appId2,
      appName2: app2.name,
      rationale: ruleDefinition.rationale,
      complianceFramework: ruleDefinition.complianceFramework,
      exemptedUsers: ruleDefinition.exemptedUsers || [],
      isActive: true,
    };

    const created = await storage.createSodRule(rule);

    console.log(`[SoD] Created rule ${created.id}: ${created.name}`);

    // Scan for existing violations
    await this.scanForViolations(created.id);

    return created;
  }

  /**
   * Update an existing SoD rule
   */
  async updateRule(ruleId: string, updates: Partial<SodRuleDefinition>): Promise<any> {
    console.log(`[SoD] Updating rule ${ruleId}`);

    const rule = await storage.getSodRule(ruleId, this.tenantId);
    if (!rule) {
      throw new Error('SoD rule not found');
    }

    // Prepare updates
    const updateData: any = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.severity) updateData.severity = updates.severity;
    if (updates.rationale) updateData.rationale = updates.rationale;
    if (updates.complianceFramework) updateData.complianceFramework = updates.complianceFramework;
    if (updates.exemptedUsers !== undefined) updateData.exemptedUsers = updates.exemptedUsers;

    const updated = await storage.updateSodRule(ruleId, this.tenantId, updateData);

    // Re-scan for violations if exemptions changed
    if (updates.exemptedUsers !== undefined) {
      await this.scanForViolations(ruleId);
    }

    console.log(`[SoD] Updated rule ${ruleId}`);

    return updated;
  }

  /**
   * Delete an SoD rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    console.log(`[SoD] Deleting rule ${ruleId}`);

    // Delete associated violations first
    const violations = await storage.getSodViolations(this.tenantId, {});
    const ruleViolations = violations.filter(v => v.sodRuleId === ruleId);

    for (const violation of ruleViolations) {
      await storage.deleteSodViolation(violation.id, this.tenantId);
    }

    // Delete rule
    await storage.deleteSodRule(ruleId, this.tenantId);

    console.log(`[SoD] Deleted rule ${ruleId} and ${ruleViolations.length} violations`);
  }

  /**
   * Toggle rule active status
   */
  async toggleRule(ruleId: string, isActive: boolean): Promise<any> {
    console.log(`[SoD] ${isActive ? 'Activating' : 'Deactivating'} rule ${ruleId}`);

    const updated = await storage.toggleSodRule(ruleId, this.tenantId, isActive);

    if (isActive) {
      // Scan for violations when activating
      await this.scanForViolations(ruleId);
    } else {
      // Mark violations as resolved when deactivating
      const violations = await storage.getSodViolations(this.tenantId, {});
      const ruleViolations = violations.filter(v => v.sodRuleId === ruleId && v.status === 'open');

      for (const violation of ruleViolations) {
        await storage.updateSodViolation(violation.id, this.tenantId, {
          status: 'resolved',
          resolutionNotes: 'Rule deactivated',
          resolvedAt: new Date(),
        });
      }
    }

    return updated;
  }

  /**
   * Check if a user-app combination would violate any SoD rules
   */
  async checkViolation(userId: string, newAppId: string): Promise<any[]> {
    console.log(`[SoD] Checking SoD violations for user ${userId} accessing app ${newAppId}`);

    // Get user's current app access
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
    const userAppIds = userAccess.map(a => a.appId);

    // Get all active SoD rules
    const rules = await storage.getSodRules(this.tenantId, { isActive: true });

    const violations = [];

    for (const rule of rules) {
      // Check if user is exempted
      if (rule.exemptedUsers && rule.exemptedUsers.includes(userId)) {
        continue;
      }

      // Check if user has app1 and is requesting app2
      if (userAppIds.includes(rule.appId1) && newAppId === rule.appId2) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          conflictingApp: rule.appName1,
          rationale: rule.rationale,
          complianceFramework: rule.complianceFramework,
        });
      }

      // Check if user has app2 and is requesting app1
      if (userAppIds.includes(rule.appId2) && newAppId === rule.appId1) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          conflictingApp: rule.appName2,
          rationale: rule.rationale,
          complianceFramework: rule.complianceFramework,
        });
      }
    }

    if (violations.length > 0) {
      console.log(`[SoD] Found ${violations.length} SoD violation(s) for user ${userId} accessing app ${newAppId}`);
    }

    return violations;
  }

  /**
   * Scan all users for SoD violations (for a specific rule or all rules)
   */
  async scanForViolations(ruleId?: string): Promise<SodScanResult> {
    console.log(`[SoD] Scanning for SoD violations in tenant ${this.tenantId}${ruleId ? ` for rule ${ruleId}` : ''}`);

    const users = await storage.getUsers(this.tenantId);
    const rules = ruleId
      ? [(await storage.getSodRule(ruleId, this.tenantId))!]
      : await storage.getSodRules(this.tenantId, { isActive: true });

    let violationsFound = 0;
    let criticalViolations = 0;
    let highViolations = 0;
    let mediumViolations = 0;
    let lowViolations = 0;

    for (const user of users) {
      // Get user's app access
      const userAccess = await storage.getUserAppAccessList(user.id, this.tenantId);
      const userAppIds = userAccess.map(a => a.appId);

      for (const rule of rules) {
        // Check if user is exempted
        if (rule.exemptedUsers && rule.exemptedUsers.includes(user.id)) {
          continue;
        }

        // Check if user has both apps in the rule
        if (userAppIds.includes(rule.appId1) && userAppIds.includes(rule.appId2)) {
          // Check if violation already exists
          const existingViolations = await storage.getSodViolations(this.tenantId, {
            userId: user.id,
          });

          const alreadyExists = existingViolations.some(
            v => v.sodRuleId === rule.id && v.status === 'open'
          );

          if (!alreadyExists) {
            // Create violation
            const violation: InsertSodViolation = {
              tenantId: this.tenantId,
              sodRuleId: rule.id,
              sodRuleName: rule.name,
              userId: user.id,
              userName: user.name,
              userEmail: user.email,
              userDepartment: user.department,
              appId1: rule.appId1,
              appName1: rule.appName1,
              appId2: rule.appId2,
              appName2: rule.appName2,
              severity: rule.severity,
              rationale: rule.rationale,
              complianceFramework: rule.complianceFramework,
              status: 'open',
              detectedAt: new Date(),
            };

            await storage.createSodViolation(violation);

            violationsFound++;

            // Count by severity
            switch (rule.severity) {
              case 'critical':
                criticalViolations++;
                break;
              case 'high':
                highViolations++;
                break;
              case 'medium':
                mediumViolations++;
                break;
              case 'low':
                lowViolations++;
                break;
            }

            // Emit policy event for critical violations
            if (rule.severity === 'critical') {
              const eventSystem = policyEngine.getEventSystem();
              eventSystem.emit('sod.critical_violation', {
                tenantId: this.tenantId,
                userId: user.id,
                userName: user.name,
                ruleName: rule.name,
                appName1: rule.appName1,
                appName2: rule.appName2,
              });
            }
          }
        }
      }
    }

    console.log(`[SoD] Scan complete: ${violationsFound} new violations found`);

    return {
      totalUsers: users.length,
      violationsFound,
      criticalViolations,
      highViolations,
      mediumViolations,
      lowViolations,
    };
  }

  /**
   * Remediate a violation (revoke one of the conflicting accesses)
   */
  async remediateViolation(violationId: string, revokeAppId: string, remediatedBy: string, notes: string): Promise<void> {
    console.log(`[SoD] Remediating violation ${violationId} by revoking app ${revokeAppId}`);

    const violation = await storage.getSodViolation(violationId, this.tenantId);
    if (!violation) {
      throw new Error('SoD violation not found');
    }

    if (violation.status !== 'open') {
      throw new Error(`Violation already ${violation.status}`);
    }

    // Validate revokeAppId is one of the conflicting apps
    if (revokeAppId !== violation.appId1 && revokeAppId !== violation.appId2) {
      throw new Error('Invalid app ID: must be one of the conflicting apps');
    }

    // Revoke access
    await storage.revokeUserAppAccess(violation.userId, revokeAppId, this.tenantId);

    // Update violation status
    await storage.updateSodViolation(violationId, this.tenantId, {
      status: 'remediated',
      remediatedBy,
      remediatedAt: new Date(),
      remediationAction: `Revoked access to ${revokeAppId === violation.appId1 ? violation.appName1 : violation.appName2}`,
      resolutionNotes: notes,
      resolvedAt: new Date(),
    });

    console.log(`[SoD] Violation ${violationId} remediated`);
  }

  /**
   * Mark violation as accepted (with justification)
   */
  async acceptViolation(violationId: string, acceptedBy: string, justification: string): Promise<void> {
    console.log(`[SoD] Accepting violation ${violationId}`);

    const violation = await storage.getSodViolation(violationId, this.tenantId);
    if (!violation) {
      throw new Error('SoD violation not found');
    }

    if (violation.status !== 'open') {
      throw new Error(`Violation already ${violation.status}`);
    }

    // Update violation status
    await storage.updateSodViolation(violationId, this.tenantId, {
      status: 'accepted',
      acceptedBy,
      acceptedAt: new Date(),
      acceptanceJustification: justification,
      resolvedAt: new Date(),
    });

    console.log(`[SoD] Violation ${violationId} accepted with justification`);
  }

  /**
   * Get violations for a user
   */
  async getUserViolations(userId: string): Promise<any[]> {
    return storage.getSodViolations(this.tenantId, { userId, status: 'open' });
  }

  /**
   * Get all active violations
   */
  async getActiveViolations(severity?: string): Promise<any[]> {
    return storage.getSodViolations(this.tenantId, { status: 'open', severity });
  }

  /**
   * Get compliance report
   */
  async getComplianceReport(framework?: string): Promise<any> {
    console.log(`[SoD] Generating compliance report${framework ? ` for ${framework}` : ''}`);

    const rules = await storage.getSodRules(this.tenantId, { isActive: true });
    const violations = await storage.getSodViolations(this.tenantId, {});

    // Filter by framework if specified
    const filteredRules = framework
      ? rules.filter(r => r.complianceFramework === framework)
      : rules;

    const filteredViolations = framework
      ? violations.filter(v => v.complianceFramework === framework)
      : violations;

    // Calculate stats
    const openViolations = filteredViolations.filter(v => v.status === 'open');
    const criticalOpen = openViolations.filter(v => v.severity === 'critical').length;
    const highOpen = openViolations.filter(v => v.severity === 'high').length;
    const mediumOpen = openViolations.filter(v => v.severity === 'medium').length;
    const lowOpen = openViolations.filter(v => v.severity === 'low').length;

    const remediatedViolations = filteredViolations.filter(v => v.status === 'remediated').length;
    const acceptedViolations = filteredViolations.filter(v => v.status === 'accepted').length;

    return {
      framework: framework || 'All',
      totalRules: filteredRules.length,
      activeRules: filteredRules.filter(r => r.isActive).length,
      totalViolations: filteredViolations.length,
      openViolations: openViolations.length,
      violationsBySeverity: {
        critical: criticalOpen,
        high: highOpen,
        medium: mediumOpen,
        low: lowOpen,
      },
      remediatedViolations,
      acceptedViolations,
      complianceStatus: criticalOpen === 0 && highOpen === 0 ? 'Compliant' : 'Non-Compliant',
    };
  }
}
