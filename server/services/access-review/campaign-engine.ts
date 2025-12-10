/**
 * Access Review Campaign Engine
 *
 * Manages quarterly/annual access certification campaigns:
 * - Create and configure campaigns
 * - Generate review items from user access data
 * - Assign reviewers (managers)
 * - Track progress and SLAs
 * - Execute decisions (approve/revoke)
 * - Generate compliance reports
 *
 * Target: 95% completion rate within deadline
 */

import { storage } from '../../storage';
import type { InsertAccessReviewCampaign, InsertAccessReviewItem } from '@shared/schema';
import { policyEngine } from '../policy/engine';

export interface CampaignConfig {
  name: string;
  description?: string;
  campaignType: 'quarterly' | 'department' | 'high_risk' | 'admin' | 'new_hire' | 'departure';
  frequency?: 'quarterly' | 'semi_annual' | 'annual' | 'one_time';
  scopeType: 'all' | 'department' | 'apps' | 'users';
  scopeConfig?: {
    departments?: string[];
    appIds?: string[];
    userIds?: string[];
  };
  startDate: Date;
  dueDate: Date;
  autoApproveOnTimeout?: boolean;
}

export interface ReviewItemContext {
  userId: string;
  userName: string;
  userEmail?: string;
  userDepartment?: string;
  userManager?: string;
  appId: string;
  appName: string;
  accessType?: string;
  grantedDate?: Date;
  lastUsedDate?: Date;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface CampaignProgress {
  campaignId: string;
  status: string;
  totalItems: number;
  reviewedItems: number;
  approvedItems: number;
  revokedItems: number;
  deferredItems: number;
  percentComplete: number;
  daysRemaining: number;
  isOverdue: boolean;
}

export interface BulkDecision {
  itemIds: string[];
  decision: 'approved' | 'revoked' | 'deferred';
  notes?: string;
  reviewerId: string;
  reviewerName: string;
}

/**
 * Access Review Campaign Engine
 */
export class AccessReviewCampaignEngine {
  constructor(private tenantId: string) {}

  /**
   * Create a new access review campaign
   */
  async createCampaign(config: CampaignConfig, createdBy: string): Promise<string> {
    console.log(`[AccessReview] Creating campaign: ${config.name}`);

    // Create campaign record
    const campaign = await storage.createAccessReviewCampaign({
      tenantId: this.tenantId,
      name: config.name,
      description: config.description,
      campaignType: config.campaignType,
      frequency: config.frequency,
      scopeType: config.scopeType,
      scopeConfig: config.scopeConfig || {},
      startDate: config.startDate,
      dueDate: config.dueDate,
      autoApproveOnTimeout: config.autoApproveOnTimeout || false,
      createdBy,
      status: 'draft',
    });

    console.log(`[AccessReview] Created campaign ${campaign.id}`);

    return campaign.id;
  }

  /**
   * Generate review items for a campaign based on scope
   */
  async generateReviewItems(campaignId: string): Promise<number> {
    console.log(`[AccessReview] Generating review items for campaign ${campaignId}`);

    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get all user access based on campaign scope
    const userAccessList = await this.getUserAccessByScope(campaign);

    console.log(`[AccessReview] Found ${userAccessList.length} access items to review`);

    // Create review items
    let itemsCreated = 0;
    for (const access of userAccessList) {
      try {
        const reviewItem = await this.createReviewItem(campaignId, access);
        if (reviewItem) {
          itemsCreated++;
        }
      } catch (error) {
        console.error(`[AccessReview] Error creating review item:`, error);
      }
    }

    // Update campaign with total items
    await storage.updateAccessReviewCampaign(campaignId, this.tenantId, {
      totalItems: itemsCreated,
      status: 'active',
    });

    console.log(`[AccessReview] Created ${itemsCreated} review items`);

    return itemsCreated;
  }

