/**
 * Event System
 *
 * Event-driven trigger system for policy automation:
 * - Emit events from various parts of the system
 * - Subscribe to events
 * - Process events asynchronously
 * - Event buffering and throttling
 *
 * Future: Can be replaced with Redis Pub/Sub or Kafka for scalability
 */

import { EventEmitter } from 'events';

export type PolicyEvent =
  | 'app.discovered'
  | 'license.unused'
  | 'oauth.risky_permission'
  | 'user.offboarded'
  | 'contract.renewal_approaching'
  | 'budget.exceeded';

export interface EventData {
  tenantId: string;
  [key: string]: any;
}

/**
 * Event System
 */
export class EventSystem {
  private emitter: EventEmitter;
  private eventCounts: Map<string, number>;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Allow many listeners
    this.eventCounts = new Map();
  }

  /**
   * Emit an event
   */
  emit(event: PolicyEvent, data: EventData): void {
    console.log(`[Event System] Emitting event: ${event}`, data);

    // Track event counts
    const count = this.eventCounts.get(event) || 0;
    this.eventCounts.set(event, count + 1);

    // Emit event
    this.emitter.emit(event, data);
  }

  /**
   * Subscribe to an event
   */
  on(event: PolicyEvent, handler: (data: EventData) => void | Promise<void>): void {
    this.emitter.on(event, async (data: EventData) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`[Event System] Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Subscribe to an event (one-time)
   */
  once(event: PolicyEvent, handler: (data: EventData) => void | Promise<void>): void {
    this.emitter.once(event, async (data: EventData) => {
      try {
        await handler(data);
      } catch (error) {
        console.error(`[Event System] Error in one-time event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Remove event listener
   */
  off(event: PolicyEvent, handler: (data: EventData) => void): void {
    this.emitter.off(event, handler);
  }

  /**
   * Get event statistics
   */
  getStats(): Record<string, number> {
    return Object.fromEntries(this.eventCounts);
  }

  /**
   * Clear all event listeners
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.eventCounts.clear();
  }
}

/**
 * Event Emitters - Helper functions to emit events from different parts of the system
 */

export class PolicyEventEmitters {
  private eventSystem: EventSystem;

  constructor(eventSystem: EventSystem) {
    this.eventSystem = eventSystem;
  }

  /**
   * Emit app discovered event
   */
  appDiscovered(tenantId: string, app: { id: string; name: string; approvalStatus: string; riskLevel?: string }): void {
    this.eventSystem.emit('app.discovered', {
      tenantId,
      appId: app.id,
      appName: app.name,
      approvalStatus: app.approvalStatus,
      riskLevel: app.riskLevel || 'low'
    });
  }

  /**
   * Emit license unused event
   */
  licenseUnused(tenantId: string, license: { userId: string; appId: string; unusedDays: number; cost?: number }): void {
    this.eventSystem.emit('license.unused', {
      tenantId,
      userId: license.userId,
      appId: license.appId,
      unusedDays: license.unusedDays,
      cost: license.cost || 0
    });
  }

  /**
   * Emit risky OAuth permission event
   */
  riskyOAuthPermission(tenantId: string, oauth: { userId: string; appId: string; riskLevel: string; scopes: string[] }): void {
    this.eventSystem.emit('oauth.risky_permission', {
      tenantId,
      userId: oauth.userId,
      appId: oauth.appId,
      riskLevel: oauth.riskLevel,
      scopes: oauth.scopes
    });
  }

  /**
   * Emit user offboarded event
   */
  userOffboarded(tenantId: string, offboarding: { userId: string; status: string; requestId: string }): void {
    this.eventSystem.emit('user.offboarded', {
      tenantId,
      userId: offboarding.userId,
      offboardingStatus: offboarding.status,
      offboardingRequestId: offboarding.requestId
    });
  }

  /**
   * Emit contract renewal approaching event
   */
  renewalApproaching(tenantId: string, contract: { id: string; appId: string; daysUntilRenewal: number; value: number; autoRenew: boolean }): void {
    this.eventSystem.emit('contract.renewal_approaching', {
      tenantId,
      contractId: contract.id,
      appId: contract.appId,
      daysUntilRenewal: contract.daysUntilRenewal,
      contractValue: contract.value,
      autoRenew: contract.autoRenew
    });
  }

  /**
   * Emit budget exceeded event
   */
  budgetExceeded(tenantId: string, budget: { department?: string; threshold: number; currentSpend: number; budgetAmount: number }): void {
    this.eventSystem.emit('budget.exceeded', {
      tenantId,
      department: budget.department || 'all',
      threshold: budget.threshold,
      currentSpend: budget.currentSpend,
      budgetAmount: budget.budgetAmount,
      percentageUsed: (budget.currentSpend / budget.budgetAmount) * 100
    });
  }
}
