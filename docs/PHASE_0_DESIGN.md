# Phase 0: SaaS Governance Foundation - Design Document

**Status**: Design Complete - Ready for Implementation
**Created**: 2025-12-08
**Branch**: `claude/shadow-it-discussion-01UkDoi8rtPGC8yp744y2x6P`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Dependencies & Impact Analysis](#dependencies--impact-analysis)
3. [Database Schema Design](#database-schema-design)
4. [API Endpoints Design](#api-endpoints-design)
5. [Frontend Components Design](#frontend-components-design)
6. [Migration Strategy](#migration-strategy)
7. [Testing Strategy](#testing-strategy)
8. [Rollback Plan](#rollback-plan)
9. [Implementation Checklist](#implementation-checklist)

---

## Executive Summary

### Goal
Establish the foundational data model and basic API/UI infrastructure for SaaS governance features, enabling future Shadow IT detection, spend management, and offboarding automation.

### Scope
- **Database**: 7 new tables for SaaS management
- **API**: 4 new route modules with ~20 endpoints
- **UI**: Basic SaaS management pages and navigation
- **No Breaking Changes**: All changes are additive

### Timeline
**Estimated**: 2-3 weeks

---

## Dependencies & Impact Analysis

### ✅ No Breaking Changes Expected

**All changes are additive:**
- New tables with no foreign keys to existing tables
- New API routes under new namespaces
- New UI pages with separate routes
- Existing functionality remains unchanged

### Dependencies Identified

#### 1. Database Dependencies

| New Table | Depends On | Relationship | Impact |
|-----------|-----------|--------------|--------|
| `saasApps` | `tenants` | tenantId (logical, no FK) | None - follows existing pattern |
| `saasContracts` | `saasApps` | appId reference | None - optional relationship |
| `saasContracts` | `tenants` | tenantId (logical) | None |
| `userAppAccess` | `users` | userId (logical) | None - will handle deleted users gracefully |
| `userAppAccess` | `saasApps` | appId (logical) | None |
| `oauthTokens` | `users` | userId (logical) | None |
| `oauthTokens` | `saasApps` | appId (logical) | None |
| `identityProviders` | `tenants` | tenantId (logical) | None |
| `saasInvoices` | `saasApps` | appId (logical) | None |
| `governancePolicies` | `tenants` | tenantId (logical) | None |

**Decision**: Follow existing AssetInfo pattern of **no foreign key constraints**, using logical relationships only.

**Rationale**:
- Maintains consistency with current schema
- Avoids cascade delete complications
- Application-layer relationship management
- Easier to evolve schema independently

#### 2. API Dependencies

| New Route | Uses Middleware | Uses Service | Impact |
|-----------|----------------|--------------|--------|
| `/api/saas-apps` | `authenticateToken`, `requireRole` | `storage` | None - uses existing middleware |
| `/api/saas-contracts` | Same | `storage` | None |
| `/api/identity-providers` | Same | `storage` + new IdP service | New service needed |
| `/api/governance-policies` | Same | `storage` + new policy engine | New service needed |

**New Services Required**:
- `server/services/identityProvider.ts` - IdP connector abstraction
- `server/services/policyEngine.ts` - Policy evaluation (Phase 1+)

#### 3. Frontend Dependencies

| New Page | Depends On | Impact |
|----------|-----------|--------|
| `/saas-management` | Existing layout components | None - reuses Sidebar, TopBar |
| SaaS components | Existing UI components | None - uses Shadcn components |
| SaaS forms | `react-hook-form`, Zod | None - follows existing pattern |

**No new npm packages required for Phase 0.**

#### 4. Integration Points

**Existing Features That Will Integrate Later:**
- **Software Licenses** (`softwareLicenses` table) - Can link to `saasApps` in Phase 1
- **Audit Logs** - Will track SaaS management actions (already available)
- **User Management** - Will link users to SaaS apps via `userAppAccess`
- **Vendor Management** - Can link vendors to SaaS apps (future enhancement)
- **AI Recommendations** - Can recommend SaaS optimizations (future)

**No immediate integration required - Phase 0 is independent.**

### Potential Conflicts

#### ❌ None Identified

**Reasons:**
1. **No namespace collisions**: New routes use `/api/saas-*` and `/api/identity-providers`
2. **No schema conflicts**: New tables don't overlap with existing tables
3. **No UI conflicts**: New pages use unique routes
4. **No role conflicts**: Uses existing RBAC system

### Resource Considerations

#### Database

**New Tables**: 7 (minimal impact on PostgreSQL)

**Estimated Row Growth**:
- `saasApps`: ~50-200 apps per tenant
- `userAppAccess`: ~500-5000 per tenant (depends on user count)
- `oauthTokens`: ~100-1000 per tenant
- `saasContracts`: ~50-200 per tenant
- `saasInvoices`: ~50-500 per tenant (historical data)
- `identityProviders`: ~1-3 per tenant
- `governancePolicies`: ~10-50 per tenant

**Storage Impact**: Negligible (~10-50 MB per tenant)

#### API Performance

**New Endpoints**: ~20 endpoints

**Expected Load**:
- Read-heavy workload (90% reads, 10% writes)
- Low frequency (<100 requests/min per tenant)
- No real-time requirements

**Rate Limiting**: Use existing `apiLimiter` (1000 req/15min)

#### Frontend Bundle Size

**New Pages**: 4-5 pages (~50-100 KB)

**Impact**: Minimal with code splitting via Vite

---

## Database Schema Design

### Design Principles

Following AssetInfo conventions:

1. ✅ **Multi-tenancy**: Every table has `tenantId`
2. ✅ **UUID Primary Keys**: `varchar` type with `gen_random_uuid()`
3. ✅ **Timestamps**: `createdAt` and `updatedAt` on all tables
4. ✅ **No Foreign Keys**: Logical relationships only
5. ✅ **JSONB for Flexibility**: Semi-structured data in JSONB columns
6. ✅ **Indexes**: Composite indexes for tenant isolation
7. ✅ **No Enums**: Text fields with Zod validation

### Table Definitions

#### 1. `saasApps` - SaaS Application Catalog

**Purpose**: Central registry of all SaaS applications (discovered, approved, or unapproved)

```typescript
export const saasApps = pgTable("saas_apps", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),

  // Basic information
  name: text("name").notNull(),
  vendor: text("vendor"),
  description: text("description"),
  category: text("category"), // e.g., "Communication", "Storage", "Development"

  // URLs and integration
  websiteUrl: text("website_url"),
  logoUrl: text("logo_url"),
  apiUrl: text("api_url"),

  // Governance
  approvalStatus: text("approval_status").notNull().default("pending"), // pending, approved, denied
  riskScore: integer("risk_score").default(0), // 0-100
  riskFactors: jsonb("risk_factors").$type<string[]>(), // ["oauth_overprivileged", "data_exfiltration"]

  // Usage tracking
  userCount: integer("user_count").default(0),
  activeUserCount: integer("active_user_count").default(0),
  lastUsedAt: timestamp("last_used_at"),

  // Ownership
  owner: text("owner"), // Department or person
  ownerId: varchar("owner_id"), // User ID if applicable
  primaryContactEmail: text("primary_contact_email"),

  // Discovery metadata
  discoveryMethod: text("discovery_method"), // "idp", "email", "manual", "browser"
  discoveryDate: timestamp("discovery_date"),
  discoveredByUserId: varchar("discovered_by_user_id"),

  // Additional metadata
  tags: jsonb("tags").$type<string[]>(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  uniqueTenantName: uniqueIndex("uniq_saas_apps_tenant_name").on(table.tenantId, table.name),
  idxTenantStatus: index("idx_saas_apps_tenant_status").on(table.tenantId, table.approvalStatus),
  idxTenantCategory: index("idx_saas_apps_tenant_category").on(table.tenantId, table.category),
  idxRiskScore: index("idx_saas_apps_risk_score").on(table.tenantId, table.riskScore),
}));
```

**Validation Schema**:
```typescript
export const insertSaasAppSchema = createInsertSchema(saasApps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  approvalStatus: z.enum(["pending", "approved", "denied"]).default("pending"),
  riskScore: z.number().min(0).max(100).default(0),
  discoveryMethod: z.enum(["idp", "email", "manual", "browser", "network"]).optional(),
});
```

---

#### 2. `saasContracts` - Contract & Subscription Management

**Purpose**: Track contracts, subscription terms, and renewal dates

```typescript
export const saasContracts = pgTable("saas_contracts", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  appId: varchar("app_id").notNull(), // Reference to saasApps

  // Contract details
  contractNumber: text("contract_number"),
  vendor: text("vendor").notNull(),

  // Financial
  annualValue: decimal("annual_value", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  billingCycle: text("billing_cycle"), // "monthly", "quarterly", "annual"
  paymentTerms: text("payment_terms"), // "net-30", "net-60"

  // Dates
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  renewalDate: timestamp("renewal_date"),
  noticePeroidDays: integer("notice_period_days"), // Days required for cancellation notice

  // Auto-renewal
  autoRenew: boolean("auto_renew").default(false),
  renewalAlerted: boolean("renewal_alerted").default(false),

  // Contract terms
  terms: text("terms"), // Full contract text or summary
  terminationClause: text("termination_clause"),

  // License details
  licenseType: text("license_type"), // "per-user", "per-device", "unlimited", "consumption-based"
  totalLicenses: integer("total_licenses"),
  usedLicenses: integer("used_licenses").default(0),

  // Document management
  contractFileUrl: text("contract_file_url"), // S3 or file path
  signedBy: text("signed_by"),
  signedDate: timestamp("signed_date"),

  // Ownership
  owner: text("owner"),
  ownerId: varchar("owner_id"),

  // Status
  status: text("status").notNull().default("active"), // active, expired, cancelled, pending

  // Additional metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  idxTenantApp: index("idx_saas_contracts_tenant_app").on(table.tenantId, table.appId),
  idxTenantStatus: index("idx_saas_contracts_tenant_status").on(table.tenantId, table.status),
  idxRenewalDate: index("idx_saas_contracts_renewal_date").on(table.renewalDate),
  idxTenantRenewalDate: index("idx_saas_contracts_tenant_renewal").on(table.tenantId, table.renewalDate),
}));
```

**Validation Schema**:
```typescript
export const insertSaasContractSchema = createInsertSchema(saasContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  billingCycle: z.enum(["monthly", "quarterly", "annual", "usage-based"]).optional(),
  licenseType: z.enum(["per-user", "per-device", "unlimited", "consumption-based"]).optional(),
  status: z.enum(["active", "expired", "cancelled", "pending"]).default("active"),
  currency: z.string().length(3).default("USD"),
});
```

---

#### 3. `userAppAccess` - User–App Relationship Graph

**Purpose**: Track which users have access to which SaaS apps and their permissions

```typescript
export const userAppAccess = pgTable("user_app_access", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  userId: varchar("user_id").notNull(), // Reference to users table
  appId: varchar("app_id").notNull(), // Reference to saasApps

  // Access details
  accessGrantedDate: timestamp("access_granted_date").defaultNow(),
  lastAccessDate: timestamp("last_access_date"),
  accessRevokedDate: timestamp("access_revoked_date"),

  // Permissions
  permissions: jsonb("permissions").$type<string[]>(), // ["read", "write", "admin"]
  roles: jsonb("roles").$type<string[]>(), // App-specific roles

  // OAuth context
  hasOAuthToken: boolean("has_oauth_token").default(false),
  oauthScopes: jsonb("oauth_scopes").$type<string[]>(),

  // Assignment tracking
  assignedBy: varchar("assigned_by"), // User ID who granted access
  assignmentMethod: text("assignment_method"), // "manual", "sso", "oauth", "discovered"

  // Status
  status: text("status").notNull().default("active"), // active, revoked, suspended

  // Usage tracking
  loginCount: integer("login_count").default(0),
  lastLoginAt: timestamp("last_login_at"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  uniqueTenantUserApp: uniqueIndex("uniq_user_app_access_tenant_user_app").on(
    table.tenantId,
    table.userId,
    table.appId
  ),
  idxTenantUser: index("idx_user_app_access_tenant_user").on(table.tenantId, table.userId),
  idxTenantApp: index("idx_user_app_access_tenant_app").on(table.tenantId, table.appId),
  idxStatus: index("idx_user_app_access_status").on(table.tenantId, table.status),
}));
```

**Validation Schema**:
```typescript
export const insertUserAppAccessSchema = createInsertSchema(userAppAccess).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "revoked", "suspended"]).default("active"),
  assignmentMethod: z.enum(["manual", "sso", "oauth", "discovered"]).optional(),
});
```

---

#### 4. `oauthTokens` - OAuth Token Tracking

**Purpose**: Track OAuth tokens granted to SaaS apps for risk analysis

```typescript
export const oauthTokens = pgTable("oauth_tokens", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  userId: varchar("user_id").notNull(),
  appId: varchar("app_id").notNull(),

  // OAuth details
  tokenHash: text("token_hash"), // Hashed token for verification (never store plaintext)
  scopes: jsonb("scopes").$type<string[]>().notNull(), // ["mail.read", "files.readwrite"]
  grantType: text("grant_type"), // "authorization_code", "implicit"

  // Token lifecycle
  grantedAt: timestamp("granted_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),

  // Risk assessment
  riskLevel: text("risk_level").default("low"), // low, medium, high, critical
  riskReasons: jsonb("risk_reasons").$type<string[]>(), // ["excessive_scopes", "mail_access"]

  // Revocation
  status: text("status").notNull().default("active"), // active, expired, revoked
  revokedBy: varchar("revoked_by"), // User ID who revoked
  revocationReason: text("revocation_reason"),

  // IdP metadata
  idpTokenId: text("idp_token_id"), // External OAuth token ID from IdP
  idpMetadata: jsonb("idp_metadata").$type<Record<string, any>>(),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  idxTenantUserApp: index("idx_oauth_tokens_tenant_user_app").on(
    table.tenantId,
    table.userId,
    table.appId
  ),
  idxTenantStatus: index("idx_oauth_tokens_tenant_status").on(table.tenantId, table.status),
  idxRiskLevel: index("idx_oauth_tokens_risk_level").on(table.tenantId, table.riskLevel),
  idxExpiresAt: index("idx_oauth_tokens_expires_at").on(table.expiresAt),
}));
```

**Validation Schema**:
```typescript
export const insertOauthTokenSchema = createInsertSchema(oauthTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "expired", "revoked"]).default("active"),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
  scopes: z.array(z.string()).min(1),
});
```

---

#### 5. `identityProviders` - IdP Configuration

**Purpose**: Store identity provider configurations for sync

```typescript
export const identityProviders = pgTable("identity_providers", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),

  // Provider details
  name: text("name").notNull(), // "Azure AD", "Okta", "Google Workspace"
  type: text("type").notNull(), // "azuread", "okta", "google", "jumpcloud"

  // Configuration
  clientId: text("client_id"),
  clientSecret: text("client_secret"), // Should be encrypted
  tenantDomain: text("tenant_domain"), // e.g., "company.onmicrosoft.com"

  // OAuth endpoints
  authorizationUrl: text("authorization_url"),
  tokenUrl: text("token_url"),
  userInfoUrl: text("user_info_url"),

  // Scopes and permissions
  scopes: jsonb("scopes").$type<string[]>(),

  // Sync configuration
  syncEnabled: boolean("sync_enabled").default(false),
  syncInterval: integer("sync_interval").default(3600), // seconds
  lastSyncAt: timestamp("last_sync_at"),
  nextSyncAt: timestamp("next_sync_at"),
  syncStatus: text("sync_status").default("idle"), // idle, syncing, error
  syncError: text("sync_error"),

  // Statistics
  totalUsers: integer("total_users").default(0),
  totalApps: integer("total_apps").default(0),

  // Status
  status: text("status").notNull().default("active"), // active, disabled, error

  // Configuration metadata
  config: jsonb("config").$type<Record<string, any>>(), // Provider-specific config

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  uniqueTenantType: uniqueIndex("uniq_identity_providers_tenant_type").on(table.tenantId, table.type),
  idxTenantStatus: index("idx_identity_providers_tenant_status").on(table.tenantId, table.status),
  idxNextSync: index("idx_identity_providers_next_sync").on(table.nextSyncAt),
}));
```

**Validation Schema**:
```typescript
export const insertIdentityProviderSchema = createInsertSchema(identityProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: z.enum(["azuread", "okta", "google", "jumpcloud"]),
  status: z.enum(["active", "disabled", "error"]).default("active"),
  syncStatus: z.enum(["idle", "syncing", "error"]).default("idle"),
});
```

---

#### 6. `saasInvoices` - Invoice Tracking

**Purpose**: Track SaaS invoices and billing history

```typescript
export const saasInvoices = pgTable("saas_invoices", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  appId: varchar("app_id"), // Optional link to saasApps
  contractId: varchar("contract_id"), // Optional link to saasContracts

  // Invoice details
  invoiceNumber: text("invoice_number"),
  vendor: text("vendor").notNull(),

  // Financial
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),

  // Dates
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),

  // Billing period
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),

  // Status
  status: text("status").notNull().default("pending"), // pending, paid, overdue, cancelled

  // Payment
  paymentMethod: text("payment_method"), // "card", "bank_transfer", "check"
  transactionId: text("transaction_id"),

  // Document
  invoiceFileUrl: text("invoice_file_url"),

  // External system
  externalInvoiceId: text("external_invoice_id"), // Stripe, etc.

  // Categorization
  category: text("category"), // "subscription", "overage", "one-time"
  department: text("department"),
  costCenter: text("cost_center"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  idxTenantApp: index("idx_saas_invoices_tenant_app").on(table.tenantId, table.appId),
  idxTenantStatus: index("idx_saas_invoices_tenant_status").on(table.tenantId, table.status),
  idxInvoiceDate: index("idx_saas_invoices_invoice_date").on(table.tenantId, table.invoiceDate),
  idxDueDate: index("idx_saas_invoices_due_date").on(table.dueDate),
}));
```

**Validation Schema**:
```typescript
export const insertSaasInvoiceSchema = createInsertSchema(saasInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["pending", "paid", "overdue", "cancelled"]).default("pending"),
  paymentMethod: z.enum(["card", "bank_transfer", "check", "other"]).optional(),
  currency: z.string().length(3).default("USD"),
});
```

---

#### 7. `governancePolicies` - Automation Policy Rules

**Purpose**: Store governance policies for automation (Phase 1+, schema now)

```typescript
export const governancePolicies = pgTable("governance_policies", {
  // Primary identification
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),

  // Policy details
  name: text("name").notNull(),
  description: text("description"),
  policyType: text("policy_type").notNull(), // "approval", "license_reclaim", "risk_blocking"

  // Trigger configuration
  trigger: jsonb("trigger").$type<{
    event: string;
    conditions: Record<string, any>;
  }>().notNull(),

  // Actions to take
  actions: jsonb("actions").$type<Array<{
    type: string;
    config: Record<string, any>;
  }>>().notNull(),

  // Execution
  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(0), // Higher = executed first

  // Statistics
  executionCount: integer("execution_count").default(0),
  lastExecutedAt: timestamp("last_executed_at"),

  // Owner
  createdBy: varchar("created_by"),

  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Indexes
  idxTenantType: index("idx_governance_policies_tenant_type").on(table.tenantId, table.policyType),
  idxTenantEnabled: index("idx_governance_policies_tenant_enabled").on(table.tenantId, table.enabled),
}));
```

**Validation Schema**:
```typescript
export const insertGovernancePolicySchema = createInsertSchema(governancePolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  policyType: z.enum([
    "approval",
    "license_reclaim",
    "risk_blocking",
    "renewal_alert",
    "offboarding"
  ]),
});
```

---

## API Endpoints Design

### Route Module 1: `/api/saas-apps`

**File**: `server/routes/saas-apps.routes.ts`

**Endpoints**:

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/saas-apps` | ✅ | technician | List all SaaS apps with filters |
| GET | `/api/saas-apps/:id` | ✅ | technician | Get single SaaS app details |
| POST | `/api/saas-apps` | ✅ | it-manager | Create new SaaS app |
| PUT | `/api/saas-apps/:id` | ✅ | it-manager | Update SaaS app |
| DELETE | `/api/saas-apps/:id` | ✅ | admin | Delete SaaS app |
| PATCH | `/api/saas-apps/:id/approval-status` | ✅ | it-manager | Approve/deny app |
| GET | `/api/saas-apps/:id/users` | ✅ | technician | List users with access |
| GET | `/api/saas-apps/stats` | ✅ | technician | Get SaaS app statistics |

**Query Filters**:
- `approvalStatus` - Filter by approval status
- `category` - Filter by category
- `riskScore` - Filter by risk level (e.g., `>80`)
- `search` - Search by name/vendor

---

### Route Module 2: `/api/saas-contracts`

**File**: `server/routes/saas-contracts.routes.ts`

**Endpoints**:

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/saas-contracts` | ✅ | technician | List all contracts |
| GET | `/api/saas-contracts/:id` | ✅ | technician | Get contract details |
| POST | `/api/saas-contracts` | ✅ | it-manager | Create contract |
| PUT | `/api/saas-contracts/:id` | ✅ | it-manager | Update contract |
| DELETE | `/api/saas-contracts/:id` | ✅ | admin | Delete contract |
| GET | `/api/saas-contracts/renewals` | ✅ | technician | Get upcoming renewals |
| PATCH | `/api/saas-contracts/:id/renewal-alert` | ✅ | it-manager | Mark renewal alerted |

**Query Filters**:
- `status` - Filter by status
- `renewalDays` - Filter by days until renewal (e.g., `<30`)
- `appId` - Filter by app

---

### Route Module 3: `/api/identity-providers`

**File**: `server/routes/identity-providers.routes.ts`

**Endpoints**:

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/identity-providers` | ✅ | it-manager | List IdPs |
| GET | `/api/identity-providers/:id` | ✅ | it-manager | Get IdP details |
| POST | `/api/identity-providers` | ✅ | admin | Add IdP |
| PUT | `/api/identity-providers/:id` | ✅ | admin | Update IdP |
| DELETE | `/api/identity-providers/:id` | ✅ | admin | Delete IdP |
| POST | `/api/identity-providers/:id/test` | ✅ | admin | Test IdP connection |
| POST | `/api/identity-providers/:id/sync` | ✅ | admin | Trigger manual sync |

---

### Route Module 4: `/api/governance-policies`

**File**: `server/routes/governance-policies.routes.ts`

**Endpoints**:

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/governance-policies` | ✅ | it-manager | List policies |
| GET | `/api/governance-policies/:id` | ✅ | it-manager | Get policy details |
| POST | `/api/governance-policies` | ✅ | admin | Create policy |
| PUT | `/api/governance-policies/:id` | ✅ | admin | Update policy |
| DELETE | `/api/governance-policies/:id` | ✅ | admin | Delete policy |
| PATCH | `/api/governance-policies/:id/toggle` | ✅ | admin | Enable/disable policy |

---

## Frontend Components Design

### New Pages

#### 1. SaaS Management Page

**Route**: `/saas-management`
**File**: `client/src/pages/saas-management.tsx`
**Role**: `technician+`

**Features**:
- Card-based SaaS app listing
- Search and filter (by status, category, risk)
- Quick actions: Approve, Deny, View Details
- Add new SaaS app (manual entry)
- Import from CSV

**Components**:
- `SaasAppCard` - Individual app display
- `SaasAppForm` - Add/edit form
- `SaasAppFilters` - Filter sidebar

---

#### 2. SaaS App Details Page

**Route**: `/saas-management/:id`
**File**: `client/src/pages/saas-app-details.tsx`
**Role**: `technician+`

**Tabs**:
1. **Overview** - Basic info, risk score, approval status
2. **Users** - List of users with access
3. **Contracts** - Associated contracts
4. **Invoices** - Billing history
5. **Activity** - Audit log

---

#### 3. Contracts Management Page

**Route**: `/contracts`
**File**: `client/src/pages/contracts.tsx`
**Role**: `it-manager+`

**Features**:
- Table view of all contracts
- Renewal calendar
- Upcoming renewals widget
- Add/edit contracts
- Upload contract PDFs

---

#### 4. Identity Providers Page

**Route**: `/settings/identity-providers`
**File**: `client/src/pages/settings/identity-providers.tsx`
**Role**: `admin`

**Features**:
- List configured IdPs
- Add new IdP (Azure AD, Okta, Google)
- Test connection
- Trigger sync
- View sync status

---

### Navigation Updates

**Add to Sidebar** (`client/src/components/layout/sidebar.tsx`):

```typescript
{
  name: "SaaS Management",
  href: "/saas-management",
  icon: Cloud,
  requiredRole: "technician",
  subItems: [
    { name: "Applications", href: "/saas-management", icon: AppWindow },
    { name: "Contracts", href: "/contracts", icon: FileText },
  ]
},
```

---

## Migration Strategy

### Migration File

**File**: `migrations/0013_add_saas_governance.sql`

**Approach**:
1. Create all 7 tables in single migration
2. Add indexes
3. Add comments for documentation

**Safety Features**:
- Use `IF NOT EXISTS` for idempotency
- No data migration (all new tables)
- No foreign keys (safe to rollback)

**Execution**:
```bash
npm run db:push
```

### Schema Validation

After migration, validate:
```sql
-- Verify tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'saas_%';

-- Check indexes
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'saas_%';
```

---

## Testing Strategy

### Unit Tests

**Database Layer** (`server/__tests__/storage-saas.test.ts`):
- CRUD operations for each table
- Multi-tenant isolation
- Filter/search functionality

**API Layer** (`server/__tests__/saas-apps.test.ts`):
- Endpoint responses
- Authentication checks
- Role-based authorization
- Input validation

### Integration Tests

**End-to-End Flows**:
1. Create SaaS app → Add contract → View on dashboard
2. Add IdP → Test connection → Sync apps
3. Approve app → Assign users → Track usage

### Manual Testing Checklist

- [ ] Create SaaS app via UI
- [ ] Edit SaaS app details
- [ ] Approve/deny app
- [ ] Create contract with renewal date
- [ ] View upcoming renewals
- [ ] Add IdP configuration
- [ ] Test multi-tenant isolation

---

## Rollback Plan

### If Issues Arise

**Option 1: Schema Rollback**

```sql
-- Drop all new tables
DROP TABLE IF EXISTS governance_policies;
DROP TABLE IF EXISTS saas_invoices;
DROP TABLE IF EXISTS identity_providers;
DROP TABLE IF EXISTS oauth_tokens;
DROP TABLE IF EXISTS user_app_access;
DROP TABLE IF EXISTS saas_contracts;
DROP TABLE IF EXISTS saas_apps;
```

**Option 2: Disable Features**

- Remove navigation items from sidebar
- Comment out route registrations
- Tables remain but features hidden

**Impact**: Zero impact on existing features (all changes are additive)

---

## Implementation Checklist

### Phase 0.1: Database & Schema (Week 1)

- [ ] Create migration file `0013_add_saas_governance.sql`
- [ ] Add table definitions to `shared/schema.ts`
- [ ] Add Zod validation schemas
- [ ] Run migration and verify
- [ ] Update `storage.ts` interface with new methods
- [ ] Implement storage methods for SaaS tables
- [ ] Write unit tests for storage layer

### Phase 0.2: API Layer (Week 2)

- [ ] Set up S3/cloud storage configuration
- [ ] Implement file upload service for contract PDFs
- [ ] Implement encryption service for IdP secrets
- [ ] Create `server/routes/saas-apps.routes.ts`
- [ ] Create `server/routes/saas-contracts.routes.ts`
- [ ] Create `server/routes/identity-providers.routes.ts`
- [ ] Create `server/routes/governance-policies.routes.ts`
- [ ] Register routes in `server/routes/index.ts`
- [ ] Add audit logging for SaaS operations
- [ ] Write API tests
- [ ] Update Swagger documentation

### Phase 0.3: Frontend (Week 2-3)

- [ ] Create `client/src/pages/saas-management.tsx`
- [ ] Create `client/src/pages/saas-app-details.tsx`
- [ ] Create `client/src/pages/contracts.tsx`
- [ ] Create `client/src/components/saas/saas-app-card.tsx`
- [ ] Create `client/src/components/saas/saas-app-form.tsx`
- [ ] Create `client/src/components/saas/contract-form.tsx`
- [ ] Add navigation items to sidebar
- [ ] Add routes to App.tsx
- [ ] Style with Tailwind/Shadcn components
- [ ] Add loading states and error handling

### Phase 0.4: Testing & Documentation (Week 3)

- [ ] Run full test suite
- [ ] Manual UI testing
- [ ] Cross-browser testing
- [ ] Document API endpoints
- [ ] Update README with new features
- [ ] Create user guide for SaaS management
- [ ] Code review and refinement

---

## Success Criteria

### Phase 0 Complete When:

✅ **Database**:
- All 7 tables created and indexed
- Storage layer methods implemented
- Multi-tenant isolation verified

✅ **API**:
- All CRUD endpoints working
- Authentication/authorization enforced
- Audit logging active
- API tests passing

✅ **Frontend**:
- SaaS management pages accessible
- Forms working (create, edit, delete)
- Navigation updated
- Basic filtering functional

✅ **Quality**:
- No breaking changes to existing features
- Test coverage >80%
- Code reviewed
- Documentation complete

---

## Next Steps After Phase 0

With this foundation in place, we can proceed to:

**Phase 1**: IdP Integration & Shadow IT Discovery
- Implement Azure AD connector
- Implement Google Workspace connector
- Build discovery sync logic
- Create Shadow IT dashboard

**Phase 2**: Spend Management & License Intelligence
- Billing integrations (Razorpay, Stripe)
- Contract AI extraction
- License optimization engine
- Spend analytics dashboard

---

## Questions & Approvals

### ✅ Finalized Decisions

All open questions have been resolved:

1. **IdP Security**: ✅ **Application-level encryption**
   - Store `clientSecret` encrypted using Node crypto module
   - Use environment-based encryption key
   - Minimizes dependencies and keeps costs low for global product
   - Simple to implement and maintain

2. **File Storage**: ✅ **S3/Cloud Storage**
   - Contract PDFs stored in S3 (or compatible cloud storage)
   - Scalable and production-ready
   - URL references stored in `contractFileUrl` field
   - Supports multi-region deployments

3. **CSV Import**: ✅ **Deferred to Phase 1**
   - Manual entry only for Phase 0
   - Allows faster Phase 0 delivery
   - Will follow existing assets bulk import pattern in Phase 1

4. **Multi-Currency Support**: ✅ **USD only for Phase 0**
   - Single currency (USD) to simplify implementation
   - Multi-currency support added in Phase 2 with spend management
   - Currency conversion and exchange rates in future release

### Approval Checklist

- [x] Schema design approved
- [x] API design approved
- [x] Frontend mockups approved (basic structure)
- [x] Migration strategy approved
- [x] Timeline acceptable (2-3 weeks)
- [x] All open questions resolved

---

**Document Version**: 1.1
**Last Updated**: 2025-12-08 (Updated with finalized decisions)
**Prepared By**: Claude (AI Assistant)
**Status**: ✅ **APPROVED - Ready for Implementation**
