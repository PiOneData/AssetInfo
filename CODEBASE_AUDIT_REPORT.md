# AssetInfo Codebase Audit Report
**Date:** 2025-12-09
**Auditor:** Claude
**Scope:** Complete codebase review for bugs, incomplete features, and architectural issues

---

## Executive Summary

This audit uncovered **67 distinct issues** across 6 categories:
- ❌ **15 CRITICAL issues** requiring immediate attention
- ⚠️ **32 HIGH priority issues** that affect core functionality
- 🟡 **15 MEDIUM priority issues** that should be addressed soon
- 🔵 **5 LOW priority items** for technical debt cleanup

### Key Findings:
1. **Security Vulnerabilities:** 3 unauthenticated endpoints exposing sensitive data
2. **Missing Backend Routes:** 15 API endpoints called by frontend but not implemented
3. **Database Schema Mismatch:** 4 columns referenced in code but missing from schema
4. **Incomplete Features:** 16 TODO items and placeholder implementations
5. **Dead Code:** 7 unused files and functions that should be removed

---

## 1. CRITICAL ISSUES (Fix Immediately)

### 1.1 Security Vulnerabilities

#### Issue #1: Unauthenticated Asset Software Endpoint
**Severity:** CRITICAL 🔴
**File:** `server/routes/assets.routes.ts:827`
**Description:** The `/assets/:assetId/software` endpoint has no authentication check, allowing anyone to query asset software information.
```typescript
router.get("/:assetId/software", async (req, res) => {  // NO authenticateToken!
```
**Impact:** Information disclosure - anyone can enumerate assets and their software
**Fix:** Add `authenticateToken` middleware before handler

#### Issue #2: Unauthenticated Bulk Asset Import
**Severity:** CRITICAL 🔴
**File:** `server/routes/assets.routes.ts:879`
**Description:** The `/assets/tni/bulk` endpoint accepts unauthenticated requests and can insert/update assets for any tenant.
```typescript
router.post("/tni/bulk", async (req, res) => {  // NO auth!
```
**Impact:** Any attacker can modify asset inventory for any tenant
**Fix:** Add `authenticateToken` and `requireRole('admin')` middleware

#### Issue #3: Exposed Debug Endpoint
**Severity:** CRITICAL 🔴
**File:** `server/routes/debug.routes.ts:18`
**Description:** Debug endpoint exposes device specifications without authentication
**Impact:** Information gathering for potential attacks
**Fix:** Add authentication or remove from production builds

### 1.2 Database Schema Issues

#### Issue #4: Missing Columns in user_app_access Schema
**Severity:** CRITICAL 🔴
**File:** `shared/schema.ts:1063-1113`
**Description:** Migration 0015 adds 4 columns to `user_app_access` that are NOT in the Drizzle schema:
- `last_reviewed_at` (TIMESTAMP)
- `last_reviewed_by` (VARCHAR)
- `next_review_date` (TIMESTAMP)
- `business_justification` (TEXT)

**Impact:** Code in `server/storage.ts:3246` and `server/services/access-review/campaign-engine.ts:214,253` references `businessJustification` which will fail
**Fix:** Add these 4 columns to the Drizzle schema definition

#### Issue #5: Wrong Field Name in Code
**Severity:** CRITICAL 🔴
**File:** `server/storage.ts:3244`
**Description:** Code references `userAppAccess.grantedAt` but field is named `accessGrantedDate`
```typescript
grantedDate: userAppAccess.grantedAt,  // WRONG!
```
**Impact:** Runtime error or TypeScript compilation failure
**Fix:** Change to `userAppAccess.accessGrantedDate`

#### Issue #6: Missing accessType Column
**Severity:** CRITICAL 🔴
**File:** `server/storage.ts:3243,3266` and `server/services/access-review/campaign-engine.ts:210,241`
**Description:** Code references `userAppAccess.accessType` which doesn't exist in schema or migrations
**Impact:** TypeScript error, undefined property access
**Fix:** Either add `accessType` column to schema and migration, or remove references

### 1.3 Missing Critical API Endpoints

#### Issue #7-11: Network Monitoring Endpoints Missing
**Severity:** CRITICAL 🔴
**Frontend:** `client/src/pages/network-monitoring.tsx`
**Missing Routes:**
- `GET /api/network/presence/live` (line 75)
- `GET /api/network/alerts` (line 91)
- `POST /api/network/agent/generate-key` (line 105)
- `POST /api/network/alerts/{alertId}/acknowledge` (line 125)
- `EventSource /api/network/presence/stream` (line 147)

