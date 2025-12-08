/**
 * Offboarding Orchestrator
 *
 * Main service that coordinates the entire offboarding process:
 * - Creates offboarding requests
 * - Discovers user's app access
 * - Executes playbook steps
 * - Generates audit reports
 *
 * Target: Reduce offboarding time from 2 hours to 5 minutes
 */

import { storage } from '../../storage';
import { SSORevocationService } from './sso-revocation';
import { OAuthRevocationService } from './oauth-revocation';
import { OwnershipTransferService } from './ownership-transfer';
import { PlaybookEngine } from './playbook-engine';
import { AuditReportGenerator } from './audit-report';
import { policyEngine } from '../policy/engine';

export interface OffboardingPreview {
  userId: string;
  userName: string;
  email: string;
  apps: Array<{
    appId: string;
    appName: string;
    accessType: string;
    lastUsed?: Date;
  }>;
  oauthTokens: number;
  ownedResources: Array<{
    platform: string;
    resourceType: string;
    count: number;
  }>;
  estimatedTimeMinutes: number;
}

export interface OffboardingOptions {
  userId: string;
  playbookId?: string;
  reason?: string;
  transferToUserId?: string;
  notes?: string;
  initiatedBy: string;
}

export interface OffboardingStatus {
  requestId: string;
  status: string;
  progress: number; // 0-100
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentTask?: string;
  errors: string[];
}

/**
 * Offboarding Orchestrator
 */
export class OffboardingOrchestrator {
  private ssoRevocation: SSORevocationService;
  private oauthRevocation: OAuthRevocationService;
  private ownershipTransfer: OwnershipTransferService;
  private playbookEngine: PlaybookEngine;
  private auditReportGenerator: AuditReportGenerator;

  constructor(private tenantId: string) {
    this.ssoRevocation = new SSORevocationService(tenantId);
    this.oauthRevocation = new OAuthRevocationService(tenantId);
    this.ownershipTransfer = new OwnershipTransferService(tenantId);
    this.playbookEngine = new PlaybookEngine(tenantId);
    this.auditReportGenerator = new AuditReportGenerator(tenantId);
  }

  /**
   * Preview what will happen during offboarding
   */
  async previewOffboarding(userId: string): Promise<OffboardingPreview> {
    console.log(`[Offboarding] Previewing offboarding for user ${userId}`);

    // Get user details
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get all apps user has access to
    const userAccess = await storage.getUserAppAccessList(userId, this.tenantId);
    const apps = userAccess.map(access => ({
      appId: access.appId,
      appName: access.appName || 'Unknown',
      accessType: access.accessType || 'Unknown',
      lastUsed: access.lastAccessDate ? new Date(access.lastAccessDate) : undefined
    }));

    // Get OAuth tokens
    const oauthTokens = await storage.getOauthTokens(this.tenantId, { userId });

    // Estimate owned resources (this would be enhanced with real API calls)
    const ownedResources = [
      { platform: 'Google Drive', resourceType: 'files', count: 0 },
      { platform: 'GitHub', resourceType: 'repositories', count: 0 },
      { platform: 'Notion', resourceType: 'pages', count: 0 }
    ];

    // Estimate time (1 minute per app + 2 minutes overhead)
    const estimatedTimeMinutes = Math.ceil(apps.length * 1 + 2);

    return {
      userId: user.id,
      userName: user.name,
      email: user.email,
      apps,
      oauthTokens: oauthTokens.length,
      ownedResources,
      estimatedTimeMinutes
    };
  }

  /**
   * Create an offboarding request
   */
  async createRequest(options: OffboardingOptions): Promise<string> {
    console.log(`[Offboarding] Creating offboarding request for user ${options.userId}`);

    // Get or create default playbook if not specified
    let playbookId = options.playbookId;
    if (!playbookId) {
      const defaultPlaybook = await this.playbookEngine.getDefaultPlaybook('standard');
      if (!defaultPlaybook) {
        throw new Error('No default playbook found');
      }
      playbookId = defaultPlaybook.id;
    }

    // Create the request
    const request = await storage.createOffboardingRequest({
      tenantId: this.tenantId,
      userId: options.userId,
      playbookId,
      status: 'pending',
      initiatedBy: options.initiatedBy,
      reason: options.reason,
      transferToUserId: options.transferToUserId,
      notes: options.notes,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0
    });

    console.log(`[Offboarding] Created request ${request.id}`);
    return request.id;
  }