  /**
   * Get user access based on campaign scope
   */
  private async getUserAccessByScope(campaign: any): Promise<any[]> {
    // Get all user app access for the tenant
    const allAccess = await storage.getAllUserAppAccess(this.tenantId);

    // Filter based on scope
    if (campaign.scopeType === 'all') {
      return allAccess;
    }

    if (campaign.scopeType === 'department' && campaign.scopeConfig?.departments) {
      return allAccess.filter(access =>
        campaign.scopeConfig.departments.includes(access.userDepartment)
      );
    }

    if (campaign.scopeType === 'apps' && campaign.scopeConfig?.appIds) {
      return allAccess.filter(access =>
        campaign.scopeConfig.appIds.includes(access.appId)
      );
    }

    if (campaign.scopeType === 'users' && campaign.scopeConfig?.userIds) {
      return allAccess.filter(access =>
        campaign.scopeConfig.userIds.includes(access.userId)
      );
    }

    return allAccess;
  }

  /**
   * Create a review item
   */
  private async createReviewItem(campaignId: string, access: any): Promise<any> {
    // Get user details
    const user = await storage.getUser(access.userId);
    const app = await storage.getSaasApp(access.appId, this.tenantId);

    if (!user || !app) {
      console.warn(`[AccessReview] Skipping item - user or app not found`);
      return null;
    }

    // Calculate days since last use
    const daysSinceLastUse = access.lastAccessDate
      ? Math.floor((Date.now() - new Date(access.lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(app, access, daysSinceLastUse);

    // Assign reviewer (user's manager)
    const reviewerId = user.manager || null;
    const reviewerName = reviewerId ? (await storage.getUser(reviewerId))?.name : null;

    const reviewItem: InsertAccessReviewItem = {
      campaignId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userDepartment: user.department,
      userManager: user.manager,
      appId: app.id,
      appName: app.name,
      accessType: access.accessType,
      grantedDate: access.grantedDate,
      lastUsedDate: access.lastAccessDate,
      daysSinceLastUse,
      businessJustification: access.businessJustification,
      riskLevel,
      reviewerId,
      reviewerName,
      decision: 'pending',
      executionStatus: 'pending',
    };

    return await storage.createAccessReviewItem(reviewItem);
  }

  /**
   * Calculate risk level for an access item
   */
  private calculateRiskLevel(
    app: any,
    access: any,
    daysSinceLastUse: number | null
  ): 'low' | 'medium' | 'high' | 'critical' {
    let score = 0;

    // App risk score
    if (app.riskScore >= 75) score += 30;
    else if (app.riskScore >= 50) score += 20;
    else if (app.riskScore >= 25) score += 10;

    // Admin access
    if (access.accessType === 'admin' || access.accessType === 'owner') {
      score += 25;
    }

    // Unused access
    if (daysSinceLastUse !== null) {
      if (daysSinceLastUse > 180) score += 30;
      else if (daysSinceLastUse > 90) score += 20;
      else if (daysSinceLastUse > 30) score += 10;
    }

    // No business justification
    if (!access.businessJustification) {
      score += 10;
    }

    // Determine risk level
    if (score >= 60) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    return 'low';
  }

  /**
   * Submit a review decision for an item
   */
  async submitDecision(
    itemId: string,
    decision: 'approved' | 'revoked' | 'deferred',
    notes: string | undefined,
    reviewerId: string,
    reviewerName: string
  ): Promise<void> {
    console.log(`[AccessReview] Submitting decision for item ${itemId}: ${decision}`);

    const item = await storage.getAccessReviewItem(itemId);
    if (!item) {
      throw new Error('Review item not found');
    }

    // Update review item
    await storage.updateAccessReviewItem(itemId, {
      decision,
      decisionNotes: notes,
      reviewerId,
      reviewerName,
      reviewedAt: new Date(),
    });

    // Create decision record for audit trail
    await storage.createAccessReviewDecision({
      campaignId: item.campaignId,
      reviewItemId: itemId,
      decision,
      decisionNotes: notes,
      decisionRationale: notes,
      reviewerId,
      reviewerName,
      reviewerEmail: (await storage.getUser(reviewerId))?.email,
      executionStatus: 'pending',
    });

    // Update campaign progress
    await this.updateCampaignProgress(item.campaignId);

    // Execute decision if revoked
    if (decision === 'revoked') {
      await this.executeRevocation(item);
    }
  }

  /**
   * Submit bulk decisions
   */
  async submitBulkDecision(bulkDecision: BulkDecision): Promise<void> {
    console.log(`[AccessReview] Submitting bulk decision for ${bulkDecision.itemIds.length} items`);

    for (const itemId of bulkDecision.itemIds) {
      try {
        await this.submitDecision(
          itemId,
          bulkDecision.decision,
          bulkDecision.notes,
          bulkDecision.reviewerId,
          bulkDecision.reviewerName
        );
      } catch (error) {
        console.error(`[AccessReview] Error processing item ${itemId}:`, error);
      }
    }
  }

  /**
   * Execute access revocation
   */
  private async executeRevocation(item: any): Promise<void> {
    console.log(`[AccessReview] Executing revocation for ${item.userName} - ${item.appName}`);

    try {
      // Use Phase 3 offboarding SSO/OAuth revocation if available
      // For now, just update the user_app_access status
      await storage.revokeUserAppAccess(item.userId, item.appId, this.tenantId);

      // Update execution status
      await storage.updateAccessReviewItem(item.id, {
        executionStatus: 'completed',
        executedAt: new Date(),
      });

      console.log(`[AccessReview] Revocation completed for ${item.userName} - ${item.appName}`);
    } catch (error) {
      console.error(`[AccessReview] Revocation failed:`, error);

      await storage.updateAccessReviewItem(item.id, {
        executionStatus: 'failed',
        executionError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update campaign progress counters
   */
  private async updateCampaignProgress(campaignId: string): Promise<void> {
    const items = await storage.getAccessReviewItems(campaignId);

    const reviewedItems = items.filter(i => i.decision !== 'pending').length;
    const approvedItems = items.filter(i => i.decision === 'approved').length;
    const revokedItems = items.filter(i => i.decision === 'revoked').length;
    const deferredItems = items.filter(i => i.decision === 'deferred').length;

    await storage.updateAccessReviewCampaign(campaignId, this.tenantId, {
      reviewedItems,
      approvedItems,
      revokedItems,
      deferredItems,
    });
  }

  /**
   * Get campaign progress
   */
  async getCampaignProgress(campaignId: string): Promise<CampaignProgress> {
    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const totalItems = campaign.totalItems || 0;
    const reviewedItems = campaign.reviewedItems || 0;
    const percentComplete = totalItems > 0 ? Math.round((reviewedItems / totalItems) * 100) : 0;

    const daysRemaining = Math.ceil(
      (new Date(campaign.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    const isOverdue = daysRemaining < 0;

    return {
      campaignId: campaign.id,
      status: campaign.status,
      totalItems,
      reviewedItems,
      approvedItems: campaign.approvedItems || 0,
      revokedItems: campaign.revokedItems || 0,
      deferredItems: campaign.deferredItems || 0,
      percentComplete,
      daysRemaining,
      isOverdue,
    };
  }

  /**
   * Complete a campaign
   */
  async completeCampaign(campaignId: string): Promise<void> {
    console.log(`[AccessReview] Completing campaign ${campaignId}`);

    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Generate completion report
    const reportUrl = await this.generateCompletionReport(campaignId);

    // Update campaign status
    await storage.updateAccessReviewCampaign(campaignId, this.tenantId, {
      status: 'completed',
      completedAt: new Date(),
      completionReportUrl: reportUrl,
    });

    // Emit policy event for campaign completion
    const eventSystem = policyEngine.getEventSystem();
    eventSystem.emit('access_review.completed', {
      tenantId: this.tenantId,
      campaignId,
      campaignName: campaign.name,
      totalItems: campaign.totalItems || 0,
      reviewedItems: campaign.reviewedItems || 0,
      revokedItems: campaign.revokedItems || 0,
    });

    console.log(`[AccessReview] Campaign ${campaignId} completed`);
  }

  /**
   * Generate completion report for compliance
   */
  private async generateCompletionReport(campaignId: string): Promise<string> {
    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    const items = await storage.getAccessReviewItems(campaignId);
    const decisions = await storage.getAccessReviewDecisions(campaignId);

    const report = {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.campaignType,
        startDate: campaign.startDate,
        dueDate: campaign.dueDate,
        completedAt: new Date(),
      },
      summary: {
        totalItems: campaign.totalItems || 0,
        reviewedItems: campaign.reviewedItems || 0,
        approvedItems: campaign.approvedItems || 0,
        revokedItems: campaign.revokedItems || 0,
        deferredItems: campaign.deferredItems || 0,
        completionRate: campaign.totalItems
          ? Math.round(((campaign.reviewedItems || 0) / campaign.totalItems) * 100)
          : 0,
      },
      decisions: decisions.map(d => ({
        user: items.find(i => i.id === d.reviewItemId)?.userName,
        app: items.find(i => i.id === d.reviewItemId)?.appName,
        decision: d.decision,
        reviewer: d.reviewerName,
        timestamp: d.createdAt,
      })),
      auditTrail: {
        totalDecisions: decisions.length,
        uniqueReviewers: new Set(decisions.map(d => d.reviewerId)).size,
        accessRevoked: campaign.revokedItems || 0,
        executionSuccessRate: items.filter(i => i.executionStatus === 'completed').length /
          Math.max(items.filter(i => i.decision === 'revoked').length, 1) * 100,
      },
    };

    // In a real implementation, this would be saved to S3 or similar storage
    // For now, return a placeholder URL
    const reportUrl = `/api/access-reviews/campaigns/${campaignId}/report.pdf`;

    console.log(`[AccessReview] Generated compliance report:`, report);

    return reportUrl;
  }

  /**
   * Send reminder emails to reviewers with pending items
   */
  async sendReminders(campaignId: string): Promise<void> {
    console.log(`[AccessReview] Sending reminders for campaign ${campaignId}`);

    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const pendingItems = await storage.getAccessReviewItemsPending(campaignId);

    // Group by reviewer
    const itemsByReviewer = new Map<string, any[]>();
    for (const item of pendingItems) {
      if (item.reviewerId) {
        if (!itemsByReviewer.has(item.reviewerId)) {
          itemsByReviewer.set(item.reviewerId, []);
        }
        itemsByReviewer.get(item.reviewerId)!.push(item);
      }
    }

    // Send reminder to each reviewer
    for (const [reviewerId, items] of itemsByReviewer.entries()) {
      const reviewer = await storage.getUser(reviewerId);
      if (reviewer?.email) {
        console.log(`[AccessReview] Sending reminder to ${reviewer.name} (${items.length} pending items)`);

        // Calculate days remaining
        const dueDate = new Date(campaign.dueDate);
        const now = new Date();
        const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Prepare review items for email
        const reviewItems = items.map(item => ({
          userName: item.userName,
          appName: item.appName,
          riskLevel: item.riskLevel,
        }));

        // Get tenant for organization name
        const tenant = await storage.getTenant(this.tenantId);
        const orgName = tenant?.name || 'AssetInfo';

        // Send email
        const { sendEmail, createAccessReviewReminderTemplate } = await import('../email');
        const emailTemplate = createAccessReviewReminderTemplate(
          reviewer.name,
          campaign.name,
          items.length,
          dueDate,
          daysRemaining,
          reviewItems,
          orgName
        );

        const emailSent = await sendEmail({
          to: reviewer.email,
          from: process.env.FROM_EMAIL || 'noreply@assetinfo.example.com',
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
        });

        if (emailSent) {
          console.log(`[AccessReview] Reminder email sent successfully to ${reviewer.email}`);
        } else {
          console.error(`[AccessReview] Failed to send reminder email to ${reviewer.email}`);
        }
      }
    }
  }

  /**
   * Auto-approve pending items when campaign times out
   */
  async autoApprovePendingItems(campaignId: string): Promise<number> {
    console.log(`[AccessReview] Auto-approving pending items for campaign ${campaignId}`);

    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.autoApproveOnTimeout) {
      console.log('[AccessReview] Campaign does not have auto-approve enabled');
      return 0;
    }

    const pendingItems = await storage.getAccessReviewItemsPending(campaignId);
    console.log(`[AccessReview] Found ${pendingItems.length} pending items to auto-approve`);

    let approvedCount = 0;
    for (const item of pendingItems) {
      try {
        // Record decision as approved with system user
        await storage.createAccessReviewDecision({
          tenantId: this.tenantId,
          campaignId,
          itemId: item.id,
          reviewerId: 'system',
          reviewerName: 'System (Auto-Approved)',
          decision: 'approved',
          decisionRationale: 'Auto-approved due to campaign timeout',
          timestamp: new Date(),
        });

        // Update item
        await storage.updateAccessReviewItem(item.id, {
          decision: 'approved',
          decisionNotes: 'Auto-approved due to campaign timeout',
          executionStatus: 'completed',
          executedAt: new Date(),
        });

        approvedCount++;
      } catch (error) {
        console.error(`[AccessReview] Error auto-approving item ${item.id}:`, error);
      }
    }

    // Update campaign progress
    const updatedCampaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (updatedCampaign) {
      await storage.updateAccessReviewCampaign(campaignId, {
        reviewedItems: updatedCampaign.totalItems,
        approvedItems: updatedCampaign.approvedItems + approvedCount,
      });
    }

    console.log(`[AccessReview] Auto-approved ${approvedCount} items for campaign ${campaignId}`);
    return approvedCount;
  }

  /**
   * Escalate overdue reviews to manager's manager
   */
  async escalateOverdueReviews(campaignId: string, daysOverdue: number): Promise<number> {
    console.log(`[AccessReview] Escalating overdue reviews for campaign ${campaignId} (${daysOverdue} days overdue)`);

    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const pendingItems = await storage.getAccessReviewItemsPending(campaignId);

    // Group by reviewer to find their managers
    const itemsByReviewer = new Map<string, any[]>();
    for (const item of pendingItems) {
      if (item.reviewerId) {
        if (!itemsByReviewer.has(item.reviewerId)) {
          itemsByReviewer.set(item.reviewerId, []);
        }
        itemsByReviewer.get(item.reviewerId)!.push(item);
      }
    }

    let escalatedCount = 0;

    // Send escalation emails to each reviewer's manager
    for (const [reviewerId, items] of itemsByReviewer.entries()) {
      const reviewer = await storage.getUser(reviewerId);
      if (!reviewer) continue;

      // Get reviewer's manager
      let escalationTarget = reviewer.manager;
      if (!escalationTarget) {
        console.log(`[AccessReview] No manager found for reviewer ${reviewer.name}, skipping escalation`);
        continue;
      }

      const manager = await storage.getUserByUsername(escalationTarget);
      if (!manager?.email) {
        console.log(`[AccessReview] Manager ${escalationTarget} not found or has no email, skipping escalation`);
        continue;
      }

      // Get tenant for organization name
      const tenant = await storage.getTenant(this.tenantId);
      const orgName = tenant?.name || 'AssetInfo';

      // Send escalation email
      const { sendEmail } = await import('../email');
      const subject = `ESCALATION: Overdue Access Reviews - ${reviewer.name}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
            🚨 Escalation: Overdue Access Reviews
          </h2>

          <p>Hello ${manager.name},</p>

          <p>This is an escalation notice regarding overdue access reviews.</p>

          <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #dc2626;">⚠️ OVERDUE</h3>
            <p style="margin-bottom: 0;">
              <strong>Reviewer:</strong> ${reviewer.name} (${reviewer.email})<br>
              <strong>Campaign:</strong> ${campaign.name}<br>
              <strong>Pending Reviews:</strong> ${items.length}<br>
              <strong>Days Overdue:</strong> ${daysOverdue}
            </p>
          </div>

          <p>The following reviews have not been completed by the assigned reviewer:</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">User</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Application</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Risk</th>
              </tr>
            </thead>
            <tbody>
              ${items.slice(0, 10).map(item => {
                const riskColor = item.riskLevel === 'critical' ? '#dc2626' :
                                 item.riskLevel === 'high' ? '#f59e0b' :
                                 item.riskLevel === 'medium' ? '#3b82f6' : '#10b981';
                return `
                  <tr>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${item.userName}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">${item.appName}</td>
                    <td style="padding: 10px; border: 1px solid #e5e7eb;">
                      <span style="background-color: ${riskColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
                        ${item.riskLevel.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ${items.length > 10 ? `<p style="color: #666; font-style: italic;">...and ${items.length - 10} more</p>` : ''}

          <div style="background-color: #fef3c7; border: 1px solid #fde68a; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #92400e;">Action Required</h4>
            <p>Please follow up with ${reviewer.name} to ensure these reviews are completed promptly. Overdue access reviews can impact security compliance and audit requirements.</p>
            <p style="margin-bottom: 0;">
              <a href="${process.env.APP_URL || 'https://assetinfo.example.com'}/access-reviews"
                 style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 10px;">
                View Campaign
              </a>
            </p>
          </div>

          <p>If you have questions, please contact your security team.</p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          <p style="font-size: 12px; color: #666;">
            This escalation email was sent automatically by the ${orgName} IT Asset Management system.
          </p>
        </div>
      `;

      const text = `
🚨 ESCALATION: Overdue Access Reviews

Hello ${manager.name},

This is an escalation notice regarding overdue access reviews.

⚠️ OVERDUE

Reviewer: ${reviewer.name} (${reviewer.email})
Campaign: ${campaign.name}
Pending Reviews: ${items.length}
Days Overdue: ${daysOverdue}

The following reviews have not been completed by the assigned reviewer:

${items.slice(0, 10).map(item => `  - ${item.userName} - ${item.appName} (${item.riskLevel.toUpperCase()})`).join('\n')}
${items.length > 10 ? `...and ${items.length - 10} more` : ''}

Action Required:
Please follow up with ${reviewer.name} to ensure these reviews are completed promptly. Overdue access reviews can impact security compliance and audit requirements.

Visit: ${process.env.APP_URL || 'https://assetinfo.example.com'}/access-reviews

If you have questions, please contact your security team.

---
This escalation email was sent automatically by the ${orgName} IT Asset Management system.
      `;

      const emailSent = await sendEmail({
        to: manager.email,
        from: process.env.FROM_EMAIL || 'noreply@assetinfo.example.com',
        subject,
        text,
        html,
      });

      if (emailSent) {
        console.log(`[AccessReview] Escalation email sent to ${manager.email} for reviewer ${reviewer.name}`);
        escalatedCount++;
      } else {
        console.error(`[AccessReview] Failed to send escalation email to ${manager.email}`);
      }
    }

    console.log(`[AccessReview] Escalated ${escalatedCount} overdue reviews for campaign ${campaignId}`);
    return escalatedCount;
  }

  /**
   * Export campaign report as CSV for auditors
   */
  async exportCampaignCSV(campaignId: string): Promise<string> {
    const campaign = await storage.getAccessReviewCampaign(campaignId, this.tenantId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const items = await storage.getAccessReviewItems(campaignId);
    const decisions = await storage.getAccessReviewDecisions(campaignId);

    // Create CSV header
    const headers = [
      'Campaign Name',
      'Campaign Type',
      'User Name',
      'User Email',
      'User Department',
      'Application',
      'Access Type',
      'Risk Level',
      'Granted Date',
      'Last Used Date',
      'Days Since Last Use',
      'Business Justification',
      'Decision',
      'Reviewer Name',
      'Decision Date',
      'Decision Notes',
      'Execution Status',
      'Executed At'
    ];

    // Create CSV rows
    const rows = items.map(item => {
      const decision = decisions.find(d => d.reviewItemId === item.id);
      return [
        campaign.name,
        campaign.campaignType,
        item.userName,
        item.userEmail || '',
        item.userDepartment || '',
        item.appName,
        item.accessType || '',
        item.riskLevel || '',
        item.grantedDate ? new Date(item.grantedDate).toISOString().split('T')[0] : '',
        item.lastUsedDate ? new Date(item.lastUsedDate).toISOString().split('T')[0] : '',
        item.daysSinceLastUse !== null && item.daysSinceLastUse !== undefined ? item.daysSinceLastUse.toString() : '',
        item.businessJustification || '',
        item.decision || 'pending',
        decision?.reviewerName || '',
        decision?.createdAt ? new Date(decision.createdAt).toISOString() : '',
        item.decisionNotes || '',
        item.executionStatus || '',
        item.executedAt ? new Date(item.executedAt).toISOString() : ''
      ].map(field => {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const escaped = field.replace(/"/g, '""');
        return /[,\n"]/.test(escaped) ? `"${escaped}"` : escaped;
      });
    });

    // Combine headers and rows
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csv;
  }
}
