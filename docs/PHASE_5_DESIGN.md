# Phase 5: Identity Governance & Access Reviews

## Overview
Identity Governance & Access Reviews (IGA) provides SOC2/ISO27001-compliant access certification, privilege drift detection, and overprivileged account monitoring.

**Goal**: Quarterly access certification and continuous privilege monitoring
**ROI**: Pass compliance audits, reduce insider threats by 60%
**Timeline**: 6-8 weeks

---

## 5.1 Access Review Campaigns

### Problem Statement
Organizations need to regularly review and certify user access to ensure:
- Users only have access to applications they need
- Orphaned accounts are identified and removed
- Compliance requirements (SOC2, ISO27001, GDPR) are met
- Audit trails exist for all access decisions

### Solution Architecture

#### Campaign Management System
```
┌─────────────────────────────────────────────────────────────┐
│                   Access Review Campaigns                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Create Campaign → Generate Reviews → Assign Reviewers       │
│       ↓                   ↓                    ↓              │
│   Schedule         User Access Lists      Email Notify       │
│   Frequency          (per manager)        Reminders          │
│                          ↓                    ↓              │
│                    Review Process      Track Progress        │
│                   (Approve/Revoke)       (Dashboard)         │
│                          ↓                    ↓              │
│                   Execute Actions      Complete Campaign     │
│                   (Bulk Revoke)         Audit Report         │
└─────────────────────────────────────────────────────────────┘
```

#### Database Schema
**access_review_campaigns**
- Campaign metadata (name, type, frequency, status)
- Scope (all apps, specific apps, specific users)
- Review period and deadlines
- Completion tracking

**access_review_items**
- Individual access items to review
- User + App + Access Type
- Reviewer assignment
- Decision (approve/revoke/pending)
- Justification notes
- Timestamps for SLA tracking

**access_review_decisions**
- Audit trail of all decisions
- Reviewer identity
- Decision rationale
- Execution status (pending/completed/failed)

#### Campaign Types
1. **Quarterly Full Review**: All users, all apps
2. **Department Review**: Specific department's access
3. **High-Risk App Review**: Apps with high risk scores
4. **Admin Access Review**: Users with admin privileges
5. **New Hire Access Review**: Access granted in last 90 days
6. **Departure Review**: Pre-offboarding access verification

#### Review Workflow
```
1. Campaign Creation
   - Admin creates campaign with scope and deadline
   - System generates review items (user-app pairs)
   - Auto-assign reviewers based on reporting structure

2. Reviewer Notification
   - Email/Slack notification to reviewers
   - Dashboard with pending reviews
   - Filters: by app, by user, by risk level

3. Review Process
   - Reviewer sees: User, App, Last Used, Justification
   - Actions: Approve (keep), Revoke (remove), Defer (ask manager)
   - Bulk actions for efficiency
   - Comments for audit trail

4. Execution Phase
   - System executes revocation decisions
   - Integrates with offboarding engine (Phase 3)
   - Logs all actions for compliance

5. Campaign Completion
   - Generate completion report
   - Highlight: approved, revoked, deferred, not reviewed
   - Export for auditors (PDF/CSV)
```

#### SLA Tracking
- Overdue reviews highlighted
- Email reminders at 50%, 75%, 90% of deadline
- Escalation to manager's manager if not completed
- Auto-approve on timeout (configurable)

---

## 5.2 Privilege Drift Detection

### Problem Statement
Over time, users accumulate permissions beyond their role requirements:
- Job changes but old access remains
- Temporary access becomes permanent
- Role creep from project-based access
- Inconsistent access across similar roles

### Solution Architecture

#### Role Template System
```
┌─────────────────────────────────────────────────────────────┐
│                    Role Template Engine                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Define Role Templates → Assign to Users → Detect Drift      │
│      (Engineer)            (User Profile)    (Daily Scan)    │
│      - GitHub                   ↓                ↓           │
│      - Jira                  Baseline        Compare         │
│      - Slack                  Access         Actual vs       │
│      - AWS                                   Expected        │
│                                                  ↓           │
│                                            Alert on Drift    │
│                                         (Extra permissions)  │
└─────────────────────────────────────────────────────────────┘
```

#### Database Schema
**role_templates**
- Role name (e.g., "Software Engineer", "Sales Manager")
- Department
- Expected apps and permission levels
- Description and justification

**user_role_assignments**
- User to role mapping
- Effective date
- Assigned by
- Review date

**privilege_drift_alerts**
- User with excess permissions
- Expected apps (from role template)
- Actual apps (from user_app_access)
- Drift apps (actual - expected)
- Alert severity (low/medium/high)
- Resolution status

