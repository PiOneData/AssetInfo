/**
 * Action Registry
 *
 * Registry for policy action handlers:
 * - Register action handlers
 * - Get action handlers
 * - Validate action configurations
 *
 * Supported actions:
 * 1. send_alert - Send notifications
 * 2. create_ticket - Create support tickets
 * 3. block_app - Block application access
 * 4. revoke_access - Revoke user access
 * 5. reclaim_license - Reclaim unused license
 * 6. notify_department_head - Notify department head
 */

import { PolicyContext } from './engine';

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ActionHandler {
  type: string;
  validate(config: any): boolean;
  execute(config: any, context: PolicyContext): Promise<ActionResult>;
}

/**
 * Action Registry
 */
export class ActionRegistry {
  private handlers: Map<string, ActionHandler>;

  constructor() {
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  /**
   * Register an action handler
   */
  register(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
    console.log(`[Action Registry] Registered handler: ${handler.type}`);
  }

  /**
   * Get action handler
   */
  getHandler(type: string): ActionHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if handler exists
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered handler types
   */
  getHandlerTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register default handlers
   */
  private registerDefaultHandlers(): void {
    // Send Alert Handler
    this.register({
      type: 'send_alert',
      validate: (config) => !!config.recipients || !!config.channels,
      execute: async (config, context) => {
        console.log(`[Action] Sending alert to ${config.recipients?.join(', ') || 'channels'}`);
        // In real implementation: send via email, Slack, etc.
        return { success: true, data: { sent: true } };
      }
    });

    // Create Ticket Handler
    this.register({
      type: 'create_ticket',
      validate: (config) => !!config.title || !!config.template,
      execute: async (config, context) => {
        console.log(`[Action] Creating ticket: ${config.title || 'from template'}`);
        // In real implementation: create ticket in ticketing system
        return { success: true, data: { ticketId: 'ticket-' + Date.now() } };
      }
    });

    // Block App Handler
    this.register({
      type: 'block_app',
      validate: (config) => !!config.appId || !!context.triggerData?.appId,
      execute: async (config, context) => {
        const appId = config.appId || context.triggerData?.appId;
        console.log(`[Action] Blocking app: ${appId}`);
        // In real implementation: update app status to blocked
        return { success: true, data: { appId, blocked: true } };
      }
    });

    // Revoke Access Handler
    this.register({
      type: 'revoke_access',
      validate: (config) => (!!config.userId || !!context.triggerData?.userId) && (!!config.appId || !!context.triggerData?.appId),
      execute: async (config, context) => {
        const userId = config.userId || context.triggerData?.userId;
        const appId = config.appId || context.triggerData?.appId;
        console.log(`[Action] Revoking access for user ${userId} from app ${appId}`);
        // In real implementation: revoke SSO and OAuth access
        return { success: true, data: { userId, appId, revoked: true } };
      }
    });

    // Reclaim License Handler
    this.register({
      type: 'reclaim_license',
      validate: (config) => (!!config.userId || !!context.triggerData?.userId) && (!!config.appId || !!context.triggerData?.appId),
      execute: async (config, context) => {
        const userId = config.userId || context.triggerData?.userId;
        const appId = config.appId || context.triggerData?.appId;
        console.log(`[Action] Reclaiming license for user ${userId} from app ${appId}`);
        // In real implementation: remove user access and reclaim license
        return { success: true, data: { userId, appId, reclaimed: true } };
      }
    });

    // Notify Department Head Handler
    this.register({
      type: 'notify_department_head',
      validate: (config) => !!config.department || !!context.triggerData?.department,
      execute: async (config, context) => {
        const department = config.department || context.triggerData?.department;
        console.log(`[Action] Notifying department head of ${department}`);
        // In real implementation: lookup department head and send notification
        return { success: true, data: { department, notified: true } };
      }
    });
  }
}
