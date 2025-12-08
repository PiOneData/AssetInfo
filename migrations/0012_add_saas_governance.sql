-- Phase 0: SaaS Governance Foundation
-- Creates 7 new tables for SaaS management, Shadow IT detection, and governance

-- ============================================================================
-- 1. SaaS Apps - Central registry of all SaaS applications
-- ============================================================================
CREATE TABLE IF NOT EXISTS saas_apps (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,

    -- Basic information
    name TEXT NOT NULL,
    vendor TEXT,
    description TEXT,
    category TEXT,

    -- URLs and integration
    website_url TEXT,
    logo_url TEXT,
    api_url TEXT,

    -- Governance
    approval_status TEXT NOT NULL DEFAULT 'pending',
    risk_score INTEGER DEFAULT 0,
    risk_factors JSONB,

    -- Usage tracking
    user_count INTEGER DEFAULT 0,
    active_user_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,

    -- Ownership
    owner TEXT,
    owner_id VARCHAR,
    primary_contact_email TEXT,

    -- Discovery metadata
    discovery_method TEXT,
    discovery_date TIMESTAMP,
    discovered_by_user_id VARCHAR,

    -- Additional metadata
    tags JSONB,
    metadata JSONB,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    UNIQUE (tenant_id, name)
);

COMMENT ON TABLE saas_apps IS 'Central registry of SaaS applications (discovered, approved, or unapproved)';
COMMENT ON COLUMN saas_apps.approval_status IS 'Values: pending, approved, denied';
COMMENT ON COLUMN saas_apps.risk_score IS 'Risk score 0-100';
COMMENT ON COLUMN saas_apps.discovery_method IS 'Values: idp, email, manual, browser, network';