**Impact:** Entire Network Monitoring page is non-functional
**Fix:** Create `server/routes/network.routes.ts` with all 5 endpoints

#### Issue #12-13: Enrollment Token Endpoints Missing
**Severity:** CRITICAL 🔴
**Frontend:** `client/src/components/EnrollmentLinkCard.tsx`
**Missing Routes:**
- `GET /api/enrollment-tokens/active` (line 36)
- `POST /api/enrollment-tokens/ensure-default` (line 60)

**Impact:** Device enrollment link card cannot fetch or create tokens
**Fix:** Create `server/routes/enrollment-tokens.routes.ts`

#### Issue #14-15: Compliance Endpoints Missing
**Severity:** CRITICAL 🔴
**Frontend:** `client/src/hooks/use-compliance.ts` and `client/src/pages/compliance/ComplianceScoreDetails.tsx`
**Missing Routes:**
- `GET /api/compliance/overview` (use-compliance.ts:75)
- `GET /api/compliance/score` (ComplianceScoreDetails.tsx:93)
- `GET /api/compliance/score-details` (ComplianceScoreDetails.tsx:96)
- `GET /api/compliance/license` (use-compliance.ts:163)

**Impact:** Compliance dashboard pages completely broken
**Fix:** Create compliance route handlers

---

## 2. HIGH PRIORITY ISSUES

### 2.1 Missing API Endpoints

#### Issue #16-17: Asset Location Filtering
**Severity:** HIGH ⚠️
**Frontend:** `client/src/components/dashboard/world-map.tsx:530,588`
**Missing Routes:**
- `GET /api/assets/location/{locationId}`
- `GET /api/assets/location/{locationId}/all`

**Impact:** World map geographic filtering doesn't work
**Fix:** Add location-based filtering to assets routes

#### Issue #18-19: Software-Device Linking
**Severity:** HIGH ⚠️
**Frontend:** `client/src/components/assets/DeviceSoftware.tsx:203,232`
**Missing Routes:**
- `POST /api/assets/{assetId}/software-links`
- `DELETE /api/assets/{assetId}/software-links/{softwareAssetId}`

**Impact:** Cannot associate software with devices
**Fix:** Add software linking endpoints to assets routes

### 2.2 Input Validation Issues

#### Issue #20: parseInt Without NaN Check
**Severity:** HIGH ⚠️
**Files:**
- `server/routes/discovery.routes.ts:120`
- `server/routes/users.routes.ts:535-536`
- `server/routes/assets.routes.ts:690`

**Description:** `parseInt()` returns `NaN` on invalid input, but code uses `|| default` which doesn't catch `NaN`
```typescript
const threshold = parseInt(req.query.threshold as string) || 70;  // NaN || 70 = NaN!
```
**Impact:** NaN propagates through calculations, breaking logic
**Fix:** Use `Number.isNaN()` check or `Number(value) || default`

#### Issue #21: Missing Tenant ID Validation
**Severity:** HIGH ⚠️
**File:** `server/routes/assets.routes.ts:879-962`
**Description:** TNI bulk endpoint accepts any string as tenantId without validation
```typescript
const tenantFromHeader = (req.header("x-tenant-id") || "").trim();
// No validation that this is a valid UUID or exists
```
**Impact:** Assets could be assigned to wrong/invalid tenants
**Fix:** Validate tenantId format and existence before processing

#### Issue #22: Date Parsing Without Validation
**Severity:** HIGH ⚠️
**File:** `server/routes/assets.routes.ts:684-686`
**Description:** Invalid date strings create `Invalid Date` objects that get inserted into database
```typescript
if (record.purchase_date?.trim()) assetData.purchaseDate = new Date(record.purchase_date);
// new Date() doesn't throw on invalid dates
```
**Impact:** Database contains invalid dates breaking queries/reports
**Fix:** Check `isNaN(date.getTime())` after parsing

#### Issue #23: No Pagination Upper Bounds
**Severity:** HIGH ⚠️
**File:** `server/routes/users.routes.ts:535-536`
**Description:** Pagination limit has no maximum, allowing DoS via huge result sets
```typescript
const limit = parseInt(req.query.limit as string) || 50;  // No max check!
```
**Impact:** Memory exhaustion attack vector
**Fix:** Add `Math.min(limit, 1000)` constraint

