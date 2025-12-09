/**
 * Phase 4: Policy Automation Engine
 *
 * Adds tables for self-healing IT policies:
 * - automated_policies: IF-THEN policy definitions
 * - policy_executions: Execution logs and results
 * - policy_templates: Pre-built policy templates
 * - policy_approvals: Approval workflows for policies requiring approval
 */

-- Automated Policies (IF-THEN rules)
CREATE TABLE IF NOT EXISTS automated_policies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,

  -- Trigger configuration (IF)
  trigger_type VARCHAR(100) NOT NULL, -- 'app_discovered', 'license_unused', 'oauth_risky_permission', etc.
  trigger_config JSONB NOT NULL,

  -- Conditions (additional filters)
  conditions JSONB,

  -- Actions (THEN)
  actions JSONB NOT NULL, -- Array of actions to execute

  -- Execution settings
  cooldown_minutes INTEGER DEFAULT 0, -- Minimum time between executions
  max_executions_per_day INTEGER, -- Maximum daily executions
  require_approval BOOLEAN DEFAULT false,

  -- Statistics
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,

  -- Metadata
  created_by VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automated_policies_tenant ON automated_policies(tenant_id);
CREATE INDEX idx_automated_policies_trigger ON automated_policies(trigger_type, enabled);
CREATE INDEX idx_automated_policies_tenant_enabled ON automated_policies(tenant_id, enabled);

-- Policy Executions (audit log)
CREATE TABLE IF NOT EXISTS policy_executions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_id VARCHAR NOT NULL REFERENCES automated_policies(id) ON DELETE CASCADE,

  -- Trigger context
  trigger_event VARCHAR(100) NOT NULL,
  trigger_data JSONB NOT NULL, -- Event data that triggered the policy

  -- Execution details
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'partial', 'failed'
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Actions executed
  actions_executed INTEGER DEFAULT 0,
  actions_succeeded INTEGER DEFAULT 0,
  actions_failed INTEGER DEFAULT 0,

  -- Results
  result JSONB, -- Detailed results of each action
  error_message TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_executions_tenant ON policy_executions(tenant_id);
CREATE INDEX idx_policy_executions_policy ON policy_executions(policy_id);
CREATE INDEX idx_policy_executions_status ON policy_executions(status);
CREATE INDEX idx_policy_executions_created ON policy_executions(created_at DESC);

-- Policy Templates (pre-built templates)
CREATE TABLE IF NOT EXISTS policy_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'security', 'cost_optimization', 'compliance', etc.
  description TEXT NOT NULL,
  icon VARCHAR(50),

  -- Template configuration
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSONB NOT NULL,
  conditions JSONB,
  actions JSONB NOT NULL,

  -- Metadata
  is_system BOOLEAN DEFAULT false, -- System templates cannot be deleted
  popularity INTEGER DEFAULT 0, -- Usage count
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_templates_category ON policy_templates(category);
CREATE INDEX idx_policy_templates_popularity ON policy_templates(popularity DESC);

-- Policy Approvals (for policies requiring approval)
CREATE TABLE IF NOT EXISTS policy_approvals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  execution_id VARCHAR NOT NULL REFERENCES policy_executions(id) ON DELETE CASCADE,
  policy_id VARCHAR NOT NULL REFERENCES automated_policies(id) ON DELETE CASCADE,

  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_by VARCHAR REFERENCES users(id),

  approved_by VARCHAR REFERENCES users(id),
  approved_at TIMESTAMP,
  approval_notes TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_approvals_tenant ON policy_approvals(tenant_id);
CREATE INDEX idx_policy_approvals_status ON policy_approvals(status);
CREATE INDEX idx_policy_approvals_execution ON policy_approvals(execution_id);

-- Insert pre-built policy templates
INSERT INTO policy_templates (name, category, description, icon, trigger_type, trigger_config, conditions, actions, is_system) VALUES
(
  'Block Unapproved Apps',
  'security',
  'Automatically block unapproved SaaS applications discovered via Shadow IT detection',
  'shield-alert',
  'app_discovered',
  '{"approvalStatus": ["unapproved"]}'::jsonb,
  NULL,
  '[
    {"type": "block_app", "config": {"notifyUsers": true, "reason": "Unapproved application"}},
    {"type": "create_ticket", "config": {"priority": "high", "assignTo": "security-team", "title": "Review blocked app: {{app.name}}"}}
  ]'::jsonb,
  true
),
(
  'Auto-Reclaim Dormant Licenses',
  'cost_optimization',
  'Automatically reclaim licenses that have been unused for 30+ days to reduce waste',
  'dollar-sign',
  'license_unused',
  '{"unusedDays": 30, "minCost": 10}'::jsonb,
  NULL,
  '[
    {"type": "notify_department_head", "config": {"gracePeriodDays": 7, "includeUsageStats": true}},
    {"type": "reclaim_license", "config": {"notifyUser": true, "reassignTo": "pool"}}
  ]'::jsonb,
  true
),
(
  'Quarantine Risky OAuth Apps',
  'security',
  'Quarantine applications that request high-risk OAuth permissions',
  'alert-triangle',
  'oauth_risky_permission',
  '{"riskLevel": ["high", "critical"]}'::jsonb,
  NULL,
  '[
    {"type": "block_app", "config": {"quarantine": true, "notifyUsers": true}},
    {"type": "send_alert", "config": {"recipients": ["security-team"], "priority": "critical", "template": "Risky OAuth app detected: {{app.name}}"}},
    {"type": "create_ticket", "config": {"priority": "critical", "assignTo": "security-team"}}
  ]'::jsonb,
  true
),
(
  'Renewal Workflow Automation',
  'procurement',
  'Automatically initiate renewal review process 45 days before contract expiration',
  'calendar',
  'renewal_approaching',
  '{"daysBeforeRenewal": 45, "minContractValue": 1000}'::jsonb,
  NULL,
  '[
    {"type": "notify_department_head", "config": {"includeUsageStats": true, "includeCostAnalysis": true}},
    {"type": "create_ticket", "config": {"assignTo": "procurement", "template": "renewal_review", "priority": "medium"}},
    {"type": "send_alert", "config": {"channels": ["email"], "template": "renewal_reminder"}}
  ]'::jsonb,
  true
),
(
  'Budget Alert System',
  'finance',
  'Alert finance team when department spending exceeds 80% of budget',
  'trending-up',
  'budget_exceeded',
  '{"threshold": 80, "period": "monthly"}'::jsonb,
  NULL,
  '[
    {"type": "send_alert", "config": {"recipients": ["finance-team"], "priority": "high", "template": "Budget threshold exceeded"}},
    {"type": "notify_department_head", "config": {"includeForecast": true, "includeTopApps": true}}
  ]'::jsonb,
  true
),
(
  'Offboarding Verification',
  'compliance',
  'Verify that user offboarding completed successfully and all access was revoked',
  'user-x',
  'user_offboarded',
  '{"status": ["completed", "partial"]}'::jsonb,
  NULL,
  '[
    {"type": "create_ticket", "config": {"assignTo": "security-team", "template": "verify_offboarding", "priority": "high"}},
    {"type": "notify_department_head", "config": {"includeAccessList": true, "includeAuditReport": true}}
  ]'::jsonb,
  true
);
