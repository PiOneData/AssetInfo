# Phase 3: Offboarding Automation - Design Document

## Overview
Implement automated user offboarding to reduce manual work from 2 hours to 5 minutes (80% reduction).

**Target Metrics:**
- One-click offboarding execution
- Complete audit trail of all actions
- 95%+ success rate on automated tasks
- Support for 4 playbook types
- Integration with 3 HR systems

## Architecture

### Database Schema

#### 1. Offboarding Requests
```sql
CREATE TABLE offboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  playbook_id UUID REFERENCES offboarding_playbooks(id),
  status VARCHAR(50) NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed', 'partial'
  initiated_by UUID NOT NULL REFERENCES users(id),
  initiated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_tasks INTEGER DEFAULT 0,
  completed_tasks INTEGER DEFAULT 0,
  failed_tasks INTEGER DEFAULT 0,
  reason TEXT,
  transfer_to_user_id UUID REFERENCES users(id),
  notes TEXT,
  audit_report_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_requests_tenant ON offboarding_requests(tenant_id);
CREATE INDEX idx_offboarding_requests_user ON offboarding_requests(user_id);
CREATE INDEX idx_offboarding_requests_status ON offboarding_requests(status);
```

#### 2. Offboarding Tasks
```sql
CREATE TABLE offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES offboarding_requests(id) ON DELETE CASCADE,
  task_type VARCHAR(100) NOT NULL, -- 'revoke_sso', 'revoke_oauth', 'transfer_ownership', 'remove_from_group', etc.
  app_id UUID REFERENCES saas_apps(id),
  app_name VARCHAR(255),
  status VARCHAR(50) NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  priority INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_tasks_request ON offboarding_tasks(request_id);
CREATE INDEX idx_offboarding_tasks_status ON offboarding_tasks(status);
```

#### 3. Offboarding Playbooks
```sql
CREATE TABLE offboarding_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL, -- 'standard', 'contractor', 'transfer', 'role_change'
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  steps JSONB NOT NULL, -- Array of step configurations
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offboarding_playbooks_tenant ON offboarding_playbooks(tenant_id);
CREATE INDEX idx_offboarding_playbooks_type ON offboarding_playbooks(type);
```

#### 4. HR Integrations
```sql
CREATE TABLE hr_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider VARCHAR(100) NOT NULL, -- 'bamboohr', 'keka', 'darwinbox'
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  webhook_secret VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  sync_enabled BOOLEAN DEFAULT true,
  auto_trigger_offboarding BOOLEAN DEFAULT true,
  default_playbook_id UUID REFERENCES offboarding_playbooks(id),
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hr_integrations_tenant ON hr_integrations(tenant_id);
CREATE INDEX idx_hr_integrations_provider ON hr_integrations(provider);
```

## Component Architecture

### 1. Offboarding Orchestrator (`server/services/offboarding/orchestrator.ts`)
Main service that coordinates the entire offboarding process.

**Key Methods:**
- `createRequest(userId, playbookId, options)` - Create new offboarding request
- `previewOffboarding(userId)` - Show what will be offboarded
- `executeOffboarding(requestId)` - Execute offboarding workflow
- `getRequestStatus(requestId)` - Get real-time status
- `generateAuditReport(requestId)` - Generate compliance report

**Workflow:**
1. Load playbook steps
2. Discover user's app access
3. Create tasks based on playbook
4. Execute tasks in priority order
5. Handle failures with retries
6. Generate audit report
7. Update user status

### 2. SSO Revocation Service (`server/services/offboarding/sso-revocation.ts`)
Revokes user access from SSO-connected applications.

**Features:**
- Azure AD user removal from app assignments
- Google Workspace app access revocation
- Group membership removal
- License reclamation

### 3. OAuth Revocation Service (`server/services/offboarding/oauth-revocation.ts`)
Revokes OAuth tokens and API access.

**Features:**
- Revoke all OAuth tokens for user
- Remove API keys/tokens
- Invalidate refresh tokens
- Log all revocations

### 4. Ownership Transfer Service (`server/services/offboarding/ownership-transfer.ts`)
Transfers ownership of resources to another user.

