-- Phase 6: Advanced Features & AI Intelligence
-- Migration: 0016_add_advanced_features.sql

-- ============================================
-- 6.1 Self-Service Access Requests
-- ============================================

-- Access Requests - User-initiated access requests
CREATE TABLE IF NOT EXISTS access_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Requester details
  requester_id VARCHAR NOT NULL,
  requester_name TEXT NOT NULL,
  requester_email TEXT,
  requester_department TEXT,

  -- Request details
  app_id VARCHAR NOT NULL,
  app_name TEXT NOT NULL,
  access_type TEXT NOT NULL, -- 'member', 'admin', 'viewer', etc.
  justification TEXT NOT NULL,
  duration_type TEXT DEFAULT 'permanent', -- 'permanent', 'temporary'
  duration_hours INTEGER, -- For temporary access
  expires_at TIMESTAMP,

  -- Approval workflow
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'cancelled'
  approver_id VARCHAR,
  approver_name TEXT,
  approval_notes TEXT,
  reviewed_at TIMESTAMP,

  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT, -- 'low', 'medium', 'high', 'critical'
  risk_factors JSONB, -- Array of risk reasons
  sod_conflicts JSONB, -- Any SoD violations detected

  -- Provisioning
  provisioning_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  provisioned_at TIMESTAMP,
  provisioning_error TEXT,

  -- SLA tracking
  sla_due_at TIMESTAMP,
  is_overdue BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_requests_tenant ON access_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester ON access_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_approver ON access_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_sla ON access_requests(sla_due_at) WHERE status = 'pending';

-- ============================================
-- 6.2 Just-In-Time (JIT) Access
-- ============================================

-- JIT Access Sessions - Temporary privilege elevation
CREATE TABLE IF NOT EXISTS jit_access_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User details
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,

  -- Access details
  app_id VARCHAR NOT NULL,
  app_name TEXT NOT NULL,
  access_type TEXT NOT NULL, -- Elevated access level (e.g., 'admin')
  previous_access_type TEXT, -- Original access level (e.g., 'member')

  -- Session details
  justification TEXT NOT NULL,
  duration_hours INTEGER NOT NULL, -- 4, 8, 24, or 72 hours
  starts_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,

  -- Approval
  requires_approval BOOLEAN DEFAULT true,
  approved_by VARCHAR,
  approved_at TIMESTAMP,

  -- MFA enforcement
  mfa_verified BOOLEAN DEFAULT false,
  mfa_verified_at TIMESTAMP,

  -- Session status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'expired', 'revoked', 'denied'
  activated_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_by VARCHAR,
  revoke_reason TEXT,

  -- Audit
  access_count INTEGER DEFAULT 0, -- Number of times accessed during session
  last_access_at TIMESTAMP,

  -- Extension
  extension_requested BOOLEAN DEFAULT false,
  extension_approved BOOLEAN DEFAULT false,
  extended_by_hours INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jit_sessions_tenant ON jit_access_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jit_sessions_user ON jit_access_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jit_sessions_status ON jit_access_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jit_sessions_expires ON jit_access_sessions(expires_at) WHERE status = 'active';

-- ============================================
-- 6.3 Segregation of Duties (SoD)
-- ============================================