#### Drift Detection Algorithm
```typescript
1. For each user:
   - Get assigned role template
   - Get expected apps from role template
   - Get actual apps from user_app_access

2. Calculate drift:
   - Excess apps = actual - expected
   - Missing apps = expected - actual
   - Overprivileged = apps with higher permissions than role

3. Risk scoring:
   - +10 points per excess high-risk app
   - +5 points per excess medium-risk app
   - +20 points if admin access not in role
   - +15 points if access unused for 60+ days

4. Alert generation:
   - Score > 50: High priority alert
   - Score 20-50: Medium priority
   - Score < 20: Low priority (informational)

5. Recommended actions:
   - Revoke excess apps
   - Update role template if legitimate need
   - Create access review for manager approval
```

#### Role Template Library
Pre-built templates for common roles:
- Software Engineer: GitHub, Jira, Slack, AWS, Figma
- Sales Rep: Salesforce, HubSpot, LinkedIn Sales Navigator
- Marketing Manager: Google Ads, Mailchimp, HubSpot, Canva
- Finance Analyst: QuickBooks, Excel, NetSuite
- HR Manager: BambooHR, ADP, Greenhouse, Slack

---

## 5.3 Overprivileged Account Detection

### Problem Statement
Admin access is often over-granted and under-monitored:
- Users have admin to apps they rarely use
- Stale admin accounts pose security risks
- No justification for elevated privileges
- Difficult to audit and track

### Solution Architecture

#### Overprivileged Detection Engine
```
┌─────────────────────────────────────────────────────────────┐
│              Overprivileged Account Scanner                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Scan User Access → Identify Patterns → Generate Alerts      │
│                                                               │
│  Detection Rules:                                             │
│  ✓ Admin access to 5+ apps                                   │
│  ✓ Admin access not used in 90 days                          │
│  ✓ Admin without business justification                      │
│  ✓ Non-IT user with admin to IT tools                        │
│  ✓ Temporary admin that became permanent                     │
│                                                               │
│  Recommendations:                                             │
│  → Downgrade to standard user                                │
│  → Implement JIT (Just-In-Time) access                       │
│  → Require periodic re-certification                         │
│  → Enable MFA for admin accounts                             │
└─────────────────────────────────────────────────────────────┘
```

#### Database Schema
**overprivileged_accounts**
- User ID and name
- App ID and name
- Permission level (admin/owner)
- Last used timestamp
- Days since last use
- Business justification
- Risk score
- Recommended action
- Status (active/resolved/deferred)

#### Detection Rules

**Rule 1: Excessive Admin Access**
```sql
-- Users with admin access to 5+ apps
SELECT userId, COUNT(*) as adminAppCount
FROM user_app_access
WHERE accessType IN ('admin', 'owner', 'super-admin')
GROUP BY userId
HAVING COUNT(*) >= 5
```

**Rule 2: Stale Admin Accounts**
```sql
-- Admin access not used in 90+ days
SELECT userId, appId, lastAccessDate,
       NOW() - lastAccessDate as daysSinceLastUse
FROM user_app_access
WHERE accessType IN ('admin', 'owner')
  AND (lastAccessDate IS NULL OR lastAccessDate < NOW() - INTERVAL '90 days')
```

**Rule 3: Cross-Department Admin**
```sql
-- Users with admin to apps outside their department
SELECT u.userId, u.department, a.appId, a.appName, a.category
FROM users u
JOIN user_app_access uaa ON u.id = uaa.userId
JOIN saas_apps a ON uaa.appId = a.id
WHERE uaa.accessType = 'admin'
  AND (
    (u.department = 'Engineering' AND a.category NOT IN ('development', 'infrastructure'))
    OR (u.department = 'Sales' AND a.category NOT IN ('crm', 'sales'))
    -- etc.
  )
```

**Rule 4: Privilege Duration**
```sql
-- Admin access granted > 1 year ago without review
SELECT userId, appId, grantedAt,
       NOW() - grantedAt as adminDuration
FROM user_app_access
WHERE accessType = 'admin'
  AND grantedAt < NOW() - INTERVAL '1 year'
  AND lastReviewedAt IS NULL
```

#### Least Privilege Recommendations
```
For each overprivileged account:
1. Analyze usage patterns (frequency, actions taken)
2. Determine minimum required permission level
3. Suggest:
   - Downgrade to 'member' if no admin actions in 90 days
   - Implement approval workflow for admin actions
   - Use JIT access with 8-hour admin sessions
   - Require MFA for all admin access
   - Schedule quarterly re-certification
```

---

## Compliance Alignment

### SOC2 Requirements
✅ **Access Review (CC6.2)**: Quarterly access reviews with audit trail
✅ **Least Privilege (CC6.3)**: Privilege drift and overprivileged account detection
✅ **User Provisioning (CC6.1)**: Role-based access templates
✅ **Segregation of Duties (CC6.4)**: Detect conflicting access combinations

### ISO27001 Requirements
✅ **A.9.2.1**: User registration and de-registration
✅ **A.9.2.2**: User access provisioning
✅ **A.9.2.5**: Review of user access rights (quarterly)
✅ **A.9.2.6**: Removal/adjustment of access rights

