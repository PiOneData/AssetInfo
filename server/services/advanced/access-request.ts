/**
 * Self-Service Access Request Service (Phase 6.1)
 *
 * Enables users to request access to applications through a self-service portal:
 * - Submit requests with business justification
 * - Auto-route to manager for approval
 * - Risk assessment and SoD conflict detection
 * - SLA tracking (24/48 hour response time)
 * - Auto-provisioning on approval
 * - Email/Slack notifications
 *
 * Target: 70% reduction in access request processing time
 */

import { storage } from '../../storage';
import type { InsertAccessRequest } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface AccessRequestSubmission {
  requesterId: string;
  appId: string;
  accessType: string; // 'member', 'admin', 'viewer'
  justification: string;
  durationType?: 'permanent' | 'temporary';
  durationHours?: number; // For temporary access
}

export interface AccessRequestDecision {
  requestId: string;
  decision: 'approved' | 'denied';
  approverId: string;
  notes?: string;
}

export interface AccessRequestResult {
  requestId: string;
  status: string;
  riskScore: number;
  riskLevel: string;
  sodConflicts: any[];
  slaDueAt: Date;
}

/**
 * Access Request Service
 */
export class AccessRequestService {
  constructor(private tenantId: string) {}

  /**
   * Submit a new access request
   */
  async submitRequest(submission: AccessRequestSubmission): Promise<AccessRequestResult> {
    console.log(`[AccessRequest] Submitting request for user ${submission.requesterId} to app ${submission.appId}`);

    // Get user details
    const user = await storage.getUser(submission.requesterId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get app details
    const app = await storage.getSaasApp(submission.appId, this.tenantId);
    if (!app) {
      throw new Error('Application not found');
    }

    // Check for SoD conflicts
    const sodConflicts = await this.checkSoDConflicts(submission.requesterId, submission.appId);

    // Calculate risk score
    const { score, level, factors } = await this.calculateRiskScore(
      submission.requesterId,
      submission.appId,
      submission.accessType,
      sodConflicts
    );

    // Calculate SLA due date (24 hours for normal, 48 hours for high risk)
    const slaDueAt = new Date();
    slaDueAt.setHours(slaDueAt.getHours() + (level === 'high' || level === 'critical' ? 48 : 24));

    // Determine approver (user's manager)
    const approverId = user.manager;
    const approver = approverId ? await storage.getUser(approverId) : null;

    // Calculate expiry for temporary access
    const expiresAt = submission.durationType === 'temporary' && submission.durationHours
      ? new Date(Date.now() + submission.durationHours * 60 * 60 * 1000)
      : null;

    // Create access request
    const request: InsertAccessRequest = {
      tenantId: this.tenantId,
      requesterId: submission.requesterId,
      requesterName: user.name,
      requesterEmail: user.email,
      requesterDepartment: user.department,
      appId: submission.appId,
      appName: app.name,
      accessType: submission.accessType,
      justification: submission.justification,
      durationType: submission.durationType || 'permanent',
      durationHours: submission.durationHours,
      expiresAt: expiresAt || undefined,
      status: 'pending',
      approverId: approverId || undefined,
      approverName: approver?.name || undefined,
      riskScore: score,
      riskLevel: level,
      riskFactors: factors,
      sodConflicts,
      slaDueAt,
      isOverdue: false,
    };

    const created = await storage.createAccessRequest(request);

    // Send notification to approver
    if (approver?.email) {
      // TODO: Send email notification
      console.log(`[AccessRequest] Would send email to ${approver.email} about request ${created.id}`);
    }

    // Emit policy event for high/critical risk requests
    if (level === 'high' || level === 'critical') {
      const eventSystem = policyEngine.getEventSystem();
      eventSystem.emit('access_request.high_risk', {
        tenantId: this.tenantId,
        requestId: created.id,
        requesterName: user.name,
        appName: app.name,
        riskLevel: level,
        riskScore: score,
      });
    }

    console.log(`[AccessRequest] Created request ${created.id} with risk level ${level}`);

    return {
      requestId: created.id,
      status: created.status,
      riskScore: score,
      riskLevel: level,
      sodConflicts,
      slaDueAt,
    };
  }

  /**
   * Approve or deny an access request
   */
  async reviewRequest(decision: AccessRequestDecision): Promise<void> {
    console.log(`[AccessRequest] Reviewing request ${decision.requestId}: ${decision.decision}`);

    const request = await storage.getAccessRequest(decision.requestId, this.tenantId);
    if (!request) {
      throw new Error('Access request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Request already ${request.status}`);
    }

    const approver = await storage.getUser(decision.approverId);
    if (!approver) {
      throw new Error('Approver not found');
    }

    // Update request status
    await storage.updateAccessRequest(decision.requestId, this.tenantId, {
      status: decision.decision,
      approverId: decision.approverId,
      approverName: approver.name,
      approvalNotes: decision.notes,
      reviewedAt: new Date(),
    });

    // If approved, provision access
    if (decision.decision === 'approved') {
      await this.provisionAccess(request);
    }

    // Send notification to requester
    if (request.requesterEmail) {
      console.log(`[AccessRequest] Would send ${decision.decision} notification to ${request.requesterEmail}`);
    }

    console.log(`[AccessRequest] Request ${decision.requestId} ${decision.decision}`);
  }

  /**
   * Provision access after approval
   */
  private async provisionAccess(request: any): Promise<void> {
    console.log(`[AccessRequest] Provisioning access for request ${request.id}`);

    try {
      // Check if user already has access
      const existingAccess = await storage.getUserAppAccess(request.requesterId, request.appId, this.tenantId);

      if (existingAccess) {
        // Update existing access level if needed
        if (existingAccess.accessType !== request.accessType) {
          await storage.updateUserAppAccessType(
            request.requesterId,
            request.appId,
            this.tenantId,
            request.accessType
          );
        }
      } else {
        // Grant new access
        await storage.grantUserAppAccess({
          userId: request.requesterId,
          appId: request.appId,
          tenantId: this.tenantId,
          accessType: request.accessType,
          grantedAt: new Date(),
          businessJustification: request.justification,
          expiresAt: request.expiresAt || undefined,
        });
      }

      // Update provisioning status
      await storage.updateAccessRequest(request.id, this.tenantId, {
        provisioningStatus: 'completed',
        provisionedAt: new Date(),
      });

      console.log(`[AccessRequest] Access provisioned successfully for request ${request.id}`);
    } catch (error) {
      console.error(`[AccessRequest] Provisioning failed for request ${request.id}:`, error);

      await storage.updateAccessRequest(request.id, this.tenantId, {
        provisioningStatus: 'failed',
        provisioningError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check for Segregation of Duties conflicts
   */
  private async checkSoDConflicts(userId: string, newAppId: string): Promise<any[]> {
    // Get user's current app access
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
    const userAppIds = userAccess.map(a => a.appId);

    // Get all active SoD rules
    const sodRules = await storage.getSodRules(this.tenantId, { isActive: true });

    const conflicts = [];

    for (const rule of sodRules) {
      // Check if user has app1 and is requesting app2
      if (userAppIds.includes(rule.appId1) && newAppId === rule.appId2) {
        conflicts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          conflictingApp: rule.appName1,
          rationale: rule.rationale,
        });
      }

      // Check if user has app2 and is requesting app1
      if (userAppIds.includes(rule.appId2) && newAppId === rule.appId1) {
        conflicts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          conflictingApp: rule.appName2,
          rationale: rule.rationale,
        });
      }
    }

    return conflicts;
  }

  /**
   * Calculate risk score for access request
   */
  private async calculateRiskScore(
    userId: string,
    appId: string,
    accessType: string,
    sodConflicts: any[]
  ): Promise<{ score: number; level: string; factors: string[] }> {
    let score = 0;
    const factors: string[] = [];

    // Get app details
    const app = await storage.getSaasApp(appId, this.tenantId);

    // App risk score
    if (app) {
      score += Math.floor(app.riskScore / 5); // Convert 0-100 to 0-20
      if (app.riskScore >= 75) {
        factors.push(`High-risk application: ${app.name}`);
      }
    }

    // Admin access
    if (accessType === 'admin' || accessType === 'owner') {
      score += 25;
      factors.push('Requesting admin access');
    }

    // SoD conflicts
    if (sodConflicts.length > 0) {
      score += sodConflicts.length * 20;
      factors.push(`${sodConflicts.length} Segregation of Duties conflict(s)`);

      // Add severity-based scoring
      const criticalConflicts = sodConflicts.filter(c => c.severity === 'critical').length;
      if (criticalConflicts > 0) {
        score += criticalConflicts * 10;
        factors.push(`${criticalConflicts} critical SoD violation(s)`);
      }
    }

    // User's current access count
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
    if (userAccess.length > 20) {
      score += 10;
      factors.push(`User has access to ${userAccess.length} apps`);
    }

    // Cap score at 100
    score = Math.min(score, 100);

    // Determine risk level
    let level: string;
    if (score >= 75) level = 'critical';
    else if (score >= 50) level = 'high';
    else if (score >= 25) level = 'medium';
    else level = 'low';

    return { score, level, factors };
  }

  /**
   * Get pending requests for an approver
   */
  async getPendingRequests(approverId: string): Promise<any[]> {
    return storage.getAccessRequestsPendingForApprover(approverId, this.tenantId);
  }

  /**
   * Get requests submitted by a user
   */
  async getUserRequests(userId: string): Promise<any[]> {
    return storage.getAccessRequestsByRequester(userId, this.tenantId);
  }

  /**
   * Check for overdue requests and mark them
   */
  async checkOverdueRequests(): Promise<void> {
    console.log(`[AccessRequest] Checking for overdue requests in tenant ${this.tenantId}`);

    const pendingRequests = await storage.getAccessRequests(this.tenantId, { status: 'pending' });

    const now = new Date();
    let overdueCount = 0;

    for (const request of pendingRequests) {
      if (request.slaDueAt && new Date(request.slaDueAt) < now && !request.isOverdue) {
        await storage.updateAccessRequest(request.id, this.tenantId, {
          isOverdue: true,
        });

        // Emit policy event for overdue request
        const eventSystem = policyEngine.getEventSystem();
        eventSystem.emit('access_request.overdue', {
          tenantId: this.tenantId,
          requestId: request.id,
          requesterName: request.requesterName,
          appName: request.appName,
          approverName: request.approverName,
        });

        overdueCount++;
      }
    }

    if (overdueCount > 0) {
      console.log(`[AccessRequest] Marked ${overdueCount} requests as overdue`);
    }
  }

  /**
   * Cancel an access request
   */
  async cancelRequest(requestId: string, userId: string): Promise<void> {
    console.log(`[AccessRequest] Cancelling request ${requestId}`);

    const request = await storage.getAccessRequest(requestId, this.tenantId);
    if (!request) {
      throw new Error('Access request not found');
    }

    // Only requester can cancel
    if (request.requesterId !== userId) {
      throw new Error('Only the requester can cancel this request');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot cancel ${request.status} request`);
    }

    await storage.updateAccessRequest(requestId, this.tenantId, {
      status: 'cancelled',
    });

    console.log(`[AccessRequest] Request ${requestId} cancelled`);
  }
}