### 2.3 Incomplete Feature Implementations

#### Issue #24-25: Identity Provider User Sync Not Implemented
**Severity:** HIGH ⚠️
**Files:**
- `server/services/idp/azuread-connector.ts:346-350`
- `server/services/idp/google-connector.ts:279-283`

**Description:** Both Azure AD and Google user sync return placeholder results
```typescript
async syncUsers(): Promise<{ usersAdded: number; usersUpdated: number }> {
  console.log('[AzureAD] User sync not implemented in Phase 1');
  return { usersAdded: 0, usersUpdated: 0 };
}
```
**Impact:** User synchronization from IdPs is non-functional
**Fix:** Implement actual user sync logic or remove feature from UI

#### Issue #26: Okta Connector Not Implemented
**Severity:** HIGH ⚠️
**File:** `server/services/idp/sync-scheduler.ts:139-140`
**Description:** Okta connector explicitly throws error
```typescript
case 'okta':
  throw new Error('Okta connector not implemented yet (Phase 2)');
```
**Impact:** Users cannot use Okta as IdP
**Fix:** Implement Okta connector or remove from UI options

#### Issue #27-28: ShadowIT User Access Processing Not Implemented
**Severity:** HIGH ⚠️
**File:** `server/services/shadowit-detector.ts:325-361`
**Description:** Both `processUserAccess()` and `processOAuthTokens()` are TODO stubs that return 0
```typescript
async processUserAccess(...): Promise<number> {
  // TODO: Implement user access processing
  return 0;
}
```
**Impact:** ShadowIT detection discovers issues but doesn't store them
**Fix:** Implement actual processing or document Phase limitation

#### Issue #29-32: Offboarding Ownership Transfers Are Simulated
**Severity:** HIGH ⚠️
**File:** `server/services/offboarding/ownership-transfer.ts`
**Description:** All platform transfers (Google Drive, GitHub, Notion, Microsoft 365, Slack) are non-functional stubs with commented-out API calls
**Impact:** Ownership transfer during offboarding doesn't actually work
**Fix:** Implement real API integrations or document as Phase 2 feature

#### Issue #33: OAuth Token Revocation Only Local
**Severity:** HIGH ⚠️
**File:** `server/services/offboarding/oauth-revocation.ts:71-94`
**Description:** Tokens are deleted from database but not revoked at OAuth provider
```typescript
// In a real implementation, this would make API calls to revoke the token
// For now, we'll just delete from our database
await storage.deleteOauthToken(token.id, this.tenantId);
```
**Impact:** Tokens remain active with providers after "revocation"
**Fix:** Add actual OAuth revocation API calls

#### Issue #34: SSO Revocation Is Simulated
**Severity:** HIGH ⚠️
**File:** `server/services/offboarding/sso-revocation.ts:185-205`
**Description:** User group removal from Azure AD/Google is simulated
```typescript
console.log(`[SSO Revocation] Would remove from Azure AD groups: ${user.email}`);
results.azuread = { groupsRemoved: 0, message: 'Simulated removal' };
```
**Impact:** Users aren't actually removed from IdP groups
**Fix:** Implement actual group removal API calls

### 2.4 Error Handling Gaps

#### Issue #35-40: Missing Error Logging
**Severity:** HIGH ⚠️
**File:** `server/routes/assets.routes.ts`
**Lines:** 92-94, 138, 358, 388, 543, 776
**Description:** Multiple endpoints catch errors but only return generic messages without logging
```typescript
} catch (error) {
  res.status(500).json({ message: "Failed to fetch assets" });  // No logging!
}
```
**Impact:** Cannot diagnose production issues
**Fix:** Add comprehensive error logging with context (tenantId, userId, requestId)

#### Issue #41: Audit Logging Failures Silent
**Severity:** HIGH ⚠️
**File:** `server/routes/auth.routes.ts:51-53`
**Description:** If audit logging fails, it's only warned but not surfaced
```typescript
} catch (auditError) {
  console.warn("Failed to log auth activity:", auditError);
}
```
**Impact:** Security events may not be recorded (compliance violation)
**Fix:** Throw error if audit logging fails, or implement retry queue

