import {
  type User,
  type InsertUser,
  type Tenant,
  type InsertTenant,
  type Asset,
  type InsertAsset,
  type SoftwareLicense,
  type InsertSoftwareLicense,
  type AssetUtilization,
  type InsertAssetUtilization,
  type AssetSoftwareLink,
  type InsertAssetSoftwareLink,
  type Recommendation,
  type InsertRecommendation,
  type AIResponse,
  type InsertAIResponse,
  type MasterData,
  type InsertMasterData,
  type UserPreferences,
  type InsertUserPreferences,
  type AuditLog,
  type InsertAuditLog,
  type UpdateUserProfile,
  type UpdateOrgSettings,
  type UserInvitation,
  type InsertUserInvitation,
  type InviteUser,
  type UpdateUserRole,
  type Ticket,
  type InsertTicket,
  type TicketComment,
  type InsertTicketComment,
  type TicketActivity,
  type InsertTicketActivity,
  type CreateTicket,
  type UpdateTicket,
  type EnrollmentToken,
  type InsertEnrollmentToken,
  type CreateEnrollmentToken,
  // SaaS Governance types (Phase 0)
  type SaasApp,
  type InsertSaasApp,
  type SaasContract,
  type InsertSaasContract,
  type UserAppAccess,
  type InsertUserAppAccess,
  type OauthToken,
  type InsertOauthToken,
  type IdentityProvider,
  type InsertIdentityProvider,
  type SaasInvoice,
  type InsertSaasInvoice,
  type GovernancePolicy,
  type InsertGovernancePolicy,
  // Phase 4 types
  type AutomatedPolicy,
  type InsertAutomatedPolicy,
  type PolicyExecution,
  type InsertPolicyExecution,
  type PolicyTemplate,
  type InsertPolicyTemplate,
  // Phase 6 types
  type AccessRequest,
  type InsertAccessRequest,
  type JitAccessSession,
  type InsertJitAccessSession,
  type SodRule,
  type InsertSodRule,
  type SodViolation,
  type InsertSodViolation,
  type ReviewSuggestion,
  type InsertReviewSuggestion,
  type AnomalyDetection,
  type InsertAnomalyDetection,
  type PeerGroupBaseline,
  type InsertPeerGroupBaseline,
  type PeerGroupOutlier,
  type InsertPeerGroupOutlier,
  type CertificationSchedule,
  type InsertCertificationSchedule,
  type IntegrationConfig,
  type InsertIntegrationConfig,
  type IntegrationEvent,
  type InsertIntegrationEvent,
  users,
  tenants,
  assets,
  assetSoftwareLinks,
  softwareLicenses,
  assetUtilization,
  recommendations,
  aiResponses,
  masterData,
  userPreferences,
  auditLogs,
  userInvitations,
  tenantAdminLock,
  tickets,
  ticketComments,
  ticketActivities,
  enrollmentTokens,
  enrollmentSessions,
  // Network Monitoring tables
  wifiDevices,
  networkAlerts,
  networkAgentKeys,
  // SaaS Governance tables (Phase 0)
  saasApps,
  saasContracts,
  userAppAccess,
  oauthTokens,
  identityProviders,
  saasInvoices,
  governancePolicies,
  // Phase 4 tables
  automatedPolicies,
  policyExecutions,
  policyTemplates,
  // Phase 5 tables
  type AccessReviewCampaign,
  type InsertAccessReviewCampaign,
  type AccessReviewItem,
  type InsertAccessReviewItem,
  type AccessReviewDecision,
  type InsertAccessReviewDecision,
  type RoleTemplate,
  type InsertRoleTemplate,
  type UserRoleAssignment,
  type InsertUserRoleAssignment,
  type PrivilegeDriftAlert,
  type InsertPrivilegeDriftAlert,
  type OverprivilegedAccount,
  type InsertOverprivilegedAccount,
  accessReviewCampaigns,
  accessReviewItems,
  accessReviewDecisions,
  roleTemplates,
  userRoleAssignments,
  privilegeDriftAlerts,
  overprivilegedAccounts,
  // Phase 6 tables
  accessRequests,
  jitAccessSessions,
  sodRules,
  sodViolations,
  reviewSuggestions,
  anomalyDetections,
  peerGroupBaselines,
  peerGroupOutliers,
  certificationSchedules,
  integrationConfigs,
  integrationEvents
} from "@shared/schema";
import { randomUUID } from "crypto";
import { hashPassword } from "./services/auth";
import { db } from "./db";
import { eq, and, or, desc, sql, ilike, isNotNull, ne, gt, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { normalizeEmail, normalizeName, generateNextUserID } from "@shared/utils";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string, tenantId?: string): Promise<User | undefined>;
  getUserByEmployeeId(employeeId: string, tenantId: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  updateUserProfile(userId: string, tenantId: string, profile: UpdateUserProfile): Promise<User | undefined>;
  updateUserPassword(userId: string, tenantId: string, hashedPassword: string): Promise<boolean>;
  deleteUserAndCleanup(userId: string, tenantId: string, fallbackUser: User): Promise<boolean>;
  
  // User Management
  getTenantUsers(tenantId: string): Promise<User[]>;
  createFirstAdminUser(user: InsertUser, tenantId: string): Promise<{ success: boolean; user?: User; alreadyExists?: boolean }>;
  updateUserRole(userId: string, tenantId: string, role: UpdateUserRole): Promise<User | undefined>;
  deactivateUser(userId: string, tenantId: string): Promise<boolean>;
  activateUser(userId: string, tenantId: string): Promise<boolean>;
  
  // User Invitations
  createInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;
  getInvitation(token: string): Promise<UserInvitation | undefined>;
  getInvitationByEmail(email: string, tenantId: string): Promise<UserInvitation | undefined>;
  getTenantInvitations(tenantId: string): Promise<UserInvitation[]>;
  updateInvitationStatus(token: string, status: "accepted" | "expired"): Promise<UserInvitation | undefined>;
  acceptInvitation(token: string, password: string): Promise<{ user: User; invitation: UserInvitation } | undefined>;

  // User Preferences
  getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | undefined>;
  createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences>;
  updateUserPreferences(userId: string, tenantId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences | undefined>;

  // Tenants
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantByName(name: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined>;
  updateOrgSettings(tenantId: string, settings: UpdateOrgSettings): Promise<Tenant | undefined>;
  
  // Backfill admin locks for existing tenants
  backfillTenantAdminLocks(): Promise<{ processed: number; locked: number; errors: number }>;

  // Assets
  getAllAssets(tenantId: string, filters?: { type?: string; status?: string; category?: string; search?: string }): Promise<Asset[]>;
  getAssetsByUserId(userId: string, tenantId: string): Promise<Asset[]>;
  getAssetsByUserEmployeeId(employeeId: string, tenantId: string): Promise<Asset[]>;
  getAsset(id: string, tenantId: string): Promise<Asset | undefined>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  createAssetsBulk(assets: InsertAsset[]): Promise<Asset[]>;
  updateAsset(id: string, tenantId: string, asset: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: string, tenantId: string): Promise<boolean>;
  getAssetSoftwareLinks(assetId: string, tenantId: string): Promise<Array<{
    id: string;
    softwareAssetId: string;
    softwareName: string;
    softwareVersion: string | null;
    softwareManufacturer: string | null;
    createdAt: Date | null;
  }>>;
  createAssetSoftwareLink(link: InsertAssetSoftwareLink): Promise<AssetSoftwareLink>;
  getSoftwareLinkedDevices(softwareAssetId: string, tenantId: string): Promise<Array<Asset & { linkedAt?: Date | null }>>;
  deleteAssetSoftwareLink(id: string, tenantId: string): Promise<boolean>;

  // Software Licenses
  getAllSoftwareLicenses(tenantId: string): Promise<SoftwareLicense[]>;
  getSoftwareLicense(id: string, tenantId: string): Promise<SoftwareLicense | undefined>;
  createSoftwareLicense(license: InsertSoftwareLicense): Promise<SoftwareLicense>;
  updateSoftwareLicense(id: string, tenantId: string, license: Partial<InsertSoftwareLicense>): Promise<SoftwareLicense | undefined>;
  deleteSoftwareLicense(id: string, tenantId: string): Promise<boolean>;

  // Asset Utilization
  addAssetUtilization(utilization: InsertAssetUtilization): Promise<AssetUtilization>;
  getAssetUtilization(assetId: string, tenantId: string): Promise<AssetUtilization[]>;

  // Recommendations
  getRecommendations(tenantId: string, status?: string): Promise<Recommendation[]>;
  createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation>;
  updateRecommendationStatus(id: string, tenantId: string, status: string): Promise<Recommendation | undefined>;
  deleteRecommendation(id: string, tenantId: string): Promise<boolean>;
  deleteRecommendationsByTenant(tenantId: string): Promise<void>;
  
  // AI Responses
  createAIResponse(response: InsertAIResponse): Promise<AIResponse>;
  getAIResponse(id: string, tenantId: string): Promise<AIResponse | undefined>;

  // Master Data
  getMasterData(tenantId: string, type?: string): Promise<MasterData[]>;
  getMasterDataById(id: string, tenantId: string): Promise<MasterData | undefined>;
  addMasterData(masterData: InsertMasterData): Promise<MasterData>;
  updateMasterData(id: string, tenantId: string, data: Partial<InsertMasterData>): Promise<MasterData | undefined>;
  deleteMasterData(id: string, tenantId: string): Promise<boolean>;
  getDistinctFromAssets(tenantId: string, field: string): Promise<{ value: string }[]>;

  // Audit Logs
  logActivity(activity: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(tenantId: string): Promise<AuditLog[]>;

  // Tickets
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  getTicket(id: string, tenantId: string): Promise<Ticket | undefined>;
  getAllTickets(tenantId: string): Promise<Ticket[]>;
  getTicketsByAssignee(assignedToId: string, tenantId: string): Promise<Ticket[]>;
  getTicketsByRequestor(requestorId: string, tenantId: string): Promise<Ticket[]>;
  updateTicket(id: string, tenantId: string, ticket: UpdateTicket): Promise<Ticket | undefined>;
  assignTicket(id: string, tenantId: string, assignedToId: string, assignedToName: string, assignedById: string, assignedByName: string): Promise<Ticket | undefined>;
  updateTicketStatus(id: string, tenantId: string, status: string, resolution?: string, resolutionNotes?: string): Promise<Ticket | undefined>;
  deleteTicket(id: string, tenantId: string): Promise<boolean>;

  // Ticket Comments
  addTicketComment(comment: InsertTicketComment): Promise<TicketComment>;
  getTicketComments(ticketId: string, tenantId: string): Promise<TicketComment[]>;
  updateTicketComment(id: string, tenantId: string, content: string): Promise<TicketComment | undefined>;
  deleteTicketComment(id: string, tenantId: string): Promise<boolean>;

  // Ticket Activities
  logTicketActivity(activity: InsertTicketActivity): Promise<TicketActivity>;
  getTicketActivities(ticketId: string, tenantId: string): Promise<TicketActivity[]>;
  
  // Enrollment Tokens
  createEnrollmentToken(token: InsertEnrollmentToken): Promise<EnrollmentToken>;
  getEnrollmentToken(id: string, tenantId: string): Promise<EnrollmentToken | undefined>;
  getEnrollmentTokenByToken(token: string): Promise<EnrollmentToken | undefined>;
  getEnrollmentTokens(tenantId: string): Promise<EnrollmentToken[]>;
  updateEnrollmentToken(id: string, tenantId: string, updates: Partial<InsertEnrollmentToken>): Promise<EnrollmentToken | undefined>;
  deleteEnrollmentToken(id: string, tenantId: string): Promise<boolean>;
  incrementEnrollmentTokenUsage(token: string): Promise<void>;
  
  // Dashboard Metrics
  getDashboardMetrics(tenantId: string): Promise<any>;

  // Global Search
  performGlobalSearch(tenantId: string, query: string, searchType?: string, userRole?: string, limit?: number): Promise<any>;

  // ============================================================================
  // SaaS Governance (Phase 0)
  // ============================================================================

  // SaaS Apps
  getSaasApps(tenantId: string, filters?: {approvalStatus?: string; category?: string; search?: string}): Promise<SaasApp[]>;
  getSaasApp(id: string, tenantId: string): Promise<SaasApp | undefined>;
  createSaasApp(app: InsertSaasApp): Promise<SaasApp>;
  updateSaasApp(id: string, tenantId: string, app: Partial<InsertSaasApp>): Promise<SaasApp | undefined>;
  deleteSaasApp(id: string, tenantId: string): Promise<boolean>;
  updateSaasAppApprovalStatus(id: string, tenantId: string, status: string): Promise<SaasApp | undefined>;
  getSaasAppUsers(appId: string, tenantId: string): Promise<UserAppAccess[]>;
  getSaasAppStats(tenantId: string): Promise<any>;

  // SaaS Contracts
  getSaasContracts(tenantId: string, filters?: {status?: string; appId?: string}): Promise<SaasContract[]>;
  getSaasContract(id: string, tenantId: string): Promise<SaasContract | undefined>;
  createSaasContract(contract: InsertSaasContract): Promise<SaasContract>;
  updateSaasContract(id: string, tenantId: string, contract: Partial<InsertSaasContract>): Promise<SaasContract | undefined>;
  deleteSaasContract(id: string, tenantId: string): Promise<boolean>;
  getUpcomingRenewals(tenantId: string, days: number): Promise<SaasContract[]>;
  updateRenewalAlerted(id: string, tenantId: string): Promise<SaasContract | undefined>;

  // User App Access
  getUserAppAccesses(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<UserAppAccess[]>;
  getUserAppAccess(id: string, tenantId: string): Promise<UserAppAccess | undefined>;
  createUserAppAccess(access: InsertUserAppAccess): Promise<UserAppAccess>;
  updateUserAppAccess(id: string, tenantId: string, access: Partial<InsertUserAppAccess>): Promise<UserAppAccess | undefined>;
  deleteUserAppAccess(id: string, tenantId: string): Promise<boolean>;
  revokeUserAppAccess(id: string, tenantId: string, revokedBy: string): Promise<UserAppAccess | undefined>;

  // OAuth Tokens
  getOauthTokens(tenantId: string, filters?: {userId?: string; appId?: string; status?: string; riskLevel?: string}): Promise<OauthToken[]>;
  getOauthToken(id: string, tenantId: string): Promise<OauthToken | undefined>;
  createOauthToken(token: InsertOauthToken): Promise<OauthToken>;
  updateOauthToken(id: string, tenantId: string, token: Partial<InsertOauthToken>): Promise<OauthToken | undefined>;
  deleteOauthToken(id: string, tenantId: string): Promise<boolean>;
  revokeOauthToken(id: string, tenantId: string, revokedBy: string, reason: string): Promise<OauthToken | undefined>;

  // Identity Providers
  getIdentityProviders(tenantId: string): Promise<IdentityProvider[]>;
  getIdentityProvider(id: string, tenantId: string): Promise<IdentityProvider | undefined>;
  getIdentityProviderByType(type: string, tenantId: string): Promise<IdentityProvider | undefined>;
  createIdentityProvider(provider: InsertIdentityProvider): Promise<IdentityProvider>;
  updateIdentityProvider(id: string, tenantId: string, provider: Partial<InsertIdentityProvider>): Promise<IdentityProvider | undefined>;
  deleteIdentityProvider(id: string, tenantId: string): Promise<boolean>;
  updateIdpSyncStatus(id: string, tenantId: string, status: string, error?: string): Promise<IdentityProvider | undefined>;

  // SaaS Invoices
  getSaasInvoices(tenantId: string, filters?: {status?: string; appId?: string}): Promise<SaasInvoice[]>;
  getSaasInvoice(id: string, tenantId: string): Promise<SaasInvoice | undefined>;
  getSaasInvoiceByExternalId(externalId: string, tenantId: string): Promise<SaasInvoice | undefined>;
  createSaasInvoice(invoice: InsertSaasInvoice): Promise<SaasInvoice>;
  updateSaasInvoice(id: string, tenantId: string, invoice: Partial<InsertSaasInvoice>): Promise<SaasInvoice | undefined>;
  deleteSaasInvoice(id: string, tenantId: string): Promise<boolean>;

  // Governance Policies
  getGovernancePolicies(tenantId: string, filters?: {policyType?: string; enabled?: boolean}): Promise<GovernancePolicy[]>;
  getGovernancePolicy(id: string, tenantId: string): Promise<GovernancePolicy | undefined>;
  createGovernancePolicy(policy: InsertGovernancePolicy): Promise<GovernancePolicy>;
  updateGovernancePolicy(id: string, tenantId: string, policy: Partial<InsertGovernancePolicy>): Promise<GovernancePolicy | undefined>;
  deleteGovernancePolicy(id: string, tenantId: string): Promise<boolean>;
  toggleGovernancePolicy(id: string, tenantId: string, enabled: boolean): Promise<GovernancePolicy | undefined>;

  // Automated Policies (Phase 4)
  getAutomatedPolicies(tenantId: string, filters?: {triggerType?: string; enabled?: boolean}): Promise<AutomatedPolicy[]>;
  getAutomatedPolicy(id: string, tenantId: string): Promise<AutomatedPolicy | undefined>;
  createAutomatedPolicy(policy: InsertAutomatedPolicy): Promise<AutomatedPolicy>;
  updateAutomatedPolicy(id: string, tenantId: string, policy: Partial<InsertAutomatedPolicy>): Promise<AutomatedPolicy | undefined>;
  deleteAutomatedPolicy(id: string, tenantId: string): Promise<boolean>;
  updatePolicyStats(id: string, tenantId: string, status: 'success' | 'partial' | 'failed'): Promise<void>;

  // Policy Executions (Phase 4)
  getPolicyExecutions(tenantId: string, filters?: {policyId?: string; status?: string}): Promise<PolicyExecution[]>;
  getPolicyExecution(id: string, tenantId: string): Promise<PolicyExecution | undefined>;
  createPolicyExecution(execution: InsertPolicyExecution): Promise<PolicyExecution>;
  updatePolicyExecution(id: string, tenantId: string, updates: Partial<InsertPolicyExecution>): Promise<PolicyExecution | undefined>;

  // Policy Templates (Phase 4)
  getPolicyTemplates(filters?: {category?: string}): Promise<PolicyTemplate[]>;
  getPolicyTemplate(id: string): Promise<PolicyTemplate | undefined>;
  incrementTemplatePopularity(id: string): Promise<void>;

  // Access Review Campaigns (Phase 5)
  getAccessReviewCampaigns(tenantId: string, filters?: {status?: string}): Promise<AccessReviewCampaign[]>;
  getAccessReviewCampaign(id: string, tenantId: string): Promise<AccessReviewCampaign | undefined>;
  createAccessReviewCampaign(campaign: InsertAccessReviewCampaign): Promise<AccessReviewCampaign>;
  updateAccessReviewCampaign(id: string, tenantId: string, updates: Partial<InsertAccessReviewCampaign>): Promise<AccessReviewCampaign | undefined>;
  deleteAccessReviewCampaign(id: string, tenantId: string): Promise<boolean>;

  // Access Review Items (Phase 5)
  getAccessReviewItems(campaignId: string): Promise<AccessReviewItem[]>;
  getAccessReviewItem(id: string): Promise<AccessReviewItem | undefined>;
  getAccessReviewItemsPending(campaignId: string): Promise<AccessReviewItem[]>;
  createAccessReviewItem(item: InsertAccessReviewItem): Promise<AccessReviewItem>;
  updateAccessReviewItem(id: string, updates: Partial<InsertAccessReviewItem>): Promise<AccessReviewItem | undefined>;

  // Access Review Decisions (Phase 5)
  getAccessReviewDecisions(campaignId: string): Promise<AccessReviewDecision[]>;
  createAccessReviewDecision(decision: InsertAccessReviewDecision): Promise<AccessReviewDecision>;

  // Role Templates (Phase 5)
  getRoleTemplates(tenantId: string, filters?: {department?: string}): Promise<RoleTemplate[]>;
  getRoleTemplate(id: string, tenantId: string): Promise<RoleTemplate | undefined>;
  createRoleTemplate(template: InsertRoleTemplate): Promise<RoleTemplate>;
  updateRoleTemplate(id: string, tenantId: string, updates: Partial<InsertRoleTemplate>): Promise<RoleTemplate | undefined>;
  deleteRoleTemplate(id: string, tenantId: string): Promise<boolean>;

  // User Role Assignments (Phase 5)
  getUserRoleAssignments(tenantId: string, filters?: {userId?: string; isActive?: boolean}): Promise<UserRoleAssignment[]>;
  getUserRoleAssignment(id: string, tenantId: string): Promise<UserRoleAssignment | undefined>;
  createUserRoleAssignment(assignment: InsertUserRoleAssignment): Promise<UserRoleAssignment>;
  updateUserRoleAssignment(id: string, tenantId: string, updates: Partial<InsertUserRoleAssignment>): Promise<UserRoleAssignment | undefined>;

  // Privilege Drift Alerts (Phase 5)
  getPrivilegeDriftAlerts(tenantId: string, filters?: {status?: string; riskLevel?: string}): Promise<PrivilegeDriftAlert[]>;
  getPrivilegeDriftAlert(id: string, tenantId: string): Promise<PrivilegeDriftAlert | undefined>;
  createPrivilegeDriftAlert(alert: InsertPrivilegeDriftAlert): Promise<PrivilegeDriftAlert>;
  updatePrivilegeDriftAlert(id: string, tenantId: string, updates: Partial<InsertPrivilegeDriftAlert>): Promise<PrivilegeDriftAlert | undefined>;

  // Overprivileged Accounts (Phase 5)
  getOverprivilegedAccounts(tenantId: string, filters?: {status?: string; riskLevel?: string}): Promise<OverprivilegedAccount[]>;
  getOverprivilegedAccount(id: string, tenantId: string): Promise<OverprivilegedAccount | undefined>;
  createOverprivilegedAccount(account: InsertOverprivilegedAccount): Promise<OverprivilegedAccount>;
  updateOverprivilegedAccount(id: string, tenantId: string, updates: Partial<InsertOverprivilegedAccount>): Promise<OverprivilegedAccount | undefined>;

  // Helper methods for Phase 5
  getAllUserAppAccess(tenantId: string): Promise<any[]>;
  updateUserAppAccessType(userId: string, appId: string, tenantId: string, newAccessType: string): Promise<void>;
  getUsers(tenantId: string): Promise<User[]>;
  getTenants(): Promise<Tenant[]>;

  // ============================================================================
  // Phase 6: Advanced Features & AI Intelligence
  // ============================================================================

  // Access Requests (Phase 6.1)
  getAccessRequests(tenantId: string, filters?: {status?: string; requesterId?: string; approverId?: string}): Promise<AccessRequest[]>;
  getAccessRequest(id: string, tenantId: string): Promise<AccessRequest | undefined>;
  getAccessRequestsPendingForApprover(approverId: string, tenantId: string): Promise<AccessRequest[]>;
  getAccessRequestsByRequester(requesterId: string, tenantId: string): Promise<AccessRequest[]>;
  createAccessRequest(request: InsertAccessRequest): Promise<AccessRequest>;
  updateAccessRequest(id: string, tenantId: string, updates: Partial<InsertAccessRequest>): Promise<AccessRequest | undefined>;
  deleteAccessRequest(id: string, tenantId: string): Promise<boolean>;

  // JIT Access Sessions (Phase 6.2)
  getJitAccessSessions(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<JitAccessSession[]>;
  getJitAccessSession(id: string, tenantId: string): Promise<JitAccessSession | undefined>;
  getActiveJitSessions(tenantId: string): Promise<JitAccessSession[]>;
  getExpiredJitSessions(tenantId: string): Promise<JitAccessSession[]>;
  createJitAccessSession(session: InsertJitAccessSession): Promise<JitAccessSession>;
  updateJitAccessSession(id: string, tenantId: string, updates: Partial<InsertJitAccessSession>): Promise<JitAccessSession | undefined>;
  deleteJitAccessSession(id: string, tenantId: string): Promise<boolean>;

  // Segregation of Duties Rules (Phase 6.3)
  getSodRules(tenantId: string, filters?: {isActive?: boolean; severity?: string}): Promise<SodRule[]>;
  getSodRule(id: string, tenantId: string): Promise<SodRule | undefined>;
  createSodRule(rule: InsertSodRule): Promise<SodRule>;
  updateSodRule(id: string, tenantId: string, updates: Partial<InsertSodRule>): Promise<SodRule | undefined>;
  deleteSodRule(id: string, tenantId: string): Promise<boolean>;
  toggleSodRule(id: string, tenantId: string, isActive: boolean): Promise<SodRule | undefined>;

  // SoD Violations (Phase 6.3)
  getSodViolations(tenantId: string, filters?: {userId?: string; status?: string; severity?: string}): Promise<SodViolation[]>;
  getSodViolation(id: string, tenantId: string): Promise<SodViolation | undefined>;
  createSodViolation(violation: InsertSodViolation): Promise<SodViolation>;
  updateSodViolation(id: string, tenantId: string, updates: Partial<InsertSodViolation>): Promise<SodViolation | undefined>;
  deleteSodViolation(id: string, tenantId: string): Promise<boolean>;

  // Review Suggestions (Phase 6.4)
  getReviewSuggestions(campaignId: string): Promise<ReviewSuggestion[]>;
  getReviewSuggestion(id: string): Promise<ReviewSuggestion | undefined>;
  createReviewSuggestion(suggestion: InsertReviewSuggestion): Promise<ReviewSuggestion>;
  updateReviewSuggestion(id: string, updates: Partial<InsertReviewSuggestion>): Promise<ReviewSuggestion | undefined>;

  // Anomaly Detections (Phase 6.5)
  getAnomalyDetections(tenantId: string, filters?: {userId?: string; status?: string; severity?: string}): Promise<AnomalyDetection[]>;
  getAnomalyDetection(id: string, tenantId: string): Promise<AnomalyDetection | undefined>;
  createAnomalyDetection(anomaly: InsertAnomalyDetection): Promise<AnomalyDetection>;
  updateAnomalyDetection(id: string, tenantId: string, updates: Partial<InsertAnomalyDetection>): Promise<AnomalyDetection | undefined>;
  deleteAnomalyDetection(id: string, tenantId: string): Promise<boolean>;

  // Peer Group Baselines (Phase 6.6)
  getPeerGroupBaselines(tenantId: string, filters?: {department?: string; role?: string}): Promise<PeerGroupBaseline[]>;
  getPeerGroupBaseline(id: string, tenantId: string): Promise<PeerGroupBaseline | undefined>;
  createPeerGroupBaseline(baseline: InsertPeerGroupBaseline): Promise<PeerGroupBaseline>;
  updatePeerGroupBaseline(id: string, tenantId: string, updates: Partial<InsertPeerGroupBaseline>): Promise<PeerGroupBaseline | undefined>;
  deletePeerGroupBaseline(id: string, tenantId: string): Promise<boolean>;

  // Peer Group Outliers (Phase 6.6)
  getPeerGroupOutliers(tenantId: string, filters?: {userId?: string; status?: string}): Promise<PeerGroupOutlier[]>;
  getPeerGroupOutlier(id: string, tenantId: string): Promise<PeerGroupOutlier | undefined>;
  createPeerGroupOutlier(outlier: InsertPeerGroupOutlier): Promise<PeerGroupOutlier>;
  updatePeerGroupOutlier(id: string, tenantId: string, updates: Partial<InsertPeerGroupOutlier>): Promise<PeerGroupOutlier | undefined>;
  deletePeerGroupOutlier(id: string, tenantId: string): Promise<boolean>;

  // Certification Schedules (Phase 6.7)
  getCertificationSchedules(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<CertificationSchedule[]>;
  getCertificationSchedule(id: string, tenantId: string): Promise<CertificationSchedule | undefined>;
  getUpcomingCertifications(tenantId: string, days: number): Promise<CertificationSchedule[]>;
  createCertificationSchedule(schedule: InsertCertificationSchedule): Promise<CertificationSchedule>;
  updateCertificationSchedule(id: string, tenantId: string, updates: Partial<InsertCertificationSchedule>): Promise<CertificationSchedule | undefined>;
  deleteCertificationSchedule(id: string, tenantId: string): Promise<boolean>;

  // Integration Configs (Phase 6.10)
  getIntegrationConfigs(tenantId: string, filters?: {category?: string; enabled?: boolean}): Promise<IntegrationConfig[]>;
  getIntegrationConfig(id: string, tenantId: string): Promise<IntegrationConfig | undefined>;
  getIntegrationConfigByIntegrationId(integrationId: string, tenantId: string): Promise<IntegrationConfig | undefined>;
  createIntegrationConfig(config: InsertIntegrationConfig): Promise<IntegrationConfig>;
  updateIntegrationConfig(id: string, tenantId: string, updates: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined>;
  deleteIntegrationConfig(id: string, tenantId: string): Promise<boolean>;
  toggleIntegrationConfig(id: string, tenantId: string, enabled: boolean): Promise<IntegrationConfig | undefined>;

  // Integration Events (Phase 6.10)
  getIntegrationEvents(tenantId: string, filters?: {integrationId?: string; eventType?: string; status?: string}): Promise<IntegrationEvent[]>;
  getIntegrationEvent(id: string, tenantId: string): Promise<IntegrationEvent | undefined>;
  createIntegrationEvent(event: InsertIntegrationEvent): Promise<IntegrationEvent>;
  updateIntegrationEvent(id: string, tenantId: string, updates: Partial<InsertIntegrationEvent>): Promise<IntegrationEvent | undefined>;

  // Helper methods for Phase 6
  getUserAppAccessList(userId: string, tenantId: string): Promise<UserAppAccess[]>;
  grantUserAppAccess(access: InsertUserAppAccess): Promise<UserAppAccess>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string, tenantId?: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase();
    const whereCondition = tenantId 
      ? and(eq(users.email, normalizedEmail), eq(users.tenantId, tenantId))
      : eq(users.email, normalizedEmail);
    const [user] = await db.select().from(users).where(whereCondition);
    return user || undefined;
  }

  async getUserByEmployeeId(employeeId: string, tenantId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      and(eq(users.userID, parseInt(employeeId)), eq(users.tenantId, tenantId))
    );
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    // Get existing user IDs to generate the next unique numeric ID
    const existingUsers = await db.select({ userID: users.userID })
      .from(users)
      .where(eq(users.tenantId, user.tenantId))
      .orderBy(desc(users.userID));
    
    const existingUserIDs = existingUsers.map(u => u.userID).filter(id => id !== null);
    const nextUserID = generateNextUserID(existingUserIDs);
    
    // Normalize user data
    const normalizedUser = {
      ...user,
      userID: nextUserID,
      email: normalizeEmail(user.email),
      firstName: normalizeName(user.firstName),
      lastName: normalizeName(user.lastName)
    };
    
    const [newUser] = await db.insert(users).values(normalizedUser).returning();
    return newUser;
  }

  // Migration function to assign userID values to existing users
  async migrateExistingUsersWithUserIDs(): Promise<void> {
    console.log("Migrating existing users to add userID values...");
    
    // Get all users without userID values
    const usersWithoutUserID = await db.select()
      .from(users)
      .where(eq(users.userID, sql`NULL`))
      .orderBy(users.createdAt);
    
    if (usersWithoutUserID.length === 0) {
      console.log("All users already have userID values.");
      return;
    }
    
    // Group by tenant to assign sequential IDs per tenant
    const usersByTenant = usersWithoutUserID.reduce((acc, user) => {
      if (!acc[user.tenantId]) {
        acc[user.tenantId] = [];
      }
      acc[user.tenantId].push(user);
      return acc;
    }, {} as Record<string, typeof usersWithoutUserID>);
    
    for (const [tenantId, tenantUsers] of Object.entries(usersByTenant)) {
      console.log(`Processing ${tenantUsers.length} users for tenant ${tenantId}`);
      
      // Get existing user IDs for this tenant
      const existingUsers = await db.select({ userID: users.userID })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), isNotNull(users.userID)))
        .orderBy(desc(users.userID));
      
      const existingUserIDs = existingUsers.map(u => u.userID).filter(id => id !== null);
      let nextUserID = generateNextUserID(existingUserIDs);
      
      // Update each user with a unique userID
      for (const user of tenantUsers) {
        await db.update(users)
          .set({
            userID: nextUserID,
            email: normalizeEmail(user.email),
            firstName: normalizeName(user.firstName),
            lastName: normalizeName(user.lastName)
          })
          .where(eq(users.id, user.id));
        
        console.log(`Assigned userID ${nextUserID} to user ${user.email}`);
        nextUserID++;
      }
    }
    
    console.log("Migration completed successfully.");
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async updateUserProfile(userId: string, tenantId: string, profile: UpdateUserProfile): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ 
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        department: profile.department,
        jobTitle: profile.jobTitle,
        manager: profile.manager,
        updatedAt: new Date()
      })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning();
    return updatedUser || undefined;
  }

  async updateUserPassword(userId: string, tenantId: string, hashedPassword: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  // User Management
  async getTenantUsers(tenantId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async createFirstAdminUser(user: InsertUser, tenantId: string): Promise<{ success: boolean; user?: User; alreadyExists?: boolean }> {
    try {
      return await db.transaction(async (tx) => {
        // Atomic first-admin protection: Try to claim the lock for this tenant
        try {
          await tx.insert(tenantAdminLock).values({ tenantId });
        } catch (lockError: any) {
          // If insert fails due to unique constraint violation, admin already exists
          if (lockError.code === "23505" || lockError.message?.includes("UNIQUE constraint failed") || lockError.message?.includes("duplicate key")) {
            return { 
              success: false, 
              alreadyExists: true 
            };
          }
          // Re-throw unexpected errors
          throw lockError;
        }

        // Successfully claimed the lock, now create the first admin user
        const userData = {
          ...user,
          role: "super-admin", // Force super-admin role for first user
          tenantId: tenantId,
        };

        const [newUser] = await tx.insert(users).values(userData).returning();
        
        return { 
          success: true, 
          user: newUser, 
          alreadyExists: false 
        };
      });
    } catch (error) {
      console.error("Error creating first admin user:", error);
      return { 
        success: false, 
        alreadyExists: false 
      };
    }
  }

  async updateUserRole(userId: string, tenantId: string, role: UpdateUserRole): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ role: role.role, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning();
    return updatedUser || undefined;
  }

  async deactivateUser(userId: string, tenantId: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async activateUser(userId: string, tenantId: string): Promise<boolean> {
    const result = await db
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async deleteUserAndCleanup(userId: string, tenantId: string, fallbackUser: User): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [targetUser] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

      if (!targetUser) {
        return false;
      }

      const fallbackDisplayName = [fallbackUser.firstName, fallbackUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || fallbackUser.email;

      await tx
        .update(assets)
        .set({
          assignedUserId: null,
          assignedUserName: null,
          assignedUserEmail: null,
          assignedUserEmployeeId: null,
          updatedAt: new Date(),
        })
        .where(and(eq(assets.tenantId, tenantId), eq(assets.assignedUserId, userId)));

      await tx
        .update(tickets)
        .set({
          requestorId: fallbackUser.id,
          requestorName: fallbackDisplayName,
          requestorEmail: fallbackUser.email,
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.requestorId, userId)));

      await tx
        .update(tickets)
        .set({
          assignedToId: null,
          assignedToName: null,
          assignedAt: null,
          status: "open",
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.assignedToId, userId)));

      await tx
        .update(tickets)
        .set({
          assignedById: null,
          assignedByName: null,
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.tenantId, tenantId), eq(tickets.assignedById, userId)));

      await tx
        .delete(userPreferences)
        .where(and(eq(userPreferences.userId, userId), eq(userPreferences.tenantId, tenantId)));

      await tx
        .delete(aiResponses)
        .where(and(eq(aiResponses.userId, userId), eq(aiResponses.tenantId, tenantId)));

      const deleteResult = await tx
        .delete(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

      return (deleteResult.rowCount || 0) > 0;
    });
  }

  // User Invitations
  async createInvitation(invitation: InsertUserInvitation): Promise<UserInvitation> {
    const invitationData = {
      ...invitation,
      token: randomUUID(),
      status: "pending" as const,
    };
    const [newInvitation] = await db.insert(userInvitations).values(invitationData).returning();
    return newInvitation;
  }

  async getInvitation(token: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db.select().from(userInvitations).where(eq(userInvitations.token, token));
    return invitation || undefined;
  }

  async getInvitationByEmail(email: string, tenantId: string): Promise<UserInvitation | undefined> {
    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(and(eq(userInvitations.email, email), eq(userInvitations.tenantId, tenantId)));
    return invitation || undefined;
  }

  async getTenantInvitations(tenantId: string): Promise<UserInvitation[]> {
    return await db.select().from(userInvitations).where(eq(userInvitations.tenantId, tenantId));
  }

  async updateInvitationStatus(token: string, status: "accepted" | "expired"): Promise<UserInvitation | undefined> {
    const [updatedInvitation] = await db
      .update(userInvitations)
      .set({ status, acceptedAt: status === "accepted" ? new Date() : undefined })
      .where(eq(userInvitations.token, token))
      .returning();
    return updatedInvitation || undefined;
  }

  async cancelInvitation(invitationId: string, tenantId: string): Promise<UserInvitation | undefined> {
    const [deletedInvitation] = await db
      .delete(userInvitations)
      .where(and(eq(userInvitations.id, invitationId), eq(userInvitations.tenantId, tenantId)))
      .returning();
    return deletedInvitation || undefined;
  }

  async acceptInvitation(token: string, password: string): Promise<{ user: User; invitation: UserInvitation } | undefined> {
    const invitation = await this.getInvitation(token);
    if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
      return undefined;
    }

    // Create user account
    const hashedPassword = await hashPassword(password);
    const newUser = await this.createUser({
      username: invitation.email,
      email: invitation.email,
      password: hashedPassword,
      firstName: invitation.firstName || "",
      lastName: invitation.lastName || "",
      role: invitation.role || "read-only",
      tenantId: invitation.tenantId,
      invitedBy: invitation.invitedBy,
      isActive: true,
    });

    // Mark invitation as accepted
    const updatedInvitation = await this.updateInvitationStatus(token, "accepted");
    if (!updatedInvitation) {
      throw new Error("Failed to update invitation status");
    }

    return { user: newUser, invitation: updatedInvitation };
  }

  // User Preferences
  async getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | undefined> {
    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.tenantId, tenantId)));
    return preferences || undefined;
  }

  async createUserPreferences(preferences: InsertUserPreferences): Promise<UserPreferences> {
    const [newPreferences] = await db.insert(userPreferences).values(preferences).returning();
    return newPreferences;
  }

  async updateUserPreferences(userId: string, tenantId: string, preferences: Partial<InsertUserPreferences>): Promise<UserPreferences | undefined> {
    const [updatedPreferences] = await db
      .update(userPreferences)
      .set({ ...preferences, updatedAt: new Date() })
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.tenantId, tenantId)))
      .returning();
    return updatedPreferences || undefined;
  }

  // Tenants
  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async getTenantByName(name: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(ilike(tenants.name, name));
    return tenant || undefined;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updatedTenant] = await db
      .update(tenants)
      .set({ ...tenant, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant || undefined;
  }

  // Get tenant by support email address for external ticket routing
  async getTenantBySupportEmail(supportEmail: string): Promise<Tenant | undefined> {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.supportEmail, supportEmail.toLowerCase()));
    
    return tenant;
  }

  // NOTE: getDefaultTenantForExternalTickets removed for security - no default fallback allowed

  async updateOrgSettings(tenantId: string, settings: UpdateOrgSettings): Promise<Tenant | undefined> {
    const [updatedTenant] = await db
      .update(tenants)
      .set({ 
        name: settings.name,
        timezone: settings.timezone,
        currency: settings.currency,
        dateFormat: settings.dateFormat,
        autoRecommendations: settings.autoRecommendations,
        dataRetentionDays: settings.dataRetentionDays,
        updatedAt: new Date()
      })
      .where(eq(tenants.id, tenantId))
      .returning();
    return updatedTenant || undefined;
  }

  async backfillTenantAdminLocks(): Promise<{ processed: number; locked: number; errors: number }> {
    let processed = 0;
    let locked = 0;
    let errors = 0;

    try {
      // Get all tenants that have users
      const tenantsWithUsers = await db
        .select({ tenantId: users.tenantId })
        .from(users)
        .groupBy(users.tenantId);

      console.log(`Found ${tenantsWithUsers.length} tenants with users to backfill`);

      for (const tenant of tenantsWithUsers) {
        processed++;
        try {
          // Try to insert admin lock (idempotent - ignore if already exists)
          await db.insert(tenantAdminLock).values({ 
            tenantId: tenant.tenantId 
          });
          locked++;
          console.log(`Created admin lock for tenant: ${tenant.tenantId}`);
        } catch (error: any) {
          // Ignore unique constraint violations (lock already exists)
          if (error.code === "23505" || error.message?.includes("UNIQUE constraint failed") || error.message?.includes("duplicate key")) {
            console.log(`Admin lock already exists for tenant: ${tenant.tenantId}`);
          } else {
            errors++;
            console.error(`Error creating admin lock for tenant ${tenant.tenantId}:`, error);
          }
        }
      }

      return { processed, locked, errors };
    } catch (error) {
      console.error("Error during tenant admin lock backfill:", error);
      return { processed, locked, errors };
    }
  }

  // Assets
  async getAllAssets(tenantId: string, filters?: { type?: string; status?: string; category?: string; search?: string }): Promise<Asset[]> {
    const conditions = [eq(assets.tenantId, tenantId)];
    
    if (filters?.type) {
      conditions.push(eq(assets.type, filters.type));
    }
    
    if (filters?.status) {
      conditions.push(eq(assets.status, filters.status));
    }
    
    if (filters?.category) {
      conditions.push(eq(assets.category, filters.category));
    }
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(
          ${assets.name} ILIKE ${searchTerm} OR
          ${assets.serialNumber} ILIKE ${searchTerm} OR
          ${assets.manufacturer} ILIKE ${searchTerm} OR
          ${assets.model} ILIKE ${searchTerm} OR
          ${assets.vendorName} ILIKE ${searchTerm} OR
          ${assets.companyName} ILIKE ${searchTerm} OR
          ${assets.location} ILIKE ${searchTerm} OR
          ${assets.assignedUserName} ILIKE ${searchTerm} OR
          ${assets.status} ILIKE ${searchTerm} OR
          ${assets.type} ILIKE ${searchTerm} OR
          ${assets.category} ILIKE ${searchTerm} OR
          CAST(${assets.purchaseCost} AS TEXT) ILIKE ${searchTerm}
        )`
      );
    }
    
    return await db.select().from(assets).where(and(...conditions));
  }

  async getAssetsByUserId(userId: string, tenantId: string): Promise<Asset[]> {
    return await db
      .select()
      .from(assets)
      .where(and(eq(assets.assignedUserId, userId), eq(assets.tenantId, tenantId)));
  }

  async getAssetsByUserEmployeeId(employeeId: string, tenantId: string): Promise<Asset[]> {
    return await db
      .select()
      .from(assets)
      .where(and(eq(assets.assignedUserEmployeeId, employeeId), eq(assets.tenantId, tenantId)));
  }

  async getAsset(id: string, tenantId: string): Promise<Asset | undefined> {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)));
    return asset || undefined;
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [newAsset] = await db.insert(assets).values(asset).returning();
    return newAsset;
  }

  async createAssetsBulk(assetList: InsertAsset[]): Promise<Asset[]> {
    if (assetList.length === 0) {
      return [];
    }
    
    return await db.transaction(async (tx) => {
      const newAssets = await tx.insert(assets).values(assetList).returning();
      return newAssets;
    });
  }

  async updateAsset(id: string, tenantId: string, asset: Partial<InsertAsset>): Promise<Asset | undefined> {
    const [updatedAsset] = await db
      .update(assets)
      .set({ ...asset, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)))
      .returning();
    return updatedAsset || undefined;
  }

  async deleteAsset(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async getAssetSoftwareLinks(assetId: string, tenantId: string) {
    const softwareAssets = alias(assets, "software_assets");

    const rows = await db
      .select({
        id: assetSoftwareLinks.id,
        softwareAssetId: assetSoftwareLinks.softwareAssetId,
        softwareName: softwareAssets.name,
        softwareVersion: softwareAssets.version,
        softwareManufacturer: softwareAssets.manufacturer,
        createdAt: assetSoftwareLinks.createdAt,
      })
      .from(assetSoftwareLinks)
      .innerJoin(
        softwareAssets,
        and(
          eq(assetSoftwareLinks.softwareAssetId, softwareAssets.id),
          eq(softwareAssets.tenantId, tenantId)
        )
      )
      .where(and(eq(assetSoftwareLinks.assetId, assetId), eq(assetSoftwareLinks.tenantId, tenantId)));

    return rows.map((row) => ({
      id: row.id,
      softwareAssetId: row.softwareAssetId,
      softwareName: row.softwareName || "Untitled Software",
      softwareVersion: row.softwareVersion ?? null,
      softwareManufacturer: row.softwareManufacturer ?? null,
      createdAt: row.createdAt ?? null,
    }));
  }

  async createAssetSoftwareLink(link: InsertAssetSoftwareLink): Promise<AssetSoftwareLink> {
    const [newLink] = await db.insert(assetSoftwareLinks).values(link).returning();
    return newLink;
  }

  async getSoftwareLinkedDevices(softwareAssetId: string, tenantId: string): Promise<Array<Asset & { linkedAt?: Date | null }>> {
    const hardwareAssets = alias(assets, "hardware_assets");

    const rows = await db
      .select({
        device: hardwareAssets,
        linkedAt: assetSoftwareLinks.createdAt,
      })
      .from(assetSoftwareLinks)
      .innerJoin(
        hardwareAssets,
        and(
          eq(assetSoftwareLinks.assetId, hardwareAssets.id),
          eq(hardwareAssets.tenantId, tenantId),
          ilike(hardwareAssets.type, "hardware")
        )
      )
      .where(and(eq(assetSoftwareLinks.softwareAssetId, softwareAssetId), eq(assetSoftwareLinks.tenantId, tenantId)));

    return rows.map((row) => ({
      ...row.device,
      linkedAt: row.linkedAt ?? null,
    }));
  }

  async deleteAssetSoftwareLink(assetId: string, softwareAssetId: string, tenantId: string): Promise<boolean> {
    const deleted = await db
      .delete(assetSoftwareLinks)
      .where(
        and(
          eq(assetSoftwareLinks.assetId, assetId),
          eq(assetSoftwareLinks.softwareAssetId, softwareAssetId),
          eq(assetSoftwareLinks.tenantId, tenantId)
        )
      )
      .returning({ id: assetSoftwareLinks.id });

    return deleted.length > 0;
  }

  // Software Licenses
  async getAllSoftwareLicenses(tenantId: string): Promise<SoftwareLicense[]> {
    return await db.select().from(softwareLicenses).where(eq(softwareLicenses.tenantId, tenantId));
  }

  async getSoftwareLicense(id: string, tenantId: string): Promise<SoftwareLicense | undefined> {
    const [license] = await db
      .select()
      .from(softwareLicenses)
      .where(and(eq(softwareLicenses.id, id), eq(softwareLicenses.tenantId, tenantId)));
    return license || undefined;
  }

  async createSoftwareLicense(license: InsertSoftwareLicense): Promise<SoftwareLicense> {
    const [newLicense] = await db.insert(softwareLicenses).values(license).returning();
    return newLicense;
  }

  async updateSoftwareLicense(id: string, tenantId: string, license: Partial<InsertSoftwareLicense>): Promise<SoftwareLicense | undefined> {
    const [updatedLicense] = await db
      .update(softwareLicenses)
      .set({ ...license, updatedAt: new Date() })
      .where(and(eq(softwareLicenses.id, id), eq(softwareLicenses.tenantId, tenantId)))
      .returning();
    return updatedLicense || undefined;
  }

  async deleteSoftwareLicense(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(softwareLicenses)
      .where(and(eq(softwareLicenses.id, id), eq(softwareLicenses.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  // Asset Utilization
  async addAssetUtilization(utilization: InsertAssetUtilization): Promise<AssetUtilization> {
    const [newUtilization] = await db.insert(assetUtilization).values(utilization).returning();
    return newUtilization;
  }

  async getAssetUtilization(assetId: string, tenantId: string): Promise<AssetUtilization[]> {
    return await db
      .select()
      .from(assetUtilization)
      .where(and(eq(assetUtilization.assetId, assetId), eq(assetUtilization.tenantId, tenantId)))
      .orderBy(desc(assetUtilization.recordedAt));
  }

  // Recommendations
  async getRecommendations(tenantId: string, status?: string): Promise<Recommendation[]> {
    if (status && ["pending", "accepted", "dismissed"].includes(status)) {
      return await db
        .select()
        .from(recommendations)
        .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.status, status)));
    }

    return await db.select().from(recommendations).where(eq(recommendations.tenantId, tenantId));
  }

  async createRecommendation(recommendation: InsertRecommendation): Promise<Recommendation> {
    const [newRecommendation] = await db.insert(recommendations).values(recommendation).returning();
    return newRecommendation;
  }

  async updateRecommendationStatus(id: string, tenantId: string, status: string): Promise<Recommendation | undefined> {
    const [updatedRecommendation] = await db
      .update(recommendations)
      .set({ status })
      .where(and(eq(recommendations.id, id), eq(recommendations.tenantId, tenantId)))
      .returning();
    return updatedRecommendation || undefined;
  }

  async deleteRecommendation(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(recommendations)
      .where(and(eq(recommendations.id, id), eq(recommendations.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async deleteRecommendationsByTenant(tenantId: string): Promise<void> {
    await db.delete(recommendations).where(eq(recommendations.tenantId, tenantId));
  }

  async createAIResponse(response: InsertAIResponse): Promise<AIResponse> {
    const [newResponse] = await db.insert(aiResponses).values(response).returning();
    return newResponse;
  }

  async getAIResponse(id: string, tenantId: string): Promise<AIResponse | undefined> {
    const response = await db
      .select()
      .from(aiResponses)
      .where(and(eq(aiResponses.id, id), eq(aiResponses.tenantId, tenantId)))
      .limit(1);
    return response[0] || undefined;
  }

  // Master Data
  async getMasterData(tenantId: string, type?: string): Promise<MasterData[]> {
    if (type) {
      return await db
        .select()
        .from(masterData)
        .where(and(eq(masterData.tenantId, tenantId), eq(masterData.type, type)));
    }
    return await db.select().from(masterData).where(eq(masterData.tenantId, tenantId));
  }

  async getMasterDataById(id: string, tenantId: string): Promise<MasterData | undefined> {
    const [record] = await db
      .select()
      .from(masterData)
      .where(and(eq(masterData.id, id), eq(masterData.tenantId, tenantId)))
      .limit(1);
    return record || undefined;
  }

  async addMasterData(data: InsertMasterData): Promise<MasterData> {
    const [newData] = await db.insert(masterData).values(data).returning();
    return newData;
  }

  async updateMasterData(id: string, tenantId: string, data: Partial<InsertMasterData>): Promise<MasterData | undefined> {
    const updatePayload: Partial<typeof masterData.$inferInsert> = {
      value: data.value,
      description: data.description,
      metadata: data.metadata,
      isActive: data.isActive,
      updatedAt: new Date(),
    };

    // Remove undefined fields to avoid overwriting existing values with null
    Object.keys(updatePayload).forEach((key) => {
      const typedKey = key as keyof typeof updatePayload;
      if (updatePayload[typedKey] === undefined) {
        delete updatePayload[typedKey];
      }
    });

    const [updated] = await db
      .update(masterData)
      .set(updatePayload)
      .where(and(eq(masterData.id, id), eq(masterData.tenantId, tenantId)))
      .returning();

    return updated || undefined;
  }

  async deleteMasterData(id: string, tenantId: string): Promise<boolean> {
    const result = await db
      .delete(masterData)
      .where(and(eq(masterData.id, id), eq(masterData.tenantId, tenantId)));
    return (result.rowCount || 0) > 0;
  }

  async getDistinctFromAssets(tenantId: string, field: string): Promise<{ value: string }[]> {
    const validFields = ["manufacturer", "model", "category", "location", "status"];
    if (!validFields.includes(field)) {
      throw new Error(`Invalid field: ${field}`);
    }

    const distinctValues = await db
      .selectDistinct({ value: sql`${sql.identifier(field)}` })
      .from(assets)
      .where(eq(assets.tenantId, tenantId));

    return distinctValues.filter(item => item.value).map(item => ({ value: String(item.value) }));
  }

  // Audit Logs
  async logActivity(activity: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLogs).values(activity).returning();
    return newLog;
  }

  async getAuditLogs(tenantId: string): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt));
  }

  // Tickets
  async createTicket(ticket: InsertTicket): Promise<Ticket> {
    return await db.transaction(async (tx) => {
      let ticketNumber: string;
      let attempts = 0;
      const maxAttempts = 5;

      // Generate unique ticket number with retry logic
      while (attempts < maxAttempts) {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        ticketNumber = `TKT-${timestamp}-${random}`;
        
        try {
          const [newTicket] = await tx
            .insert(tickets)
            .values({
              ...ticket,
              ticketNumber,
            })
            .returning();

          // Log creation activity
          await tx.insert(ticketActivities).values({
            ticketId: newTicket.id,
            activityType: "created",
            description: `Ticket created by ${ticket.requestorName}`,
            actorId: ticket.requestorId,
            actorName: ticket.requestorName,
            actorRole: "employee",
            tenantId: ticket.tenantId,
          });

          return newTicket;
        } catch (error: any) {
          if (error.code === '23505' && error.constraint?.includes('ticket_number')) {
            // Unique constraint violation on ticket number, retry
            attempts++;
            if (attempts >= maxAttempts) {
              throw new Error("Failed to generate unique ticket number after multiple attempts");
            }
            continue;
          }
          throw error;
        }
      }
      
      throw new Error("Failed to create ticket");
    });
  }

  async getTicket(id: string, tenantId: string): Promise<Ticket | undefined> {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
    
    return ticket;
  }

  async getAllTickets(tenantId: string): Promise<Ticket[]> {
    return await db
      .select()
      .from(tickets)
      .where(eq(tickets.tenantId, tenantId))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicketsByAssignee(assignedToId: string, tenantId: string): Promise<Ticket[]> {
    return await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.assignedToId, assignedToId), eq(tickets.tenantId, tenantId)))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicketsByRequestor(requestorId: string, tenantId: string): Promise<Ticket[]> {
    return await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.requestorId, requestorId), eq(tickets.tenantId, tenantId)))
      .orderBy(desc(tickets.createdAt));
  }

  async updateTicket(id: string, tenantId: string, ticket: UpdateTicket): Promise<Ticket | undefined> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to tenant
      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
      
      if (!existingTicket) {
        throw new Error("Ticket not found or access denied");
      }

      const [updatedTicket] = await tx
        .update(tickets)
        .set({ ...ticket, updatedAt: new Date() })
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)))
        .returning();

      // Log activity for field updates
      if (Object.keys(ticket).length > 0) {
        await tx.insert(ticketActivities).values({
          ticketId: id,
          activityType: "updated",
          description: `Ticket details updated`,
          actorId: existingTicket.requestorId, // Default to requestor, should be passed from route
          actorName: existingTicket.requestorName,
          actorRole: "employee",
          tenantId: existingTicket.tenantId, // Use ticket's tenantId, not payload
        });
      }
      
      return updatedTicket;
    });
  }

  async assignTicket(
    id: string, 
    tenantId: string, 
    assignedToId: string, 
    assignedToName: string, 
    assignedById: string, 
    assignedByName: string
  ): Promise<Ticket | undefined> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to tenant
      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
      
      if (!existingTicket) {
        throw new Error("Ticket not found or access denied");
      }

      const [updatedTicket] = await tx
        .update(tickets)
        .set({
          assignedToId,
          assignedToName,
          assignedById,
          assignedByName,
          assignedAt: new Date(),
          status: "in-progress",
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)))
        .returning();

      // Log activity
      await tx.insert(ticketActivities).values({
        ticketId: id,
        activityType: "assigned",
        description: `Ticket assigned to ${assignedToName} by ${assignedByName}`,
        actorId: assignedById,
        actorName: assignedByName,
        actorRole: "admin", // Assuming admin assigns tickets
        tenantId,
      });
      
      return updatedTicket;
    });
  }

  async updateTicketStatus(
    id: string, 
    tenantId: string, 
    status: string, 
    resolution?: string, 
    resolutionNotes?: string
  ): Promise<Ticket | undefined> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to tenant
      const [existingTicket] = await tx
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
      
      if (!existingTicket) {
        throw new Error("Ticket not found or access denied");
      }

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === "resolved") {
        updateData.resolvedAt = new Date();
        if (resolution) updateData.resolution = resolution;
        if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
      } else if (status === "closed") {
        updateData.closedAt = new Date();
      }

      const [updatedTicket] = await tx
        .update(tickets)
        .set(updateData)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)))
        .returning();

      // Log activity
      await tx.insert(ticketActivities).values({
        ticketId: id,
        activityType: "status_changed",
        description: `Ticket status changed to ${status}`,
        actorId: existingTicket.assignedToId || existingTicket.requestorId,
        actorName: existingTicket.assignedToName || existingTicket.requestorName,
        actorRole: existingTicket.assignedToId ? "technician" : "employee",
        tenantId,
      });
      
      return updatedTicket;
    });
  }

  async deleteTicket(id: string, tenantId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to tenant
      const [existingTicket] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
      
      if (!existingTicket) {
        return false; // Ticket not found or access denied
      }

      // Delete dependent records first (activities and comments)
      await tx
        .delete(ticketActivities)
        .where(and(eq(ticketActivities.ticketId, id), eq(ticketActivities.tenantId, tenantId)));

      await tx
        .delete(ticketComments)
        .where(and(eq(ticketComments.ticketId, id), eq(ticketComments.tenantId, tenantId)));

      // Delete the ticket
      const result = await tx
        .delete(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)));
      
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  // Ticket Comments
  async addTicketComment(comment: InsertTicketComment): Promise<TicketComment> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to the same tenant
      const [ticket] = await tx
        .select({ tenantId: tickets.tenantId })
        .from(tickets)
        .where(and(eq(tickets.id, comment.ticketId), eq(tickets.tenantId, comment.tenantId)));
      
      if (!ticket) {
        throw new Error("Ticket not found or access denied");
      }

      // Use ticket's tenantId, not payload tenantId
      const [newComment] = await tx
        .insert(ticketComments)
        .values({ ...comment, tenantId: ticket.tenantId })
        .returning();

      // Log activity with verified tenantId
      await tx.insert(ticketActivities).values({
        ticketId: comment.ticketId,
        activityType: "commented",
        description: `${comment.authorName} added a comment`,
        actorId: comment.authorId,
        actorName: comment.authorName,
        actorRole: comment.authorRole,
        tenantId: ticket.tenantId, // Use verified tenantId
      });

      return newComment;
    });
  }

  async getTicketComments(ticketId: string, tenantId: string): Promise<TicketComment[]> {
    return await db
      .select()
      .from(ticketComments)
      .where(and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.tenantId, tenantId)))
      .orderBy(ticketComments.createdAt);
  }

  async updateTicketComment(id: string, tenantId: string, content: string): Promise<TicketComment | undefined> {
    return await db.transaction(async (tx) => {
      // Verify comment exists and belongs to tenant
      const [existingComment] = await tx
        .select({ ticketId: ticketComments.ticketId })
        .from(ticketComments)
        .where(and(eq(ticketComments.id, id), eq(ticketComments.tenantId, tenantId)));
      
      if (!existingComment) {
        throw new Error("Comment not found or access denied");
      }

      // Verify the associated ticket belongs to the same tenant
      const [ticket] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, existingComment.ticketId), eq(tickets.tenantId, tenantId)));
      
      if (!ticket) {
        throw new Error("Associated ticket not found or access denied");
      }

      const [updatedComment] = await tx
        .update(ticketComments)
        .set({ content })
        .where(and(eq(ticketComments.id, id), eq(ticketComments.tenantId, tenantId)))
        .returning();
      
      return updatedComment;
    });
  }

  async deleteTicketComment(id: string, tenantId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      // Verify comment exists and belongs to tenant
      const [existingComment] = await tx
        .select({ ticketId: ticketComments.ticketId })
        .from(ticketComments)
        .where(and(eq(ticketComments.id, id), eq(ticketComments.tenantId, tenantId)));
      
      if (!existingComment) {
        return false; // Comment not found or access denied
      }

      // Verify the associated ticket belongs to the same tenant
      const [ticket] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, existingComment.ticketId), eq(tickets.tenantId, tenantId)));
      
      if (!ticket) {
        return false; // Associated ticket not found or access denied
      }

      const result = await tx
        .delete(ticketComments)
        .where(and(eq(ticketComments.id, id), eq(ticketComments.tenantId, tenantId)));
      
      return result.rowCount !== null && result.rowCount > 0;
    });
  }

  // Ticket Activities
  async logTicketActivity(activity: InsertTicketActivity): Promise<TicketActivity> {
    return await db.transaction(async (tx) => {
      // Verify ticket exists and belongs to the same tenant
      const [ticket] = await tx
        .select({ tenantId: tickets.tenantId })
        .from(tickets)
        .where(and(eq(tickets.id, activity.ticketId), eq(tickets.tenantId, activity.tenantId)));
      
      if (!ticket) {
        throw new Error("Ticket not found or access denied");
      }

      // Use ticket's tenantId, not payload tenantId
      const [newActivity] = await tx
        .insert(ticketActivities)
        .values({ ...activity, tenantId: ticket.tenantId })
        .returning();

      return newActivity;
    });
  }

  async getTicketActivities(ticketId: string, tenantId: string): Promise<TicketActivity[]> {
    return await db
      .select()
      .from(ticketActivities)
      .where(and(eq(ticketActivities.ticketId, ticketId), eq(ticketActivities.tenantId, tenantId)))
      .orderBy(ticketActivities.createdAt);
  }

  // Helper function to calculate time ago
  private getTimeAgo(date: Date | null): string {
    if (!date) return 'Unknown';
    
    const now = new Date();
    const diffInMs = now.getTime() - new Date(date).getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return new Date(date).toLocaleDateString();
  }

  // Asset Age Analysis
  private async getAssetAgeAnalysis(tenantId: string) {
    try {
      const now = new Date();
      const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
      const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());

      // Get assets older than 3 years (replacement candidates) - excluding software
      const assetsOlderThan3Years = await db
        .select({
          id: assets.id,
          name: assets.name,
          category: assets.category,
          manufacturer: assets.manufacturer,
          model: assets.model,
          purchaseDate: assets.purchaseDate,
          purchaseCost: assets.purchaseCost,
          location: assets.location,
          assignedUserName: assets.assignedUserName,
          status: assets.status
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          ne(assets.type, 'Software'),
          sql`purchase_date IS NOT NULL`,
          sql`purchase_date <= ${threeYearsAgo}`
        ))
        .orderBy(assets.purchaseDate)
        .limit(20);

      // Get assets older than 5 years (critical replacement) - excluding software
      const assetsOlderThan5Years = await db
        .select({
          id: assets.id,
          name: assets.name,
          category: assets.category,
          manufacturer: assets.manufacturer,
          model: assets.model,
          purchaseDate: assets.purchaseDate,
          purchaseCost: assets.purchaseCost,
          location: assets.location,
          assignedUserName: assets.assignedUserName,
          status: assets.status
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          ne(assets.type, 'Software'),
          sql`purchase_date IS NOT NULL`,
          sql`purchase_date <= ${fiveYearsAgo}`
        ))
        .orderBy(assets.purchaseDate)
        .limit(20);

      // Calculate age distribution - excluding software
      const ageDistribution = await db
        .select({
          ageCategory: sql<string>`
            CASE 
              WHEN purchase_date IS NULL THEN 'unknown'
              WHEN purchase_date > ${threeYearsAgo} THEN 'new'
              WHEN purchase_date > ${fiveYearsAgo} THEN 'aging'
              ELSE 'old'
            END
          `,
          count: sql<number>`COUNT(*)`
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          ne(assets.type, 'Software')
        ))
        .groupBy(sql`1`);

      // Calculate replacement cost estimates
      const replacementCosts = {
        threeYearOld: assetsOlderThan3Years.reduce((sum, asset) => sum + (Number(asset.purchaseCost) || 0), 0),
        fiveYearOld: assetsOlderThan5Years.reduce((sum, asset) => sum + (Number(asset.purchaseCost) || 0), 0)
      };

      return {
        replacementCandidates: {
          threeYearOld: assetsOlderThan3Years.map(asset => ({
            id: asset.id,
            name: asset.name,
            category: asset.category,
            manufacturer: asset.manufacturer,
            model: asset.model,
            purchaseDate: asset.purchaseDate,
            age: this.calculateAssetAge(asset.purchaseDate),
            purchaseCost: asset.purchaseCost,
            location: asset.location,
            assignedUser: asset.assignedUserName,
            status: asset.status,
            replacementUrgency: 'moderate'
          })),
          fiveYearOld: assetsOlderThan5Years.map(asset => ({
            id: asset.id,
            name: asset.name,
            category: asset.category,
            manufacturer: asset.manufacturer,
            model: asset.model,
            purchaseDate: asset.purchaseDate,
            age: this.calculateAssetAge(asset.purchaseDate),
            purchaseCost: asset.purchaseCost,
            location: asset.location,
            assignedUser: asset.assignedUserName,
            status: asset.status,
            replacementUrgency: 'high'
          }))
        },
        ageDistribution: ageDistribution.reduce((acc, item) => {
          acc[item.ageCategory] = Number(item.count);
          return acc;
        }, {} as Record<string, number>),
        replacementCosts,
        summary: {
          totalAssetsNeedingReplacement: assetsOlderThan3Years.length,
          criticalReplacementAssets: assetsOlderThan5Years.length,
          estimatedReplacementCost: replacementCosts.threeYearOld,
          averageAssetAge: await this.getAverageAssetAge(tenantId)
        }
      };
    } catch (error) {
      console.error('Error analyzing asset age:', error);
      return {
        replacementCandidates: { threeYearOld: [], fiveYearOld: [] },
        ageDistribution: {},
        replacementCosts: { threeYearOld: 0, fiveYearOld: 0 },
        summary: {
          totalAssetsNeedingReplacement: 0,
          criticalReplacementAssets: 0,
          estimatedReplacementCost: 0,
          averageAssetAge: 0
        }
      };
    }
  }

  private calculateAssetAge(purchaseDate: Date | null): string {
    if (!purchaseDate) return 'Unknown';
    
    const now = new Date();
    const ageInYears = now.getFullYear() - purchaseDate.getFullYear();
    const monthDiff = now.getMonth() - purchaseDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < purchaseDate.getDate())) {
      return `${ageInYears - 1}.${Math.abs(12 + monthDiff)} years`;
    }
    
    return `${ageInYears}.${monthDiff} years`;
  }

  private async getAverageAssetAge(tenantId: string): Promise<number> {
    try {
      const result = await db
        .select({
          avgYears: sql<number>`
            AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, purchase_date))) 
          `
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          sql`purchase_date IS NOT NULL`
        ));

      return Number(result[0]?.avgYears) || 0;
    } catch (error) {
      console.error('Error calculating average asset age:', error);
      return 0;
    }
  }

  // Dashboard Metrics
  async getDashboardMetrics(tenantId: string): Promise<any> {
    try {
      // Get overall asset counts by type
      const assetTypesCounts = await db
        .select({
          type: assets.type,
          total: sql<number>`count(*)`,
          deployed: sql<number>`count(*) filter (where status = 'deployed')`,
          inStock: sql<number>`count(*) filter (where status = 'in-stock')`,
          inRepair: sql<number>`count(*) filter (where status = 'in-repair')`,
          disposed: sql<number>`count(*) filter (where status = 'disposed')`
        })
        .from(assets)
        .where(eq(assets.tenantId, tenantId))
        .groupBy(assets.type);

      // Get hardware breakdown by category
      const hardwareCounts = await db
        .select({
          category: assets.category,
          total: sql<number>`count(*)`,
          deployed: sql<number>`count(*) filter (where status = 'deployed')`,
          inStock: sql<number>`count(*) filter (where status = 'in-stock')`,
          inRepair: sql<number>`count(*) filter (where status = 'in-repair')`
        })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.type, 'hardware')))
        .groupBy(assets.category);

      // Get hardware warranty/AMC status
      const hardwareWarrantyStatus = await db
        .select({
          total: sql<number>`count(*)`,
          warrantyExpiring: sql<number>`count(*) filter (where warranty_expiry IS NOT NULL AND warranty_expiry <= current_date + interval '30 days' and warranty_expiry > current_date)`,
          warrantyExpired: sql<number>`count(*) filter (where warranty_expiry IS NOT NULL AND warranty_expiry <= current_date)`,
          amcDue: sql<number>`count(*) filter (where amc_expiry IS NOT NULL AND amc_expiry <= current_date + interval '30 days' and amc_expiry > current_date)`,
          amcExpired: sql<number>`count(*) filter (where amc_expiry IS NOT NULL AND amc_expiry <= current_date)`
        })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.type, 'Hardware')));

      // Get software license status
      const softwareStatus = await db
        .select({
          total: sql<number>`count(*)`,
          assigned: sql<number>`sum(COALESCE(used_licenses, 0))`,
          totalLicenses: sql<number>`sum(COALESCE(total_licenses, 0))`,
          renewalDue: sql<number>`count(*) filter (where renewal_date IS NOT NULL AND renewal_date <= current_date + interval '30 days' and renewal_date > current_date)`,
          expired: sql<number>`count(*) filter (where renewal_date IS NOT NULL AND renewal_date <= current_date)`
        })
        .from(softwareLicenses)
        .where(eq(softwareLicenses.tenantId, tenantId));

      // Get peripheral breakdown by category
      const peripheralCounts = await db
        .select({
          category: assets.category,
          total: sql<number>`count(*)`,
          deployed: sql<number>`count(*) filter (where status = 'deployed')`,
          inStock: sql<number>`count(*) filter (where status = 'in-stock')`,
          inRepair: sql<number>`count(*) filter (where status = 'in-repair')`
        })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.type, 'Peripherals')))
        .groupBy(assets.category);

      // Get "Others" type assets breakdown by category
      const othersCounts = await db
        .select({
          type: assets.type,
          category: assets.category,
          total: sql<number>`count(*)`,
          deployed: sql<number>`count(*) filter (where status = 'deployed')`,
          inStock: sql<number>`count(*) filter (where status = 'in-stock')`,
          inRepair: sql<number>`count(*) filter (where status = 'in-repair')`
        })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.type, 'Others')))
        .groupBy(assets.type, assets.category);

      // Get ticket counts
      const ticketCounts = await db
        .select({
          total: sql<number>`count(*)`,
          open: sql<number>`count(*) filter (where status = 'open')`,
          inProgress: sql<number>`count(*) filter (where status = 'in-progress')`,
          resolved: sql<number>`count(*) filter (where status = 'resolved')`,
          closed: sql<number>`count(*) filter (where status = 'closed')`
        })
        .from(tickets)
        .where(eq(tickets.tenantId, tenantId));

      // NEW: Get detailed unused hardware assets (in-stock status)
      const unusedHardwareAssets = await db
        .select({
          id: assets.id,
          name: assets.name,
          category: assets.category,
          manufacturer: assets.manufacturer,
          model: assets.model,
          purchaseDate: assets.purchaseDate,
          purchaseCost: assets.purchaseCost,
          location: assets.location
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          eq(assets.type, 'Hardware'),
          eq(assets.status, 'in-stock')
        ))
        .limit(10);

      // NEW: Get detailed unused software licenses
      const unusedSoftwareLicenses = await db
        .select({
          id: softwareLicenses.id,
          name: softwareLicenses.name,
          vendor: softwareLicenses.vendor,
          version: softwareLicenses.version,
          totalLicenses: softwareLicenses.totalLicenses,
          usedLicenses: softwareLicenses.usedLicenses,
          costPerLicense: softwareLicenses.costPerLicense,
          renewalDate: softwareLicenses.renewalDate
        })
        .from(softwareLicenses)
        .where(and(
          eq(softwareLicenses.tenantId, tenantId),
          sql`${softwareLicenses.usedLicenses} < ${softwareLicenses.totalLicenses}`
        ))
        .limit(10);

      // NEW: Get detailed expiring assets (warranties within 30 days) - using proper date comparison
      const expiringWarranties = await db
        .select({
          id: assets.id,
          name: assets.name,
          category: assets.category,
          manufacturer: assets.manufacturer,
          model: assets.model,
          serialNumber: assets.serialNumber,
          purchaseDate: assets.purchaseDate,
          warrantyExpiry: assets.warrantyExpiry,
          amcExpiry: assets.amcExpiry,
          location: assets.location,
          assignedUserName: assets.assignedUserName
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          or(
            and(
              sql`warranty_expiry IS NOT NULL`,
              sql`warranty_expiry <= current_date + interval '30 days'`,
              sql`warranty_expiry > current_date`
            ),
            and(
              sql`amc_expiry IS NOT NULL`,
              sql`amc_expiry <= current_date + interval '30 days'`,
              sql`amc_expiry > current_date`
            )
          )
        ))
        .orderBy(sql`COALESCE(warranty_expiry, amc_expiry)`)
        .limit(10);

      // NEW: Get detailed expiring software licenses from software_licenses table
      const expiringSoftwareLicensesFromTable = await db
        .select({
          id: softwareLicenses.id,
          name: softwareLicenses.name,
          vendor: softwareLicenses.vendor,
          version: softwareLicenses.version,
          licenseKey: softwareLicenses.licenseKey,
          createdAt: softwareLicenses.createdAt,
          renewalDate: softwareLicenses.renewalDate,
          totalLicenses: softwareLicenses.totalLicenses,
          costPerLicense: softwareLicenses.costPerLicense
        })
        .from(softwareLicenses)
        .where(and(
          eq(softwareLicenses.tenantId, tenantId),
          sql`renewal_date IS NOT NULL`,
          sql`renewal_date <= current_date + interval '30 days'`,
          sql`renewal_date > current_date`
        ))
        .orderBy(softwareLicenses.renewalDate)
        .limit(10);

      // ALSO get expiring Software assets from assets table (type='Software')
      const expiringSoftwareAssets = await db
        .select({
          id: assets.id,
          name: assets.name,
          vendor: assets.manufacturer, // Use manufacturer as vendor for Software assets
          version: assets.version, // Software assets have version field
          licenseKey: assets.licenseKey, // Software assets have licenseKey field
          createdAt: assets.createdAt,
          renewalDate: assets.renewalDate, // Software assets use renewalDate
          usedLicenses: assets.usedLicenses
        })
        .from(assets)
        .where(and(
          eq(assets.tenantId, tenantId),
          eq(assets.type, 'Software'),
          sql`renewal_date IS NOT NULL`,
          sql`renewal_date <= current_date + interval '30 days'`,
          sql`renewal_date > current_date`
        ))
        .orderBy(assets.renewalDate)
        .limit(10);

      // Combine both sources of expiring software licenses
      const expiringSoftwareLicenses = [
        ...expiringSoftwareLicensesFromTable,
        ...expiringSoftwareAssets.map(asset => ({
          ...asset,
          costPerLicense: null // Software assets don't have costPerLicense
        }))
      ].sort((a, b) => {
        const dateA = a.renewalDate ? new Date(a.renewalDate).getTime() : 0;
        const dateB = b.renewalDate ? new Date(b.renewalDate).getTime() : 0;
        return dateA - dateB;
      }).slice(0, 10);

      // NEW: Get recent activity logs
      const recentActivities = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          resourceType: auditLogs.resourceType,
          resourceId: auditLogs.resourceId,
          userEmail: auditLogs.userEmail,
          userRole: auditLogs.userRole,
          description: auditLogs.description,
          createdAt: auditLogs.createdAt
        })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, tenantId))
        .orderBy(sql`created_at DESC`)
        .limit(10);

      // Process results
      const assetsByType = assetTypesCounts.reduce((acc: any, item) => {
        acc[item.type] = {
          total: Number(item.total),
          deployed: Number(item.deployed),
          inStock: Number(item.inStock),
          inRepair: Number(item.inRepair),
          disposed: Number(item.disposed)
        };
        return acc;
      }, {});

      const hardwareBreakdown = hardwareCounts.reduce((acc: any, item) => {
        if (item.category) {
          acc[item.category] = {
            total: Number(item.total),
            deployed: Number(item.deployed),
            inStock: Number(item.inStock),
            inRepair: Number(item.inRepair)
          };
        }
        return acc;
      }, {});

      const peripheralBreakdown = peripheralCounts.reduce((acc: any, item) => {
        if (item.category) {
          acc[item.category] = {
            total: Number(item.total),
            deployed: Number(item.deployed),
            inStock: Number(item.inStock),
            inRepair: Number(item.inRepair)
          };
        }
        return acc;
      }, {});

      const othersBreakdown = othersCounts.reduce((acc: any, item) => {
        if (item.category) {
          acc[item.category] = {
            total: Number(item.total),
            deployed: Number(item.deployed),
            inStock: Number(item.inStock),
            inRepair: Number(item.inRepair),
            type: item.type
          };
        }
        return acc;
      }, {});

      const warrantyStatus = hardwareWarrantyStatus[0] || { 
        total: 0, warrantyExpiring: 0, warrantyExpired: 0, amcDue: 0, amcExpired: 0 
      };

      const licenseStatus = softwareStatus[0] || { 
        total: 0, assigned: 0, totalLicenses: 0, renewalDue: 0, expired: 0 
      };

      const ticketStats = ticketCounts[0] || { 
        total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 
      };

      const totalAssets = assetTypesCounts.reduce((sum, item) => sum + Number(item.total), 0);
      
      // Calculate utilization percentage for software licenses
      const utilizationPct = licenseStatus.totalLicenses > 0 
        ? Math.round((licenseStatus.assigned * 100) / licenseStatus.totalLicenses) 
        : 0;

      // Maintain backward compatibility with existing UI
      const assetStatusBreakdown = [
        { status: "deployed", count: assetTypesCounts.reduce((sum, item) => sum + Number(item.deployed), 0) },
        { status: "in-stock", count: assetTypesCounts.reduce((sum, item) => sum + Number(item.inStock), 0) },
        { status: "in-repair", count: assetTypesCounts.reduce((sum, item) => sum + Number(item.inRepair), 0) },
        { status: "disposed", count: assetTypesCounts.reduce((sum, item) => sum + Number(item.disposed), 0) }
      ];

      // Calculate comprehensive metrics for the response
      const unassignedLicenses = Math.max(0, licenseStatus.totalLicenses - licenseStatus.assigned);
      const utilizationPctFinal = licenseStatus.totalLicenses > 0 
        ? Math.round((licenseStatus.assigned * 100) / licenseStatus.totalLicenses) 
        : 0;

      // Create assetStatusCounts object for frontend compatibility
      const assetStatusCounts = {
        deployed: assetTypesCounts.reduce((sum, item) => sum + Number(item.deployed), 0),
        inStock: assetTypesCounts.reduce((sum, item) => sum + Number(item.inStock), 0),
        inRepair: assetTypesCounts.reduce((sum, item) => sum + Number(item.inRepair), 0),
        retired: assetTypesCounts.reduce((sum, item) => sum + Number(item.disposed), 0) // Map 'disposed' to 'retired' for frontend
      };

      return {
        // Legacy compatibility - maintain existing structure for current UI
        totalAssets,
        activeLicenses: licenseStatus.totalLicenses - licenseStatus.expired,
        complianceScore: totalAssets > 0 ? Math.round(((totalAssets - warrantyStatus.warrantyExpired) / totalAssets) * 100) : 100,
        assetStatusBreakdown,
        assetStatusCounts, // Add the object that frontend expects

        // Enhanced metrics for new dashboard tiles
        pendingActions: warrantyStatus.warrantyExpiring + warrantyStatus.amcDue + licenseStatus.renewalDue,
        assetsByType,
        
        // Hardware detailed breakdown
        hardware: {
          overview: assetsByType.Hardware || { total: 0, deployed: 0, inStock: 0, inRepair: 0, disposed: 0 },
          byCategory: hardwareBreakdown,
          warrantyStatus: {
            total: warrantyStatus.total,
            expiring: warrantyStatus.warrantyExpiring,
            expired: warrantyStatus.warrantyExpired,
            amcDue: warrantyStatus.amcDue,
            amcExpired: warrantyStatus.amcExpired
          }
        },

        // Software detailed breakdown
        software: {
          overview: assetsByType.Software || { total: 0, deployed: 0, inStock: 0, inRepair: 0, disposed: 0 },
          licenseStatus: {
            totalLicenses: licenseStatus.totalLicenses,
            assigned: licenseStatus.assigned,
            unassigned: unassignedLicenses,
            unutilized: unassignedLicenses, // Same as unassigned for now
            renewalDue: licenseStatus.renewalDue,
            expired: licenseStatus.expired,
            utilizationPct: utilizationPctFinal
          }
        },

        // Peripheral detailed breakdown
        peripherals: {
          overview: assetsByType.Peripherals || { total: 0, deployed: 0, inStock: 0, inRepair: 0, disposed: 0 },
          byCategory: peripheralBreakdown
        },

        // Others detailed breakdown (special categories like CCTV, access control)
        others: {
          overview: {
            total: Object.values(othersBreakdown).reduce((sum: number, item: any) => sum + Number(item.total), 0),
            deployed: Object.values(othersBreakdown).reduce((sum: number, item: any) => sum + Number(item.deployed), 0),
            inStock: Object.values(othersBreakdown).reduce((sum: number, item: any) => sum + Number(item.inStock), 0),
            inRepair: Object.values(othersBreakdown).reduce((sum: number, item: any) => sum + Number(item.inRepair), 0)
          },
          byCategory: othersBreakdown
        },

        // Ticket metrics
        tickets: ticketStats,

        // NEW: Enhanced ITAM Insights
        itamInsights: {
          // Unused Assets
          unusedAssets: {
            hardware: unusedHardwareAssets.map(asset => ({
              id: asset.id,
              name: asset.name,
              category: asset.category,
              manufacturer: asset.manufacturer,
              model: asset.model,
              purchaseDate: asset.purchaseDate,
              purchaseCost: asset.purchaseCost,
              location: asset.location,
              type: 'hardware'
            })),
            software: unusedSoftwareLicenses.map(license => ({
              id: license.id,
              name: license.name,
              vendor: license.vendor,
              version: license.version,
              totalLicenses: license.totalLicenses,
              usedLicenses: license.usedLicenses,
              availableLicenses: (license.totalLicenses || 0) - (license.usedLicenses || 0),
              costPerLicense: license.costPerLicense,
              renewalDate: license.renewalDate,
              type: 'software'
            }))
          },

          // Expiring Items
          expiringItems: {
            warranties: expiringWarranties.map(asset => ({
              id: asset.id,
              name: asset.name,
              category: asset.category,
              manufacturer: asset.manufacturer,
              model: asset.model,
              serialNumber: asset.serialNumber,
              purchaseDate: asset.purchaseDate,
              warrantyExpiry: asset.warrantyExpiry,
              amcExpiry: asset.amcExpiry,
              location: asset.location,
              assignedUser: asset.assignedUserName, // Fixed: renamed from assignedUserName
              type: 'warranty',
              expiryDate: asset.warrantyExpiry || asset.amcExpiry, // Fixed: explicit mapping
              contractType: asset.warrantyExpiry ? 'Warranty' : 'AMC' // Fixed: explicit contract type
            })),
            licenses: expiringSoftwareLicenses.map(license => ({
              id: license.id,
              name: license.name,
              vendor: license.vendor,
              version: license.version,
              licenseKey: license.licenseKey,
              purchaseDate: license.createdAt, // Use createdAt as purchase date equivalent
              renewalDate: license.renewalDate,
              totalLicenses: (license as any).totalLicenses || 0, // Only from software_licenses table
              usedLicenses: (license as any).usedLicenses || 0, // Available in both sources
              costPerLicense: (license as any).costPerLicense || null,
              type: 'license',
              expiryDate: license.renewalDate, // Fixed: explicit mapping
              contractType: 'Software License' // Fixed: explicit contract type
            }))
          },

          // Recent Activities
          recentActivities: recentActivities.map(activity => ({
            id: activity.id,
            action: activity.action,
            resourceType: activity.resourceType,
            resourceId: activity.resourceId,
            userEmail: activity.userEmail,
            userRole: activity.userRole,
            description: activity.description,
            createdAt: activity.createdAt,
            timeAgo: this.getTimeAgo(activity.createdAt)
          })),

          // Asset Age Analysis
          assetAgeAnalysis: await this.getAssetAgeAnalysis(tenantId),

          // Summary Metrics
          summary: {
            totalUnusedHardware: unusedHardwareAssets.length,
            totalUnusedLicenses: unusedSoftwareLicenses.reduce((sum, license) => sum + ((license.totalLicenses || 0) - (license.usedLicenses || 0)), 0),
            totalExpiringWarranties: expiringWarranties.length,
            totalExpiringLicenses: expiringSoftwareLicenses.length,
            totalPendingActions: (warrantyStatus.warrantyExpiring || 0) + (warrantyStatus.amcDue || 0) + (licenseStatus.renewalDue || 0),
            complianceRisk: (warrantyStatus.warrantyExpired || 0) + (licenseStatus.expired || 0) // Fixed: ensure numeric value
          }
        }
      };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      throw error;
    }
  }

  // Global Search functionality
  async performGlobalSearch(tenantId: string, query: string, searchType?: string, userRole?: string, limit: number = 10): Promise<any> {
    try {
      const results: any = {
        assets: [],
        users: [],
        vendors: [],
        locations: [],
        softwareLicenses: []
      };

      // Search assets
      if (!searchType || searchType === 'all' || searchType === 'assets') {
        results.assets = await db
          .select()
          .from(assets)
          .where(and(
            eq(assets.tenantId, tenantId),
            or(
              ilike(assets.name, `%${query}%`),
              ilike(assets.category, `%${query}%`),
              ilike(assets.manufacturer, `%${query}%`),
              ilike(assets.model, `%${query}%`),
              ilike(assets.serialNumber, `%${query}%`),
              ilike(assets.location, `%${query}%`)
            )
          ))
          .limit(limit);
      }

      // Search users (only for admin and it-manager roles)
      if (userRole === 'admin' || userRole === 'it-manager') {
        if (!searchType || searchType === 'all' || searchType === 'users') {
          results.users = await db
            .select()
            .from(users)
            .where(and(
              eq(users.tenantId, tenantId),
              or(
                ilike(users.firstName, `%${query}%`),
                ilike(users.lastName, `%${query}%`),
                ilike(users.email, `%${query}%`),
                ilike(users.username, `%${query}%`),
                ilike(users.department, `%${query}%`)
              )
            ))
            .limit(limit);
        }
      }

      // Search software licenses
      if (!searchType || searchType === 'all' || searchType === 'licenses') {
        results.softwareLicenses = await db
          .select()
          .from(softwareLicenses)
          .where(and(
            eq(softwareLicenses.tenantId, tenantId),
            or(
              ilike(softwareLicenses.name, `%${query}%`),
              ilike(softwareLicenses.vendor, `%${query}%`),
              ilike(softwareLicenses.version, `%${query}%`),
              ilike(softwareLicenses.licenseType, `%${query}%`)
            )
          ))
          .limit(limit);
      }

      // Search vendors (extract from assets and licenses)
      if (!searchType || searchType === 'all' || searchType === 'vendors') {
        const vendorAssets = await db
          .select({
            vendorName: assets.vendorName,
            vendorEmail: assets.vendorEmail,
            vendorPhone: assets.vendorPhone
          })
          .from(assets)
          .where(and(
            eq(assets.tenantId, tenantId),
            ilike(assets.vendorName, `%${query}%`)
          ))
          .groupBy(assets.vendorName, assets.vendorEmail, assets.vendorPhone)
          .limit(limit);

        const vendorLicenses = await db
          .select({
            vendorName: softwareLicenses.vendor,
            vendorEmail: sql<string>`null`,
            vendorPhone: sql<string>`null`
          })
          .from(softwareLicenses)
          .where(and(
            eq(softwareLicenses.tenantId, tenantId),
            ilike(softwareLicenses.vendor, `%${query}%`),
            isNotNull(softwareLicenses.vendor)
          ))
          .groupBy(softwareLicenses.vendor)
          .limit(limit);

        results.vendors = [...vendorAssets, ...vendorLicenses].slice(0, limit);
      }

      // Search locations (extract from assets)
      if (!searchType || searchType === 'all' || searchType === 'locations') {
        results.locations = await db
          .select({
            location: assets.location,
            count: sql<number>`count(*)`
          })
          .from(assets)
          .where(and(
            eq(assets.tenantId, tenantId),
            ilike(assets.location, `%${query}%`)
          ))
          .groupBy(assets.location)
          .limit(limit);
      }

      return { results };
    } catch (error) {
      console.error('Error performing global search:', error);
      throw error;
    }
  }

  // Enrollment Tokens
  async createEnrollmentToken(token: InsertEnrollmentToken): Promise<EnrollmentToken> {
    const [newToken] = await db.insert(enrollmentTokens).values(token).returning();
    return newToken;
  }

  async getEnrollmentToken(id: string, tenantId: string): Promise<EnrollmentToken | undefined> {
    const [token] = await db.select().from(enrollmentTokens).where(
      and(eq(enrollmentTokens.id, id), eq(enrollmentTokens.tenantId, tenantId))
    );
    return token || undefined;
  }

  async getEnrollmentTokenByToken(token: string): Promise<EnrollmentToken | undefined> {
    const [enrollmentToken] = await db.select().from(enrollmentTokens).where(
      eq(enrollmentTokens.token, token)
    );
    return enrollmentToken || undefined;
  }

  async getEnrollmentTokens(tenantId: string): Promise<EnrollmentToken[]> {
    return await db.select().from(enrollmentTokens).where(
      eq(enrollmentTokens.tenantId, tenantId)
    ).orderBy(desc(enrollmentTokens.createdAt));
  }

  async updateEnrollmentToken(id: string, tenantId: string, updates: Partial<InsertEnrollmentToken>): Promise<EnrollmentToken | undefined> {
    const [updated] = await db.update(enrollmentTokens)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(enrollmentTokens.id, id), eq(enrollmentTokens.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  // Enrollment Session methods (for nonce-based PKG downloads)
  async createEnrollmentSession(nonce: string, data: {
    tenantId: string;
    tenantToken: string;
    userAgent: string;
    ipHash: string;
    status: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<void> {
    await db.insert(enrollmentSessions).values({
      nonce,
      tenantId: data.tenantId,
      tenantToken: data.tenantToken,
      userAgent: data.userAgent,
      ipHash: data.ipHash,
      status: data.status,
      expiresAt: new Date(data.expiresAt)
    });
  }

  async getEnrollmentSession(nonce: string): Promise<any> {
    const [session] = await db.select().from(enrollmentSessions).where(
      and(
        eq(enrollmentSessions.nonce, nonce),
        gt(enrollmentSessions.expiresAt, new Date())
      )
    );
    return session;
  }

  async consumeEnrollmentSession(nonce: string, deviceInfo: {
    serial: string;
    hostname: string;
    osv: string;
    claimedAt: string;
  }): Promise<void> {
    await db.update(enrollmentSessions)
      .set({
        status: 'consumed',
        serial: deviceInfo.serial,
        hostname: deviceInfo.hostname,
        osv: deviceInfo.osv,
        claimedAt: new Date(deviceInfo.claimedAt)
      })
      .where(eq(enrollmentSessions.nonce, nonce));
  }

  async deleteEnrollmentToken(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(enrollmentTokens).where(
      and(eq(enrollmentTokens.id, id), eq(enrollmentTokens.tenantId, tenantId))
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async incrementEnrollmentTokenUsage(token: string): Promise<void> {
    await db.update(enrollmentTokens)
      .set({
        usageCount: sql`${enrollmentTokens.usageCount} + 1`,
        lastUsedAt: new Date()
      })
      .where(eq(enrollmentTokens.token, token));
  }

  // ============================================================================
  // SaaS Governance (Phase 0)
  // ============================================================================

  // SaaS Apps
  async getSaasApps(tenantId: string, filters?: {approvalStatus?: string; category?: string; search?: string}): Promise<SaasApp[]> {
    const conditions = [eq(saasApps.tenantId, tenantId)];

    if (filters?.approvalStatus) {
      conditions.push(eq(saasApps.approvalStatus, filters.approvalStatus));
    }
    if (filters?.category) {
      conditions.push(eq(saasApps.category, filters.category));
    }
    if (filters?.search) {
      conditions.push(or(
        ilike(saasApps.name, `%${filters.search}%`),
        ilike(saasApps.vendor, `%${filters.search}%`)
      ) as any);
    }

    return db.select().from(saasApps).where(and(...conditions)).orderBy(desc(saasApps.createdAt));
  }

  async getSaasApp(id: string, tenantId: string): Promise<SaasApp | undefined> {
    const [app] = await db.select().from(saasApps).where(and(eq(saasApps.id, id), eq(saasApps.tenantId, tenantId)));
    return app;
  }

  async createSaasApp(app: InsertSaasApp): Promise<SaasApp> {
    const [created] = await db.insert(saasApps).values(app).returning();
    return created;
  }

  async updateSaasApp(id: string, tenantId: string, app: Partial<InsertSaasApp>): Promise<SaasApp | undefined> {
    const [updated] = await db.update(saasApps)
      .set({ ...app, updatedAt: new Date() })
      .where(and(eq(saasApps.id, id), eq(saasApps.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSaasApp(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(saasApps).where(and(eq(saasApps.id, id), eq(saasApps.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateSaasAppApprovalStatus(id: string, tenantId: string, status: string): Promise<SaasApp | undefined> {
    const [updated] = await db.update(saasApps)
      .set({ approvalStatus: status, updatedAt: new Date() })
      .where(and(eq(saasApps.id, id), eq(saasApps.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async getSaasAppUsers(appId: string, tenantId: string): Promise<UserAppAccess[]> {
    return db.select().from(userAppAccess)
      .where(and(eq(userAppAccess.appId, appId), eq(userAppAccess.tenantId, tenantId)))
      .orderBy(desc(userAppAccess.createdAt));
  }

  async getSaasAppStats(tenantId: string): Promise<any> {
    const apps = await db.select().from(saasApps).where(eq(saasApps.tenantId, tenantId));
    const total = apps.length;
    const approved = apps.filter(a => a.approvalStatus === 'approved').length;
    const pending = apps.filter(a => a.approvalStatus === 'pending').length;
    const denied = apps.filter(a => a.approvalStatus === 'denied').length;
    const highRisk = apps.filter(a => (a.riskScore || 0) >= 70).length;

    return { totalApps: total, approvedApps: approved, pendingApps: pending, highRiskApps: highRisk };
  }

  // SaaS Contracts
  async getSaasContracts(tenantId: string, filters?: {status?: string; appId?: string}): Promise<SaasContract[]> {
    const conditions = [eq(saasContracts.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(saasContracts.status, filters.status));
    }
    if (filters?.appId) {
      conditions.push(eq(saasContracts.appId, filters.appId));
    }

    return db.select().from(saasContracts).where(and(...conditions)).orderBy(desc(saasContracts.createdAt));
  }

  async getSaasContract(id: string, tenantId: string): Promise<SaasContract | undefined> {
    const [contract] = await db.select().from(saasContracts)
      .where(and(eq(saasContracts.id, id), eq(saasContracts.tenantId, tenantId)));
    return contract;
  }

  async createSaasContract(contract: InsertSaasContract): Promise<SaasContract> {
    const [created] = await db.insert(saasContracts).values(contract).returning();
    return created;
  }

  async updateSaasContract(id: string, tenantId: string, contract: Partial<InsertSaasContract>): Promise<SaasContract | undefined> {
    const [updated] = await db.update(saasContracts)
      .set({ ...contract, updatedAt: new Date() })
      .where(and(eq(saasContracts.id, id), eq(saasContracts.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSaasContract(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(saasContracts)
      .where(and(eq(saasContracts.id, id), eq(saasContracts.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getUpcomingRenewals(tenantId: string, days: number): Promise<SaasContract[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return db.select().from(saasContracts)
      .where(and(
        eq(saasContracts.tenantId, tenantId),
        eq(saasContracts.status, 'active'),
        isNotNull(saasContracts.renewalDate),
        sql`${saasContracts.renewalDate} <= ${futureDate}`
      ))
      .orderBy(saasContracts.renewalDate);
  }

  async updateRenewalAlerted(id: string, tenantId: string): Promise<SaasContract | undefined> {
    const [updated] = await db.update(saasContracts)
      .set({ renewalAlerted: true, updatedAt: new Date() })
      .where(and(eq(saasContracts.id, id), eq(saasContracts.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // User App Access
  async getUserAppAccesses(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<UserAppAccess[]> {
    const conditions = [eq(userAppAccess.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(userAppAccess.userId, filters.userId));
    }
    if (filters?.appId) {
      conditions.push(eq(userAppAccess.appId, filters.appId));
    }
    if (filters?.status) {
      conditions.push(eq(userAppAccess.status, filters.status));
    }

    return db.select().from(userAppAccess).where(and(...conditions)).orderBy(desc(userAppAccess.createdAt));
  }

  async getUserAppAccess(id: string, tenantId: string): Promise<UserAppAccess | undefined> {
    const [access] = await db.select().from(userAppAccess)
      .where(and(eq(userAppAccess.id, id), eq(userAppAccess.tenantId, tenantId)));
    return access;
  }

  async createUserAppAccess(access: InsertUserAppAccess): Promise<UserAppAccess> {
    const [created] = await db.insert(userAppAccess).values(access).returning();
    return created;
  }

  async updateUserAppAccess(id: string, tenantId: string, access: Partial<InsertUserAppAccess>): Promise<UserAppAccess | undefined> {
    const [updated] = await db.update(userAppAccess)
      .set({ ...access, updatedAt: new Date() })
      .where(and(eq(userAppAccess.id, id), eq(userAppAccess.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteUserAppAccess(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(userAppAccess)
      .where(and(eq(userAppAccess.id, id), eq(userAppAccess.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async revokeUserAppAccess(id: string, tenantId: string, revokedBy: string): Promise<UserAppAccess | undefined> {
    const [updated] = await db.update(userAppAccess)
      .set({
        status: 'revoked',
        accessRevokedDate: new Date(),
        assignedBy: revokedBy,
        updatedAt: new Date()
      })
      .where(and(eq(userAppAccess.id, id), eq(userAppAccess.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // OAuth Tokens
  async getOauthTokens(tenantId: string, filters?: {userId?: string; appId?: string; status?: string; riskLevel?: string}): Promise<OauthToken[]> {
    const conditions = [eq(oauthTokens.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(oauthTokens.userId, filters.userId));
    }
    if (filters?.appId) {
      conditions.push(eq(oauthTokens.appId, filters.appId));
    }
    if (filters?.status) {
      conditions.push(eq(oauthTokens.status, filters.status));
    }
    if (filters?.riskLevel) {
      conditions.push(eq(oauthTokens.riskLevel, filters.riskLevel));
    }

    return db.select().from(oauthTokens).where(and(...conditions)).orderBy(desc(oauthTokens.createdAt));
  }

  async getOauthToken(id: string, tenantId: string): Promise<OauthToken | undefined> {
    const [token] = await db.select().from(oauthTokens)
      .where(and(eq(oauthTokens.id, id), eq(oauthTokens.tenantId, tenantId)));
    return token;
  }

  async createOauthToken(token: InsertOauthToken): Promise<OauthToken> {
    const [created] = await db.insert(oauthTokens).values(token).returning();
    return created;
  }

  async updateOauthToken(id: string, tenantId: string, token: Partial<InsertOauthToken>): Promise<OauthToken | undefined> {
    const [updated] = await db.update(oauthTokens)
      .set({ ...token, updatedAt: new Date() })
      .where(and(eq(oauthTokens.id, id), eq(oauthTokens.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteOauthToken(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(oauthTokens)
      .where(and(eq(oauthTokens.id, id), eq(oauthTokens.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async revokeOauthToken(id: string, tenantId: string, revokedBy: string, reason: string): Promise<OauthToken | undefined> {
    const [updated] = await db.update(oauthTokens)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy,
        revocationReason: reason,
        updatedAt: new Date()
      })
      .where(and(eq(oauthTokens.id, id), eq(oauthTokens.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Identity Providers
  async getIdentityProviders(tenantId: string): Promise<IdentityProvider[]> {
    return db.select().from(identityProviders)
      .where(eq(identityProviders.tenantId, tenantId))
      .orderBy(desc(identityProviders.createdAt));
  }

  async getIdentityProvider(id: string, tenantId: string): Promise<IdentityProvider | undefined> {
    const [provider] = await db.select().from(identityProviders)
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, tenantId)));
    return provider;
  }

  async getIdentityProviderByType(type: string, tenantId: string): Promise<IdentityProvider | undefined> {
    const [provider] = await db.select().from(identityProviders)
      .where(and(eq(identityProviders.type, type), eq(identityProviders.tenantId, tenantId)));
    return provider;
  }

  async createIdentityProvider(provider: InsertIdentityProvider): Promise<IdentityProvider> {
    const [created] = await db.insert(identityProviders).values(provider).returning();
    return created;
  }

  async updateIdentityProvider(id: string, tenantId: string, provider: Partial<InsertIdentityProvider>): Promise<IdentityProvider | undefined> {
    const [updated] = await db.update(identityProviders)
      .set({ ...provider, updatedAt: new Date() })
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteIdentityProvider(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(identityProviders)
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateIdpSyncStatus(id: string, tenantId: string, status: string, error?: string): Promise<IdentityProvider | undefined> {
    const [updated] = await db.update(identityProviders)
      .set({
        syncStatus: status,
        syncError: error || null,
        lastSyncAt: status === 'idle' ? new Date() : undefined,
        updatedAt: new Date()
      })
      .where(and(eq(identityProviders.id, id), eq(identityProviders.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // SaaS Invoices
  async getSaasInvoices(tenantId: string, filters?: {status?: string; appId?: string}): Promise<SaasInvoice[]> {
    const conditions = [eq(saasInvoices.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(saasInvoices.status, filters.status));
    }
    if (filters?.appId) {
      conditions.push(eq(saasInvoices.appId, filters.appId));
    }

    return db.select().from(saasInvoices).where(and(...conditions)).orderBy(desc(saasInvoices.invoiceDate));
  }

  async getSaasInvoice(id: string, tenantId: string): Promise<SaasInvoice | undefined> {
    const [invoice] = await db.select().from(saasInvoices)
      .where(and(eq(saasInvoices.id, id), eq(saasInvoices.tenantId, tenantId)));
    return invoice;
  }

  async getSaasInvoiceByExternalId(externalId: string, tenantId: string): Promise<SaasInvoice | undefined> {
    const [invoice] = await db.select().from(saasInvoices)
      .where(and(eq(saasInvoices.externalId, externalId), eq(saasInvoices.tenantId, tenantId)));
    return invoice;
  }

  async createSaasInvoice(invoice: InsertSaasInvoice): Promise<SaasInvoice> {
    const [created] = await db.insert(saasInvoices).values(invoice).returning();
    return created;
  }

  async updateSaasInvoice(id: string, tenantId: string, invoice: Partial<InsertSaasInvoice>): Promise<SaasInvoice | undefined> {
    const [updated] = await db.update(saasInvoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(and(eq(saasInvoices.id, id), eq(saasInvoices.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSaasInvoice(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(saasInvoices)
      .where(and(eq(saasInvoices.id, id), eq(saasInvoices.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Governance Policies
  async getGovernancePolicies(tenantId: string, filters?: {policyType?: string; enabled?: boolean}): Promise<GovernancePolicy[]> {
    const conditions = [eq(governancePolicies.tenantId, tenantId)];

    if (filters?.policyType) {
      conditions.push(eq(governancePolicies.policyType, filters.policyType));
    }
    if (filters?.enabled !== undefined) {
      conditions.push(eq(governancePolicies.enabled, filters.enabled));
    }

    return db.select().from(governancePolicies).where(and(...conditions)).orderBy(desc(governancePolicies.priority));
  }

  async getGovernancePolicy(id: string, tenantId: string): Promise<GovernancePolicy | undefined> {
    const [policy] = await db.select().from(governancePolicies)
      .where(and(eq(governancePolicies.id, id), eq(governancePolicies.tenantId, tenantId)));
    return policy;
  }

  async createGovernancePolicy(policy: InsertGovernancePolicy): Promise<GovernancePolicy> {
    const [created] = await db.insert(governancePolicies).values(policy).returning();
    return created;
  }

  async updateGovernancePolicy(id: string, tenantId: string, policy: Partial<InsertGovernancePolicy>): Promise<GovernancePolicy | undefined> {
    const [updated] = await db.update(governancePolicies)
      .set({ ...policy, updatedAt: new Date() })
      .where(and(eq(governancePolicies.id, id), eq(governancePolicies.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteGovernancePolicy(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(governancePolicies)
      .where(and(eq(governancePolicies.id, id), eq(governancePolicies.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async toggleGovernancePolicy(id: string, tenantId: string, enabled: boolean): Promise<GovernancePolicy | undefined> {
    const [updated] = await db.update(governancePolicies)
      .set({ enabled, updatedAt: new Date() })
      .where(and(eq(governancePolicies.id, id), eq(governancePolicies.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Automated Policies (Phase 4)
  async getAutomatedPolicies(tenantId: string, filters?: {triggerType?: string; enabled?: boolean}): Promise<AutomatedPolicy[]> {
    const conditions = [eq(automatedPolicies.tenantId, tenantId)];

    if (filters?.triggerType) {
      conditions.push(eq(automatedPolicies.triggerType, filters.triggerType));
    }
    if (filters?.enabled !== undefined) {
      conditions.push(eq(automatedPolicies.enabled, filters.enabled));
    }

    return db.select().from(automatedPolicies)
      .where(and(...conditions))
      .orderBy(desc(automatedPolicies.priority), desc(automatedPolicies.createdAt));
  }

  async getAutomatedPolicy(id: string, tenantId: string): Promise<AutomatedPolicy | undefined> {
    const [policy] = await db.select().from(automatedPolicies)
      .where(and(eq(automatedPolicies.id, id), eq(automatedPolicies.tenantId, tenantId)));
    return policy;
  }

  async createAutomatedPolicy(policy: InsertAutomatedPolicy): Promise<AutomatedPolicy> {
    const [created] = await db.insert(automatedPolicies).values(policy).returning();
    return created;
  }

  async updateAutomatedPolicy(id: string, tenantId: string, policy: Partial<InsertAutomatedPolicy>): Promise<AutomatedPolicy | undefined> {
    const [updated] = await db.update(automatedPolicies)
      .set({ ...policy, updatedAt: new Date() })
      .where(and(eq(automatedPolicies.id, id), eq(automatedPolicies.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteAutomatedPolicy(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(automatedPolicies)
      .where(and(eq(automatedPolicies.id, id), eq(automatedPolicies.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updatePolicyStats(id: string, tenantId: string, status: 'success' | 'partial' | 'failed'): Promise<void> {
    const policy = await this.getAutomatedPolicy(id, tenantId);
    if (!policy) return;

    const updates: Partial<InsertAutomatedPolicy> = {
      executionCount: (policy.executionCount || 0) + 1,
      lastExecutedAt: new Date()
    };

    if (status === 'success') {
      updates.successCount = (policy.successCount || 0) + 1;
    } else {
      updates.failureCount = (policy.failureCount || 0) + 1;
    }

    await this.updateAutomatedPolicy(id, tenantId, updates);
  }

  // Policy Executions (Phase 4)
  async getPolicyExecutions(tenantId: string, filters?: {policyId?: string; status?: string}): Promise<PolicyExecution[]> {
    const conditions = [eq(policyExecutions.tenantId, tenantId)];

    if (filters?.policyId) {
      conditions.push(eq(policyExecutions.policyId, filters.policyId));
    }
    if (filters?.status) {
      conditions.push(eq(policyExecutions.status, filters.status));
    }

    return db.select().from(policyExecutions)
      .where(and(...conditions))
      .orderBy(desc(policyExecutions.createdAt))
      .limit(100); // Limit to recent 100 executions
  }

  async getPolicyExecution(id: string, tenantId: string): Promise<PolicyExecution | undefined> {
    const [execution] = await db.select().from(policyExecutions)
      .where(and(eq(policyExecutions.id, id), eq(policyExecutions.tenantId, tenantId)));
    return execution;
  }

  async createPolicyExecution(execution: InsertPolicyExecution): Promise<PolicyExecution> {
    const [created] = await db.insert(policyExecutions).values(execution).returning();
    return created;
  }

  async updatePolicyExecution(id: string, tenantId: string, updates: Partial<InsertPolicyExecution>): Promise<PolicyExecution | undefined> {
    const [updated] = await db.update(policyExecutions)
      .set(updates)
      .where(and(eq(policyExecutions.id, id), eq(policyExecutions.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Policy Templates (Phase 4)
  async getPolicyTemplates(filters?: {category?: string}): Promise<PolicyTemplate[]> {
    const conditions = [];

    if (filters?.category) {
      conditions.push(eq(policyTemplates.category, filters.category));
    }

    const query = conditions.length > 0
      ? db.select().from(policyTemplates).where(and(...conditions))
      : db.select().from(policyTemplates);

    return query.orderBy(desc(policyTemplates.popularity), policyTemplates.name);
  }

  async getPolicyTemplate(id: string): Promise<PolicyTemplate | undefined> {
    const [template] = await db.select().from(policyTemplates)
      .where(eq(policyTemplates.id, id));
    return template;
  }

  async incrementTemplatePopularity(id: string): Promise<void> {
    await db.update(policyTemplates)
      .set({ popularity: sql`${policyTemplates.popularity} + 1` })
      .where(eq(policyTemplates.id, id));
  }

  // ============================================
  // Phase 5: Identity Governance & Access Reviews
  // ============================================

  // Access Review Campaigns (Phase 5)
  async getAccessReviewCampaigns(tenantId: string, filters?: {status?: string}): Promise<AccessReviewCampaign[]> {
    const conditions = [eq(accessReviewCampaigns.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(accessReviewCampaigns.status, filters.status));
    }

    return db.select().from(accessReviewCampaigns)
      .where(and(...conditions))
      .orderBy(desc(accessReviewCampaigns.createdAt));
  }

  async getAccessReviewCampaign(id: string, tenantId: string): Promise<AccessReviewCampaign | undefined> {
    const [campaign] = await db.select().from(accessReviewCampaigns)
      .where(and(eq(accessReviewCampaigns.id, id), eq(accessReviewCampaigns.tenantId, tenantId)));
    return campaign;
  }

  async createAccessReviewCampaign(campaign: InsertAccessReviewCampaign): Promise<AccessReviewCampaign> {
    const [created] = await db.insert(accessReviewCampaigns).values(campaign).returning();
    return created;
  }

  async updateAccessReviewCampaign(id: string, tenantId: string, updates: Partial<InsertAccessReviewCampaign>): Promise<AccessReviewCampaign | undefined> {
    const [updated] = await db.update(accessReviewCampaigns)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(accessReviewCampaigns.id, id), eq(accessReviewCampaigns.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteAccessReviewCampaign(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(accessReviewCampaigns)
      .where(and(eq(accessReviewCampaigns.id, id), eq(accessReviewCampaigns.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Access Review Items (Phase 5)
  async getAccessReviewItems(campaignId: string): Promise<AccessReviewItem[]> {
    return db.select().from(accessReviewItems)
      .where(eq(accessReviewItems.campaignId, campaignId))
      .orderBy(desc(accessReviewItems.riskLevel), accessReviewItems.userName);
  }

  async getAccessReviewItem(id: string): Promise<AccessReviewItem | undefined> {
    const [item] = await db.select().from(accessReviewItems)
      .where(eq(accessReviewItems.id, id));
    return item;
  }

  async getAccessReviewItemsPending(campaignId: string): Promise<AccessReviewItem[]> {
    return db.select().from(accessReviewItems)
      .where(and(
        eq(accessReviewItems.campaignId, campaignId),
        eq(accessReviewItems.decision, 'pending')
      ))
      .orderBy(desc(accessReviewItems.riskLevel), accessReviewItems.userName);
  }

  async createAccessReviewItem(item: InsertAccessReviewItem): Promise<AccessReviewItem> {
    const [created] = await db.insert(accessReviewItems).values(item).returning();
    return created;
  }

  async updateAccessReviewItem(id: string, updates: Partial<InsertAccessReviewItem>): Promise<AccessReviewItem | undefined> {
    const [updated] = await db.update(accessReviewItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accessReviewItems.id, id))
      .returning();
    return updated;
  }

  // Access Review Decisions (Phase 5)
  async getAccessReviewDecisions(campaignId: string): Promise<AccessReviewDecision[]> {
    return db.select().from(accessReviewDecisions)
      .where(eq(accessReviewDecisions.campaignId, campaignId))
      .orderBy(desc(accessReviewDecisions.createdAt));
  }

  async createAccessReviewDecision(decision: InsertAccessReviewDecision): Promise<AccessReviewDecision> {
    const [created] = await db.insert(accessReviewDecisions).values(decision).returning();
    return created;
  }

  // Role Templates (Phase 5)
  async getRoleTemplates(tenantId: string, filters?: {department?: string}): Promise<RoleTemplate[]> {
    const conditions = [eq(roleTemplates.tenantId, tenantId)];

    if (filters?.department) {
      conditions.push(eq(roleTemplates.department, filters.department));
    }

    return db.select().from(roleTemplates)
      .where(and(...conditions))
      .orderBy(roleTemplates.name);
  }

  async getRoleTemplate(id: string, tenantId: string): Promise<RoleTemplate | undefined> {
    const [template] = await db.select().from(roleTemplates)
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.tenantId, tenantId)));
    return template;
  }

  async createRoleTemplate(template: InsertRoleTemplate): Promise<RoleTemplate> {
    const [created] = await db.insert(roleTemplates).values(template).returning();
    return created;
  }

  async updateRoleTemplate(id: string, tenantId: string, updates: Partial<InsertRoleTemplate>): Promise<RoleTemplate | undefined> {
    const [updated] = await db.update(roleTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteRoleTemplate(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(roleTemplates)
      .where(and(eq(roleTemplates.id, id), eq(roleTemplates.tenantId, tenantId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // User Role Assignments (Phase 5)
  async getUserRoleAssignments(tenantId: string, filters?: {userId?: string; isActive?: boolean}): Promise<UserRoleAssignment[]> {
    const conditions = [eq(userRoleAssignments.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(userRoleAssignments.userId, filters.userId));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(userRoleAssignments.isActive, filters.isActive));
    }

    return db.select().from(userRoleAssignments)
      .where(and(...conditions))
      .orderBy(desc(userRoleAssignments.createdAt));
  }

  async getUserRoleAssignment(id: string, tenantId: string): Promise<UserRoleAssignment | undefined> {
    const [assignment] = await db.select().from(userRoleAssignments)
      .where(and(eq(userRoleAssignments.id, id), eq(userRoleAssignments.tenantId, tenantId)));
    return assignment;
  }

  async createUserRoleAssignment(assignment: InsertUserRoleAssignment): Promise<UserRoleAssignment> {
    const [created] = await db.insert(userRoleAssignments).values(assignment).returning();
    return created;
  }

  async updateUserRoleAssignment(id: string, tenantId: string, updates: Partial<InsertUserRoleAssignment>): Promise<UserRoleAssignment | undefined> {
    const [updated] = await db.update(userRoleAssignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(userRoleAssignments.id, id), eq(userRoleAssignments.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Privilege Drift Alerts (Phase 5)
  async getPrivilegeDriftAlerts(tenantId: string, filters?: {status?: string; riskLevel?: string}): Promise<PrivilegeDriftAlert[]> {
    const conditions = [eq(privilegeDriftAlerts.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(privilegeDriftAlerts.status, filters.status));
    }
    if (filters?.riskLevel) {
      conditions.push(eq(privilegeDriftAlerts.riskLevel, filters.riskLevel));
    }

    return db.select().from(privilegeDriftAlerts)
      .where(and(...conditions))
      .orderBy(desc(privilegeDriftAlerts.riskScore), desc(privilegeDriftAlerts.detectedAt));
  }

  async getPrivilegeDriftAlert(id: string, tenantId: string): Promise<PrivilegeDriftAlert | undefined> {
    const [alert] = await db.select().from(privilegeDriftAlerts)
      .where(and(eq(privilegeDriftAlerts.id, id), eq(privilegeDriftAlerts.tenantId, tenantId)));
    return alert;
  }

  async createPrivilegeDriftAlert(alert: InsertPrivilegeDriftAlert): Promise<PrivilegeDriftAlert> {
    const [created] = await db.insert(privilegeDriftAlerts).values(alert).returning();
    return created;
  }

  async updatePrivilegeDriftAlert(id: string, tenantId: string, updates: Partial<InsertPrivilegeDriftAlert>): Promise<PrivilegeDriftAlert | undefined> {
    const [updated] = await db.update(privilegeDriftAlerts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(privilegeDriftAlerts.id, id), eq(privilegeDriftAlerts.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Overprivileged Accounts (Phase 5)
  async getOverprivilegedAccounts(tenantId: string, filters?: {status?: string; riskLevel?: string}): Promise<OverprivilegedAccount[]> {
    const conditions = [eq(overprivilegedAccounts.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(overprivilegedAccounts.status, filters.status));
    }
    if (filters?.riskLevel) {
      conditions.push(eq(overprivilegedAccounts.riskLevel, filters.riskLevel));
    }

    return db.select().from(overprivilegedAccounts)
      .where(and(...conditions))
      .orderBy(desc(overprivilegedAccounts.riskScore), desc(overprivilegedAccounts.detectedAt));
  }

  async getOverprivilegedAccount(id: string, tenantId: string): Promise<OverprivilegedAccount | undefined> {
    const [account] = await db.select().from(overprivilegedAccounts)
      .where(and(eq(overprivilegedAccounts.id, id), eq(overprivilegedAccounts.tenantId, tenantId)));
    return account;
  }

  async createOverprivilegedAccount(account: InsertOverprivilegedAccount): Promise<OverprivilegedAccount> {
    const [created] = await db.insert(overprivilegedAccounts).values(account).returning();
    return created;
  }

  async updateOverprivilegedAccount(id: string, tenantId: string, updates: Partial<InsertOverprivilegedAccount>): Promise<OverprivilegedAccount | undefined> {
    const [updated] = await db.update(overprivilegedAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(overprivilegedAccounts.id, id), eq(overprivilegedAccounts.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Helper methods for Phase 5
  async getAllUserAppAccess(tenantId: string): Promise<any[]> {
    // Get all user-app access for the tenant
    const userAccess = await db.select({
      userId: userAppAccess.userId,
      userName: users.name,
      userEmail: users.email,
      userDepartment: users.department,
      userManager: users.manager,
      appId: userAppAccess.appId,
      appName: saasApps.name,
      appCategory: saasApps.category,
      accessType: userAppAccess.accessType,
      grantedDate: userAppAccess.accessGrantedDate,
      lastAccessDate: userAppAccess.lastAccessDate,
      businessJustification: userAppAccess.businessJustification,
    })
    .from(userAppAccess)
    .leftJoin(users, eq(userAppAccess.userId, users.id))
    .leftJoin(saasApps, and(
      eq(userAppAccess.appId, saasApps.id),
      eq(saasApps.tenantId, tenantId)
    ))
    .where(and(
      eq(userAppAccess.tenantId, tenantId),
      eq(userAppAccess.status, 'active')
    ))
    .orderBy(users.name, saasApps.name);

    return userAccess;
  }

  async updateUserAppAccessType(userId: string, appId: string, tenantId: string, newAccessType: string): Promise<void> {
    await db.update(userAppAccess)
      .set({
        accessType: newAccessType,
        updatedAt: new Date()
      })
      .where(and(
        eq(userAppAccess.userId, userId),
        eq(userAppAccess.appId, appId),
        eq(userAppAccess.tenantId, tenantId)
      ));
  }

  async getUsers(tenantId: string): Promise<User[]> {
    return db.select().from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(users.name);
  }

  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(tenants.name);
  }

  // ============================================================================
  // Phase 6: Advanced Features & AI Intelligence
  // ============================================================================

  // Access Requests (Phase 6.1)
  async getAccessRequests(tenantId: string, filters?: {status?: string; requesterId?: string; approverId?: string}): Promise<AccessRequest[]> {
    const conditions = [eq(accessRequests.tenantId, tenantId)];

    if (filters?.status) {
      conditions.push(eq(accessRequests.status, filters.status));
    }
    if (filters?.requesterId) {
      conditions.push(eq(accessRequests.requesterId, filters.requesterId));
    }
    if (filters?.approverId) {
      conditions.push(eq(accessRequests.approverId, filters.approverId));
    }

    return db.select().from(accessRequests)
      .where(and(...conditions))
      .orderBy(desc(accessRequests.createdAt));
  }

  async getAccessRequest(id: string, tenantId: string): Promise<AccessRequest | undefined> {
    const [request] = await db.select().from(accessRequests)
      .where(and(eq(accessRequests.id, id), eq(accessRequests.tenantId, tenantId)));
    return request;
  }

  async getAccessRequestsPendingForApprover(approverId: string, tenantId: string): Promise<AccessRequest[]> {
    return db.select().from(accessRequests)
      .where(and(
        eq(accessRequests.tenantId, tenantId),
        eq(accessRequests.approverId, approverId),
        eq(accessRequests.status, 'pending')
      ))
      .orderBy(desc(accessRequests.createdAt));
  }

  async getAccessRequestsByRequester(requesterId: string, tenantId: string): Promise<AccessRequest[]> {
    return db.select().from(accessRequests)
      .where(and(
        eq(accessRequests.tenantId, tenantId),
        eq(accessRequests.requesterId, requesterId)
      ))
      .orderBy(desc(accessRequests.createdAt));
  }

  async createAccessRequest(request: InsertAccessRequest): Promise<AccessRequest> {
    const [created] = await db.insert(accessRequests).values(request).returning();
    return created;
  }

  async updateAccessRequest(id: string, tenantId: string, updates: Partial<InsertAccessRequest>): Promise<AccessRequest | undefined> {
    const [updated] = await db.update(accessRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(accessRequests.id, id), eq(accessRequests.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteAccessRequest(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(accessRequests)
      .where(and(eq(accessRequests.id, id), eq(accessRequests.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // JIT Access Sessions (Phase 6.2)
  async getJitAccessSessions(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<JitAccessSession[]> {
    const conditions = [eq(jitAccessSessions.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(jitAccessSessions.userId, filters.userId));
    }
    if (filters?.appId) {
      conditions.push(eq(jitAccessSessions.appId, filters.appId));
    }
    if (filters?.status) {
      conditions.push(eq(jitAccessSessions.status, filters.status));
    }

    return db.select().from(jitAccessSessions)
      .where(and(...conditions))
      .orderBy(desc(jitAccessSessions.createdAt));
  }

  async getJitAccessSession(id: string, tenantId: string): Promise<JitAccessSession | undefined> {
    const [session] = await db.select().from(jitAccessSessions)
      .where(and(eq(jitAccessSessions.id, id), eq(jitAccessSessions.tenantId, tenantId)));
    return session;
  }

  async getActiveJitSessions(tenantId: string): Promise<JitAccessSession[]> {
    const now = new Date();
    return db.select().from(jitAccessSessions)
      .where(and(
        eq(jitAccessSessions.tenantId, tenantId),
        eq(jitAccessSessions.status, 'active'),
        gt(jitAccessSessions.expiresAt, now)
      ))
      .orderBy(jitAccessSessions.expiresAt);
  }

  async getExpiredJitSessions(tenantId: string): Promise<JitAccessSession[]> {
    const now = new Date();
    return db.select().from(jitAccessSessions)
      .where(and(
        eq(jitAccessSessions.tenantId, tenantId),
        eq(jitAccessSessions.status, 'active'),
        sql`${jitAccessSessions.expiresAt} < ${now}`
      ))
      .orderBy(jitAccessSessions.expiresAt);
  }

  async createJitAccessSession(session: InsertJitAccessSession): Promise<JitAccessSession> {
    const [created] = await db.insert(jitAccessSessions).values(session).returning();
    return created;
  }

  async updateJitAccessSession(id: string, tenantId: string, updates: Partial<InsertJitAccessSession>): Promise<JitAccessSession | undefined> {
    const [updated] = await db.update(jitAccessSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(jitAccessSessions.id, id), eq(jitAccessSessions.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteJitAccessSession(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(jitAccessSessions)
      .where(and(eq(jitAccessSessions.id, id), eq(jitAccessSessions.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Segregation of Duties Rules (Phase 6.3)
  async getSodRules(tenantId: string, filters?: {isActive?: boolean; severity?: string}): Promise<SodRule[]> {
    const conditions = [eq(sodRules.tenantId, tenantId)];

    if (filters?.isActive !== undefined) {
      conditions.push(eq(sodRules.isActive, filters.isActive));
    }
    if (filters?.severity) {
      conditions.push(eq(sodRules.severity, filters.severity));
    }

    return db.select().from(sodRules)
      .where(and(...conditions))
      .orderBy(desc(sodRules.severity), sodRules.name);
  }

  async getSodRule(id: string, tenantId: string): Promise<SodRule | undefined> {
    const [rule] = await db.select().from(sodRules)
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)));
    return rule;
  }

  async createSodRule(rule: InsertSodRule): Promise<SodRule> {
    const [created] = await db.insert(sodRules).values(rule).returning();
    return created;
  }

  async updateSodRule(id: string, tenantId: string, updates: Partial<InsertSodRule>): Promise<SodRule | undefined> {
    const [updated] = await db.update(sodRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSodRule(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(sodRules)
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async toggleSodRule(id: string, tenantId: string, isActive: boolean): Promise<SodRule | undefined> {
    const [updated] = await db.update(sodRules)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // SoD Violations (Phase 6.3)
  async getSodViolations(tenantId: string, filters?: {userId?: string; status?: string; severity?: string}): Promise<SodViolation[]> {
    const conditions = [eq(sodViolations.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(sodViolations.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(sodViolations.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(sodViolations.severity, filters.severity));
    }

    return db.select().from(sodViolations)
      .where(and(...conditions))
      .orderBy(desc(sodViolations.severity), desc(sodViolations.detectedAt));
  }

  async getSodViolation(id: string, tenantId: string): Promise<SodViolation | undefined> {
    const [violation] = await db.select().from(sodViolations)
      .where(and(eq(sodViolations.id, id), eq(sodViolations.tenantId, tenantId)));
    return violation;
  }

  async createSodViolation(violation: InsertSodViolation): Promise<SodViolation> {
    const [created] = await db.insert(sodViolations).values(violation).returning();
    return created;
  }

  async updateSodViolation(id: string, tenantId: string, updates: Partial<InsertSodViolation>): Promise<SodViolation | undefined> {
    const [updated] = await db.update(sodViolations)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(sodViolations.id, id), eq(sodViolations.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteSodViolation(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(sodViolations)
      .where(and(eq(sodViolations.id, id), eq(sodViolations.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Review Suggestions (Phase 6.4)
  async getReviewSuggestions(campaignId: string): Promise<ReviewSuggestion[]> {
    return db.select().from(reviewSuggestions)
      .where(eq(reviewSuggestions.campaignId, campaignId))
      .orderBy(desc(reviewSuggestions.confidence));
  }

  async getReviewSuggestion(id: string): Promise<ReviewSuggestion | undefined> {
    const [suggestion] = await db.select().from(reviewSuggestions)
      .where(eq(reviewSuggestions.id, id));
    return suggestion;
  }

  async createReviewSuggestion(suggestion: InsertReviewSuggestion): Promise<ReviewSuggestion> {
    const [created] = await db.insert(reviewSuggestions).values(suggestion).returning();
    return created;
  }

  async updateReviewSuggestion(id: string, updates: Partial<InsertReviewSuggestion>): Promise<ReviewSuggestion | undefined> {
    const [updated] = await db.update(reviewSuggestions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(reviewSuggestions.id, id))
      .returning();
    return updated;
  }

  // Anomaly Detections (Phase 6.5)
  async getAnomalyDetections(tenantId: string, filters?: {userId?: string; status?: string; severity?: string}): Promise<AnomalyDetection[]> {
    const conditions = [eq(anomalyDetections.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(anomalyDetections.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(anomalyDetections.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(anomalyDetections.severity, filters.severity));
    }

    return db.select().from(anomalyDetections)
      .where(and(...conditions))
      .orderBy(desc(anomalyDetections.severity), desc(anomalyDetections.detectedAt));
  }

  async getAnomalyDetection(id: string, tenantId: string): Promise<AnomalyDetection | undefined> {
    const [anomaly] = await db.select().from(anomalyDetections)
      .where(and(eq(anomalyDetections.id, id), eq(anomalyDetections.tenantId, tenantId)));
    return anomaly;
  }

  async createAnomalyDetection(anomaly: InsertAnomalyDetection): Promise<AnomalyDetection> {
    const [created] = await db.insert(anomalyDetections).values(anomaly).returning();
    return created;
  }

  async updateAnomalyDetection(id: string, tenantId: string, updates: Partial<InsertAnomalyDetection>): Promise<AnomalyDetection | undefined> {
    const [updated] = await db.update(anomalyDetections)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(anomalyDetections.id, id), eq(anomalyDetections.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteAnomalyDetection(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(anomalyDetections)
      .where(and(eq(anomalyDetections.id, id), eq(anomalyDetections.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Peer Group Baselines (Phase 6.6)
  async getPeerGroupBaselines(tenantId: string, filters?: {department?: string; role?: string}): Promise<PeerGroupBaseline[]> {
    const conditions = [eq(peerGroupBaselines.tenantId, tenantId)];

    if (filters?.department) {
      conditions.push(eq(peerGroupBaselines.department, filters.department));
    }
    if (filters?.role) {
      conditions.push(eq(peerGroupBaselines.role, filters.role));
    }

    return db.select().from(peerGroupBaselines)
      .where(and(...conditions))
      .orderBy(peerGroupBaselines.department, peerGroupBaselines.role);
  }

  async getPeerGroupBaseline(id: string, tenantId: string): Promise<PeerGroupBaseline | undefined> {
    const [baseline] = await db.select().from(peerGroupBaselines)
      .where(and(eq(peerGroupBaselines.id, id), eq(peerGroupBaselines.tenantId, tenantId)));
    return baseline;
  }

  async createPeerGroupBaseline(baseline: InsertPeerGroupBaseline): Promise<PeerGroupBaseline> {
    const [created] = await db.insert(peerGroupBaselines).values(baseline).returning();
    return created;
  }

  async updatePeerGroupBaseline(id: string, tenantId: string, updates: Partial<InsertPeerGroupBaseline>): Promise<PeerGroupBaseline | undefined> {
    const [updated] = await db.update(peerGroupBaselines)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(peerGroupBaselines.id, id), eq(peerGroupBaselines.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deletePeerGroupBaseline(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(peerGroupBaselines)
      .where(and(eq(peerGroupBaselines.id, id), eq(peerGroupBaselines.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Peer Group Outliers (Phase 6.6)
  async getPeerGroupOutliers(tenantId: string, filters?: {userId?: string; status?: string}): Promise<PeerGroupOutlier[]> {
    const conditions = [eq(peerGroupOutliers.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(peerGroupOutliers.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(peerGroupOutliers.status, filters.status));
    }

    return db.select().from(peerGroupOutliers)
      .where(and(...conditions))
      .orderBy(desc(peerGroupOutliers.varianceScore), desc(peerGroupOutliers.detectedAt));
  }

  async getPeerGroupOutlier(id: string, tenantId: string): Promise<PeerGroupOutlier | undefined> {
    const [outlier] = await db.select().from(peerGroupOutliers)
      .where(and(eq(peerGroupOutliers.id, id), eq(peerGroupOutliers.tenantId, tenantId)));
    return outlier;
  }

  async createPeerGroupOutlier(outlier: InsertPeerGroupOutlier): Promise<PeerGroupOutlier> {
    const [created] = await db.insert(peerGroupOutliers).values(outlier).returning();
    return created;
  }

  async updatePeerGroupOutlier(id: string, tenantId: string, updates: Partial<InsertPeerGroupOutlier>): Promise<PeerGroupOutlier | undefined> {
    const [updated] = await db.update(peerGroupOutliers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(peerGroupOutliers.id, id), eq(peerGroupOutliers.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deletePeerGroupOutlier(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(peerGroupOutliers)
      .where(and(eq(peerGroupOutliers.id, id), eq(peerGroupOutliers.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Certification Schedules (Phase 6.7)
  async getCertificationSchedules(tenantId: string, filters?: {userId?: string; appId?: string; status?: string}): Promise<CertificationSchedule[]> {
    const conditions = [eq(certificationSchedules.tenantId, tenantId)];

    if (filters?.userId) {
      conditions.push(eq(certificationSchedules.userId, filters.userId));
    }
    if (filters?.appId) {
      conditions.push(eq(certificationSchedules.appId, filters.appId));
    }
    if (filters?.status) {
      conditions.push(eq(certificationSchedules.status, filters.status));
    }

    return db.select().from(certificationSchedules)
      .where(and(...conditions))
      .orderBy(certificationSchedules.nextCertificationDate);
  }

  async getCertificationSchedule(id: string, tenantId: string): Promise<CertificationSchedule | undefined> {
    const [schedule] = await db.select().from(certificationSchedules)
      .where(and(eq(certificationSchedules.id, id), eq(certificationSchedules.tenantId, tenantId)));
    return schedule;
  }

  async getUpcomingCertifications(tenantId: string, days: number): Promise<CertificationSchedule[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return db.select().from(certificationSchedules)
      .where(and(
        eq(certificationSchedules.tenantId, tenantId),
        eq(certificationSchedules.status, 'active'),
        sql`${certificationSchedules.nextCertificationDate} <= ${futureDate}`
      ))
      .orderBy(certificationSchedules.nextCertificationDate);
  }

  async createCertificationSchedule(schedule: InsertCertificationSchedule): Promise<CertificationSchedule> {
    const [created] = await db.insert(certificationSchedules).values(schedule).returning();
    return created;
  }

  async updateCertificationSchedule(id: string, tenantId: string, updates: Partial<InsertCertificationSchedule>): Promise<CertificationSchedule | undefined> {
    const [updated] = await db.update(certificationSchedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(certificationSchedules.id, id), eq(certificationSchedules.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteCertificationSchedule(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(certificationSchedules)
      .where(and(eq(certificationSchedules.id, id), eq(certificationSchedules.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Integration Configs (Phase 6.10)
  async getIntegrationConfigs(tenantId: string, filters?: {category?: string; enabled?: boolean}): Promise<IntegrationConfig[]> {
    const conditions = [eq(integrationConfigs.tenantId, tenantId)];

    if (filters?.category) {
      conditions.push(eq(integrationConfigs.category, filters.category));
    }
    if (filters?.enabled !== undefined) {
      conditions.push(eq(integrationConfigs.enabled, filters.enabled));
    }

    return db.select().from(integrationConfigs)
      .where(and(...conditions))
      .orderBy(integrationConfigs.category, integrationConfigs.name);
  }

  async getIntegrationConfig(id: string, tenantId: string): Promise<IntegrationConfig | undefined> {
    const [config] = await db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.tenantId, tenantId)));
    return config;
  }

  async getIntegrationConfigByIntegrationId(integrationId: string, tenantId: string): Promise<IntegrationConfig | undefined> {
    const [config] = await db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.integrationId, integrationId), eq(integrationConfigs.tenantId, tenantId)));
    return config;
  }

  async createIntegrationConfig(config: InsertIntegrationConfig): Promise<IntegrationConfig> {
    const [created] = await db.insert(integrationConfigs).values(config).returning();
    return created;
  }

  async updateIntegrationConfig(id: string, tenantId: string, updates: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined> {
    const [updated] = await db.update(integrationConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.tenantId, tenantId)))
      .returning();
    return updated;
  }

  async deleteIntegrationConfig(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(integrationConfigs)
      .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.tenantId, tenantId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async toggleIntegrationConfig(id: string, tenantId: string, enabled: boolean): Promise<IntegrationConfig | undefined> {
    const [updated] = await db.update(integrationConfigs)
      .set({ enabled, updatedAt: new Date() })
      .where(and(eq(integrationConfigs.id, id), eq(integrationConfigs.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Integration Events (Phase 6.10)
  async getIntegrationEvents(tenantId: string, filters?: {integrationId?: string; eventType?: string; status?: string}): Promise<IntegrationEvent[]> {
    const conditions = [eq(integrationEvents.tenantId, tenantId)];

    if (filters?.integrationId) {
      conditions.push(eq(integrationEvents.integrationId, filters.integrationId));
    }
    if (filters?.eventType) {
      conditions.push(eq(integrationEvents.eventType, filters.eventType));
    }
    if (filters?.status) {
      conditions.push(eq(integrationEvents.status, filters.status));
    }

    return db.select().from(integrationEvents)
      .where(and(...conditions))
      .orderBy(desc(integrationEvents.createdAt));
  }

  async getIntegrationEvent(id: string, tenantId: string): Promise<IntegrationEvent | undefined> {
    const [event] = await db.select().from(integrationEvents)
      .where(and(eq(integrationEvents.id, id), eq(integrationEvents.tenantId, tenantId)));
    return event;
  }

  async createIntegrationEvent(event: InsertIntegrationEvent): Promise<IntegrationEvent> {
    const [created] = await db.insert(integrationEvents).values(event).returning();
    return created;
  }

  async updateIntegrationEvent(id: string, tenantId: string, updates: Partial<InsertIntegrationEvent>): Promise<IntegrationEvent | undefined> {
    const [updated] = await db.update(integrationEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(integrationEvents.id, id), eq(integrationEvents.tenantId, tenantId)))
      .returning();
    return updated;
  }

  // Helper methods for Phase 6
  async getUserAppAccessList(userId: string, tenantId: string): Promise<UserAppAccess[]> {
    return db.select().from(userAppAccess)
      .where(and(
        eq(userAppAccess.userId, userId),
        eq(userAppAccess.tenantId, tenantId)
      ))
      .orderBy(userAppAccess.grantedAt);
  }

  async grantUserAppAccess(access: InsertUserAppAccess): Promise<UserAppAccess> {
    const [created] = await db.insert(userAppAccess).values(access).returning();
    return created;
  }

  // Enrollment Tokens Methods
  async getActiveEnrollmentToken(tenantId: string): Promise<EnrollmentToken | undefined> {
    const now = new Date();
    const [token] = await db.select()
      .from(enrollmentTokens)
      .where(and(
        eq(enrollmentTokens.tenantId, tenantId),
        eq(enrollmentTokens.isActive, true),
        or(
          sql`${enrollmentTokens.expiresAt} IS NULL`,
          gt(enrollmentTokens.expiresAt, now)
        )
      ))
      .orderBy(desc(enrollmentTokens.createdAt))
      .limit(1);

    return token;
  }

  async ensureDefaultEnrollmentToken(tenantId: string, createdBy?: string): Promise<EnrollmentToken> {
    // Check if there's already an active token
    const existingToken = await this.getActiveEnrollmentToken(tenantId);
    if (existingToken) {
      return existingToken;
    }

    // Generate a new token
    const token = randomUUID();
    const [newToken] = await db.insert(enrollmentTokens)
      .values({
        tenantId,
        token,
        name: 'Default Enrollment Token',
        description: 'Auto-generated default enrollment token',
        isActive: true,
        expiresAt: null, // Never expires
        maxUses: null, // Unlimited uses
        usedCount: 0,
        createdBy,
      })
      .returning();

    return newToken;
  }

  async validateEnrollmentToken(tokenString: string): Promise<EnrollmentToken | null> {
    const [token] = await db.select()
      .from(enrollmentTokens)
      .where(and(
        eq(enrollmentTokens.token, tokenString),
        eq(enrollmentTokens.isActive, true)
      ))
      .limit(1);

    if (!token) return null;

    // Check if expired
    if (token.expiresAt && new Date() > token.expiresAt) {
      return null;
    }

    // Check if max uses exceeded
    if (token.maxUses !== null && token.usedCount >= token.maxUses) {
      return null;
    }

    return token;
  }

  // Network Monitoring Methods
  async getActiveWifiDevices(tenantId: string): Promise<any[]> {
    return db.select()
      .from(wifiDevices)
      .where(and(
        eq(wifiDevices.tenantId, tenantId),
        eq(wifiDevices.isActive, true)
      ))
      .orderBy(desc(wifiDevices.lastSeen));
  }

  async upsertWifiDevice(deviceData: any): Promise<any> {
    const { tenantId, macAddress } = deviceData;

    // Try to find existing device
    const [existing] = await db.select()
      .from(wifiDevices)
      .where(and(
        eq(wifiDevices.tenantId, tenantId),
        eq(wifiDevices.macAddress, macAddress)
      ))
      .limit(1);

    if (existing) {
      // Update existing device
      const [updated] = await db.update(wifiDevices)
        .set({
          ipAddress: deviceData.ipAddress,
          hostname: deviceData.hostname || existing.hostname,
          manufacturer: deviceData.manufacturer || existing.manufacturer,
          lastSeen: new Date(),
          isActive: true,
          connectionDuration: sql`${wifiDevices.connectionDuration} + ${deviceData.connectionDuration || 0}`,
          metadata: deviceData.metadata || existing.metadata,
          updatedAt: new Date(),
        })
        .where(eq(wifiDevices.id, existing.id))
        .returning();

      return updated;
    } else {
      // Insert new device
      const [inserted] = await db.insert(wifiDevices)
        .values({
          ...deviceData,
          firstSeen: new Date(),
          lastSeen: new Date(),
          isActive: true,
        })
        .returning();

      // Create alert for new unauthorized device
      if (!deviceData.isAuthorized) {
        await this.createNetworkAlert({
          tenantId,
          macAddress: deviceData.macAddress,
          ipAddress: deviceData.ipAddress,
          hostname: deviceData.hostname,
          manufacturer: deviceData.manufacturer,
          deviceInfo: deviceData.metadata || {},
        });
      }

      return inserted;
    }
  }

  async getNetworkAlerts(tenantId: string, status?: string): Promise<any[]> {
    const conditions = [eq(networkAlerts.tenantId, tenantId)];
    if (status) {
      conditions.push(eq(networkAlerts.status, status));
    }

    return db.select()
      .from(networkAlerts)
      .where(and(...conditions))
      .orderBy(desc(networkAlerts.detectedAt));
  }

  async createNetworkAlert(alertData: any): Promise<any> {
    const [alert] = await db.insert(networkAlerts)
      .values({
        ...alertData,
        status: 'new',
        detectedAt: new Date(),
      })
      .returning();

    return alert;
  }

  async acknowledgeNetworkAlert(alertId: number, userId: string, notes?: string): Promise<any> {
    const [alert] = await db.update(networkAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
        notes: notes || null,
        updatedAt: new Date(),
      })
      .where(eq(networkAlerts.id, alertId))
      .returning();

    return alert;
  }

  async generateNetworkAgentKey(tenantId: string, agentName: string, createdBy?: string): Promise<any> {
    const apiKey = randomUUID();

    const [key] = await db.insert(networkAgentKeys)
      .values({
        tenantId,
        apiKey,
        agentName,
        description: `API key for ${agentName}`,
        isActive: true,
        createdBy,
      })
      .returning();

    return key;
  }

  async validateNetworkAgentKey(apiKey: string): Promise<any> {
    const [key] = await db.select()
      .from(networkAgentKeys)
      .where(and(
        eq(networkAgentKeys.apiKey, apiKey),
        eq(networkAgentKeys.isActive, true)
      ))
      .limit(1);

    if (key) {
      // Update last used timestamp
      await db.update(networkAgentKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(networkAgentKeys.id, key.id));
    }

    return key;
  }
}

// Create and seed the database storage
export const storage = new DatabaseStorage();

// Seed function to populate initial data
export async function seedDatabase() {
  console.log("Checking database seeding configuration...");

  try {
    // Skip seeding if explicitly disabled
    if (process.env.SKIP_DATABASE_SEEDING === 'true') {
      console.log("Database seeding skipped via environment variable.");
      return;
    }

    console.log("No sample data seeding configured. Database initialization complete.");
    console.log("Use the application UI to create your first tenant and admin user.");

  } catch (error) {
    console.error("Error during database initialization:", error);
    throw error;
  }
}