  /**
   * Execute offboarding workflow
   */
  async executeOffboarding(requestId: string): Promise<void> {
    console.log(`[Offboarding] Executing offboarding request ${requestId}`);

    try {
      // Get the request
      const request = await storage.getOffboardingRequest(requestId, this.tenantId);
      if (!request) {
        throw new Error('Offboarding request not found');
      }

      // Update status to in_progress
      await storage.updateOffboardingRequest(requestId, this.tenantId, {
        status: 'in_progress',
        startedAt: new Date()
      });

      // Load playbook
      const playbook = request.playbookId
        ? await storage.getOffboardingPlaybook(request.playbookId, this.tenantId)
        : await this.playbookEngine.getDefaultPlaybook('standard');

      if (!playbook) {
        throw new Error('Playbook not found');
      }

      // Generate tasks from playbook
      const tasks = await this.generateTasks(request, playbook);

      // Update total tasks count
      await storage.updateOffboardingRequest(requestId, this.tenantId, {
        totalTasks: tasks.length
      });

      // Execute tasks in priority order
      const sortedTasks = tasks.sort((a, b) => (a.priority || 0) - (b.priority || 0));

      for (const task of sortedTasks) {
        await this.executeTask(request, task);
      }

      // Generate audit report
      const auditReportUrl = await this.auditReportGenerator.generateReport(requestId);

      // Update request as completed
      const finalRequest = await storage.getOffboardingRequest(requestId, this.tenantId);
      const hasFailures = (finalRequest?.failedTasks || 0) > 0;

      const finalStatus = hasFailures ? 'partial' : 'completed';

      await storage.updateOffboardingRequest(requestId, this.tenantId, {
        status: finalStatus,
        completedAt: new Date(),
        auditReportUrl
      });

      // Emit policy event for completed offboarding
      const eventSystem = policyEngine.getEventSystem();
      eventSystem.emit('user.offboarded', {
        tenantId: this.tenantId,
        userId: request.userId,
        offboardingStatus: finalStatus,
        offboardingRequestId: requestId,
        totalTasks: finalRequest?.totalTasks || 0,
        completedTasks: finalRequest?.completedTasks || 0,
        failedTasks: finalRequest?.failedTasks || 0
      });

      console.log(`[Offboarding] Completed request ${requestId}`);
    } catch (error) {
      console.error(`[Offboarding] Error executing request ${requestId}:`, error);

      // Mark as failed
      await storage.updateOffboardingRequest(requestId, this.tenantId, {
        status: 'failed',
        completedAt: new Date()
      });

      throw error;
    }
  }

  /**
   * Generate tasks from playbook steps
   */
  private async generateTasks(request: any, playbook: any): Promise<any[]> {
    const tasks: any[] = [];

    // Get user's app access
    const userAccess = await storage.getUserAppAccessList(request.userId, this.tenantId);

    // Process each playbook step
    for (const step of playbook.steps || []) {
      if (!step.enabled) continue;

      switch (step.type) {
        case 'revoke_sso':
          // Create tasks for each app with SSO access
          for (const access of userAccess.filter(a => a.accessType === 'sso')) {
            const task = await storage.createOffboardingTask({
              requestId: request.id,
              taskType: 'revoke_sso',
              appId: access.appId,
              appName: access.appName,
              status: 'pending',
              priority: step.priority || 0
            });
            tasks.push(task);
          }
          break;

        case 'revoke_oauth':
          // Create task for OAuth revocation
          const oauthTask = await storage.createOffboardingTask({
            requestId: request.id,
            taskType: 'revoke_oauth',
            status: 'pending',
            priority: step.priority || 0
          });
          tasks.push(oauthTask);
          break;

        case 'transfer_ownership':
          if (request.transferToUserId) {
            // Create task for ownership transfer
            const transferTask = await storage.createOffboardingTask({
              requestId: request.id,
              taskType: 'transfer_ownership',
              status: 'pending',
              priority: step.priority || 0
            });
            tasks.push(transferTask);
          }
          break;

        case 'remove_from_groups':
          // Create task for group removal
          const groupTask = await storage.createOffboardingTask({
            requestId: request.id,
            taskType: 'remove_from_groups',
            status: 'pending',
            priority: step.priority || 0
          });
          tasks.push(groupTask);
          break;

        case 'archive_data':
        case 'generate_report':
          // These are handled separately
          break;

        default:
          console.warn(`[Offboarding] Unknown step type: ${step.type}`);
      }
    }

    return tasks;
  }