#### Issue #42: Background Offboarding Errors Not Tracked
**Severity:** HIGH ⚠️
**File:** `server/routes/offboarding.routes.ts:145-147`
**Description:** Async offboarding execution errors only logged to console
```typescript
orchestrator.executeOffboarding(req.params.id).catch(error => {
  console.error('Offboarding execution failed:', error);
});
```
**Impact:** Offboarding failures happen silently
**Fix:** Update database record with failure status

### 2.5 Race Conditions

#### Issue #43: TOCTOU in User Creation
**Severity:** HIGH ⚠️
**File:** `server/routes/users.routes.ts:653-686`
**Description:** Check for existing user and creation are separate operations
```typescript
const existingUser = await storage.getUserByEmail(inviteData.email);
if (existingUser) {
  return res.status(400).json({ message: "Email not available" });
}
// Race window here!
const newUser = await storage.createUser({...});
```
**Impact:** Duplicate users can be created
**Fix:** Use unique constraint and handle DB error, or use transaction

#### Issue #44: Bulk Asset Upsert Without Transaction
**Severity:** HIGH ⚠️
**File:** `server/routes/assets.routes.ts:889-953`
**Description:** Update and insert are separate operations without transaction
```typescript
const updated = await db.update(s.assets).set({...});
if (updated.length === 0) {
  await db.insert(s.assets).values(row as any);
}
```
**Impact:** Inconsistent state if insert fails after update
**Fix:** Wrap in database transaction or use proper upsert

---

## 3. MEDIUM PRIORITY ISSUES

### 3.1 Incomplete CRUD Operations

#### Issue #45: Missing DELETE Recommendation Endpoint
**Severity:** MEDIUM 🟡
**Frontend:** `client/src/pages/recommendations.tsx:138`
**Missing:** `DELETE /api/recommendations/{id}`
**Impact:** Users cannot delete recommendations from UI
**Fix:** Add DELETE handler to recommendations routes

### 3.2 Missing TODO Implementations

#### Issue #46: Email Integration for Access Reviews
**Severity:** MEDIUM 🟡
**File:** `server/services/access-review/campaign-engine.ts:523-529`
**Description:** Email reminders are logged but never sent
```typescript
// TODO: Integrate with email service
// await emailService.sendAccessReviewReminder(reviewer.email, campaign, items);
```
**Impact:** Access review reminders not delivered
**Fix:** Integrate with email service (SendGrid, SES, etc.)

#### Issue #47: Report Generation Placeholder
**Severity:** MEDIUM 🟡
**File:** `server/services/access-review/campaign-engine.ts:490-496`
**Description:** Report URL is hardcoded, file not actually generated
```typescript
const reportUrl = `/api/access-reviews/campaigns/${campaignId}/report.pdf`;
// In a real implementation, this would be saved to S3
```
**Impact:** Compliance reports cannot be downloaded
**Fix:** Implement actual PDF generation and storage

#### Issue #48-49: Multi-Currency Not Supported
**Severity:** MEDIUM 🟡
**Files:**
- `server/routes/spend.routes.ts:98`
- `server/services/license-optimizer.ts:282`

**Description:** All spending/cost data hardcoded to USD
```typescript
currency: 'USD' // TODO: Multi-currency support
```
**Impact:** Multi-currency organizations see incorrect displays
**Fix:** Add currency field to contracts, implement conversion

#### Issue #50: Asset Software Fetch Returns Empty
**Severity:** MEDIUM 🟡
**File:** `server/routes/assets.routes.ts:845-861`
**Description:** Software list endpoint returns placeholder
```typescript
// Note: oaFetchDeviceSoftware should be imported if available
return res.json({ items: [] });
```
**Impact:** Cannot fetch detailed software list for assets
**Fix:** Implement actual software fetching logic

### 3.3 Missing Edge Case Handling

#### Issue #51: No Bounds Checking on Thresholds
**Severity:** MEDIUM 🟡
**File:** `server/routes/discovery.routes.ts:120`
**Description:** Risk score thresholds have no bounds (can be negative or >100)
```typescript
const threshold = parseInt(req.query.threshold as string) || 70;
// Could be -1000 or 999999
```
**Impact:** Nonsensical filtering results
**Fix:** Add `Math.max(0, Math.min(100, threshold))` bounds

#### Issue #52: Empty Array Not Validated in Bulk Ops
**Severity:** MEDIUM 🟡
**File:** `server/routes/users.routes.ts:1141-1143`
**Description:** Empty result set not explicitly handled
**Impact:** Silent failure if CSV has no data
**Fix:** Add explicit empty array check with user-friendly message

