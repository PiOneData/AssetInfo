/**
 * Access Review Scheduler
 *
 * Handles scheduled tasks for Phase 5:
 * - Quarterly access review campaign creation
 * - Daily privilege drift scans
 * - Weekly overprivileged account scans
 * - SLA reminder emails
 */

import { storage } from '../../storage';
import { AccessReviewCampaignEngine } from './campaign-engine';
import { PrivilegeDriftDetector } from './privilege-drift';
import { OverprivilegedAccountDetector } from './overprivileged-detector';
import type { CampaignConfig } from './campaign-engine';

export class AccessReviewScheduler {
  /**
   * Create quarterly access review campaigns
   * Runs on the first day of each quarter (Jan 1, Apr 1, Jul 1, Oct 1)
   */
  static async createQuarterlyAccessReviewCampaigns(): Promise<void> {
    console.log('[AccessReviewScheduler] Starting quarterly access review campaign creation');

    try {
      // Get all tenants
      const tenants = await storage.getTenants();

      for (const tenant of tenants) {
        try {
          // Check if a quarterly campaign already exists for this quarter
          const campaigns = await storage.getAccessReviewCampaigns(tenant.id, {
            status: 'active',
          });

          const hasActiveQuarterlyCampaign = campaigns.some(
            (c) => c.campaignType === 'quarterly' && c.status === 'active'
          );

          if (hasActiveQuarterlyCampaign) {
            console.log(`[AccessReviewScheduler] Tenant ${tenant.id} already has active quarterly campaign`);
            continue;
          }

          // Create new quarterly campaign
          const now = new Date();
          const quarter = Math.floor(now.getMonth() / 3) + 1;
          const year = now.getFullYear();
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + 30); // 30 days to complete

          const config: CampaignConfig = {
            name: `Q${quarter} ${year} Access Review`,
            description: `Quarterly access certification for Q${quarter} ${year}`,
            campaignType: 'quarterly',
            frequency: 'quarterly',
            scopeType: 'all',
            startDate: now,
            dueDate,
            autoApproveOnTimeout: false,
          };

          const engine = new AccessReviewCampaignEngine(tenant.id);
          const campaignId = await engine.createCampaign(config, 'system');

          // Generate review items
          const itemsCreated = await engine.generateReviewItems(campaignId);

          console.log(
            `[AccessReviewScheduler] Created quarterly campaign ${campaignId} for tenant ${tenant.id} with ${itemsCreated} items`
          );
        } catch (error) {
          console.error(`[AccessReviewScheduler] Error creating campaign for tenant ${tenant.id}:`, error);
        }
      }

      console.log('[AccessReviewScheduler] Quarterly campaign creation completed');
    } catch (error) {
      console.error('[AccessReviewScheduler] Error in quarterly campaign creation:', error);
    }
  }

  /**
   * Run privilege drift detection for all tenants
   * Runs daily
   */
  static async runPrivilegeDriftDetection(): Promise<void> {
    console.log('[AccessReviewScheduler] Starting privilege drift detection');

    try {
      const tenants = await storage.getTenants();

      for (const tenant of tenants) {
        try {
          const detector = new PrivilegeDriftDetector(tenant.id);
          const results = await detector.scanAll();

          // Create alerts for detected drift
          let alertsCreated = 0;
          for (const result of results) {
            await detector.createDriftAlert(result);
            alertsCreated++;
          }

          console.log(
            `[AccessReviewScheduler] Privilege drift scan completed for tenant ${tenant.id}: ${results.length} drift detected, ${alertsCreated} alerts created`
          );
        } catch (error) {
          console.error(`[AccessReviewScheduler] Error in drift detection for tenant ${tenant.id}:`, error);
        }
      }

      console.log('[AccessReviewScheduler] Privilege drift detection completed');
    } catch (error) {
      console.error('[AccessReviewScheduler] Error in privilege drift detection:', error);
    }
  }

  /**
   * Run overprivileged account detection for all tenants
   * Runs weekly
   */
  static async runOverprivilegedAccountDetection(): Promise<void> {
    console.log('[AccessReviewScheduler] Starting overprivileged account detection');

    try {
      const tenants = await storage.getTenants();

      for (const tenant of tenants) {
        try {
          const detector = new OverprivilegedAccountDetector(tenant.id);
          const results = await detector.scanAll();

          // Create alerts for detected overprivileged accounts
          let alertsCreated = 0;
          for (const result of results) {
            await detector.createOverprivilegedAlert(result);
            alertsCreated++;
          }

          console.log(
            `[AccessReviewScheduler] Overprivileged account scan completed for tenant ${tenant.id}: ${results.length} accounts detected, ${alertsCreated} alerts created`
          );
        } catch (error) {
          console.error(`[AccessReviewScheduler] Error in overprivileged detection for tenant ${tenant.id}:`, error);
        }
      }

      console.log('[AccessReviewScheduler] Overprivileged account detection completed');
    } catch (error) {
      console.error('[AccessReviewScheduler] Error in overprivileged account detection:', error);
    }
  }

  /**
   * Send reminder emails for pending access reviews
   * Runs daily
   */
  static async sendAccessReviewReminders(): Promise<void> {
    console.log('[AccessReviewScheduler] Starting access review reminders');

    try {
      const tenants = await storage.getTenants();

      for (const tenant of tenants) {
        try {
          // Get all active campaigns
          const campaigns = await storage.getAccessReviewCampaigns(tenant.id, {
            status: 'active',
          });

          for (const campaign of campaigns) {
            // Check if campaign is approaching due date
            const dueDate = new Date(campaign.dueDate);
            const now = new Date();
            const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            // Send reminders at 7 days, 3 days, and 1 day before due date
            if (daysRemaining === 7 || daysRemaining === 3 || daysRemaining === 1) {
              const engine = new AccessReviewCampaignEngine(tenant.id);
              await engine.sendReminders(campaign.id);

              console.log(
                `[AccessReviewScheduler] Sent reminders for campaign ${campaign.id} (${daysRemaining} days remaining)`
              );
            }

            // Check if campaign is overdue
            if (daysRemaining < 0) {
              const daysOverdue = Math.abs(daysRemaining);
              console.log(`[AccessReviewScheduler] Campaign ${campaign.id} is overdue by ${daysOverdue} days`);

              // Escalate to managers at specific milestones (3, 7, 14 days overdue)
              if (daysOverdue === 3 || daysOverdue === 7 || daysOverdue === 14) {
                const engine = new AccessReviewCampaignEngine(tenant.id);
                await engine.escalateOverdueReviews(campaign.id, daysOverdue);
                console.log(`[AccessReviewScheduler] Escalated overdue reviews for campaign ${campaign.id}`);
              }

              // Auto-approve pending items if configured and significantly overdue (7+ days)
              if (campaign.autoApproveOnTimeout && daysOverdue >= 7) {
                const engine = new AccessReviewCampaignEngine(tenant.id);
                await engine.autoApprovePendingItems(campaign.id);
                console.log(`[AccessReviewScheduler] Auto-approved pending items for campaign ${campaign.id}`);
              }

              // Emit overdue event for policy automation
              const { policyEngine } = await import('../policy/engine');
              const eventSystem = policyEngine.getEventSystem();
              eventSystem.emit('access_review.overdue', {
                tenantId: tenant.id,
                campaignId: campaign.id,
                campaignName: campaign.name,
                daysOverdue,
                autoApproved: campaign.autoApproveOnTimeout && daysOverdue >= 7,
              });
            }
          }
        } catch (error) {
          console.error(`[AccessReviewScheduler] Error sending reminders for tenant ${tenant.id}:`, error);
        }
      }

      console.log('[AccessReviewScheduler] Access review reminders completed');
    } catch (error) {
      console.error('[AccessReviewScheduler] Error in access review reminders:', error);
    }
  }

  /**
   * Initialize all scheduled tasks
   */
  static initializeScheduledTasks(): void {
    console.log('[AccessReviewScheduler] Initializing scheduled tasks');

    // Quarterly access review campaigns - run on 1st of Jan, Apr, Jul, Oct at midnight
    // For demo purposes, we'll check daily and only create if it's a new quarter
    setInterval(
      () => {
        const now = new Date();
        const isFirstOfMonth = now.getDate() === 1;
        const isQuarterStart = [0, 3, 6, 9].includes(now.getMonth()); // Jan, Apr, Jul, Oct

        if (isFirstOfMonth && isQuarterStart) {
          AccessReviewScheduler.createQuarterlyAccessReviewCampaigns();
        }
      },
      24 * 60 * 60 * 1000
    ); // Check daily

    // Privilege drift detection - run daily at 2 AM
    setInterval(
      () => {
        AccessReviewScheduler.runPrivilegeDriftDetection();
      },
      24 * 60 * 60 * 1000
    ); // Daily

    // Overprivileged account detection - run weekly on Mondays at 3 AM
    setInterval(
      () => {
        const now = new Date();
        const isMonday = now.getDay() === 1;

        if (isMonday) {
          AccessReviewScheduler.runOverprivilegedAccountDetection();
        }
      },
      24 * 60 * 60 * 1000
    ); // Check daily, run on Mondays

    // Access review reminders - run daily at 9 AM
    setInterval(
      () => {
        AccessReviewScheduler.sendAccessReviewReminders();
      },
      24 * 60 * 60 * 1000
    ); // Daily

    console.log('[AccessReviewScheduler] Scheduled tasks initialized');
    console.log('  - Quarterly campaigns: 1st of Jan/Apr/Jul/Oct');
    console.log('  - Privilege drift scan: Daily');
    console.log('  - Overprivileged account scan: Weekly (Mondays)');
    console.log('  - Access review reminders: Daily');
  }
}
