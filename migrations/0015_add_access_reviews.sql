-- Phase 5: Identity Governance & Access Reviews
-- Migration: 0015_add_access_reviews.sql

-- ============================================
-- 5.1 Access Review Campaigns
-- ============================================

-- Access Review Campaigns - Quarterly/Annual access certification
CREATE TABLE IF NOT EXISTS access_review_campaigns (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Campaign details
  name TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL, -- 'quarterly', 'department', 'high_risk', 'admin', 'new_hire', 'departure'
  frequency TEXT, -- 'quarterly', 'semi_annual', 'annual', 'one_time'

  -- Scope
  scope_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'department', 'apps', 'users'
  scope_config JSONB, -- Department names, app IDs, or user IDs

  -- Schedule
  start_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  auto_approve_on_timeout BOOLEAN DEFAULT false,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'completed', 'cancelled'
  total_items INTEGER DEFAULT 0,
  reviewed_items INTEGER DEFAULT 0,
  approved_items INTEGER DEFAULT 0,
  revoked_items INTEGER DEFAULT 0,
  deferred_items INTEGER DEFAULT 0,

  -- Audit
  created_by VARCHAR NOT NULL,
  completed_at TIMESTAMP,
  completion_report_url TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_review_campaigns_tenant ON access_review_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_review_campaigns_status ON access_review_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_access_review_campaigns_due ON access_review_campaigns(due_date);

-- Access Review Items - Individual access items to review
CREATE TABLE IF NOT EXISTS access_review_items (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR NOT NULL REFERENCES access_review_campaigns(id) ON DELETE CASCADE,

  -- What to review
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,
  user_manager TEXT,

  app_id VARCHAR NOT NULL,
  app_name TEXT NOT NULL,
  access_type TEXT, -- 'admin', 'member', 'viewer', etc.

  -- Context
  granted_date TIMESTAMP,
  last_used_date TIMESTAMP,
  days_since_last_use INTEGER,
  business_justification TEXT,
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'

  -- Review
  reviewer_id VARCHAR,
  reviewer_name TEXT,
  decision TEXT DEFAULT 'pending', -- 'pending', 'approved', 'revoked', 'deferred'
  decision_notes TEXT,
  reviewed_at TIMESTAMP,

  -- Execution
  execution_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  executed_at TIMESTAMP,
  execution_error TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_review_items_campaign ON access_review_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_access_review_items_reviewer ON access_review_items(reviewer_id, decision);
CREATE INDEX IF NOT EXISTS idx_access_review_items_user ON access_review_items(user_id);
CREATE INDEX IF NOT EXISTS idx_access_review_items_app ON access_review_items(app_id);

-- Access Review Decisions - Audit trail
CREATE TABLE IF NOT EXISTS access_review_decisions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id VARCHAR NOT NULL REFERENCES access_review_campaigns(id) ON DELETE CASCADE,
  review_item_id VARCHAR NOT NULL REFERENCES access_review_items(id) ON DELETE CASCADE,

  -- Decision
  decision TEXT NOT NULL, -- 'approved', 'revoked', 'deferred'
  decision_notes TEXT,
  decision_rationale TEXT,

  -- Reviewer
  reviewer_id VARCHAR NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT,

  -- Execution
  execution_status TEXT DEFAULT 'pending',
  executed_at TIMESTAMP,
  execution_result JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_review_decisions_campaign ON access_review_decisions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_access_review_decisions_item ON access_review_decisions(review_item_id);
CREATE INDEX IF NOT EXISTS idx_access_review_decisions_reviewer ON access_review_decisions(reviewer_id);

-- ============================================
-- 5.2 Privilege Drift Detection
-- ============================================

-- Role Templates - Define expected access for roles
CREATE TABLE IF NOT EXISTS role_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Role details
  name TEXT NOT NULL,
  description TEXT,
  department TEXT,
  level TEXT, -- 'individual_contributor', 'manager', 'director', 'executive'

  -- Expected access
  expected_apps JSONB NOT NULL, -- Array of { appId, appName, accessType, required }

  -- Metadata
  user_count INTEGER DEFAULT 0, -- Number of users assigned this role
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by VARCHAR NOT NULL,
  last_reviewed_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_role_templates_tenant ON role_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_role_templates_department ON role_templates(tenant_id, department);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_role_templates_tenant_name ON role_templates(tenant_id, name);

-- User Role Assignments - Map users to role templates
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Assignment
  user_id VARCHAR NOT NULL,
  role_template_id VARCHAR NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,

  -- Tracking
  effective_date TIMESTAMP NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMP,
  assigned_by VARCHAR NOT NULL,
  assignment_reason TEXT,

  -- Review
  next_review_date TIMESTAMP,
  last_reviewed_at TIMESTAMP,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_tenant ON user_role_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user ON user_role_assignments(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role ON user_role_assignments(role_template_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_role_assignments_active ON user_role_assignments(tenant_id, user_id, role_template_id) WHERE is_active = true;

-- Privilege Drift Alerts - Users with access beyond their role
CREATE TABLE IF NOT EXISTS privilege_drift_alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User and role
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,
  role_template_id VARCHAR REFERENCES role_templates(id) ON DELETE SET NULL,
  role_name TEXT,

  -- Drift details
  expected_apps JSONB, -- Apps user should have based on role
  actual_apps JSONB, -- Apps user actually has
  excess_apps JSONB, -- Apps user has but shouldn't (drift)
  missing_apps JSONB, -- Apps user should have but doesn't

  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
  risk_factors JSONB, -- Array of reasons for the risk score

  -- Recommended actions
  recommended_action TEXT, -- 'revoke_excess', 'update_role', 'create_review'
  recommended_apps_to_revoke JSONB,

  -- Status
  status TEXT DEFAULT 'open', -- 'open', 'in_review', 'resolved', 'deferred', 'false_positive'
  resolution_notes TEXT,
  resolved_by VARCHAR,
  resolved_at TIMESTAMP,

  -- Timestamps
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privilege_drift_alerts_tenant ON privilege_drift_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_privilege_drift_alerts_user ON privilege_drift_alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_privilege_drift_alerts_risk ON privilege_drift_alerts(tenant_id, risk_level, status);
CREATE INDEX IF NOT EXISTS idx_privilege_drift_alerts_detected ON privilege_drift_alerts(detected_at);

-- ============================================
-- 5.3 Overprivileged Account Detection
-- ============================================

-- Overprivileged Accounts - Users with excessive admin access
CREATE TABLE IF NOT EXISTS overprivileged_accounts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User details
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,
  user_title TEXT,

  -- Overprivilege details
  admin_app_count INTEGER DEFAULT 0,
  admin_apps JSONB, -- Array of { appId, appName, accessType, grantedAt, lastUsedAt }

  -- Stale access
  stale_admin_count INTEGER DEFAULT 0, -- Apps with admin not used in 90+ days
  stale_admin_apps JSONB,

  -- Cross-department access
  cross_dept_admin_count INTEGER DEFAULT 0,
  cross_dept_admin_apps JSONB,

  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
  risk_factors JSONB,

  -- Business justification
  has_justification BOOLEAN DEFAULT false,
  justification_text TEXT,
  justification_approved_by VARCHAR,
  justification_expires_at TIMESTAMP,

  -- Recommendations
  recommended_action TEXT, -- 'downgrade', 'implement_jit', 'require_mfa', 'schedule_review'
  recommended_apps_to_downgrade JSONB,
  least_privilege_alternative TEXT,

  -- Status
  status TEXT DEFAULT 'open', -- 'open', 'in_remediation', 'resolved', 'deferred', 'accepted_risk'
  remediation_plan TEXT,
  remediation_deadline TIMESTAMP,
  resolved_by VARCHAR,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,

  -- Timestamps
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overprivileged_accounts_tenant ON overprivileged_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_overprivileged_accounts_user ON overprivileged_accounts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_overprivileged_accounts_risk ON overprivileged_accounts(tenant_id, risk_level, status);
CREATE INDEX IF NOT EXISTS idx_overprivileged_accounts_detected ON overprivileged_accounts(detected_at);

-- ============================================
-- Seed Data: Pre-built Role Templates
-- ============================================

-- Note: These will be inserted via application code on first run
-- to allow proper tenant_id association

-- Default role templates (to be seeded):
-- 1. Software Engineer
-- 2. Sales Representative
-- 3. Marketing Manager
-- 4. Finance Analyst
-- 5. HR Manager
-- 6. Product Manager
-- 7. Customer Support
-- 8. IT Administrator

-- ============================================
-- Update user_app_access for enhanced tracking
-- ============================================

-- Add columns to track when access was last reviewed
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP;
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS last_reviewed_by VARCHAR;
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS next_review_date TIMESTAMP;
ALTER TABLE user_app_access ADD COLUMN IF NOT EXISTS business_justification TEXT;
