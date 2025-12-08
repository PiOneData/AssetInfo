# Phase 4: Policy Automation Engine - Design Document

## Overview
Implement self-healing IT policies that reduce IT toil by 50% through automated policy enforcement.

**Target Metrics:**
- Set policies once, automation runs forever
- 50% reduction in IT toil
- 95%+ policy execution success rate
- < 1 minute response time to policy triggers
- Support for 6 trigger types and 6 action types

## Architecture

### Database Schema

#### 1. Automated Policies
```sql
CREATE TABLE automated_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,

  -- Trigger configuration (IF)
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSONB NOT NULL,

  -- Conditions (additional filters)
  conditions JSONB,

  -- Actions (THEN)
  actions JSONB NOT NULL,

  -- Execution settings
  cooldown_minutes INTEGER DEFAULT 0,
  max_executions_per_day INTEGER,
  require_approval BOOLEAN DEFAULT false,

  -- Statistics
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMP,

  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_automated_policies_tenant ON automated_policies(tenant_id);
CREATE INDEX idx_automated_policies_trigger ON automated_policies(trigger_type, enabled);
```

#### 2. Policy Executions
```sql
CREATE TABLE policy_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  policy_id UUID NOT NULL REFERENCES automated_policies(id),

  -- Trigger context
  trigger_event VARCHAR(100) NOT NULL,
  trigger_data JSONB NOT NULL,

  -- Execution details
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  -- Actions executed
  actions_executed INTEGER DEFAULT 0,
  actions_succeeded INTEGER DEFAULT 0,
  actions_failed INTEGER DEFAULT 0,

  -- Results
  result JSONB,
  error_message TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_executions_tenant ON policy_executions(tenant_id);
CREATE INDEX idx_policy_executions_policy ON policy_executions(policy_id);
CREATE INDEX idx_policy_executions_status ON policy_executions(status);
CREATE INDEX idx_policy_executions_created ON policy_executions(created_at DESC);
```

#### 3. Policy Templates
```sql
CREATE TABLE policy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50),

  -- Template configuration
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSONB NOT NULL,
  conditions JSONB,
  actions JSONB NOT NULL,

  -- Metadata
  is_system BOOLEAN DEFAULT false,
  popularity INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_templates_category ON policy_templates(category);
```

#### 4. Policy Approvals (for policies requiring approval)
```sql
CREATE TABLE policy_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  execution_id UUID NOT NULL REFERENCES policy_executions(id),
  policy_id UUID NOT NULL REFERENCES automated_policies(id),

  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requested_by UUID REFERENCES users(id),

  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  approval_notes TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policy_approvals_tenant ON policy_approvals(tenant_id);
CREATE INDEX idx_policy_approvals_status ON policy_approvals(status);
```

## Trigger Types

### 1. App Discovered
Fires when a new SaaS app is discovered via Shadow IT detection.

**Trigger Config:**
```json
{
  "approvalStatus": ["unapproved", "pending"],
  "riskLevel": ["high", "critical"],
  "category": ["file_sharing", "collaboration"]
}
```

**Use Cases:**
- Block unapproved file sharing apps
- Alert on high-risk app discovery
- Auto-create tickets for review

### 2. License Unused
Fires when a license is unused for X days.

**Trigger Config:**
```json
{
  "unusedDays": 30,
  "appIds": ["app-123", "app-456"],
  "costThreshold": 50
}
```

**Use Cases:**
- Auto-reclaim dormant licenses
- Notify manager before reclaiming
- Create cost optimization report

### 3. Risky OAuth Permission
Fires when risky OAuth permissions are granted.

**Trigger Config:**
```json
{
  "riskLevel": ["high", "critical"],
  "scopes": ["mail.read", "files.readwrite.all"],
  "apps": ["*"]
}
```

**Use Cases:**
- Quarantine risky OAuth apps
- Revoke dangerous permissions
- Alert security team

### 4. User Offboarded
Fires when a user offboarding is completed.

**Trigger Config:**
```json
{
  "offboardingStatus": ["completed", "partial"],
  "departments": ["engineering", "sales"]
}
```