-- SoD Rules - Define conflicting access combinations
CREATE TABLE IF NOT EXISTS sod_rules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Rule definition
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'

  -- Conflicting access (two apps that shouldn't be accessed by same user)
  app_id_1 VARCHAR NOT NULL,
  app_name_1 TEXT NOT NULL,
  access_type_1 TEXT, -- Optional: specific access type

  app_id_2 VARCHAR NOT NULL,
  app_name_2 TEXT NOT NULL,
  access_type_2 TEXT, -- Optional: specific access type

  -- Rationale
  compliance_framework TEXT, -- 'SOX', 'GDPR', 'HIPAA', 'Custom'
  rationale TEXT,

  -- Exemptions
  exempted_users JSONB, -- Array of user IDs allowed to violate this rule

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sod_rules_tenant ON sod_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sod_rules_apps ON sod_rules(app_id_1, app_id_2);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sod_rules_apps ON sod_rules(tenant_id, app_id_1, app_id_2) WHERE is_active = true;

-- SoD Violations - Users with conflicting access
CREATE TABLE IF NOT EXISTS sod_violations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User details
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,

  -- Violated rule
  sod_rule_id VARCHAR NOT NULL REFERENCES sod_rules(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  severity TEXT NOT NULL,

  -- Conflicting access details
  app_1_id VARCHAR NOT NULL,
  app_1_name TEXT NOT NULL,
  access_type_1 TEXT,

  app_2_id VARCHAR NOT NULL,
  app_2_name TEXT NOT NULL,
  access_type_2 TEXT,

  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_factors JSONB,

  -- Remediation
  recommended_action TEXT, -- 'revoke_app_1', 'revoke_app_2', 'downgrade_access', 'request_exemption'
  remediation_plan TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_remediation', 'resolved', 'exempted', 'false_positive'
  resolved_by VARCHAR,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,

  -- Timestamps
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sod_violations_tenant ON sod_violations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sod_violations_user ON sod_violations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sod_violations_rule ON sod_violations(sod_rule_id);
CREATE INDEX IF NOT EXISTS idx_sod_violations_status ON sod_violations(tenant_id, status);

-- ============================================
-- 6.4 AI-Powered Review Suggestions
-- ============================================

-- Review Suggestions - ML predictions for access review decisions
CREATE TABLE IF NOT EXISTS review_suggestions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Review item reference
  review_item_id VARCHAR NOT NULL,
  campaign_id VARCHAR NOT NULL,

  -- User and app
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  app_id VARCHAR NOT NULL,
  app_name TEXT NOT NULL,

  -- ML Prediction
  predicted_decision TEXT NOT NULL, -- 'approved', 'revoked'
  confidence_score DECIMAL(5,2) NOT NULL, -- 0.00 to 100.00

  -- Prediction factors (feature importance)
  factors JSONB NOT NULL, -- Array of {factor: string, weight: number, explanation: string}

  -- Similar cases (for context)
  similar_cases JSONB, -- Array of {userId, appId, decision, similarity}

  -- Model metadata
  model_version TEXT,
  model_trained_at TIMESTAMP,
  features_used JSONB,

  -- Actual decision (for feedback loop)
  actual_decision TEXT, -- Filled after human review
  was_correct BOOLEAN, -- Did the ML predict correctly?

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_suggestions_tenant ON review_suggestions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_review_suggestions_campaign ON review_suggestions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_review_suggestions_item ON review_suggestions(review_item_id);

-- ============================================
-- 6.5 Anomaly Detection
-- ============================================

-- Anomaly Detections - Behavioral anomalies
CREATE TABLE IF NOT EXISTS anomaly_detections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User details
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,

  -- Anomaly details
  anomaly_type TEXT NOT NULL, -- 'after_hours', 'weekend', 'geographic', 'bulk_download', 'rapid_switching', 'privilege_escalation', 'failed_login_spike'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  confidence_score DECIMAL(5,2) NOT NULL, -- 0.00 to 100.00

  -- Context
  app_id VARCHAR,
  app_name TEXT,
  event_type TEXT, -- 'login', 'access', 'download', 'permission_change'
  event_count INTEGER, -- Number of events in anomaly
  event_time TIMESTAMP,

  -- Baseline comparison
  baseline_value DECIMAL(10,2), -- Normal value (e.g., avg access count)
  actual_value DECIMAL(10,2), -- Observed value
  deviation_percent DECIMAL(10,2), -- Percentage deviation from baseline

  -- Geographic context
  location_country TEXT,
  location_city TEXT,
  ip_address TEXT,
  is_new_location BOOLEAN DEFAULT false,

  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_factors JSONB,

  -- Investigation
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'false_positive', 'blocked'
  investigated_by VARCHAR,
  investigated_at TIMESTAMP,
  investigation_notes TEXT,

  -- Actions taken
  action_taken TEXT, -- 'none', 'notify_user', 'notify_manager', 'block_access', 'require_mfa', 'revoke_session'
  action_at TIMESTAMP,

  -- Timestamps
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_detections_tenant ON anomaly_detections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_user ON anomaly_detections(user_id, status);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_type ON anomaly_detections(tenant_id, anomaly_type, severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_status ON anomaly_detections(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_detected ON anomaly_detections(detected_at);

-- ============================================
-- 6.6 Peer Group Analysis
-- ============================================

-- Peer Group Baselines - Access patterns for role groups
CREATE TABLE IF NOT EXISTS peer_group_baselines (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Group definition
  department TEXT NOT NULL,
  job_title TEXT,
  job_level TEXT, -- 'individual_contributor', 'manager', 'director', 'executive'
  group_size INTEGER NOT NULL, -- Number of users in this peer group

  -- Access baseline (apps used by 80%+ of peers)
  common_apps JSONB NOT NULL, -- Array of {appId, appName, percentage, accessType}
  average_app_count DECIMAL(5,2), -- Average number of apps per user in group
  std_dev_app_count DECIMAL(5,2), -- Standard deviation

  -- Analysis metadata
  analyzed_at TIMESTAMP NOT NULL,
  next_analysis_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peer_baselines_tenant ON peer_group_baselines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_peer_baselines_group ON peer_group_baselines(tenant_id, department, job_title, job_level);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_peer_baselines_group ON peer_group_baselines(tenant_id, department, job_title, job_level);

-- Peer Group Outliers - Users with significantly different access than peers
CREATE TABLE IF NOT EXISTS peer_group_outliers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User details
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT,
  user_department TEXT,
  user_job_title TEXT,
  user_job_level TEXT,

  -- Peer group reference
  peer_group_id VARCHAR NOT NULL REFERENCES peer_group_baselines(id) ON DELETE CASCADE,

  -- Outlier analysis
  outlier_type TEXT NOT NULL, -- 'over_privileged', 'under_privileged', 'non_standard'
  deviation_score DECIMAL(10,2) NOT NULL, -- How far from peer average

  -- Access differences
  excess_apps JSONB, -- Apps user has but peers don't
  missing_apps JSONB, -- Apps user doesn't have but peers do
  total_app_count INTEGER,
  peer_average_app_count DECIMAL(5,2),

  -- Recommendations
  recommended_additions JSONB, -- Apps to grant
  recommended_removals JSONB, -- Apps to revoke
  justification TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'reviewed', 'remediated', 'accepted'
  reviewed_by VARCHAR,
  reviewed_at TIMESTAMP,
  review_notes TEXT,

  -- Timestamps
  detected_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peer_outliers_tenant ON peer_group_outliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_peer_outliers_user ON peer_group_outliers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_peer_outliers_group ON peer_group_outliers(peer_group_id);
CREATE INDEX IF NOT EXISTS idx_peer_outliers_status ON peer_group_outliers(tenant_id, status);

-- ============================================
-- 6.7 Risk-Based Certification
-- ============================================

-- Certification Schedule - Smart review scheduling based on risk
CREATE TABLE IF NOT EXISTS certification_schedules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- User and app
  user_id VARCHAR NOT NULL,
  user_name TEXT NOT NULL,
  app_id VARCHAR NOT NULL,
  app_name TEXT NOT NULL,
  access_type TEXT,

  -- Risk-based frequency
  risk_level TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  review_frequency TEXT NOT NULL, -- 'monthly', 'quarterly', 'semi_annual', 'annual'
  frequency_reason TEXT, -- Why this frequency was assigned

  -- Schedule
  last_reviewed_at TIMESTAMP,
  next_review_at TIMESTAMP NOT NULL,
  is_overdue BOOLEAN DEFAULT false,

  -- Auto-campaign assignment
  auto_include_in_campaigns BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cert_schedules_tenant ON certification_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cert_schedules_user ON certification_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_cert_schedules_next_review ON certification_schedules(next_review_at) WHERE is_overdue = false;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cert_schedules_user_app ON certification_schedules(tenant_id, user_id, app_id);

-- ============================================
-- 6.8 Integration Marketplace
-- ============================================

-- Integration Configs - Enabled integrations per tenant
CREATE TABLE IF NOT EXISTS integration_configs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,

  -- Integration details
  integration_id VARCHAR NOT NULL, -- 'slack', 'teams', 'jira', 'freshservice', 'crowdstrike'
  integration_name TEXT NOT NULL,
  integration_type TEXT NOT NULL, -- 'notification', 'ticketing', 'security', 'accounting'

  -- Configuration
  enabled BOOLEAN DEFAULT false,
  config JSONB NOT NULL, -- Integration-specific config (webhook URLs, API keys, etc.)

  -- OAuth credentials (if applicable)
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMP,

  -- Usage tracking
  last_used_at TIMESTAMP,
  event_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_configs_tenant ON integration_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_configs_type ON integration_configs(tenant_id, integration_type);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_integration_configs_tenant_integration ON integration_configs(tenant_id, integration_id);

-- Integration Events - Audit trail of integration activity
CREATE TABLE IF NOT EXISTS integration_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL,
  integration_config_id VARCHAR NOT NULL REFERENCES integration_configs(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL, -- 'notification_sent', 'ticket_created', 'webhook_received'
  event_data JSONB,

  -- Result
  status TEXT NOT NULL, -- 'success', 'failed'
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_events_config ON integration_events(integration_config_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_tenant ON integration_events(tenant_id, created_at);

-- ============================================
-- Enhance existing tables for Phase 6
-- ============================================

-- Add AI suggestion columns to access_review_items (from Phase 5)
ALTER TABLE access_review_items ADD COLUMN IF NOT EXISTS ai_suggestion TEXT; -- 'approved', 'revoked', null
ALTER TABLE access_review_items ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(5,2); -- 0.00 to 100.00
ALTER TABLE access_review_items ADD COLUMN IF NOT EXISTS ai_factors JSONB; -- Prediction explanation

-- Add peer comparison to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_level TEXT; -- 'individual_contributor', 'manager', 'director', 'executive'
ALTER TABLE users ADD COLUMN IF NOT EXISTS peer_group_id VARCHAR;