-- ============================================================================
-- 2. SaaS Contracts - Contract & subscription management
-- ============================================================================
CREATE TABLE IF NOT EXISTS saas_contracts (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,
    app_id VARCHAR NOT NULL,

    -- Contract details
    contract_number TEXT,
    vendor TEXT NOT NULL,

    -- Financial
    annual_value NUMERIC(12, 2),
    currency TEXT NOT NULL DEFAULT 'USD',
    billing_cycle TEXT,
    payment_terms TEXT,

    -- Dates
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    renewal_date TIMESTAMP,
    notice_period_days INTEGER,

    -- Auto-renewal
    auto_renew BOOLEAN DEFAULT FALSE,
    renewal_alerted BOOLEAN DEFAULT FALSE,

    -- Contract terms
    terms TEXT,
    termination_clause TEXT,

    -- License details
    license_type TEXT,
    total_licenses INTEGER,
    used_licenses INTEGER DEFAULT 0,

    -- Document management
    contract_file_url TEXT,
    signed_by TEXT,
    signed_date TIMESTAMP,

    -- Ownership
    owner TEXT,
    owner_id VARCHAR,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',

    -- Additional metadata
    metadata JSONB,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE saas_contracts IS 'SaaS contracts and subscription management';
COMMENT ON COLUMN saas_contracts.billing_cycle IS 'Values: monthly, quarterly, annual, usage-based';
COMMENT ON COLUMN saas_contracts.license_type IS 'Values: per-user, per-device, unlimited, consumption-based';
COMMENT ON COLUMN saas_contracts.status IS 'Values: active, expired, cancelled, pending';

-- ============================================================================
-- 3. User App Access - User–App relationship graph
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_app_access (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    app_id VARCHAR NOT NULL,

    -- Access details
    access_granted_date TIMESTAMP DEFAULT NOW(),
    last_access_date TIMESTAMP,
    access_revoked_date TIMESTAMP,

    -- Permissions
    permissions JSONB,
    roles JSONB,

    -- OAuth context
    has_oauth_token BOOLEAN DEFAULT FALSE,
    oauth_scopes JSONB,

    -- Assignment tracking
    assigned_by VARCHAR,
    assignment_method TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',

    -- Usage tracking
    login_count INTEGER DEFAULT 0,
    last_login_at TIMESTAMP,

    -- Metadata
    metadata JSONB,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    UNIQUE (tenant_id, user_id, app_id)
);

COMMENT ON TABLE user_app_access IS 'Tracks which users have access to which SaaS apps';
COMMENT ON COLUMN user_app_access.assignment_method IS 'Values: manual, sso, oauth, discovered';
COMMENT ON COLUMN user_app_access.status IS 'Values: active, revoked, suspended';

-- ============================================================================
-- 4. OAuth Tokens - OAuth token tracking for risk analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    app_id VARCHAR NOT NULL,

    -- OAuth details
    token_hash TEXT,
    scopes JSONB NOT NULL,
    grant_type TEXT,

    -- Token lifecycle
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    last_used_at TIMESTAMP,

    -- Risk assessment
    risk_level TEXT DEFAULT 'low',
    risk_reasons JSONB,

    -- Revocation
    status TEXT NOT NULL DEFAULT 'active',
    revoked_by VARCHAR,
    revocation_reason TEXT,

    -- IdP metadata
    idp_token_id TEXT,
    idp_metadata JSONB,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oauth_tokens IS 'OAuth tokens granted to SaaS apps for risk analysis';
COMMENT ON COLUMN oauth_tokens.token_hash IS 'Hashed token for verification (never store plaintext)';
COMMENT ON COLUMN oauth_tokens.risk_level IS 'Values: low, medium, high, critical';
COMMENT ON COLUMN oauth_tokens.status IS 'Values: active, expired, revoked';

-- ============================================================================
-- 5. Identity Providers - IdP configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_providers (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,

    -- Provider details
    name TEXT NOT NULL,
    type TEXT NOT NULL,

    -- Configuration (client_secret will be encrypted at application layer)
    client_id TEXT,
    client_secret TEXT,
    tenant_domain TEXT,

    -- OAuth endpoints
    authorization_url TEXT,
    token_url TEXT,
    user_info_url TEXT,

    -- Scopes and permissions
    scopes JSONB,

    -- Sync configuration
    sync_enabled BOOLEAN DEFAULT FALSE,
    sync_interval INTEGER DEFAULT 3600,
    last_sync_at TIMESTAMP,
    next_sync_at TIMESTAMP,
    sync_status TEXT DEFAULT 'idle',
    sync_error TEXT,

    -- Statistics
    total_users INTEGER DEFAULT 0,
    total_apps INTEGER DEFAULT 0,

    -- Status
    status TEXT NOT NULL DEFAULT 'active',

    -- Configuration metadata
    config JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    UNIQUE (tenant_id, type)
);

COMMENT ON TABLE identity_providers IS 'Identity provider configurations for SaaS discovery';
COMMENT ON COLUMN identity_providers.type IS 'Values: azuread, okta, google, jumpcloud';
COMMENT ON COLUMN identity_providers.client_secret IS 'ENCRYPTED at application layer';
COMMENT ON COLUMN identity_providers.sync_status IS 'Values: idle, syncing, error';
COMMENT ON COLUMN identity_providers.status IS 'Values: active, disabled, error';

-- ============================================================================
-- 6. SaaS Invoices - Invoice tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS saas_invoices (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,
    app_id VARCHAR,
    contract_id VARCHAR,

    -- Invoice details
    invoice_number TEXT,
    vendor TEXT NOT NULL,

    -- Financial
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    tax_amount NUMERIC(12, 2),
    total_amount NUMERIC(12, 2),

    -- Dates
    invoice_date TIMESTAMP NOT NULL,
    due_date TIMESTAMP,
    paid_date TIMESTAMP,

    -- Billing period
    period_start TIMESTAMP,
    period_end TIMESTAMP,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending',

    -- Payment
    payment_method TEXT,
    transaction_id TEXT,

    -- Document
    invoice_file_url TEXT,

    -- External system
    external_invoice_id TEXT,

    -- Categorization
    category TEXT,
    department TEXT,
    cost_center TEXT,

    -- Metadata
    metadata JSONB,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE saas_invoices IS 'SaaS invoices and billing history';
COMMENT ON COLUMN saas_invoices.status IS 'Values: pending, paid, overdue, cancelled';
COMMENT ON COLUMN saas_invoices.payment_method IS 'Values: card, bank_transfer, check, other';

-- ============================================================================
-- 7. Governance Policies - Automation policy rules
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance_policies (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR NOT NULL,

    -- Policy details
    name TEXT NOT NULL,
    description TEXT,
    policy_type TEXT NOT NULL,

    -- Trigger configuration
    trigger JSONB NOT NULL,

    -- Actions to take
    actions JSONB NOT NULL,

    -- Execution
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,

    -- Statistics
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,

    -- Owner
    created_by VARCHAR,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE governance_policies IS 'Governance policies for automation (Phase 1+)';
COMMENT ON COLUMN governance_policies.policy_type IS 'Values: approval, license_reclaim, risk_blocking, renewal_alert, offboarding';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- SaaS Apps indexes
CREATE INDEX IF NOT EXISTS idx_saas_apps_tenant_status ON saas_apps(tenant_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_saas_apps_tenant_category ON saas_apps(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_saas_apps_risk_score ON saas_apps(tenant_id, risk_score);

-- SaaS Contracts indexes
CREATE INDEX IF NOT EXISTS idx_saas_contracts_tenant_app ON saas_contracts(tenant_id, app_id);
CREATE INDEX IF NOT EXISTS idx_saas_contracts_tenant_status ON saas_contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_saas_contracts_renewal_date ON saas_contracts(renewal_date);
CREATE INDEX IF NOT EXISTS idx_saas_contracts_tenant_renewal ON saas_contracts(tenant_id, renewal_date);

-- User App Access indexes
CREATE INDEX IF NOT EXISTS idx_user_app_access_tenant_user ON user_app_access(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_app_access_tenant_app ON user_app_access(tenant_id, app_id);
CREATE INDEX IF NOT EXISTS idx_user_app_access_status ON user_app_access(tenant_id, status);

-- OAuth Tokens indexes
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tenant_user_app ON oauth_tokens(tenant_id, user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_tenant_status ON oauth_tokens(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_risk_level ON oauth_tokens(tenant_id, risk_level);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- Identity Providers indexes
CREATE INDEX IF NOT EXISTS idx_identity_providers_tenant_status ON identity_providers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_identity_providers_next_sync ON identity_providers(next_sync_at);

-- SaaS Invoices indexes
CREATE INDEX IF NOT EXISTS idx_saas_invoices_tenant_app ON saas_invoices(tenant_id, app_id);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_tenant_status ON saas_invoices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_invoice_date ON saas_invoices(tenant_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_due_date ON saas_invoices(due_date);

-- Governance Policies indexes
CREATE INDEX IF NOT EXISTS idx_governance_policies_tenant_type ON governance_policies(tenant_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_governance_policies_tenant_enabled ON governance_policies(tenant_id, enabled);
