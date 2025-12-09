/**
 * IdP Sync Scheduler
 *
 * Manages periodic synchronization of identity providers
 * Uses node-cron for scheduling background jobs
 */

import cron from 'node-cron';
import { storage } from '../../storage';
import { AzureADConnector } from './azuread-connector';
import { GoogleWorkspaceConnector } from './google-connector';
import { OktaConnector } from './okta-connector';
import { ShadowITDetector } from '../shadowit-detector';
import { decrypt } from '../encryption';
import type { IdPConnector } from './connector.interface';

interface ScheduledSync {
  task: cron.ScheduledTask;
  providerId: string;
  tenantId: string;
  lastRun?: Date;
  nextRun?: Date;
}

/**
 * IdP Sync Scheduler
 *
 * Handles scheduled and manual synchronization of identity providers
 */
export class IdPSyncScheduler {
  private scheduledTasks: Map<string, ScheduledSync> = new Map();
  private runningSyncs: Set<string> = new Set();

  /**
   * Initialize scheduler and start all tenant syncs
   */
  async initialize(): Promise<void> {
    console.log('[Scheduler] Initializing IdP sync scheduler...');

    try {
      // Get all active identity providers across all tenants
      // Note: This requires a method to get all providers (not filtered by tenant)
      // For now, we'll need to be manually triggered per tenant

      console.log('[Scheduler] Scheduler initialized successfully');
    } catch (error) {
      console.error('[Scheduler] Failed to initialize scheduler:', error);
    }
  }

  /**
   * Schedule syncs for all providers in a tenant
   */
  async scheduleForTenant(tenantId: string): Promise<void> {
    try {
      const providers = await storage.getIdentityProviders(tenantId);

      console.log(`[Scheduler] Scheduling ${providers.length} providers for tenant ${tenantId}`);

      for (const provider of providers) {
        if (provider.syncEnabled && provider.status === 'active') {
          await this.scheduleProvider(tenantId, provider);
        }
      }
    } catch (error) {
      console.error(`[Scheduler] Error scheduling tenant ${tenantId}:`, error);
    }
  }

  /**
   * Schedule a specific provider for periodic sync
   */
  private async scheduleProvider(tenantId: string, provider: any): Promise<void> {
    const taskKey = `${tenantId}-${provider.id}`;

    // Remove existing schedule if any
    if (this.scheduledTasks.has(taskKey)) {
      const existingTask = this.scheduledTasks.get(taskKey)!;
      existingTask.task.stop();
      this.scheduledTasks.delete(taskKey);
    }

    try {
      // Convert sync interval (seconds) to cron expression
      const intervalMinutes = Math.floor((provider.syncInterval || 3600) / 60);

      // Ensure minimum interval of 5 minutes
      const actualInterval = Math.max(intervalMinutes, 5);

      // Create cron expression: every N minutes
      const cronExpression = `*/${actualInterval} * * * *`;

      const task = cron.schedule(cronExpression, async () => {
        await this.performSync(tenantId, provider.id);
      });

      this.scheduledTasks.set(taskKey, {
        task,
        providerId: provider.id,
        tenantId,
        nextRun: this.calculateNextRun(actualInterval)
      });

      console.log(`[Scheduler] Scheduled ${provider.name} (${provider.type}) - every ${actualInterval} minutes`);
    } catch (error) {
      console.error(`[Scheduler] Failed to schedule provider ${provider.id}:`, error);
    }
  }

  /**
   * Calculate next run time based on interval
   */
  private calculateNextRun(intervalMinutes: number): Date {
    return new Date(Date.now() + intervalMinutes * 60 * 1000);
  }

  /**
   * Create IdP connector instance
   */
  private async createConnector(provider: any, tenantId: string): Promise<IdPConnector> {
    // Decrypt client secret
    const decryptedSecret = decrypt(provider.clientSecret);

    const config = {
      clientId: provider.clientId,
      clientSecret: decryptedSecret,
      tenantDomain: provider.tenantDomain || undefined,
      scopes: provider.scopes || [],
      customConfig: provider.config || {}
    };

    // Create appropriate connector based on type
    switch (provider.type) {
      case 'azuread':
        return new AzureADConnector(config, tenantId, provider.id);

      case 'google':
        return new GoogleWorkspaceConnector(config, tenantId, provider.id);

      case 'okta':
        return new OktaConnector(config, tenantId, provider.id);

      default:
        throw new Error(`Unsupported provider type: ${provider.type}`);
    }
  }