### 3.4 Missing Foreign Key Constraints

#### Issue #53-60: No FK Constraints in Drizzle Schema
**Severity:** MEDIUM 🟡
**File:** `shared/schema.ts`
**Description:** Migration files define foreign keys but Drizzle schema doesn't enforce them
**Missing FKs:**
- `saasContracts.appId` → `saasApps.id`
- `offboardingTasks.appId` → `saasApps.id`
- `offboardingTasks.requestId` → `offboardingRequests.id`
- `offboardingPlaybooks.createdBy` → `users.id`
- `offboardingRequests.userId` → `users.id`
- `userAppAccess.userId` → `users.id`
- `userAppAccess.appId` → `saasApps.id`
- `oauthTokens.userId` → `users.id`

**Impact:** Deletions don't cascade properly, orphaned records possible
**Fix:** Add foreign key references to Drizzle schema

---

## 4. LOW PRIORITY ISSUES

### 4.1 Dead Code

#### Issue #61-62: Backup Files Should Be Removed
**Severity:** LOW 🔵
**Files:**
- `client/src/App.tsx.backup`
- `client/src/components/layout/sidebar.tsx.bak`

**Fix:** Delete these backup files from version control

#### Issue #63-67: Unused Exported Functions
**Severity:** LOW 🔵
**File:** `shared/utils.ts`
**Unused Functions (never imported):**
- `normalizeUserID()` (lines 26-40)
- `validateUserUniqueness()` (lines 58-107)
- `formatUserDisplayName()` (lines 112-116)
- `createUserSlug()` (lines 121-125)
- `parseUserSlug()` (lines 130-146)

**Fix:** Remove unused functions to reduce bundle size

### 4.2 Code Cleanup

#### Issue #68: Commented-Out API Code Should Be Removed
**Severity:** LOW 🔵
**File:** `server/services/offboarding/ownership-transfer.ts`
**Lines:** 107-130, 156-174, 199-215, 240-242, 271-272
**Description:** Large blocks of commented-out API integration code
**Fix:** Remove comments or move to documentation

### 4.3 Missing Features

#### Issue #69: macOS Enrollment Package
**Severity:** LOW 🔵
**File:** `client/src/pages/enroll.tsx:223`
**Description:** UI advertises macOS .pkg installer as "coming soon"
**Impact:** Users cannot enroll macOS devices via package
**Fix:** Either implement .pkg or remove mention from UI

---

## 5. PREVIOUSLY FIXED ISSUES ✅

### Issue #70: SaaS App Stats Property Name Mismatch
**Status:** ✅ FIXED
**Commit:** `39d2928`
**File:** `server/storage.ts:2556`
**Description:** Backend returned `{total, approved}` but frontend expected `{totalApps, approvedApps}`
**Fix Applied:** Changed return to use correct property names

### Issue #71: Geographic Coordinates Key Mismatch
**Status:** ✅ FIXED
**Commit:** `3549503`
**File:** `server/routes/geographic.routes.ts`
**Description:** Location data indexed by IDs but frontend expected name-based keys
**Fix Applied:** Changed to name-based indexing

---

## PRIORITIZED ACTION PLAN

### Sprint 1: Critical Security & Data Issues (Week 1)

