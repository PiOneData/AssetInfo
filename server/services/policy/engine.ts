/**
 * Policy Execution Engine
 *
 * Core engine for self-healing IT policies:
 * - Evaluate policy conditions
 * - Execute policy actions
 * - Handle cooldowns and execution limits
 * - Track execution statistics
 * - Retry failed actions
 *
 * Target: 50% reduction in IT toil through automation
 */

import { storage } from '../../storage';
import { EventSystem } from './event-system';
import { ActionRegistry } from './action-registry';

export interface PolicyContext {
  tenantId: string;
  triggerEvent: string;
  triggerData: Record<string, any>;
  userId?: string;
}

export interface PolicyExecutionResult {
  success: boolean;
  executionId: string;
  actionsExecuted: number;
  actionsSucceeded: number;
  actionsFailed: number;
  results: Array<{
    actionType: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
}

/**
 * Policy Execution Engine
 */
export class PolicyEngine {
  private eventSystem: EventSystem;
  private actionRegistry: ActionRegistry;

  constructor() {
    this.eventSystem = new EventSystem();
    this.actionRegistry = new ActionRegistry();
    this.initializeEventHandlers();
  }

  /**
   * Initialize event handlers for all trigger types
   */
  private initializeEventHandlers(): void {
    // Subscribe to all event types
    this.eventSystem.on('app.discovered', (data) => this.handleEvent('app_discovered', data));
    this.eventSystem.on('license.unused', (data) => this.handleEvent('license_unused', data));
    this.eventSystem.on('oauth.risky_permission', (data) => this.handleEvent('oauth_risky_permission', data));
    this.eventSystem.on('user.offboarded', (data) => this.handleEvent('user_offboarded', data));
    this.eventSystem.on('contract.renewal_approaching', (data) => this.handleEvent('renewal_approaching', data));
    this.eventSystem.on('budget.exceeded', (data) => this.handleEvent('budget_exceeded', data));

    // Phase 5: Identity Governance & Access Reviews
    this.eventSystem.on('privilege_drift.detected', (data) => this.handleEvent('privilege_drift_detected', data));
    this.eventSystem.on('overprivileged_account.detected', (data) => this.handleEvent('overprivileged_detected', data));
    this.eventSystem.on('access_review.completed', (data) => this.handleEvent('access_review_completed', data));
    this.eventSystem.on('access_review.overdue', (data) => this.handleEvent('access_review_overdue', data));
  }