**Supported Platforms:**
- Google Drive (files, folders, shared drives)
- Notion (pages, databases, workspaces)
- GitHub (repositories, organizations)
- Slack (channels ownership)
- Microsoft 365 (OneDrive, SharePoint)

**Process:**
1. Discover owned resources
2. Transfer to designated user
3. Verify transfer success
4. Document in audit log

### 5. HR Integration Connectors

#### BambooHR Connector (`server/services/hr/bamboohr-connector.ts`)
```typescript
interface BambooHRConnector {
  testConnection(): Promise<boolean>;
  syncEmployees(): Promise<SyncResult>;
  handleWebhook(payload: BambooHRWebhook): Promise<void>;
  getEmployeeStatus(employeeId: string): Promise<EmployeeStatus>;
}
```

**Webhook Events:**
- Employee terminated
- Employee status changed
- Employee transferred

#### Keka Connector (`server/services/hr/keka-connector.ts`)
Indian market HR system.

**Features:**
- Employee sync
- Offboarding webhooks
- Status monitoring

#### Darwinbox Connector (`server/services/hr/darwinbox-connector.ts`)
Enterprise HR system.

**Features:**
- Employee sync
- Exit workflows
- Department transfers

### 6. Playbook Engine (`server/services/offboarding/playbook-engine.ts`)
Manages playbook templates and execution.

**Default Playbooks:**

**Standard Offboarding:**
```json
{
  "name": "Standard Employee Offboarding",
  "type": "standard",
  "steps": [
    { "type": "revoke_sso", "priority": 1 },
    { "type": "revoke_oauth", "priority": 2 },
    { "type": "transfer_ownership", "priority": 3 },
    { "type": "remove_from_groups", "priority": 4 },
    { "type": "archive_data", "priority": 5 },
    { "type": "generate_report", "priority": 6 }
  ]
}
```

**Contractor Offboarding:**
```json
{
  "name": "Contractor Offboarding",
  "type": "contractor",
  "steps": [
    { "type": "revoke_sso", "priority": 1 },
    { "type": "revoke_oauth", "priority": 2 },
    { "type": "remove_from_groups", "priority": 3 },
    { "type": "generate_report", "priority": 4 }
  ]
}
```

**Department Transfer:**
```json
{
  "name": "Department Transfer",
  "type": "transfer",
  "steps": [
    { "type": "transfer_ownership", "priority": 1 },
    { "type": "update_groups", "priority": 2 },
    { "type": "update_permissions", "priority": 3 },
    { "type": "generate_report", "priority": 4 }
  ]
}
```

**Role Change:**
```json
{
  "name": "Role Change",
  "type": "role_change",
  "steps": [
    { "type": "review_access", "priority": 1 },
    { "type": "adjust_permissions", "priority": 2 },
    { "type": "update_licenses", "priority": 3 },
    { "type": "generate_report", "priority": 4 }
  ]
}
```

### 7. Audit Report Generator (`server/services/offboarding/audit-report.ts`)
Generates comprehensive audit reports.

**Report Sections:**
- Executive Summary
- User Details
- Apps Accessed
- Revocation Actions
- Ownership Transfers
- Failed Actions (if any)
- Timeline
- Compliance Checklist

**Export Formats:**
- PDF (primary)
- JSON (for systems integration)
- CSV (for analysis)

## API Endpoints

### Offboarding Management
```
POST   /api/offboarding/requests              - Create offboarding request
GET    /api/offboarding/requests              - List offboarding requests
GET    /api/offboarding/requests/:id          - Get request details
POST   /api/offboarding/requests/:id/execute  - Execute offboarding
POST   /api/offboarding/requests/:id/cancel   - Cancel offboarding
GET    /api/offboarding/requests/:id/audit    - Get audit report
POST   /api/offboarding/preview/:userId       - Preview offboarding actions
GET    /api/offboarding/stats                 - Offboarding statistics
```

### Playbook Management
```
GET    /api/offboarding/playbooks             - List playbooks
POST   /api/offboarding/playbooks             - Create playbook
GET    /api/offboarding/playbooks/:id         - Get playbook
PUT    /api/offboarding/playbooks/:id         - Update playbook
DELETE /api/offboarding/playbooks/:id         - Delete playbook
```

