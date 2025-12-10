/**
 * Phase 5: Identity Governance & Access Reviews API Routes
 *
 * Provides endpoints for:
 * - Access review campaigns
 * - Privilege drift detection
 * - Overprivileged account monitoring
 * - Role template management
 */

import { Router } from 'express';
import { storage } from '../storage';
import { requireRole } from '../middleware/auth.middleware';
import { AccessReviewCampaignEngine } from '../services/access-review/campaign-engine';
import { PrivilegeDriftDetector } from '../services/access-review/privilege-drift';
import { OverprivilegedAccountDetector } from '../services/access-review/overprivileged-detector';
import type {
  CampaignConfig,
  BulkDecision,
} from '../services/access-review/campaign-engine';
import type { RoleTemplateDefinition } from '../services/access-review/privilege-drift';

const router = Router();

// ============================================
// Access Review Campaigns
// ============================================

/**
 * GET /api/access-reviews/campaigns
 * List all access review campaigns
 */
router.get('/campaigns', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status } = req.query;

    const campaigns = await storage.getAccessReviewCampaigns(tenantId, {
      status: status as string | undefined,
    });

    res.json({ campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

/**
 * GET /api/access-reviews/campaigns/:id
 * Get campaign details
 */
router.get('/campaigns/:id', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const campaign = await storage.getAccessReviewCampaign(id, tenantId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

/**
 * POST /api/access-reviews/campaigns
 * Create a new access review campaign
 */
router.post('/campaigns', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const config: CampaignConfig = req.body;

    // Validate config
    if (!config.name || !config.campaignType || !config.scopeType || !config.startDate || !config.dueDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const engine = new AccessReviewCampaignEngine(tenantId);
    const campaignId = await engine.createCampaign(config, userId);

    res.status(201).json({ campaignId, message: 'Campaign created successfully' });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * POST /api/access-reviews/campaigns/:id/generate-items
 * Generate review items for a campaign
 */
router.post('/campaigns/:id/generate-items', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const engine = new AccessReviewCampaignEngine(tenantId);
    const itemsCreated = await engine.generateReviewItems(id);

    res.json({ itemsCreated, message: 'Review items generated successfully' });
  } catch (error) {
    console.error('Error generating review items:', error);
    res.status(500).json({ error: 'Failed to generate review items' });
  }
});

/**
 * GET /api/access-reviews/campaigns/:id/items
 * Get review items for a campaign
 */
router.get('/campaigns/:id/items', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const items = await storage.getAccessReviewItems(id);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching review items:', error);
    res.status(500).json({ error: 'Failed to fetch review items' });
  }
});

/**
 * GET /api/access-reviews/campaigns/:id/progress
 * Get campaign progress
 */
router.get('/campaigns/:id/progress', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const engine = new AccessReviewCampaignEngine(tenantId);
    const progress = await engine.getCampaignProgress(id);

    res.json({ progress });
  } catch (error) {
    console.error('Error fetching campaign progress:', error);
    res.status(500).json({ error: 'Failed to fetch campaign progress' });
  }
});

/**
 * POST /api/access-reviews/campaigns/:id/complete
 * Complete a campaign
 */
router.post('/campaigns/:id/complete', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const engine = new AccessReviewCampaignEngine(tenantId);
    await engine.completeCampaign(id);

    res.json({ message: 'Campaign completed successfully' });
  } catch (error) {
    console.error('Error completing campaign:', error);
    res.status(500).json({ error: 'Failed to complete campaign' });
  }
});

/**
 * POST /api/access-reviews/campaigns/:id/reminders
 * Send reminder emails to reviewers
 */
router.post('/campaigns/:id/reminders', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const engine = new AccessReviewCampaignEngine(tenantId);
    await engine.sendReminders(id);

    res.json({ message: 'Reminders sent successfully' });
  } catch (error) {
    console.error('Error sending reminders:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

/**
 * GET /api/access-reviews/campaigns/:id/export/csv
 * Export campaign report as CSV for auditors
 */
router.get('/campaigns/:id/export/csv', requireRole(['admin', 'compliance_manager', 'auditor']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const engine = new AccessReviewCampaignEngine(tenantId);
    const csv = await engine.exportCampaignCSV(id);

    // Get campaign name for filename
    const campaign = await storage.getAccessReviewCampaign(id, tenantId);
    const filename = campaign
      ? `access-review-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
      : `access-review-${id}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting campaign CSV:', error);
    res.status(500).json({ error: 'Failed to export campaign' });
  }
});

// ============================================
// Access Review Items & Decisions
// ============================================

/**
 * POST /api/access-reviews/items/:id/decision
 * Submit a review decision for an item
 */
router.post('/items/:id/decision', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.name;
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!decision || !['approved', 'revoked', 'deferred'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const item = await storage.getAccessReviewItem(id);
    if (!item) {
      return res.status(404).json({ error: 'Review item not found' });
    }

    const engine = new AccessReviewCampaignEngine(tenantId);
    await engine.submitDecision(id, decision, notes, userId, userName);

    res.json({ message: 'Decision submitted successfully' });
  } catch (error) {
    console.error('Error submitting decision:', error);
    res.status(500).json({ error: 'Failed to submit decision' });
  }
});