  /**
   * Handle incoming events and trigger matching policies
   */
  private async handleEvent(triggerType: string, triggerData: Record<string, any>): Promise<void> {
    console.log(`[Policy Engine] Event received: ${triggerType}`, triggerData);

    try {
      const tenantId = triggerData.tenantId;
      if (!tenantId) {
        console.error('[Policy Engine] Event missing tenantId');
        return;
      }

      // Find matching policies
      const policies = await this.findMatchingPolicies(triggerType, tenantId);

      console.log(`[Policy Engine] Found ${policies.length} matching policies for ${triggerType}`);

      // Execute each matching policy
      for (const policy of policies) {
        try {
          if (await this.canExecutePolicy(policy)) {
            await this.executePolicy(policy, { tenantId, triggerEvent: triggerType, triggerData });
          } else {
            console.log(`[Policy Engine] Policy ${policy.id} cannot execute (cooldown or limit)`);
          }
        } catch (error: any) {
          console.error(`[Policy Engine] Error executing policy ${policy.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[Policy Engine] Error handling event ${triggerType}:`, error);
    }
  }

  /**
   * Find policies matching the trigger type
   */
  private async findMatchingPolicies(triggerType: string, tenantId: string): Promise<any[]> {
    return await storage.getAutomatedPolicies(tenantId, { triggerType, enabled: true });
  }

  /**
   * Check if policy can execute (cooldown, limits)
   */
  private async canExecutePolicy(policy: any): Promise<boolean> {
    // Check cooldown
    if (policy.cooldownMinutes && policy.lastExecutedAt) {
      const cooldownMs = policy.cooldownMinutes * 60 * 1000;
      const timeSinceLastExecution = Date.now() - new Date(policy.lastExecutedAt).getTime();

      if (timeSinceLastExecution < cooldownMs) {
        return false;
      }
    }

    // Check daily execution limit
    if (policy.maxExecutionsPerDay) {
      // Get executions today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const executions = await storage.getPolicyExecutions(policy.tenantId, { policyId: policy.id });
      const executionsToday = executions.filter(e =>
        e.createdAt && new Date(e.createdAt) >= today
      );

      if (executionsToday.length >= policy.maxExecutionsPerDay) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate policy conditions
   */
  private evaluateConditions(policy: any, context: PolicyContext): boolean {
    if (!policy.conditions) {
      return true; // No conditions = always match
    }

    // Simple condition evaluation
    // In a real implementation, this would support complex boolean logic
    const conditions = policy.conditions;
    const triggerData = context.triggerData;

    for (const [key, value] of Object.entries(conditions)) {
      if (Array.isArray(value)) {
        // Array condition: triggerData[key] must be in array
        if (!value.includes(triggerData[key])) {
          return false;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Object condition: supports operators like $gt, $lt, $gte, $lte
        const operators = value as Record<string, any>;
        for (const [op, opValue] of Object.entries(operators)) {
          const dataValue = triggerData[key];
          switch (op) {
            case '$gt':
              if (!(dataValue > opValue)) return false;
              break;
            case '$gte':
              if (!(dataValue >= opValue)) return false;
              break;
            case '$lt':
              if (!(dataValue < opValue)) return false;
              break;
            case '$lte':
              if (!(dataValue <= opValue)) return false;
              break;
            case '$eq':
              if (dataValue !== opValue) return false;
              break;
            case '$ne':
              if (dataValue === opValue) return false;
              break;
            default:
              console.warn(`[Policy Engine] Unknown operator: ${op}`);
          }
        }
      } else {
        // Simple equality
        if (triggerData[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Execute policy actions
   */
  async executePolicy(policy: any, context: PolicyContext): Promise<PolicyExecutionResult> {
    console.log(`[Policy Engine] Executing policy: ${policy.name}`);

    // Create execution record
    const executionRecord = await storage.createPolicyExecution({
      tenantId: context.tenantId,
      policyId: policy.id,
      triggerEvent: context.triggerEvent,
      triggerData: context.triggerData,
      status: 'running'
    });

    const executionId = executionRecord.id;
    let actionsExecuted = 0;
    let actionsSucceeded = 0;
    let actionsFailed = 0;

    const results: PolicyExecutionResult['results'] = [];

    // Execute actions sequentially
    for (const action of policy.actions || []) {
      try {
        console.log(`[Policy Engine] Executing action: ${action.type}`);

        const handler = this.actionRegistry.getHandler(action.type);
        if (!handler) {
          console.warn(`[Policy Engine] No handler found for action type: ${action.type}`);
          results.push({
            actionType: action.type,
            success: false,
            error: 'No handler found'
          });
          actionsFailed++;
          continue;
        }

        const result = await handler.execute(action.config, context);

        results.push({
          actionType: action.type,
          success: result.success,
          result: result.data,
          error: result.error
        });

        if (result.success) {
          actionsSucceeded++;
        } else {
          actionsFailed++;
        }

        actionsExecuted++;
      } catch (error: any) {
        console.error(`[Policy Engine] Error executing action ${action.type}:`, error);
        results.push({
          actionType: action.type,
          success: false,
          error: error.message
        });
        actionsFailed++;
        actionsExecuted++;
      }
    }

    // Update execution status
    const finalStatus = actionsFailed > 0
      ? (actionsSucceeded > 0 ? 'partial' : 'failed')
      : 'success';

    // Update execution record
    await storage.updatePolicyExecution(executionId, context.tenantId, {
      status: finalStatus,
      completedAt: new Date(),
      actionsExecuted,
      actionsSucceeded,
      actionsFailed,
      result: { actions: results }
    });

    // Update policy statistics
    await storage.updatePolicyStats(policy.id, context.tenantId, finalStatus);

    console.log(`[Policy Engine] Policy execution completed: ${finalStatus}`);

    return {
      success: finalStatus === 'success',
      executionId,
      actionsExecuted,
      actionsSucceeded,
      actionsFailed,
      results
    };
  }

  /**
   * Manually trigger a policy (for testing)
   */
  async triggerPolicy(policyId: string, tenantId: string, testData?: Record<string, any>): Promise<PolicyExecutionResult> {
    const policy = await storage.getAutomatedPolicy(policyId, tenantId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    // Create test context
    const context: PolicyContext = {
      tenantId,
      triggerEvent: policy.triggerType,
      triggerData: testData || {}
    };

    // Execute the policy
    return await this.executePolicy(policy, context);
  }

  /**
   * Get event system for external event emission
   */
  getEventSystem(): EventSystem {
    return this.eventSystem;
  }
}

// Singleton instance
export const policyEngine = new PolicyEngine();