### HR Integrations
```
GET    /api/hr-integrations                   - List HR integrations
POST   /api/hr-integrations                   - Create HR integration
GET    /api/hr-integrations/:id               - Get integration details
PUT    /api/hr-integrations/:id               - Update integration
DELETE /api/hr-integrations/:id               - Delete integration
POST   /api/hr-integrations/:id/test          - Test connection
POST   /api/hr-integrations/:id/sync          - Trigger manual sync
POST   /api/hr-integrations/webhook/:provider - Webhook endpoint
```

## UI Components

### 1. Offboarding Dashboard (`client/src/pages/offboarding-dashboard.tsx`)
Main dashboard for offboarding management.

**Features:**
- List of all offboarding requests
- Status indicators
- Quick actions
- Search and filters
- Statistics cards

### 2. Offboarding Wizard (`client/src/components/offboarding/wizard.tsx`)
Step-by-step offboarding process.

**Steps:**
1. Select User
2. Preview Access
3. Choose Playbook
4. Configure Options (transfer to user, etc.)
5. Review & Confirm
6. Execute
7. View Results

### 3. Offboarding Preview (`client/src/components/offboarding/preview.tsx`)
Shows what will be offboarded before execution.

**Display:**
- All apps user has access to
- OAuth tokens
- Owned resources
- Group memberships
- Estimated time

### 4. Progress Tracker (`client/src/components/offboarding/progress-tracker.tsx`)
Real-time progress during offboarding execution.

**Features:**
- Task list with status
- Progress bar
- Error notifications
- Retry options
- Live updates via polling

### 5. Audit Report Viewer (`client/src/components/offboarding/audit-report.tsx`)
View and download audit reports.

### 6. Playbook Manager (`client/src/pages/playbook-manager.tsx`)
Manage offboarding playbooks.

**Features:**
- Create/edit playbooks
- Drag-and-drop step ordering
- Preview playbook
- Set as default

### 7. HR Integration Settings (`client/src/pages/hr-integrations.tsx`)
Configure HR system integrations.

**Features:**
- Add/edit integrations
- Test connection
- Configure webhooks
- Auto-trigger settings

## Security & Compliance

### Access Control
- Only admins can initiate offboarding
- Audit log for all actions
- Approval workflow for sensitive operations
- Multi-factor authentication for critical actions

### Data Retention
- Audit reports stored for 7 years
- Offboarding requests archived after 90 days
- Task logs retained for compliance

### Error Handling
- Graceful degradation on failures
- Retry logic with exponential backoff
- Admin notifications on critical failures
- Manual intervention options

## Performance Targets

- **Preview Generation:** < 5 seconds
- **Offboarding Execution:** < 5 minutes for 10 apps
- **Concurrent Requests:** Support 10 simultaneous offboardings
- **Audit Report Generation:** < 10 seconds

## Testing Strategy

### Unit Tests
- Each service individually tested
- Mock external APIs
- Test error scenarios

### Integration Tests
- End-to-end offboarding flow
- HR webhook processing
- Playbook execution

### Manual Testing
- Test with real IdP connections
- Verify ownership transfers
- Validate audit reports

## Rollout Plan

### Phase 3.1: Core Offboarding (Week 1-2)
- Database schema
- Offboarding orchestrator
- SSO/OAuth revocation
- Basic UI

### Phase 3.2: Ownership Transfer (Week 2-3)
- Google Drive transfer
- GitHub transfer
- Notion transfer
- Audit reporting

### Phase 3.3: HR Integrations (Week 3-4)
- BambooHR connector
- Keka connector
- Darwinbox connector
- Webhook handling
- Auto-trigger

### Phase 3.4: Playbooks (Week 4)
- Playbook engine
- Default templates
- Playbook UI
- Testing & polish

## Success Metrics

- ✅ Offboarding time reduced from 2 hours to < 5 minutes
- ✅ 80% reduction in manual work
- ✅ 95%+ task success rate
- ✅ Complete audit trail for compliance
- ✅ HR system auto-trigger working
- ✅ Ownership transfer success rate > 90%

## Future Enhancements (Phase 4+)

- Slack notifications for offboarding events
- Custom approval workflows
- Scheduled offboarding (future date)
- Bulk offboarding
- Re-hiring workflows
- Integration with ticketing system
- Advanced analytics dashboard