  /**
   * Execute a single offboarding task
   */
  private async executeTask(request: any, task: any): Promise<void> {
    console.log(`[Offboarding] Executing task ${task.id} (${task.taskType})`);

    try {
      // Update task status
      await storage.updateOffboardingTask(task.id, task.requestId, {
        status: 'in_progress',
        startedAt: new Date()
      });

      let result: any = {};

      // Execute based on task type
      switch (task.taskType) {
        case 'revoke_sso':
          result = await this.ssoRevocation.revokeAccess(request.userId, task.appId);
          break;

        case 'revoke_oauth':
          result = await this.oauthRevocation.revokeAllTokens(request.userId);
          break;

        case 'transfer_ownership':
          if (request.transferToUserId) {
            result = await this.ownershipTransfer.transferAll(
              request.userId,
              request.transferToUserId
            );
          }
          break;

        case 'remove_from_groups':
          result = await this.ssoRevocation.removeFromAllGroups(request.userId);
          break;

        default:
          console.warn(`[Offboarding] Unhandled task type: ${task.taskType}`);
          result = { skipped: true };
      }

      // Mark task as completed
      await storage.updateOffboardingTask(task.id, task.requestId, {
        status: 'completed',
        completedAt: new Date(),
        result
      });

      // Update request completed count
      await storage.updateOffboardingRequest(request.id, this.tenantId, {
        completedTasks: (request.completedTasks || 0) + 1
      });
    } catch (error: any) {
      console.error(`[Offboarding] Task ${task.id} failed:`, error);

      // Mark task as failed
      await storage.updateOffboardingTask(task.id, task.requestId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message || 'Unknown error',
        retryCount: (task.retryCount || 0) + 1
      });

      // Update request failed count
      await storage.updateOffboardingRequest(request.id, this.tenantId, {
        failedTasks: (request.failedTasks || 0) + 1
      });

      // Don't throw - continue with other tasks
    }
  }

  /**
   * Get offboarding status
   */
  async getStatus(requestId: string): Promise<OffboardingStatus> {
    const request = await storage.getOffboardingRequest(requestId, this.tenantId);
    if (!request) {
      throw new Error('Offboarding request not found');
    }

    const tasks = await storage.getOffboardingTasks(requestId);
    const currentTask = tasks.find(t => t.status === 'in_progress');

    const progress = request.totalTasks > 0
      ? Math.round(((request.completedTasks || 0) / request.totalTasks) * 100)
      : 0;

    const errors = tasks
      .filter(t => t.status === 'failed')
      .map(t => t.errorMessage || 'Unknown error');

    return {
      requestId: request.id,
      status: request.status,
      progress,
      totalTasks: request.totalTasks || 0,
      completedTasks: request.completedTasks || 0,
      failedTasks: request.failedTasks || 0,
      currentTask: currentTask?.taskType,
      errors
    };
  }

  /**
   * Cancel an offboarding request
   */
  async cancelOffboarding(requestId: string): Promise<void> {
    console.log(`[Offboarding] Cancelling request ${requestId}`);

    await storage.updateOffboardingRequest(requestId, this.tenantId, {
      status: 'cancelled',
      completedAt: new Date()
    });

    // Cancel pending tasks
    const tasks = await storage.getOffboardingTasks(requestId);
    for (const task of tasks.filter(t => t.status === 'pending')) {
      await storage.updateOffboardingTask(task.id, requestId, {
        status: 'skipped'
      });
    }
  }
}