/**
 * POST /api/access-reviews/campaigns/:id/bulk-decision
 * Submit bulk decisions for multiple items
 */
router.post('/campaigns/:id/bulk-decision', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const userName = req.user!.name;
    const { itemIds, decision, notes } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }

    if (!decision || !['approved', 'revoked', 'deferred'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    const bulkDecision: BulkDecision = {
      itemIds,
      decision,
      notes,
      reviewerId: userId,
      reviewerName: userName,
    };

    const engine = new AccessReviewCampaignEngine(tenantId);
    await engine.submitBulkDecision(bulkDecision);

    res.json({ message: `Bulk decision submitted for ${itemIds.length} items` });
  } catch (error) {
    console.error('Error submitting bulk decision:', error);
    res.status(500).json({ error: 'Failed to submit bulk decision' });
  }
});

/**
 * GET /api/access-reviews/my-reviews
 * Get pending review items assigned to current user
 */
router.get('/my-reviews', requireRole(['admin', 'compliance_manager', 'manager']), async (req, res) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;

    // Get all active campaigns
    const campaigns = await storage.getAccessReviewCampaigns(tenantId, { status: 'active' });

    // Get pending items for each campaign assigned to this user
    const myReviews = [];
    for (const campaign of campaigns) {
      const items = await storage.getAccessReviewItemsPending(campaign.id);
      const myItems = items.filter(item => item.reviewerId === userId);

      if (myItems.length > 0) {
        myReviews.push({
          campaign,
          items: myItems,
        });
      }
    }

    res.json({ reviews: myReviews });
  } catch (error) {
    console.error('Error fetching my reviews:', error);
    res.status(500).json({ error: 'Failed to fetch my reviews' });
  }
});

// ============================================
// Role Templates
// ============================================

/**
 * GET /api/role-templates
 * List all role templates
 */
router.get('/role-templates', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { department } = req.query;

    const templates = await storage.getRoleTemplates(tenantId, {
      department: department as string | undefined,
    });

    res.json({ templates });
  } catch (error) {
    console.error('Error fetching role templates:', error);
    res.status(500).json({ error: 'Failed to fetch role templates' });
  }
});

/**
 * GET /api/role-templates/prebuilt
 * Get pre-built role templates
 */
router.get('/role-templates/prebuilt', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const detector = new PrivilegeDriftDetector(tenantId);
    const prebuiltTemplates = detector.getPrebuiltTemplates();

    res.json({ templates: prebuiltTemplates });
  } catch (error) {
    console.error('Error fetching prebuilt templates:', error);
    res.status(500).json({ error: 'Failed to fetch prebuilt templates' });
  }
});

/**
 * GET /api/role-templates/:id
 * Get role template details
 */
router.get('/role-templates/:id', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const template = await storage.getRoleTemplate(id, tenantId);
    if (!template) {
      return res.status(404).json({ error: 'Role template not found' });
    }

    res.json({ template });
  } catch (error) {
    console.error('Error fetching role template:', error);
    res.status(500).json({ error: 'Failed to fetch role template' });
  }
});

/**
 * POST /api/role-templates
 * Create a new role template
 */
router.post('/role-templates', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const template: RoleTemplateDefinition = req.body;

    if (!template.name || !template.expectedApps) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const detector = new PrivilegeDriftDetector(tenantId);
    const templateId = await detector.createRoleTemplate(template, userId);

    res.status(201).json({ templateId, message: 'Role template created successfully' });
  } catch (error) {
    console.error('Error creating role template:', error);
    res.status(500).json({ error: 'Failed to create role template' });
  }
});

/**
 * PUT /api/role-templates/:id
 * Update a role template
 */
router.put('/role-templates/:id', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const updates = req.body;

    const updated = await storage.updateRoleTemplate(id, tenantId, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Role template not found' });
    }

    res.json({ template: updated, message: 'Role template updated successfully' });
  } catch (error) {
    console.error('Error updating role template:', error);
    res.status(500).json({ error: 'Failed to update role template' });
  }
});

/**
 * DELETE /api/role-templates/:id
 * Delete a role template
 */
router.delete('/role-templates/:id', requireRole(['admin']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const deleted = await storage.deleteRoleTemplate(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: 'Role template not found' });
    }

    res.json({ message: 'Role template deleted successfully' });
  } catch (error) {
    console.error('Error deleting role template:', error);
    res.status(500).json({ error: 'Failed to delete role template' });
  }
});

/**
 * POST /api/role-templates/:id/assign
 * Assign a role template to a user
 */
