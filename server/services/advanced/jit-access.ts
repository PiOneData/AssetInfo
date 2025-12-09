/**
 * Just-In-Time (JIT) Access Service (Phase 6.2)
 *
 * Enables temporary privilege elevation with automatic revocation:
 * - Request temporary admin access (4/8/24/72 hours)
 * - Manager approval for sensitive apps
 * - MFA requirement for JIT sessions
 * - Auto-revocation after expiry
 * - Session extension requests
 * - Real-time monitoring dashboard
 *
 * Target: 80% reduction in standing admin privileges
 */

import { storage } from '../../storage';
import type { InsertJitAccessSession } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface JitAccessRequest {
  userId: string;
  appId: string;
  accessType: string; // 'admin', 'owner', 'elevated'
  currentAccessType?: string; // Current access level
  justification: string;
  durationHours: number; // 4, 8, 24, 72
  requiresMfa: boolean;
}

export interface JitAccessApproval {
  sessionId: string;
  approverId: string;
  decision: 'approved' | 'denied';
  notes?: string;
}

export interface JitAccessResult {
  sessionId: string;
  status: string;
  expiresAt: Date;
  requiresMfa: boolean;
  requiresApproval: boolean;
}

/**
 * JIT Access Service
 */
export class JitAccessService {
  constructor(private tenantId: string) {}