**Use Cases:**
- Verify all access revoked
- Notify manager
- Archive user data

### 5. Renewal Approaching
Fires when a contract renewal is approaching.

**Trigger Config:**
```json
{
  "daysBeforeRenewal": 30,
  "contractValue": 10000,
  "autoRenew": false
}
```

**Use Cases:**
- Alert procurement team
- Review usage before renewal
- Negotiate better pricing

### 6. Budget Exceeded
Fires when spending exceeds budget.

**Trigger Config:**
```json
{
  "budgetType": "monthly",
  "threshold": 80,
  "department": "engineering"
}
```

**Use Cases:**
- Alert finance team
- Freeze new purchases
- Generate spending report

## Action Types

### 1. Send Alert
Send notification to users or channels.

**Action Config:**
```json
{
  "type": "send_alert",
  "recipients": ["user-123", "admin@company.com"],
  "channels": ["slack", "email"],
  "priority": "high",
  "template": "New risky app discovered: {{app.name}}"
}
```

### 2. Create Ticket
Create a ticket in the ticketing system.

**Action Config:**
```json
{
  "type": "create_ticket",
  "priority": "high",
  "assignTo": "security-team",
  "title": "Review risky app: {{app.name}}",
  "description": "Risk level: {{app.riskLevel}}"
}
```

### 3. Block App
Block access to an application.

**Action Config:**
```json
{
  "type": "block_app",
  "appId": "{{trigger.appId}}",
  "reason": "Unapproved application",
  "notifyUsers": true
}
```

### 4. Revoke Access
Revoke user access to an app.

**Action Config:**
```json
{
  "type": "revoke_access",
  "userId": "{{trigger.userId}}",
  "appId": "{{trigger.appId}}",
  "revokeOAuth": true
}
```

### 5. Reclaim License
Reclaim unused license.

**Action Config:**
```json
{
  "type": "reclaim_license",
  "userId": "{{trigger.userId}}",
  "appId": "{{trigger.appId}}",
  "notifyUser": true,
  "reassignTo": "pool"
}
```

### 6. Notify Department Head
Send notification to department head.

**Action Config:**
```json
{
  "type": "notify_department_head",
  "department": "{{trigger.department}}",
  "subject": "Action required: {{trigger.summary}}",
  "includeDetails": true
}
```

## Component Architecture

### 1. Policy Engine (`server/services/policy/engine.ts`)
Core policy evaluation and execution engine.

**Key Methods:**
- `evaluatePolicy(policy, context)` - Check if policy conditions match
- `executePolicy(policy, context)` - Execute policy actions
- `matchTrigger(triggerType, eventData)` - Find matching policies
- `canExecute(policy)` - Check cooldown and execution limits

### 2. Event System (`server/services/policy/event-system.ts`)
Event-driven trigger system.

**Events:**
- `app.discovered`
- `license.unused`
- `oauth.risky_permission`
- `user.offboarded`
- `contract.renewal_approaching`
- `budget.exceeded`

**Methods:**
- `emit(eventType, data)` - Emit event
- `subscribe(eventType, handler)` - Subscribe to events
- `processEvent(event)` - Process and trigger policies

### 3. Action Handlers (`server/services/policy/actions/`)
Individual action implementations.

**Structure:**
```typescript
interface ActionHandler {
  type: string;
  validate(config: any): boolean;
  execute(config: any, context: any): Promise<ActionResult>;
}
```

**Handlers:**
- `AlertHandler` - Send notifications
- `TicketHandler` - Create tickets
- `BlockAppHandler` - Block applications
- `RevokeAccessHandler` - Revoke access
- `ReclaimLicenseHandler` - Reclaim licenses
- `NotifyHandler` - Send custom notifications

### 4. Template Manager (`server/services/policy/template-manager.ts`)
Manage pre-built policy templates.

**Pre-built Templates:**