### GDPR Requirements
✅ **Article 32**: Access controls and regular testing
✅ **Article 5**: Data minimization (least privilege)
✅ **Audit Trail**: Complete logging of access decisions

---

## Integration Points

### Phase 3: Offboarding Automation
- Access review triggers pre-offboarding verification
- Revoked access uses offboarding SSO/OAuth revocation
- Offboarding completion creates access review item

### Phase 4: Policy Automation
- Privilege drift alerts trigger policy actions
- Auto-create access review campaigns quarterly
- Overprivileged account detection triggers alerts

### Phase 1: Discovery & Inventory
- Pull user access data from IdP sync
- Role templates map to department structure
- User manager hierarchy for reviewer assignment

---

## Technical Implementation

### Services
1. **AccessReviewEngine** (`server/services/access-review/engine.ts`)
   - Create and manage campaigns
   - Generate review items
   - Assign reviewers
   - Execute decisions

2. **PrivilegeDriftDetector** (`server/services/access-review/privilege-drift.ts`)
   - Define role templates
   - Scan user access vs. role baseline
   - Calculate drift scores
   - Generate alerts

3. **OverprivilegedDetector** (`server/services/access-review/overprivileged.ts`)
   - Scan for excessive admin access
   - Detect stale admin accounts
   - Generate recommendations
   - Track remediation

### API Routes
- `POST /api/access-reviews/campaigns` - Create campaign
- `GET /api/access-reviews/campaigns` - List campaigns
- `GET /api/access-reviews/campaigns/:id` - Campaign details
- `GET /api/access-reviews/campaigns/:id/items` - Review items
- `POST /api/access-reviews/campaigns/:id/items/:itemId/decision` - Submit decision
- `POST /api/access-reviews/campaigns/:id/bulk-decision` - Bulk approve/revoke
- `POST /api/access-reviews/campaigns/:id/complete` - Complete campaign
- `GET /api/access-reviews/my-reviews` - Reviewer's pending reviews
- `GET /api/role-templates` - List role templates
- `POST /api/role-templates` - Create role template
- `GET /api/privilege-drift` - Drift alerts
- `POST /api/privilege-drift/:id/resolve` - Resolve drift
- `GET /api/overprivileged-accounts` - Overprivileged accounts
- `POST /api/overprivileged-accounts/:id/remediate` - Fix overprivilege

### Frontend UI
1. **Access Review Dashboard** (`client/src/pages/access-reviews.tsx`)
   - Campaign list and status
   - Create new campaign wizard
   - Pending reviews for current user
   - Progress tracking

2. **Review Interface** (`client/src/pages/access-review-detail.tsx`)
   - List of access items to review
   - Approve/Revoke/Defer actions
   - Bulk operations
   - Filters and search

3. **Privilege Drift Dashboard** (`client/src/pages/privilege-drift.tsx`)
   - Drift alerts by severity
   - User drill-down
   - Role template management

4. **Overprivileged Accounts** (`client/src/pages/overprivileged-accounts.tsx`)
   - List of risky accounts
   - Remediation recommendations
   - Track resolution status

---

## Success Metrics

### KPIs
- **Access Review Completion Rate**: Target 95% within deadline
- **Average Review Time**: Target < 2 hours per campaign
- **Privilege Drift Detected**: Track reduction over time
- **Overprivileged Accounts Remediated**: Target 80% within 30 days
- **Compliance Audit Pass Rate**: 100%

### ROI Calculation
**Before Phase 5:**
- Manual access reviews: 40 hours/quarter × 4 quarters = 160 hours
- Audit prep for access controls: 80 hours
- Total: 240 hours/year × $100/hour = **$24,000/year**

**After Phase 5:**
- Automated review generation: 2 hours/quarter
- Reviewer time (streamlined): 10 hours/quarter × 4 = 40 hours
- Continuous monitoring: automated
- Total: 42 hours/year × $100/hour = **$4,200/year**

**Savings**: $19,800/year (82.5% reduction)
**Risk Reduction**: 60% reduction in insider threat exposure

---

## Implementation Timeline

### Week 1-2: Core Infrastructure
- Database schema and migrations
- Role template system
- Access review engine

### Week 3-4: Detection Engines
- Privilege drift detection
- Overprivileged account scanner
- Alert generation

### Week 5-6: UI & Workflows
- Access review dashboard
- Campaign creator
- Reviewer interface

### Week 7-8: Integration & Testing
- Policy automation integration
- Offboarding integration
- Compliance reporting
- End-to-end testing

---

## Future Enhancements (Phase 6+)

- **AI-Powered Review Suggestions**: ML model predicts approve/revoke based on patterns
- **Just-In-Time (JIT) Access**: Temporary admin elevation with auto-revocation
- **Segregation of Duties**: Detect conflicting access combinations
- **Peer Group Analysis**: Compare user access to similar roles
- **Risk-Based Certification**: High-risk apps reviewed more frequently
- **Self-Service Access Requests**: Users request access, manager approves via workflow