**Day 1-2: Security Fixes**
- [ ] Add authentication to asset software endpoint (#1)
- [ ] Add authentication to TNI bulk endpoint (#2)
- [ ] Protect or remove debug endpoint (#3)

**Day 3-4: Database Schema Fixes**
- [ ] Add 4 missing columns to userAppAccess schema (#4)
- [ ] Fix grantedAt → accessGrantedDate field name (#5)
- [ ] Add accessType column or remove references (#6)

**Day 5: Critical Endpoint Implementation - Part 1**
- [ ] Create enrollment-tokens routes (#12-13)
- [ ] Test device enrollment flow end-to-end

### Sprint 2: Missing Core Features (Week 2)

**Day 1-3: Network Monitoring**
- [ ] Create network.routes.ts with 5 endpoints (#7-11)
- [ ] Implement network presence tracking
- [ ] Implement alert system
- [ ] Add agent key generation

**Day 4-5: Compliance Dashboard**
- [ ] Create compliance route handlers (#14-15)
- [ ] Implement compliance score calculation
- [ ] Test compliance dashboard UI

### Sprint 3: High Priority Fixes (Week 3)

**Day 1: Input Validation**
- [ ] Fix all parseInt NaN issues (#20)
- [ ] Add tenant ID validation (#21)
- [ ] Add date parsing validation (#22)
- [ ] Add pagination bounds (#23)

**Day 2-3: Missing Endpoints**
- [ ] Add asset location filtering endpoints (#16-17)
- [ ] Add software-device linking endpoints (#18-19)
- [ ] Add DELETE recommendation endpoint (#45)

**Day 4-5: Error Handling**
- [ ] Add comprehensive error logging (#35-40)
- [ ] Fix audit logging failures (#41)
- [ ] Track background offboarding errors (#42)
- [ ] Fix race conditions (#43-44)

### Sprint 4: Feature Completeness (Week 4)

**Day 1-2: Identity Provider Sync**
- [ ] Implement Azure AD user sync (#24)
- [ ] Implement Google Workspace user sync (#25)
- [ ] Implement Okta connector (#26) OR remove from UI

**Day 3-4: ShadowIT Processing**
- [ ] Implement user access processing (#27)
- [ ] Implement OAuth token processing (#28)

**Day 5: Documentation & Testing**
- [ ] Document all Phase limitations
- [ ] Add integration tests for critical paths
- [ ] Update API documentation

### Backlog: Medium Priority (Future Sprints)

**Offboarding Features**
- [ ] Implement real ownership transfers (#29-32)
- [ ] Implement actual OAuth revocation (#33)
- [ ] Implement actual SSO revocation (#34)

**Feature Enhancements**
- [ ] Add email integration for access reviews (#46)
- [ ] Implement report generation (#47)
- [ ] Add multi-currency support (#48-49)
- [ ] Implement asset software fetch (#50)

**Code Quality**
- [ ] Add edge case handling (#51-52)
- [ ] Add foreign key constraints (#53-60)
- [ ] Remove dead code (#61-67)
- [ ] Clean up commented code (#68)

---

## TESTING REQUIREMENTS

### Critical Path Tests Needed:
1. **Authentication tests** - verify all endpoints require auth
2. **Database tests** - verify schema matches code expectations
3. **API integration tests** - verify all frontend-called endpoints exist
4. **Input validation tests** - test boundary conditions
5. **Concurrency tests** - verify no race conditions in user/asset creation
6. **Error handling tests** - verify errors are logged and returned properly

### Recommended Test Coverage:
- Unit tests: 80%+ for services and utilities
- Integration tests: 100% for API routes
- E2E tests: Critical user journeys (enrollment, offboarding, compliance)

---

## ESTIMATED EFFORT

| Category | Issues | Estimated Days |
|----------|--------|----------------|
| Critical Security | 3 | 2 |
| Critical DB Schema | 3 | 2 |
| Critical Endpoints | 9 | 6 |
| High Priority | 29 | 15 |
| Medium Priority | 16 | 8 |
| Low Priority | 9 | 2 |
| **TOTAL** | **69** | **35 days** |

**Team Size:** 1-2 developers
**Timeline:** ~2 months for all issues
**Minimum Viable:** ~2 weeks for all Critical + High security issues

---

## IMMEDIATE NEXT STEPS

1. **Review this report** with the development team
2. **Prioritize** which features are truly needed vs. can be deferred
3. **Create tickets** for Sprint 1 items
4. **Start with security fixes** - these are production vulnerabilities
5. **Consider feature freeze** for Phase 2 items to focus on completing Phase 1

---

## APPENDIX: FILES REQUIRING MOST ATTENTION

**Most Issues (Top 10):**
1. `server/routes/assets.routes.ts` - 12 issues
2. `server/services/offboarding/ownership-transfer.ts` - 6 issues
3. `server/routes/users.routes.ts` - 7 issues
4. `shared/schema.ts` - 8 issues (missing columns/FKs)
5. `server/storage.ts` - 4 issues
6. `server/services/idp/` - 3 issues
7. `server/services/shadowit-detector.ts` - 2 issues
8. `server/services/access-review/campaign-engine.ts` - 2 issues
9. `server/routes/discovery.routes.ts` - 2 issues
10. `server/routes/auth.routes.ts` - 2 issues

---

**Report End**
Generated by comprehensive automated codebase audit