  /**
   * Perform sync for a specific provider
   */
  async performSync(tenantId: string, providerId: string): Promise<void> {
    const taskKey = `${tenantId}-${providerId}`;

    // Prevent concurrent syncs for the same provider
    if (this.runningSyncs.has(taskKey)) {
      console.log(`[Scheduler] Sync already running for ${taskKey}, skipping...`);
      return;
    }

    this.runningSyncs.add(taskKey);

    try {
      // Get provider details
      const provider = await storage.getIdentityProvider(providerId, tenantId);

      if (!provider) {
        console.error(`[Scheduler] Provider ${providerId} not found`);
        return;
      }

      if (provider.status !== 'active') {
        console.log(`[Scheduler] Provider ${provider.name} is not active, skipping sync`);
        return;
      }

      console.log(`[Scheduler] Starting sync: ${provider.name} (${provider.type})`);

      // Update status to syncing
      await storage.updateIdpSyncStatus(providerId, tenantId, 'syncing');

      // Update scheduled task last run time
      if (this.scheduledTasks.has(taskKey)) {
        const scheduled = this.scheduledTasks.get(taskKey)!;
        scheduled.lastRun = new Date();
        scheduled.nextRun = this.calculateNextRun(Math.floor((provider.syncInterval || 3600) / 60));
      }

      // Create connector
      const connector = await this.createConnector(provider, tenantId);

      // Perform full sync
      const syncResult = await connector.performFullSync();

      if (syncResult.success) {
        console.log(`[Scheduler] Sync successful for ${provider.name}:`);
        console.log(`  - Apps discovered: ${syncResult.appsDiscovered}`);
        console.log(`  - Users processed: ${syncResult.usersProcessed}`);
        console.log(`  - Tokens discovered: ${syncResult.tokensDiscovered}`);
        console.log(`  - Duration: ${syncResult.syncDuration}ms`);

        // Process discovered apps with Shadow IT detector
        const detector = new ShadowITDetector(tenantId);
        const processingStats = await detector.processFullSync(syncResult, providerId);

        console.log(`[Scheduler] Shadow IT processing complete:`);
        console.log(`  - Apps processed: ${processingStats.appsProcessed}`);
        console.log(`  - Apps created: ${processingStats.appsCreated}`);
        console.log(`  - Apps updated: ${processingStats.appsUpdated}`);
        console.log(`  - Shadow IT detected: ${processingStats.shadowITDetected}`);
        console.log(`  - High risk apps: ${processingStats.highRiskApps}`);

        // Update provider stats
        await storage.updateIdentityProvider(providerId, tenantId, {
          totalApps: syncResult.appsDiscovered,
          totalUsers: syncResult.usersProcessed
        });

        // Update sync status to idle
        await storage.updateIdpSyncStatus(providerId, tenantId, 'idle', null, new Date());
      } else {
        // Sync failed
        const errorMessage = syncResult.errors.join('; ');
        console.error(`[Scheduler] Sync failed for ${provider.name}:`, errorMessage);

        await storage.updateIdpSyncStatus(providerId, tenantId, 'error', errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Scheduler] Sync error for ${taskKey}:`, error);

      try {
        await storage.updateIdpSyncStatus(providerId, tenantId, 'error', errorMessage);
      } catch (updateError) {
        console.error(`[Scheduler] Failed to update sync status:`, updateError);
      }
    } finally {
      this.runningSyncs.delete(taskKey);
    }
  }

  /**
   * Trigger immediate sync (manual trigger)
   */
  async triggerImmediateSync(tenantId: string, providerId: string): Promise<void> {
    console.log(`[Scheduler] Triggering immediate sync for provider ${providerId}`);
    await this.performSync(tenantId, providerId);
  }

  /**
   * Stop sync schedule for a specific provider
   */
  stopProvider(tenantId: string, providerId: string): void {
    const taskKey = `${tenantId}-${providerId}`;

    if (this.scheduledTasks.has(taskKey)) {
      const scheduled = this.scheduledTasks.get(taskKey)!;
      scheduled.task.stop();
      this.scheduledTasks.delete(taskKey);
      console.log(`[Scheduler] Stopped sync for provider ${providerId}`);
    }
  }

  /**
   * Stop all scheduled syncs for a tenant
   */
  stopTenant(tenantId: string): void {
    const keysToRemove: string[] = [];

    for (const [key, scheduled] of this.scheduledTasks.entries()) {
      if (scheduled.tenantId === tenantId) {
        scheduled.task.stop();
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => this.scheduledTasks.delete(key));
    console.log(`[Scheduler] Stopped ${keysToRemove.length} syncs for tenant ${tenantId}`);
  }

  /**
   * Stop all scheduled syncs
   */
  stopAll(): void {
    for (const scheduled of this.scheduledTasks.values()) {
      scheduled.task.stop();
    }

    this.scheduledTasks.clear();
    console.log('[Scheduler] Stopped all scheduled syncs');
  }

  /**
   * Get status of scheduled syncs
   */
  getStatus(): Array<{
    tenantId: string;
    providerId: string;
    lastRun?: Date;
    nextRun?: Date;
    isRunning: boolean;
  }> {
    const status: Array<any> = [];

    for (const [key, scheduled] of this.scheduledTasks.entries()) {
      status.push({
        tenantId: scheduled.tenantId,
        providerId: scheduled.providerId,
        lastRun: scheduled.lastRun,
        nextRun: scheduled.nextRun,
        isRunning: this.runningSyncs.has(key)
      });
    }

    return status;
  }

  /**
   * Get number of active schedules
   */
  getActiveCount(): number {
    return this.scheduledTasks.size;
  }

  /**
   * Get number of running syncs
   */
  getRunningCount(): number {
    return this.runningSyncs.size;
  }
}

// Singleton instance
export const idpSyncScheduler = new IdPSyncScheduler();

// Initialize on module load
idpSyncScheduler.initialize().catch(error => {
  console.error('[Scheduler] Failed to initialize:', error);
});