**Template 1: Block Unapproved Apps**
```json
{
  "name": "Block Unapproved Apps",
  "category": "security",
  "trigger": {
    "type": "app_discovered",
    "config": { "approvalStatus": ["unapproved"] }
  },
  "actions": [
    { "type": "block_app", "config": { "notifyUsers": true } },
    { "type": "create_ticket", "config": { "assignTo": "security-team" } }
  ]
}
```

**Template 2: Auto-Reclaim Dormant Licenses**
```json
{
  "name": "Auto-Reclaim Dormant Licenses",
  "category": "cost_optimization",
  "trigger": {
    "type": "license_unused",
    "config": { "unusedDays": 30 }
  },
  "actions": [
    { "type": "notify_department_head", "config": { "grace_period_days": 7 } },
    { "type": "reclaim_license", "config": { "notifyUser": true } }
  ]
}
```

**Template 3: Quarantine Risky OAuth Apps**
```json
{
  "name": "Quarantine Risky OAuth Apps",
  "category": "security",
  "trigger": {
    "type": "oauth_risky_permission",
    "config": { "riskLevel": ["high", "critical"] }
  },
  "actions": [
    { "type": "block_app", "config": { "quarantine": true } },
    { "type": "send_alert", "config": { "recipients": ["security-team"], "priority": "high" } },
    { "type": "create_ticket", "config": { "priority": "critical" } }
  ]
}
```

**Template 4: Renewal Workflow Automation**
```json
{
  "name": "Renewal Workflow Automation",
  "category": "procurement",
  "trigger": {
    "type": "renewal_approaching",
    "config": { "daysBeforeRenewal": 45 }
  },
  "actions": [
    { "type": "notify_department_head", "config": { "includeUsageStats": true } },
    { "type": "create_ticket", "config": { "assignTo": "procurement", "template": "renewal_review" } },
    { "type": "send_alert", "config": { "channels": ["email"], "template": "renewal_reminder" } }
  ]
}
```

**Template 5: Budget Alert System**
```json
{
  "name": "Budget Alert System",
  "category": "finance",
  "trigger": {
    "type": "budget_exceeded",
    "config": { "threshold": 80 }
  },
  "actions": [
    { "type": "send_alert", "config": { "recipients": ["finance-team"], "priority": "high" } },
    { "type": "notify_department_head", "config": { "includeForecast": true } }
  ]
}
```

**Template 6: Offboarding Verification**
```json
{
  "name": "Offboarding Verification",
  "category": "compliance",
  "trigger": {
    "type": "user_offboarded",
    "config": { "status": "completed" }
  },
  "actions": [
    { "type": "create_ticket", "config": { "assignTo": "security-team", "template": "verify_offboarding" } },
    { "type": "notify_department_head", "config": { "includeAccessList": true } }
  ]
}
```

## Execution Engine

### Event-Driven Architecture
```
Event Source → Event Bus → Policy Engine → Action Queue → Action Handlers
```

**Technologies:**
- **Event Bus**: In-memory event emitter (future: Redis Pub/Sub or Kafka)
- **Job Queue**: Async task processing with retry logic
- **Storage**: PostgreSQL for policy definitions and execution logs

### Execution Flow
1. **Event Emission**: System emits event (e.g., app discovered)
2. **Policy Matching**: Engine finds policies matching the trigger
3. **Condition Evaluation**: Check if policy conditions are met
4. **Cooldown Check**: Verify policy isn't in cooldown period
5. **Execution Limit**: Check daily execution limit
6. **Approval Check**: Queue for approval if required
7. **Action Execution**: Execute actions sequentially
8. **Result Logging**: Log execution results
9. **Statistics Update**: Update policy execution stats

### Retry Logic
- Failed actions retry up to 3 times
- Exponential backoff: 2s, 4s, 8s
- Partial success allowed (some actions succeed, some fail)
- Detailed error logging for debugging

### Audit Trail
- Every policy execution logged
- Action results captured
- User context preserved
- Execution duration tracked

## API Endpoints

