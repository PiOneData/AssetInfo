/**
 * Phase 3: Offboarding Automation
 *
 * Adds tables for automated user offboarding:
 * - offboarding_requests: Track offboarding workflows
 * - offboarding_tasks: Individual tasks within offboarding
 * - offboarding_playbooks: Templates for different offboarding scenarios
 * - hr_integrations: HR system connections for auto-trigger
 */

-- Offboarding Playbooks (templates)
CREATE TABLE IF NOT EXISTS offboarding_playbooks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL, -- 'standard', 'contractor', 'transfer', 'role_change'
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  steps JSONB NOT NULL, -- Array of step configurations
  created_by VARCHAR NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_playbooks_tenant ON offboarding_playbooks(tenant_id);
CREATE INDEX idx_offboarding_playbooks_type ON offboarding_playbooks(type);

-- Offboarding Requests (main workflow tracking)
CREATE TABLE IF NOT EXISTS offboarding_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  playbook_id VARCHAR REFERENCES offboarding_playbooks(id),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'partial', 'cancelled'
  initiated_by VARCHAR NOT NULL REFERENCES users(id),
  initiated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  reason TEXT,
  transfer_to_user_id VARCHAR REFERENCES users(id), -- For ownership transfer
  notes TEXT,
  audit_report_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_requests_tenant ON offboarding_requests(tenant_id);
CREATE INDEX idx_offboarding_requests_user ON offboarding_requests(user_id);
CREATE INDEX idx_offboarding_requests_status ON offboarding_requests(status);
CREATE INDEX idx_offboarding_requests_initiated_at ON offboarding_requests(initiated_at DESC);

-- Offboarding Tasks (individual actions within a request)
CREATE TABLE IF NOT EXISTS offboarding_tasks (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR NOT NULL REFERENCES offboarding_requests(id) ON DELETE CASCADE,
  task_type VARCHAR(100) NOT NULL, -- 'revoke_sso', 'revoke_oauth', 'transfer_ownership', 'remove_from_group', etc.
  app_id VARCHAR REFERENCES saas_apps(id),
  app_name VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  priority INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB, -- Details of what was done
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_tasks_request ON offboarding_tasks(request_id);
CREATE INDEX idx_offboarding_tasks_status ON offboarding_tasks(status);
CREATE INDEX idx_offboarding_tasks_type ON offboarding_tasks(task_type);

-- HR System Integrations
CREATE TABLE IF NOT EXISTS hr_integrations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL, -- 'bamboohr', 'keka', 'darwinbox'
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL, -- API credentials, subdomain, etc.
  webhook_secret VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'error'
  sync_enabled BOOLEAN DEFAULT true,
  auto_trigger_offboarding BOOLEAN DEFAULT true,
  default_playbook_id VARCHAR REFERENCES offboarding_playbooks(id),
  last_sync_at TIMESTAMP,
  sync_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hr_integrations_tenant ON hr_integrations(tenant_id);
CREATE INDEX idx_hr_integrations_provider ON hr_integrations(provider);

-- Insert default playbooks for demo/testing
INSERT INTO offboarding_playbooks (tenant_id, name, type, description, is_default, steps, created_by)
SELECT
  t.id,
  'Standard Employee Offboarding',
  'standard',
  'Complete offboarding workflow for full-time employees including SSO revocation, OAuth cleanup, and ownership transfer',
  true,
  '[
    {"type": "revoke_sso", "priority": 1, "enabled": true, "description": "Revoke SSO assignments from all applications"},
    {"type": "revoke_oauth", "priority": 2, "enabled": true, "description": "Revoke OAuth tokens and API access"},
    {"type": "transfer_ownership", "priority": 3, "enabled": true, "description": "Transfer ownership of files and resources"},
    {"type": "remove_from_groups", "priority": 4, "enabled": true, "description": "Remove from all security groups"},
    {"type": "archive_data", "priority": 5, "enabled": true, "description": "Archive user data for compliance"},
    {"type": "generate_report", "priority": 6, "enabled": true, "description": "Generate audit report"}
  ]'::jsonb,
  u.id
FROM tenants t
CROSS JOIN LATERAL (
  SELECT id FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1
) u
ON CONFLICT DO NOTHING;

INSERT INTO offboarding_playbooks (tenant_id, name, type, description, is_default, steps, created_by)
SELECT
  t.id,
  'Contractor Offboarding',
  'contractor',
  'Quick offboarding for contractors - revoke access without ownership transfer',
  false,
  '[
    {"type": "revoke_sso", "priority": 1, "enabled": true, "description": "Revoke SSO assignments from all applications"},
    {"type": "revoke_oauth", "priority": 2, "enabled": true, "description": "Revoke OAuth tokens and API access"},
    {"type": "remove_from_groups", "priority": 3, "enabled": true, "description": "Remove from all security groups"},
    {"type": "generate_report", "priority": 4, "enabled": true, "description": "Generate audit report"}
  ]'::jsonb,
  u.id
FROM tenants t
CROSS JOIN LATERAL (
  SELECT id FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1
) u
ON CONFLICT DO NOTHING;

INSERT INTO offboarding_playbooks (tenant_id, name, type, description, is_default, steps, created_by)
SELECT
  t.id,
  'Department Transfer',
  'transfer',
  'Transfer employee to another department with ownership handover',
  false,
  '[
    {"type": "transfer_ownership", "priority": 1, "enabled": true, "description": "Transfer ownership to new manager"},
    {"type": "update_groups", "priority": 2, "enabled": true, "description": "Update group memberships"},
    {"type": "update_permissions", "priority": 3, "enabled": true, "description": "Update access permissions"},
    {"type": "generate_report", "priority": 4, "enabled": true, "description": "Generate transfer report"}
  ]'::jsonb,
  u.id
FROM tenants t
CROSS JOIN LATERAL (
  SELECT id FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1
) u
ON CONFLICT DO NOTHING;

INSERT INTO offboarding_playbooks (tenant_id, name, type, description, is_default, steps, created_by)
SELECT
  t.id,
  'Role Change',
  'role_change',
  'Adjust access for role changes within the organization',
  false,
  '[
    {"type": "review_access", "priority": 1, "enabled": true, "description": "Review current access permissions"},
    {"type": "adjust_permissions", "priority": 2, "enabled": true, "description": "Adjust permissions for new role"},
    {"type": "update_licenses", "priority": 3, "enabled": true, "description": "Update license assignments"},
    {"type": "generate_report", "priority": 4, "enabled": true, "description": "Generate role change report"}
  ]'::jsonb,
  u.id
FROM tenants t
CROSS JOIN LATERAL (
  SELECT id FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1
) u
ON CONFLICT DO NOTHING;