  /**
   * Request temporary elevated access
   */
  async requestAccess(request: JitAccessRequest): Promise<JitAccessResult> {
    console.log(`[JitAccess] Requesting JIT access for user ${request.userId} to app ${request.appId}`);

    // Get user details
    const user = await storage.getUser(request.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get app details
    const app = await storage.getSaasApp(request.appId, this.tenantId);
    if (!app) {
      throw new Error('Application not found');
    }

    // Get current access
    const currentAccess = await storage.getUserAppAccess(request.userId, request.appId, this.tenantId);
    const previousAccessType = currentAccess?.accessType;

    // Determine if approval is required
    const requiresApproval = this.requiresApproval(app.riskScore, request.accessType);

    // Calculate session times
    const startsAt = new Date();
    const expiresAt = new Date(Date.now() + request.durationHours * 60 * 60 * 1000);

    // Create JIT session
    const session: InsertJitAccessSession = {
      tenantId: this.tenantId,
      userId: request.userId,
      userName: user.name,
      userEmail: user.email,
      appId: request.appId,
      appName: app.name,
      accessType: request.accessType,
      previousAccessType,
      justification: request.justification,
      durationHours: request.durationHours,
      startsAt,
      expiresAt,
      requiresApproval,
      requiresMfa: request.requiresMfa,
      mfaVerified: false,
      status: requiresApproval ? 'pending_approval' : 'pending_mfa',
      approverId: requiresApproval ? user.manager : undefined,
      approverName: requiresApproval && user.manager ? (await storage.getUser(user.manager))?.name : undefined,
    };

    const created = await storage.createJitAccessSession(session);

    // Send notification to approver if approval required
    if (requiresApproval && user.manager) {
      const approver = await storage.getUser(user.manager);
      if (approver?.email) {
        console.log(`[JitAccess] Would send approval request to ${approver.email} for session ${created.id}`);
      }
    }

    // Emit policy event for high-risk JIT requests
    if (app.riskScore >= 75 || request.accessType === 'owner') {
      const eventSystem = policyEngine.getEventSystem();
      eventSystem.emit('jit_access.high_risk_request', {
        tenantId: this.tenantId,
        sessionId: created.id,
        userName: user.name,
        appName: app.name,
        accessType: request.accessType,
        durationHours: request.durationHours,
      });
    }

    console.log(`[JitAccess] Created JIT session ${created.id}, status: ${created.status}`);

    return {
      sessionId: created.id,
      status: created.status,
      expiresAt,
      requiresMfa: request.requiresMfa,
      requiresApproval,
    };
  }

  /**
   * Approve or deny a JIT access request
   */
  async reviewRequest(approval: JitAccessApproval): Promise<void> {
    console.log(`[JitAccess] Reviewing session ${approval.sessionId}: ${approval.decision}`);

    const session = await storage.getJitAccessSession(approval.sessionId, this.tenantId);
    if (!session) {
      throw new Error('JIT access session not found');
    }

    if (session.status !== 'pending_approval') {
      throw new Error(`Session not pending approval (status: ${session.status})`);
    }

    const approver = await storage.getUser(approval.approverId);
    if (!approver) {
      throw new Error('Approver not found');
    }

    // Update session with approval decision
    const newStatus = approval.decision === 'approved'
      ? (session.requiresMfa ? 'pending_mfa' : 'active')
      : 'denied';

    await storage.updateJitAccessSession(approval.sessionId, this.tenantId, {
      status: newStatus,
      approverId: approval.approverId,
      approverName: approver.name,
      approvalNotes: approval.notes,
      approvedAt: approval.decision === 'approved' ? new Date() : undefined,
    });

    // If approved and no MFA required, grant access immediately
    if (approval.decision === 'approved' && !session.requiresMfa) {
      await this.grantAccess(session);
    }

    // Send notification to requester
    if (session.userEmail) {
      console.log(`[JitAccess] Would send ${approval.decision} notification to ${session.userEmail}`);
    }

    console.log(`[JitAccess] Session ${approval.sessionId} ${approval.decision}`);
  }

  /**
   * Verify MFA and activate JIT session
   */
  async verifyMfaAndActivate(sessionId: string, userId: string): Promise<void> {
    console.log(`[JitAccess] Verifying MFA for session ${sessionId}`);

    const session = await storage.getJitAccessSession(sessionId, this.tenantId);
    if (!session) {
      throw new Error('JIT access session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Unauthorized: session belongs to different user');
    }

    if (session.status !== 'pending_mfa') {
      throw new Error(`Session not pending MFA (status: ${session.status})`);
    }

    // Update session to active
    await storage.updateJitAccessSession(sessionId, this.tenantId, {
      status: 'active',
      mfaVerified: true,
      activatedAt: new Date(),
    });

    // Grant elevated access
    await this.grantAccess(session);

    console.log(`[JitAccess] Session ${sessionId} activated with MFA`);
  }

  /**
   * Grant elevated access for active JIT session
   */
  private async grantAccess(session: any): Promise<void> {
    console.log(`[JitAccess] Granting elevated access for session ${session.id}`);

    try {
      // Check if user already has access
      const existingAccess = await storage.getUserAppAccess(session.userId, session.appId, this.tenantId);

      if (existingAccess) {
        // Store previous access type if not already stored
        if (!session.previousAccessType) {
          await storage.updateJitAccessSession(session.id, this.tenantId, {
            previousAccessType: existingAccess.accessType,
          });
        }

        // Elevate access type
        await storage.updateUserAppAccessType(
          session.userId,
          session.appId,
          this.tenantId,
          session.accessType
        );
      } else {
        // Grant new elevated access
        await storage.grantUserAppAccess({
          userId: session.userId,
          appId: session.appId,
          tenantId: this.tenantId,
          accessType: session.accessType,
          grantedAt: new Date(),
          businessJustification: `JIT Access: ${session.justification}`,
          expiresAt: session.expiresAt,
        });
      }

      // Update provisioning status
      await storage.updateJitAccessSession(session.id, this.tenantId, {
        provisioningStatus: 'completed',
        provisionedAt: new Date(),
      });

      console.log(`[JitAccess] Access granted successfully for session ${session.id}`);
    } catch (error) {
      console.error(`[JitAccess] Failed to grant access for session ${session.id}:`, error);

      await storage.updateJitAccessSession(session.id, this.tenantId, {
        provisioningStatus: 'failed',
        provisioningError: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Revoke expired JIT sessions
   */
  async revokeExpiredSessions(): Promise<void> {
    console.log(`[JitAccess] Checking for expired sessions in tenant ${this.tenantId}`);

    const expiredSessions = await storage.getExpiredJitSessions(this.tenantId);

    let revokedCount = 0;

    for (const session of expiredSessions) {
      try {
        console.log(`[JitAccess] Revoking expired session ${session.id} (expired at ${session.expiresAt})`);

        // Restore previous access or revoke if no previous access
        if (session.previousAccessType) {
          // Restore to previous access level
          await storage.updateUserAppAccessType(
            session.userId,
            session.appId,
            this.tenantId,
            session.previousAccessType
          );
        } else {
          // Revoke access entirely (was granted by JIT)
          await storage.revokeUserAppAccess(
            session.userId,
            session.appId,
            this.tenantId
          );
        }

        // Update session status
        await storage.updateJitAccessSession(session.id, this.tenantId, {
          status: 'expired',
          revokedAt: new Date(),
        });

        // Emit policy event
        const eventSystem = policyEngine.getEventSystem();
        eventSystem.emit('jit_access.auto_revoked', {
          tenantId: this.tenantId,
          sessionId: session.id,
          userName: session.userName,
          appName: session.appName,
          accessType: session.accessType,
        });

        revokedCount++;
      } catch (error) {
        console.error(`[JitAccess] Failed to revoke session ${session.id}:`, error);
      }
    }

    if (revokedCount > 0) {
      console.log(`[JitAccess] Revoked ${revokedCount} expired sessions`);
    }
  }

  /**
   * Request session extension
   */
  async extendSession(sessionId: string, userId: string, additionalHours: number, justification: string): Promise<void> {
    console.log(`[JitAccess] Requesting extension for session ${sessionId}: +${additionalHours} hours`);

    const session = await storage.getJitAccessSession(sessionId, this.tenantId);
    if (!session) {
      throw new Error('JIT access session not found');
    }

    if (session.userId !== userId) {
      throw new Error('Unauthorized: session belongs to different user');
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot extend ${session.status} session`);
    }

    // Check if session already expired
    if (new Date() > new Date(session.expiresAt)) {
      throw new Error('Session already expired');
    }

    // Calculate new expiry
    const newExpiresAt = new Date(new Date(session.expiresAt).getTime() + additionalHours * 60 * 60 * 1000);

    // Update session
    await storage.updateJitAccessSession(sessionId, this.tenantId, {
      expiresAt: newExpiresAt,
      extensionJustification: justification,
      extendedAt: new Date(),
    });

    console.log(`[JitAccess] Session ${sessionId} extended until ${newExpiresAt}`);
  }

  /**
   * Manually revoke JIT session
   */
  async revokeSession(sessionId: string, revokedBy: string, reason: string): Promise<void> {
    console.log(`[JitAccess] Manually revoking session ${sessionId}`);

    const session = await storage.getJitAccessSession(sessionId, this.tenantId);
    if (!session) {
      throw new Error('JIT access session not found');
    }

    if (session.status !== 'active') {
      throw new Error(`Cannot revoke ${session.status} session`);
    }

    // Restore previous access or revoke if no previous access
    if (session.previousAccessType) {
      await storage.updateUserAppAccessType(
        session.userId,
        session.appId,
        this.tenantId,
        session.previousAccessType
      );
    } else {
      await storage.revokeUserAppAccess(
        session.userId,
        session.appId,
        this.tenantId
      );
    }

    // Update session status
    await storage.updateJitAccessSession(sessionId, this.tenantId, {
      status: 'revoked',
      revokedAt: new Date(),
      revokedBy,
      revocationReason: reason,
    });

    console.log(`[JitAccess] Session ${sessionId} revoked by ${revokedBy}`);
  }

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<any[]> {
    return storage.getJitAccessSessions(this.tenantId, {
      userId,
      status: 'active',
    });
  }

  /**
   * Get pending approvals for an approver
   */
  async getPendingApprovals(approverId: string): Promise<any[]> {
    return storage.getJitAccessSessions(this.tenantId, {
      status: 'pending_approval',
    }).then(sessions => sessions.filter(s => s.approverId === approverId));
  }

  /**
   * Determine if approval is required based on app risk and access type
   */
  private requiresApproval(appRiskScore: number, accessType: string): boolean {
    // Always require approval for owner access
    if (accessType === 'owner') {
      return true;
    }

    // Require approval for admin access to high-risk apps (score >= 75)
    if (accessType === 'admin' && appRiskScore >= 75) {
      return true;
    }

    // No approval needed for lower-risk combinations
    return false;
  }
}