### Policy Management
```
GET    /api/policies                    - List all policies
POST   /api/policies                    - Create policy
GET    /api/policies/:id                - Get policy details
PUT    /api/policies/:id                - Update policy
DELETE /api/policies/:id                - Delete policy
POST   /api/policies/:id/enable         - Enable policy
POST   /api/policies/:id/disable        - Disable policy
POST   /api/policies/:id/test           - Test policy with sample data
GET    /api/policies/:id/executions     - Get execution history
GET    /api/policies/:id/stats          - Get policy statistics
```

### Policy Executions
```
GET    /api/policy-executions           - List executions
GET    /api/policy-executions/:id       - Get execution details
POST   /api/policy-executions/:id/retry - Retry failed execution
```

### Policy Templates
```
GET    /api/policy-templates            - List templates
GET    /api/policy-templates/:id        - Get template
POST   /api/policy-templates/:id/use    - Create policy from template
```

### Policy Approvals
```
GET    /api/policy-approvals            - List pending approvals
POST   /api/policy-approvals/:id/approve - Approve execution
POST   /api/policy-approvals/:id/reject  - Reject execution
```

### Event Testing
```
POST   /api/policies/test-event         - Emit test event
```

## UI Components

### 1. Policy Builder (`client/src/pages/policy-builder.tsx`)
No-code policy builder with drag-and-drop.

**Features:**
- Visual IF-THEN builder
- Trigger selector with configuration
- Condition builder
- Action selector with configuration
- Template library
- Test mode

### 2. Policy Dashboard (`client/src/pages/policy-dashboard.tsx`)
Overview of all policies and executions.

**Features:**
- Policy list with status
- Execution statistics
- Recent executions
- Success/failure rates
- Quick enable/disable

### 3. Execution History (`client/src/components/policy/execution-history.tsx`)
Detailed execution logs.

**Features:**
- Timeline view
- Action results
- Error details
- Retry options

### 4. Template Gallery (`client/src/components/policy/template-gallery.tsx`)
Browse and use pre-built templates.

**Categories:**
- Security
- Cost Optimization
- Compliance
- Procurement
- Finance

## Security & Compliance

### Access Control
- Policy creation: IT Manager+ only
- Policy approval: Admin only
- Execution logs: Read-only for auditors
- Template management: System only

### Safety Mechanisms
- Cooldown periods prevent policy spam
- Daily execution limits prevent runaway policies
- Approval workflows for critical actions
- Dry-run mode for testing
- Emergency disable for all policies

### Audit Requirements
- Complete execution trail
- User attribution for all actions
- Immutable execution logs
- 7-year retention for compliance

## Performance Targets

- **Event Processing**: < 100ms
- **Policy Evaluation**: < 500ms
- **Action Execution**: < 5 seconds per action
- **Concurrent Executions**: Support 50 simultaneous
- **Event Throughput**: 1000 events/minute

## Testing Strategy

### Unit Tests
- Policy evaluation logic
- Action handlers
- Condition matching

### Integration Tests
- End-to-end policy execution
- Event emission and processing
- Multi-action workflows

### Load Tests
- Event burst handling
- Concurrent policy execution
- Database performance

## Rollout Plan

### Phase 4.1: Core Engine (Week 1-2)
- Database schema
- Policy engine
- Event system
- Basic action handlers

### Phase 4.2: Action Handlers (Week 2-3)
- All 6 action types
- Retry logic
- Error handling

### Phase 4.3: Templates & UI (Week 3-4)
- Pre-built templates
- Policy builder UI
- Dashboard UI

### Phase 4.4: Advanced Features (Week 4-5)
- Approval workflows
- Advanced conditions
- Analytics dashboard

### Phase 4.5: Testing & Polish (Week 5-6)
- Load testing
- Bug fixes
- Documentation

## Success Metrics

- ✅ 50% reduction in IT toil
- ✅ 95%+ policy execution success rate
- ✅ < 1 minute trigger-to-action time
- ✅ 10+ pre-built templates
- ✅ No-code policy creation
- ✅ Complete audit trail

## Future Enhancements (Phase 5+)

- Machine learning for policy suggestions
- Slack/Teams integration for approvals
- Advanced scheduling (business hours only)
- Policy simulation mode
- Multi-tenant policy sharing
- Policy marketplace