router.post('/role-templates/:id/assign', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const assignedBy = req.user!.id;
    const { id } = req.params;
    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const detector = new PrivilegeDriftDetector(tenantId);
    await detector.assignRoleToUser(userId, id, assignedBy, reason);

    res.json({ message: 'Role assigned successfully' });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// ============================================
// Privilege Drift Detection
// ============================================

/**
 * GET /api/privilege-drift
 * List privilege drift alerts
 */
router.get('/privilege-drift', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, riskLevel } = req.query;

    const alerts = await storage.getPrivilegeDriftAlerts(tenantId, {
      status: status as string | undefined,
      riskLevel: riskLevel as string | undefined,
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Error fetching privilege drift alerts:', error);
    res.status(500).json({ error: 'Failed to fetch privilege drift alerts' });
  }
});

/**
 * POST /api/privilege-drift/scan
 * Run privilege drift scan
 */
router.post('/privilege-drift/scan', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const detector = new PrivilegeDriftDetector(tenantId);
    const results = await detector.scanAll();

    // Create alerts for detected drift
    let alertsCreated = 0;
    for (const result of results) {
      await detector.createDriftAlert(result);
      alertsCreated++;
    }

    res.json({
      message: 'Privilege drift scan completed',
      driftDetected: results.length,
      alertsCreated,
    });
  } catch (error) {
    console.error('Error running privilege drift scan:', error);
    res.status(500).json({ error: 'Failed to run privilege drift scan' });
  }
});

/**
 * GET /api/privilege-drift/:id
 * Get privilege drift alert details
 */
router.get('/privilege-drift/:id', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const alert = await storage.getPrivilegeDriftAlert(id, tenantId);
    if (!alert) {
      return res.status(404).json({ error: 'Privilege drift alert not found' });
    }

    res.json({ alert });
  } catch (error) {
    console.error('Error fetching privilege drift alert:', error);
    res.status(500).json({ error: 'Failed to fetch privilege drift alert' });
  }
});

/**
 * POST /api/privilege-drift/:id/resolve
 * Resolve a privilege drift alert
 */
router.post('/privilege-drift/:id/resolve', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const resolvedBy = req.user!.id;
    const { id } = req.params;
    const { resolution, notes } = req.body;

    if (!resolution || !['revoked', 'role_updated', 'false_positive'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution type' });
    }

    const detector = new PrivilegeDriftDetector(tenantId);
    await detector.resolveDriftAlert(id, resolution, notes, resolvedBy);

    res.json({ message: 'Privilege drift alert resolved successfully' });
  } catch (error) {
    console.error('Error resolving privilege drift alert:', error);
    res.status(500).json({ error: 'Failed to resolve privilege drift alert' });
  }
});

// ============================================
// Overprivileged Accounts
// ============================================

/**
 * GET /api/overprivileged-accounts
 * List overprivileged accounts
 */
router.get('/overprivileged-accounts', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, riskLevel } = req.query;

    const accounts = await storage.getOverprivilegedAccounts(tenantId, {
      status: status as string | undefined,
      riskLevel: riskLevel as string | undefined,
    });

    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching overprivileged accounts:', error);
    res.status(500).json({ error: 'Failed to fetch overprivileged accounts' });
  }
});

/**
 * POST /api/overprivileged-accounts/scan
 * Run overprivileged account scan
 */
router.post('/overprivileged-accounts/scan', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const detector = new OverprivilegedAccountDetector(tenantId);
    const results = await detector.scanAll();

    // Create alerts for detected overprivileged accounts
    let alertsCreated = 0;
    for (const result of results) {
      await detector.createOverprivilegedAlert(result);
      alertsCreated++;
    }

    res.json({
      message: 'Overprivileged account scan completed',
      accountsDetected: results.length,
      alertsCreated,
    });
  } catch (error) {
    console.error('Error running overprivileged account scan:', error);
    res.status(500).json({ error: 'Failed to run overprivileged account scan' });
  }
});

/**
 * GET /api/overprivileged-accounts/:id
 * Get overprivileged account details
 */
router.get('/overprivileged-accounts/:id', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const account = await storage.getOverprivilegedAccount(id, tenantId);
    if (!account) {
      return res.status(404).json({ error: 'Overprivileged account not found' });
    }

    res.json({ account });
  } catch (error) {
    console.error('Error fetching overprivileged account:', error);
    res.status(500).json({ error: 'Failed to fetch overprivileged account' });
  }
});

/**
 * POST /api/overprivileged-accounts/:id/remediate
 * Remediate an overprivileged account
 */
router.post('/overprivileged-accounts/:id/remediate', requireRole(['admin', 'compliance_manager']), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const remediatedBy = req.user!.id;
    const { id } = req.params;
    const { action, remediationPlan } = req.body;

    if (!action || !['downgrade', 'implement_jit', 'require_mfa', 'accept_risk'].includes(action)) {
      return res.status(400).json({ error: 'Invalid remediation action' });
    }

    const detector = new OverprivilegedAccountDetector(tenantId);
    await detector.remediateAccount(id, action, remediationPlan, remediatedBy);

    res.json({ message: 'Overprivileged account remediated successfully' });
  } catch (error) {
    console.error('Error remediating overprivileged account:', error);
    res.status(500).json({ error: 'Failed to remediate overprivileged account' });
  }
});

export default router;
