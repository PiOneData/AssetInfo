import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Asset Type Enum - shared across frontend and backend
export const AssetTypeEnum = z.enum(["Hardware", "Software", "Peripherals", "Others"]);
export type AssetType = z.infer<typeof AssetTypeEnum>;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userID: integer("user_id"), // Numeric User ID for human-readable identification (unique constraint will be added after migration)
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role").notNull().default("technician"), // super-admin, admin, it-manager, technician
  avatar: text("avatar"), // URL to profile picture
  phone: text("phone"),
  department: text("department"),
  jobTitle: text("job_title"),
  manager: text("manager"),
  lastLoginAt: timestamp("last_login_at"),
  isActive: boolean("is_active").default(true),
  mustChangePassword: boolean("must_change_password").default(false),
  tenantId: varchar("tenant_id").notNull(),
  invitedBy: varchar("invited_by"), // User who invited this user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"), // Company logo URL
  website: text("website"),
  industry: text("industry"),
  employeeCount: integer("employee_count"),
  supportEmail: text("support_email"), // Email address for external ticket routing
  // Settings
  timezone: text("timezone").default("UTC"),
  currency: text("currency").default("USD"),
  dateFormat: text("date_format").default("MM/DD/YYYY"),
  fiscalYearStart: text("fiscal_year_start").default("01-01"),
  autoRecommendations: boolean("auto_recommendations").default(true),
  dataRetentionDays: integer("data_retention_days").default(365),
  // Security Settings
  enforceSSO: boolean("enforce_sso").default(false),
  requireMFA: boolean("require_mfa").default(false),
  sessionTimeout: integer("session_timeout").default(480), // minutes
  passwordPolicy: jsonb("password_policy"), // complexity rules
  // OpenAudit Integration (per-tenant)
  openauditUrl: text("openaudit_url"), // e.g., http://openaudit.company.com
  openauditUsername: text("openaudit_username"),
  openauditPassword: text("openaudit_password"), // Should be encrypted in production
  openauditOrgId: text("openaudit_org_id"), // OpenAudit organization ID for this tenant
  openauditSyncEnabled: boolean("openaudit_sync_enabled").default(false),
  openauditSyncCron: text("openaudit_sync_cron").default("*/5 * * * *"), // Every 5 minutes
  openauditLastSync: timestamp("openaudit_last_sync"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assets = pgTable(
  "assets",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

    name: text("name").notNull(),
    type: text("type").notNull(), // Hardware, Software, Peripherals, Others
    category: text("category"), // laptop, desktop, server, etc.
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),

    status: text("status").notNull().default("in-stock"), // in-stock, deployed, in-repair, disposed
    location: text("location"), // Legacy field, will be deprecated
    country: text("country"),
    state: text("state"),
    city: text("city"),

    assignedUserId: varchar("assigned_user_id"),
    assignedUserName: text("assigned_user_name"),
    assignedUserEmail: text("assigned_user_email"),
    assignedUserEmployeeId: text("assigned_user_employee_id"),

    purchaseDate: timestamp("purchase_date"),
    purchaseCost: decimal("purchase_cost", { precision: 10, scale: 2 }),
    warrantyExpiry: timestamp("warranty_expiry"),
    amcExpiry: timestamp("amc_expiry"), // Annual Maintenance Contract expiry

    specifications: jsonb("specifications"), // CPU, RAM, Storage, etc.
    notes: text("notes"),

    // Software-specific fields
    softwareName: text("software_name"),
    version: text("version"),
    licenseType: text("license_type"), // perpetual, subscription, volume
    licenseKey: text("license_key"),
    usedLicenses: integer("used_licenses"),
    renewalDate: timestamp("renewal_date"),

    // Vendor information
    vendorName: text("vendor_name"),
    vendorEmail: text("vendor_email"),
    vendorPhone: text("vendor_phone"),

    // Company information
    companyName: text("company_name"),
    companyGstNumber: text("company_gst_number"),
    addedViaEnrollment: boolean("added_via_enrollment").notNull().default(false),

    tenantId: varchar("tenant_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    // ✅ Add these unique indexes so ON CONFLICT works
    uniqTenantSerial: uniqueIndex("uniq_assets_tenant_serial").on(
      t.tenantId,
      t.serialNumber
    ),
    uniqTenantName: uniqueIndex("uniq_assets_tenant_name").on(
      t.tenantId,
      t.name
    ),
  })
);


export const softwareLicenses = pgTable("software_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  vendor: text("vendor"),
  version: text("version"),
  licenseKey: text("license_key"),
  licenseType: text("license_type"), // perpetual, subscription, volume
  totalLicenses: integer("total_licenses").notNull(),
  usedLicenses: integer("used_licenses").notNull().default(0),
  costPerLicense: decimal("cost_per_license", { precision: 10, scale: 2 }),
  renewalDate: timestamp("renewal_date"),
  notes: text("notes"),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assetUtilization = pgTable("asset_utilization", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull(),
  cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }),
  ramUsage: decimal("ram_usage", { precision: 5, scale: 2 }),
  diskUsage: decimal("disk_usage", { precision: 5, scale: 2 }),
  networkUsage: decimal("network_usage", { precision: 10, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow(),
  tenantId: varchar("tenant_id").notNull(),
});

export const assetSoftwareLinks = pgTable("asset_software_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  assetId: varchar("asset_id").notNull(),
  softwareAssetId: varchar("software_asset_id").notNull(),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqAssetSoftwareLink: uniqueIndex("uniq_asset_software_link").on(table.tenantId, table.assetId, table.softwareAssetId),
}));

export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // downgrade, upgrade, reallocation, license-optimization
  title: text("title").notNull(),
  description: text("description").notNull(),
  potentialSavings: decimal("potential_savings", { precision: 10, scale: 2 }),
  priority: text("priority").notNull().default("medium"), // low, medium, high
  status: text("status").notNull().default("pending"), // pending, accepted, dismissed
  assetIds: jsonb("asset_ids"), // Array of asset IDs affected
  generatedAt: timestamp("generated_at").defaultNow(),
  tenantId: varchar("tenant_id").notNull(),
});

// User Preferences
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  // Notification Settings
  emailNotifications: boolean("email_notifications").default(true),
  pushNotifications: boolean("push_notifications").default(false),
  aiRecommendationAlerts: boolean("ai_recommendation_alerts").default(true),
  weeklyReports: boolean("weekly_reports").default(false),
  assetExpiryAlerts: boolean("asset_expiry_alerts").default(true),
  // Display Settings
  theme: text("theme").default("light"), // light, dark, auto
  language: text("language").default("en"),
  timezone: text("timezone").default("UTC"),
  dateFormat: text("date_format").default("MM/DD/YYYY"),
  dashboardLayout: jsonb("dashboard_layout"), // widget preferences
  itemsPerPage: integer("items_per_page").default(25),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Logs for Enterprise Compliance
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(), // CREATE, UPDATE, DELETE, LOGIN, LOGOUT
  resourceType: text("resource_type").notNull(), // ASSET, LICENSE, USER, SETTING
  resourceId: varchar("resource_id"),
  userId: varchar("user_id").notNull(),
  userEmail: text("user_email").notNull(),
  userRole: text("user_role").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  description: text("description"),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiResponses = pgTable("ai_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  userId: varchar("user_id").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const masterData = pgTable("master_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // manufacturer, model, category, location, vendor, company
  value: text("value").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata"), // flexible properties
  createdBy: varchar("created_by").notNull(),
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tickets for Service Desk
export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: text("ticket_number").notNull().unique(), // Auto-generated ticket number
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // hardware, software, network, account, other
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  status: text("status").notNull().default("open"), // open, in-progress, resolved, closed, cancelled
  
  // User relationships
  requestorId: varchar("requestor_id").notNull(), // Employee who raised the ticket
  requestorName: text("requestor_name").notNull(),
  requestorEmail: text("requestor_email").notNull(),
  assignedToId: varchar("assigned_to_id"), // Technician assigned to ticket
  assignedToName: text("assigned_to_name"),
  assignedById: varchar("assigned_by_id"), // Admin who assigned the ticket
  assignedByName: text("assigned_by_name"),
  
  // Timestamps
  assignedAt: timestamp("assigned_at"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  dueDate: timestamp("due_date"),
  
  // Additional details
  resolution: text("resolution"), // Resolution details when ticket is resolved
  resolutionNotes: text("resolution_notes"), // Internal notes for resolution
  assetId: varchar("asset_id"), // Related asset (if applicable)
  assetName: text("asset_name"),
  attachments: jsonb("attachments"), // File attachments metadata
  tags: text("tags").array(), // Array of tags for categorization
  
  // Tenant isolation
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Ticket Comments for communication trail
export const ticketComments = pgTable("ticket_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull(),
  authorId: varchar("author_id").notNull(),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").notNull(),
  content: text("content").notNull(),
  isInternal: boolean("is_internal").default(false), // Internal notes vs public comments
  attachments: jsonb("attachments"), // File attachments metadata
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Ticket Activity Log for audit trail
export const ticketActivities = pgTable("ticket_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull(),
  activityType: text("activity_type").notNull(), // created, assigned, status_changed, commented, resolved, closed
  description: text("description").notNull(), // Human-readable description
  actorId: varchar("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  actorRole: text("actor_role").notNull(),
  metadata: jsonb("metadata"), // Additional context data
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssetSchema = createInsertSchema(assets, {
  purchaseDate: z.coerce.date().optional(),
  warrantyExpiry: z.coerce.date().optional(),
  renewalDate: z.coerce.date().optional(),
  country: z.string().optional(),
  state: z.string().optional(), 
  city: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: AssetTypeEnum, // Enforce Title Case asset types
  purchaseCost: z.number().nonnegative().optional().or(z.undefined()),
});

export const insertSoftwareLicenseSchema = createInsertSchema(softwareLicenses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssetUtilizationSchema = createInsertSchema(assetUtilization).omit({
  id: true,
  recordedAt: true,
});

export const insertRecommendationSchema = createInsertSchema(recommendations).omit({
  id: true,
  generatedAt: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertAiResponseSchema = createInsertSchema(aiResponses).omit({
  id: true,
  createdAt: true,
});

export const insertMasterDataSchema = createInsertSchema(masterData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  ticketNumber: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({
  id: true,
  createdAt: true,
});

export const insertTicketActivitySchema = createInsertSchema(ticketActivities).omit({
  id: true,
  createdAt: true,
});

// User Invitations Table
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").notNull().default("technician"), // super-admin, admin, it-manager, technician
  tenantId: varchar("tenant_id").notNull(),
  invitedBy: varchar("invited_by").notNull(),
  token: text("token").notNull().unique(), // Invitation token
  status: text("status").notNull().default("pending"), // pending, accepted, expired
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant Admin Lock - Sentinel table for atomic first admin creation
export const tenantAdminLock = pgTable("tenant_admin_lock", {
  tenantId: varchar("tenant_id").primaryKey(), // Unique constraint prevents race conditions
  createdAt: timestamp("created_at").defaultNow(),
});

// Authentication schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  tenantName: z.string().min(1),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type SoftwareLicense = typeof softwareLicenses.$inferSelect;
export type InsertSoftwareLicense = z.infer<typeof insertSoftwareLicenseSchema>;
export type AssetUtilization = typeof assetUtilization.$inferSelect;
export type InsertAssetUtilization = z.infer<typeof insertAssetUtilizationSchema>;
export type AssetSoftwareLink = typeof assetSoftwareLinks.$inferSelect;
export type InsertAssetSoftwareLink = typeof assetSoftwareLinks.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AIResponse = typeof aiResponses.$inferSelect;
export type InsertAIResponse = z.infer<typeof insertAiResponseSchema>;
export type MasterData = typeof masterData.$inferSelect;
export type InsertMasterData = z.infer<typeof insertMasterDataSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketActivity = typeof ticketActivities.$inferSelect;
export type InsertTicketActivity = z.infer<typeof insertTicketActivitySchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;

// Additional validation schemas for API endpoints
export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  manager: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const updateUserPreferencesSchema = z.object({
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  aiRecommendationAlerts: z.boolean(),
  weeklyReports: z.boolean(),
  assetExpiryAlerts: z.boolean(),
  theme: z.enum(["light", "dark", "auto"]),
  language: z.string(),
  timezone: z.string(),
  dateFormat: z.string(),
  itemsPerPage: z.number().int().min(10).max(100),
});

export const updateOrgSettingsSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  timezone: z.string(),
  currency: z.string(),
  dateFormat: z.string(),
  autoRecommendations: z.boolean(),
  dataRetentionDays: z.number().int().min(30).max(2555), // 30 days to 7 years
});

// User invitation schemas
export const inviteUserSchema = z.object({
  email: z.string().email("Valid email address is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["technician", "it-manager", "admin"]), // super-admin excluded from invitations
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(["technician", "it-manager", "admin", "super-admin"]),
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  token: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;
export type InviteUser = z.infer<typeof inviteUserSchema>;
export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type UpdateUserPreferences = z.infer<typeof updateUserPreferencesSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type UpdateOrgSettings = z.infer<typeof updateOrgSettingsSchema>;

// Ticket validation schemas
export const createTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().min(1, "Description is required").max(2000, "Description too long"),
  category: z.enum(["hardware", "software", "network", "account", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assetId: z.string().optional(),
  assetName: z.string().optional(),
});

export const updateTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long").optional(),
  description: z.string().min(1, "Description is required").max(2000, "Description too long").optional(),
  category: z.enum(["hardware", "software", "network", "account", "other"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assetId: z.string().optional(),
  assetName: z.string().optional(),
});

export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1, "Technician ID is required"),
});

export const addTicketCommentSchema = z.object({
  content: z.string().min(1, "Comment content is required").max(2000, "Comment too long"),
  isInternal: z.boolean().default(false),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(["open", "in-progress", "resolved", "closed", "cancelled"]),
  resolution: z.string().max(2000, "Resolution too long").optional(),
  resolutionNotes: z.string().max(2000, "Resolution notes too long").optional(),
});

export type CreateTicket = z.infer<typeof createTicketSchema>;
export type UpdateTicket = z.infer<typeof updateTicketSchema>;
export type AssignTicket = z.infer<typeof assignTicketSchema>;
export type AddTicketComment = z.infer<typeof addTicketCommentSchema>;
export type UpdateTicketStatus = z.infer<typeof updateTicketStatusSchema>;

// ============================================
// Network Discovery Tables
// ============================================

// Discovery Jobs - tracks network discovery scans
export const discoveryJobs = pgTable("discovery_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull().unique(), // Short alphanumeric ID for user reference
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, expired
  
  // Job metadata
  initiatedBy: varchar("initiated_by").notNull(), // User who started the discovery
  initiatedByName: text("initiated_by_name").notNull(),
  osType: text("os_type").notNull(), // windows, macos, linux
  
  // Site/network scope
  siteId: varchar("site_id"), // Optional site assignment
  siteName: text("site_name"),
  networkRange: text("network_range"), // CIDR or IP range being scanned
  
  // Progress tracking
  totalHosts: integer("total_hosts").default(0), // Total hosts discovered
  scannedHosts: integer("scanned_hosts").default(0), // Hosts scanned so far
  successfulHosts: integer("successful_hosts").default(0), // Hosts with full SNMP data
  partialHosts: integer("partial_hosts").default(0), // Hosts with partial data (port fingerprint)
  unreachableHosts: integer("unreachable_hosts").default(0), // Hosts that couldn't be reached
  progressMessage: text("progress_message"), // Current progress message (e.g., "Scanning 192.168.1.1...")
  progressPercent: integer("progress_percent").default(0), // Progress percentage (0-100)
  
  // Results
  results: jsonb("results"), // Full scan results (devices discovered)
  errorLog: text("error_log"), // Error messages if any
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(), // Job expires after 15-30 minutes
  
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Discovery Tokens - short-lived auth tokens for discovery agents
export const discoveryTokens = pgTable("discovery_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(), // JWT or random token
  jobId: varchar("job_id").notNull(), // References discoveryJobs.id
  
  // Scope constraints
  tenantId: varchar("tenant_id").notNull(),
  siteId: varchar("site_id"), // Optional site scoping
  
  // Token lifecycle
  isUsed: boolean("is_used").default(false),
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(), // 15-30 minute expiry
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Enrollment Tokens - Long-lived tokens for agent enrollment
export const enrollmentTokens = pgTable("enrollment_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(), // Secure random token
  name: text("name").notNull(), // e.g., "Main Office", "Remote Workers", "Data Center"
  description: text("description"),
  
  // Tenant scoping
  tenantId: varchar("tenant_id").notNull(),
  
  // Optional constraints
  siteId: varchar("site_id"), // Auto-assign enrolled devices to this site
  siteName: text("site_name"),
  maxUses: integer("max_uses"), // null = unlimited
  usageCount: integer("usage_count").default(0),
  
  // Token lifecycle
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"), // null = never expires
  
  // Metadata
  createdBy: varchar("created_by").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enrollment Sessions - one-time nonce-based sessions for PKG downloads
export const enrollmentSessions = pgTable("enrollment_sessions", {
  nonce: text("nonce").primaryKey(), // Cryptographic random nonce
  
  // Tenant mapping
  tenantId: varchar("tenant_id").notNull(),
  tenantToken: text("tenant_token").notNull(), // Original enrollment token
  
  // Session metadata
  status: text("status").notNull().default("issued"), // issued, consumed
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  
  // Device info (captured on claim)
  serial: text("serial"),
  hostname: text("hostname"),
  osv: text("osv"),
  claimedAt: timestamp("claimed_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Credential Profiles - store SNMP credentials for discovery
export const credentialProfiles = pgTable("credential_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Default SNMPv3", "Guest Network"
  description: text("description"),
  
  // SNMP version and credentials
  snmpVersion: text("snmp_version").notNull(), // v2c, v3
  
  // SNMPv2c credentials
  communityString: text("community_string"), // e.g., "public", "itam_public"
  
  // SNMPv3 credentials
  snmpV3Username: text("snmp_v3_username"),
  snmpV3AuthProtocol: text("snmp_v3_auth_protocol"), // SHA, MD5
  snmpV3AuthPassword: text("snmp_v3_auth_password"),
  snmpV3PrivProtocol: text("snmp_v3_priv_protocol"), // AES, DES
  snmpV3PrivPassword: text("snmp_v3_priv_password"),
  snmpV3SecurityLevel: text("snmp_v3_security_level"), // noAuthNoPriv, authNoPriv, authPriv
  
  // Metadata
  isDefault: boolean("is_default").default(false), // Use this profile first
  priority: integer("priority").default(0), // Higher priority tried first
  isActive: boolean("is_active").default(true),
  
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Discovered Devices - staging table for devices found during discovery
export const discoveredDevices = pgTable("discovered_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull(), // References discoveryJobs.id
  
  // Device identification
  ipAddress: text("ip_address").notNull(),
  macAddress: text("mac_address"),
  hostname: text("hostname"),
  
  // SNMP data
  sysName: text("sys_name"),
  sysDescr: text("sys_descr"),
  sysObjectID: text("sys_object_id"),
  serialNumber: text("serial_number"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  
  // Network interfaces (from ifTable)
  interfaces: jsonb("interfaces"), // Array of interface data
  
  // OS detection
  osName: text("os_name"),
  osVersion: text("os_version"),
  
  // Discovery method and status
  discoveryMethod: text("discovery_method").notNull(), // snmpv3, snmpv2c, port-fingerprint
  status: text("status").notNull().default("discovered"), // discovered, partial, failed
  credentialProfileId: varchar("credential_profile_id"), // Which credential worked
  
  // Port fingerprinting data (if SNMP failed)
  openPorts: jsonb("open_ports"), // Array of open port numbers
  portFingerprint: text("port_fingerprint"), // Service classification (router, switch, printer, etc.)
  macOui: text("mac_oui"), // MAC OUI vendor lookup
  
  // Deduplication fields
  isDuplicate: boolean("is_duplicate").default(false), // True if matches existing asset
  duplicateAssetId: varchar("duplicate_asset_id"), // ID of matching asset
  duplicateMatchField: text("duplicate_match_field"), // serial, mac, ip
  
  // Import status
  isImported: boolean("is_imported").default(false),
  importedAt: timestamp("imported_at"),
  importedAssetId: varchar("imported_asset_id"), // ID in assets table after import
  
  // Site assignment
  siteId: varchar("site_id"),
  siteName: text("site_name"),
  
  // Additional metadata
  rawData: jsonb("raw_data"), // Full SNMP response or scan data
  notes: text("notes"),
  
  tenantId: varchar("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert Schemas for Discovery
export const insertDiscoveryJobSchema = createInsertSchema(discoveryJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDiscoveryTokenSchema = createInsertSchema(discoveryTokens).omit({
  id: true,
  createdAt: true,
});

export const insertEnrollmentTokenSchema = createInsertSchema(enrollmentTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCredentialProfileSchema = createInsertSchema(credentialProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDiscoveredDeviceSchema = createInsertSchema(discoveredDevices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Validation Schemas for Discovery API
export const createDiscoveryJobSchema = z.object({
  siteId: z.string().optional(),
  siteName: z.string().optional(),
  networkRange: z.string().optional(), // CIDR notation
});

export const uploadDiscoveryResultsSchema = z.object({
  devices: z.array(z.object({
    ipAddress: z.string(),
    macAddress: z.string().optional(),
    hostname: z.string().optional(),
    sysName: z.string().optional(),
    sysDescr: z.string().optional(),
    sysObjectID: z.string().optional(),
    serialNumber: z.string().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    osName: z.string().optional(),
    osVersion: z.string().optional(),
    interfaces: z.any().optional(),
    discoveryMethod: z.enum(["snmpv3", "snmpv2c", "port-fingerprint"]),
    status: z.enum(["discovered", "partial", "failed"]),
    openPorts: z.array(z.number()).optional(),
    portFingerprint: z.string().optional(),
    macOui: z.string().optional(),
    rawData: z.any().optional(),
  })),
});

export const importDiscoveredDevicesSchema = z.object({
  jobId: z.string(),
  deviceIds: z.array(z.string()), // Array of discoveredDevices.id to import
  siteId: z.string().optional(),
  siteName: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const createCredentialProfileSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  description: z.string().optional(),
  snmpVersion: z.enum(["v2c", "v3"]),
  communityString: z.string().optional(),
  snmpV3Username: z.string().optional(),
  snmpV3AuthProtocol: z.enum(["SHA", "MD5"]).optional(),
  snmpV3AuthPassword: z.string().optional(),
  snmpV3PrivProtocol: z.enum(["AES", "DES"]).optional(),
  snmpV3PrivPassword: z.string().optional(),
  snmpV3SecurityLevel: z.enum(["noAuthNoPriv", "authNoPriv", "authPriv"]).optional(),
  isDefault: z.boolean().default(false),
  priority: z.number().default(0),
});

export const createEnrollmentTokenSchema = z.object({
  name: z.string().min(1, "Token name is required"),
  description: z.string().optional(),
  siteId: z.string().optional(),
  siteName: z.string().optional(),
  maxUses: z.number().positive().optional(),
  expiresAt: z.coerce.date().optional(),
});

// ============================================
// Network Monitoring Tables
// ============================================

// Network Monitor Agents - manages WiFi monitoring agents
export const networkMonitorAgents = pgTable("network_monitor_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: text("agent_id").notNull().unique(),
  tenantId: varchar("tenant_id").notNull(),
  apiKey: text("api_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  isActive: boolean("is_active").default(true),
  lastHeartbeat: timestamp("last_heartbeat"),
  version: text("version"),
  capabilities: jsonb("capabilities"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// WiFi Presence - tracks devices detected by WiFi monitoring
export const wifiPresence = pgTable("wifi_presence", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar("tenant_id").notNull(),
  macAddress: text("mac_address").notNull(),
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  manufacturer: text("manufacturer"),
  assetId: varchar("asset_id"), // Link to assets table
  assetName: text("asset_name"),
  isAuthorized: boolean("is_authorized").default(false),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  isActive: boolean("is_active").default(true),
  connectionDuration: integer("connection_duration").default(0), // in seconds
  deviceType: text("device_type"), // phone, laptop, tablet, etc
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Unknown Device Alerts - alerts for unrecognized devices
export const unknownDeviceAlerts = pgTable("unknown_device_alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tenantId: varchar("tenant_id").notNull(),
  macAddress: text("mac_address").notNull(),
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  manufacturer: text("manufacturer"),
  deviceType: text("device_type"),
  detectedAt: timestamp("detected_at").defaultNow(),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by"),
  resolution: text("resolution"),
  severity: text("severity").default("medium"), // low, medium, high
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// SaaS Governance Tables (Phase 0)
// ============================================================================

// SaaS Apps - Central registry of all SaaS applications
export const saasApps = pgTable(
  "saas_apps",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Basic information
    name: text("name").notNull(),
    vendor: text("vendor"),
    description: text("description"),
    category: text("category"),

    // URLs and integration
    websiteUrl: text("website_url"),
    logoUrl: text("logo_url"),
    apiUrl: text("api_url"),

    // Governance
    approvalStatus: text("approval_status").notNull().default("pending"),
    riskScore: integer("risk_score").default(0),
    riskFactors: jsonb("risk_factors").$type<string[]>(),

    // Usage tracking
    userCount: integer("user_count").default(0),
    activeUserCount: integer("active_user_count").default(0),
    lastUsedAt: timestamp("last_used_at"),

    // Ownership
    owner: text("owner"),
    ownerId: varchar("owner_id"),
    primaryContactEmail: text("primary_contact_email"),

    // Discovery metadata
    discoveryMethod: text("discovery_method"),
    discoveryDate: timestamp("discovery_date"),
    discoveredByUserId: varchar("discovered_by_user_id"),

    // Additional metadata
    tags: jsonb("tags").$type<string[]>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueTenantName: uniqueIndex("uniq_saas_apps_tenant_name").on(table.tenantId, table.name),
    idxTenantStatus: index("idx_saas_apps_tenant_status").on(table.tenantId, table.approvalStatus),
    idxTenantCategory: index("idx_saas_apps_tenant_category").on(table.tenantId, table.category),
    idxRiskScore: index("idx_saas_apps_risk_score").on(table.tenantId, table.riskScore),
  })
);

// SaaS Contracts - Contract & subscription management
export const saasContracts = pgTable(
  "saas_contracts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    appId: varchar("app_id").notNull(),

    // Contract details
    contractNumber: text("contract_number"),
    vendor: text("vendor").notNull(),

    // Financial
    annualValue: decimal("annual_value", { precision: 12, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    billingCycle: text("billing_cycle"),
    paymentTerms: text("payment_terms"),

    // Dates
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    renewalDate: timestamp("renewal_date"),
    noticePeriodDays: integer("notice_period_days"),

    // Auto-renewal
    autoRenew: boolean("auto_renew").default(false),
    renewalAlerted: boolean("renewal_alerted").default(false),

    // Contract terms
    terms: text("terms"),
    terminationClause: text("termination_clause"),

    // License details
    licenseType: text("license_type"),
    totalLicenses: integer("total_licenses"),
    usedLicenses: integer("used_licenses").default(0),

    // Document management
    contractFileUrl: text("contract_file_url"),
    signedBy: text("signed_by"),
    signedDate: timestamp("signed_date"),

    // Ownership
    owner: text("owner"),
    ownerId: varchar("owner_id"),

    // Status
    status: text("status").notNull().default("active"),

    // Additional metadata
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenantApp: index("idx_saas_contracts_tenant_app").on(table.tenantId, table.appId),
    idxTenantStatus: index("idx_saas_contracts_tenant_status").on(table.tenantId, table.status),
    idxRenewalDate: index("idx_saas_contracts_renewal_date").on(table.renewalDate),
    idxTenantRenewalDate: index("idx_saas_contracts_tenant_renewal").on(table.tenantId, table.renewalDate),
  })
);

// User App Access - User–App relationship graph
export const userAppAccess = pgTable(
  "user_app_access",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    userId: varchar("user_id").notNull(),
    appId: varchar("app_id").notNull(),

    // Access details
    accessGrantedDate: timestamp("access_granted_date").defaultNow(),
    lastAccessDate: timestamp("last_access_date"),
    accessRevokedDate: timestamp("access_revoked_date"),

    // Permissions
    permissions: jsonb("permissions").$type<string[]>(),
    roles: jsonb("roles").$type<string[]>(),

    // OAuth context
    hasOAuthToken: boolean("has_oauth_token").default(false),
    oauthScopes: jsonb("oauth_scopes").$type<string[]>(),

    // Assignment tracking
    assignedBy: varchar("assigned_by"),
    assignmentMethod: text("assignment_method"),

    // Status
    status: text("status").notNull().default("active"),

    // Usage tracking
    loginCount: integer("login_count").default(0),
    lastLoginAt: timestamp("last_login_at"),

    // Access review fields (added for access review campaigns)
    accessType: text("access_type"),
    businessJustification: text("business_justification"),
    lastReviewedAt: timestamp("last_reviewed_at"),
    lastReviewedBy: varchar("last_reviewed_by"),
    nextReviewDate: timestamp("next_review_date"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueTenantUserApp: uniqueIndex("uniq_user_app_access_tenant_user_app").on(
      table.tenantId,
      table.userId,
      table.appId
    ),
    idxTenantUser: index("idx_user_app_access_tenant_user").on(table.tenantId, table.userId),
    idxTenantApp: index("idx_user_app_access_tenant_app").on(table.tenantId, table.appId),
    idxStatus: index("idx_user_app_access_status").on(table.tenantId, table.status),
  })
);

// OAuth Tokens - OAuth token tracking for risk analysis
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    userId: varchar("user_id").notNull(),
    appId: varchar("app_id").notNull(),

    // OAuth details
    tokenHash: text("token_hash"),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    grantType: text("grant_type"),

    // Token lifecycle
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),

    // Risk assessment
    riskLevel: text("risk_level").default("low"),
    riskReasons: jsonb("risk_reasons").$type<string[]>(),

    // Revocation
    status: text("status").notNull().default("active"),
    revokedBy: varchar("revoked_by"),
    revocationReason: text("revocation_reason"),

    // IdP metadata
    idpTokenId: text("idp_token_id"),
    idpMetadata: jsonb("idp_metadata").$type<Record<string, any>>(),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, any>>(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenantUserApp: index("idx_oauth_tokens_tenant_user_app").on(table.tenantId, table.userId, table.appId),
    idxTenantStatus: index("idx_oauth_tokens_tenant_status").on(table.tenantId, table.status),
    idxRiskLevel: index("idx_oauth_tokens_risk_level").on(table.tenantId, table.riskLevel),
    idxExpiresAt: index("idx_oauth_tokens_expires_at").on(table.expiresAt),
  })
);

// Identity Providers - IdP configuration
export const identityProviders = pgTable(
  "identity_providers",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Provider details
    name: text("name").notNull(),
    type: text("type").notNull(),

    // Configuration (clientSecret will be encrypted at application layer)
    clientId: text("client_id"),
    clientSecret: text("client_secret"),
    tenantDomain: text("tenant_domain"),

    // OAuth endpoints
    authorizationUrl: text("authorization_url"),
    tokenUrl: text("token_url"),
    userInfoUrl: text("user_info_url"),

    // Scopes and permissions
    scopes: jsonb("scopes").$type<string[]>(),

    // Sync configuration
    syncEnabled: boolean("sync_enabled").default(false),
    syncInterval: integer("sync_interval").default(3600),
    lastSyncAt: timestamp("last_sync_at"),
    nextSyncAt: timestamp("next_sync_at"),
    syncStatus: text("sync_status").default("idle"),
    syncError: text("sync_error"),

    // Statistics
    totalUsers: integer("total_users").default(0),
    totalApps: integer("total_apps").default(0),

    // Status
    status: text("status").notNull().default("active"),

    // Configuration metadata
    config: jsonb("config").$type<Record<string, any>>(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    uniqueTenantType: uniqueIndex("uniq_identity_providers_tenant_type").on(table.tenantId, table.type),
    idxTenantStatus: index("idx_identity_providers_tenant_status").on(table.tenantId, table.status),
    idxNextSync: index("idx_identity_providers_next_sync").on(table.nextSyncAt),
  })
);

// SaaS Invoices - Invoice tracking
export const saasInvoices = pgTable(
  "saas_invoices",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    appId: varchar("app_id"),
    contractId: varchar("contract_id"),

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
    status: text("status").notNull().default("pending"),

    // Payment
    paymentMethod: text("payment_method"),
    transactionId: text("transaction_id"),

    // Document
    invoiceFileUrl: text("invoice_file_url"),

    // External system
    externalInvoiceId: text("external_invoice_id"),

    // Categorization
    category: text("category"),
    department: text("department"),
    costCenter: text("cost_center"),

    // Metadata
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenantApp: index("idx_saas_invoices_tenant_app").on(table.tenantId, table.appId),
    idxTenantStatus: index("idx_saas_invoices_tenant_status").on(table.tenantId, table.status),
    idxInvoiceDate: index("idx_saas_invoices_invoice_date").on(table.tenantId, table.invoiceDate),
    idxDueDate: index("idx_saas_invoices_due_date").on(table.dueDate),
  })
);

// Governance Policies - Automation policy rules
export const governancePolicies = pgTable(
  "governance_policies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Policy details
    name: text("name").notNull(),
    description: text("description"),
    policyType: text("policy_type").notNull(),

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
    priority: integer("priority").default(0),

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
  },
  (table) => ({
    idxTenantType: index("idx_governance_policies_tenant_type").on(table.tenantId, table.policyType),
    idxTenantEnabled: index("idx_governance_policies_tenant_enabled").on(table.tenantId, table.enabled),
  })
);

// ============================================
// SaaS Governance Validation Schemas (Phase 0)
// ============================================

export const insertSaasAppSchema = createInsertSchema(saasApps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  approvalStatus: z.enum(["pending", "approved", "denied"]).default("pending"),
  riskScore: z.number().min(0).max(100).default(0),
  discoveryMethod: z.enum(["idp", "email", "manual", "browser", "network"]).optional(),
});

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

export const insertUserAppAccessSchema = createInsertSchema(userAppAccess).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "revoked", "suspended"]).default("active"),
  assignmentMethod: z.enum(["manual", "sso", "oauth", "discovered"]).optional(),
});

export const insertOauthTokenSchema = createInsertSchema(oauthTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["active", "expired", "revoked"]).default("active"),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("low"),
  scopes: z.array(z.string()).min(1),
});

export const insertIdentityProviderSchema = createInsertSchema(identityProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  type: z.enum(["azuread", "okta", "google", "jumpcloud"]),
  status: z.enum(["active", "disabled", "error"]).default("active"),
  syncStatus: z.enum(["idle", "syncing", "error"]).default("idle"),
});

export const insertSaasInvoiceSchema = createInsertSchema(saasInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["pending", "paid", "overdue", "cancelled"]).default("pending"),
  paymentMethod: z.enum(["card", "bank_transfer", "check", "other"]).optional(),
  currency: z.string().length(3).default("USD"),
});

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

// Types
export type DiscoveryJob = typeof discoveryJobs.$inferSelect;
export type InsertDiscoveryJob = z.infer<typeof insertDiscoveryJobSchema>;
export type DiscoveryToken = typeof discoveryTokens.$inferSelect;
export type InsertDiscoveryToken = z.infer<typeof insertDiscoveryTokenSchema>;
export type EnrollmentToken = typeof enrollmentTokens.$inferSelect;
export type InsertEnrollmentToken = z.infer<typeof insertEnrollmentTokenSchema>;
export type CreateEnrollmentToken = z.infer<typeof createEnrollmentTokenSchema>;
export type CredentialProfile = typeof credentialProfiles.$inferSelect;
export type InsertCredentialProfile = z.infer<typeof insertCredentialProfileSchema>;
export type DiscoveredDevice = typeof discoveredDevices.$inferSelect;
export type InsertDiscoveredDevice = z.infer<typeof insertDiscoveredDeviceSchema>;
export type CreateDiscoveryJob = z.infer<typeof createDiscoveryJobSchema>;
export type UploadDiscoveryResults = z.infer<typeof uploadDiscoveryResultsSchema>;
export type ImportDiscoveredDevices = z.infer<typeof importDiscoveredDevicesSchema>;
export type CreateCredentialProfile = z.infer<typeof createCredentialProfileSchema>;

// SaaS Governance Types
export type SaasApp = typeof saasApps.$inferSelect;
export type InsertSaasApp = z.infer<typeof insertSaasAppSchema>;
export type SaasContract = typeof saasContracts.$inferSelect;
export type InsertSaasContract = z.infer<typeof insertSaasContractSchema>;
export type UserAppAccess = typeof userAppAccess.$inferSelect;
export type InsertUserAppAccess = z.infer<typeof insertUserAppAccessSchema>;
export type OauthToken = typeof oauthTokens.$inferSelect;
export type InsertOauthToken = z.infer<typeof insertOauthTokenSchema>;
export type IdentityProvider = typeof identityProviders.$inferSelect;
export type InsertIdentityProvider = z.infer<typeof insertIdentityProviderSchema>;
export type SaasInvoice = typeof saasInvoices.$inferSelect;
export type InsertSaasInvoice = z.infer<typeof insertSaasInvoiceSchema>;
export type GovernancePolicy = typeof governancePolicies.$inferSelect;
export type InsertGovernancePolicy = z.infer<typeof insertGovernancePolicySchema>;

// ========================================
// Phase 3: Offboarding Automation
// ========================================

// Offboarding Playbooks Table
export const offboardingPlaybooks = pgTable(
  "offboarding_playbooks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'standard', 'contractor', 'transfer', 'role_change'
    description: text("description"),
    isDefault: boolean("is_default").default(false),
    steps: jsonb("steps").$type<Array<{
      type: string;
      priority: number;
      enabled: boolean;
      description: string;
    }>>().notNull(),
    createdBy: varchar("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_offboarding_playbooks_tenant").on(table.tenantId),
    idxType: index("idx_offboarding_playbooks_type").on(table.type),
  })
);

// Offboarding Requests Table
export const offboardingRequests = pgTable(
  "offboarding_requests",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    userId: varchar("user_id").notNull(),
    playbookId: varchar("playbook_id"),
    status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'failed', 'partial', 'cancelled'
    initiatedBy: varchar("initiated_by").notNull(),
    initiatedAt: timestamp("initiated_at").defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    totalTasks: integer("total_tasks").default(0),
    completedTasks: integer("completed_tasks").default(0),
    failedTasks: integer("failed_tasks").default(0),
    reason: text("reason"),
    transferToUserId: varchar("transfer_to_user_id"),
    notes: text("notes"),
    auditReportUrl: text("audit_report_url"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_offboarding_requests_tenant").on(table.tenantId),
    idxUser: index("idx_offboarding_requests_user").on(table.userId),
    idxStatus: index("idx_offboarding_requests_status").on(table.status),
    idxInitiatedAt: index("idx_offboarding_requests_initiated_at").on(table.initiatedAt),
  })
);

// Offboarding Tasks Table
export const offboardingTasks = pgTable(
  "offboarding_tasks",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: varchar("request_id").notNull(),
    taskType: text("task_type").notNull(), // 'revoke_sso', 'revoke_oauth', 'transfer_ownership', etc.
    appId: varchar("app_id"),
    appName: text("app_name"),
    status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'failed', 'skipped'
    priority: integer("priority").default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    result: jsonb("result").$type<Record<string, any>>(),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxRequest: index("idx_offboarding_tasks_request").on(table.requestId),
    idxStatus: index("idx_offboarding_tasks_status").on(table.status),
    idxType: index("idx_offboarding_tasks_type").on(table.taskType),
  })
);

// HR Integrations Table
export const hrIntegrations = pgTable(
  "hr_integrations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    provider: text("provider").notNull(), // 'bamboohr', 'keka', 'darwinbox'
    name: text("name").notNull(),
    config: jsonb("config").$type<Record<string, any>>().notNull(),
    webhookSecret: text("webhook_secret"),
    status: text("status").notNull().default('active'), // 'active', 'inactive', 'error'
    syncEnabled: boolean("sync_enabled").default(true),
    autoTriggerOffboarding: boolean("auto_trigger_offboarding").default(true),
    defaultPlaybookId: varchar("default_playbook_id"),
    lastSyncAt: timestamp("last_sync_at"),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_hr_integrations_tenant").on(table.tenantId),
    idxProvider: index("idx_hr_integrations_provider").on(table.provider),
  })
);

// Enrollment Tokens Table - For device enrollment
export const enrollmentTokens = pgTable(
  "enrollment_tokens",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    token: varchar("token").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true),
    expiresAt: timestamp("expires_at"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").default(0),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_enrollment_tokens_tenant").on(table.tenantId),
    idxToken: index("idx_enrollment_tokens_token").on(table.token),
    idxActive: index("idx_enrollment_tokens_active").on(table.tenantId, table.isActive),
  })
);

// Network Monitoring Tables - WiFi device tracking and alerts
export const wifiDevices = pgTable(
  "wifi_devices",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id").notNull(),
    macAddress: varchar("mac_address").notNull(),
    ipAddress: varchar("ip_address").notNull(),
    hostname: text("hostname"),
    manufacturer: text("manufacturer"),
    assetId: varchar("asset_id"),
    assetName: text("asset_name"),
    isAuthorized: boolean("is_authorized").default(false),
    firstSeen: timestamp("first_seen").defaultNow(),
    lastSeen: timestamp("last_seen").defaultNow(),
    isActive: boolean("is_active").default(true),
    connectionDuration: integer("connection_duration").default(0),
    deviceType: text("device_type"),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_wifi_devices_tenant").on(table.tenantId),
    idxMac: index("idx_wifi_devices_mac").on(table.macAddress),
    idxActive: index("idx_wifi_devices_active").on(table.tenantId, table.isActive),
    uniqueTenantMac: uniqueIndex("uniq_wifi_devices_tenant_mac").on(table.tenantId, table.macAddress),
  })
);

export const networkAlerts = pgTable(
  "network_alerts",
  {
    id: serial("id").primaryKey(),
    tenantId: varchar("tenant_id").notNull(),
    macAddress: varchar("mac_address").notNull(),
    ipAddress: varchar("ip_address").notNull(),
    hostname: text("hostname"),
    manufacturer: text("manufacturer"),
    detectedAt: timestamp("detected_at").defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at"),
    acknowledgedBy: varchar("acknowledged_by"),
    status: text("status").notNull().default("new"), // 'new', 'acknowledged', 'resolved'
    notes: text("notes"),
    deviceInfo: jsonb("device_info").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_network_alerts_tenant").on(table.tenantId),
    idxStatus: index("idx_network_alerts_status").on(table.tenantId, table.status),
    idxDetected: index("idx_network_alerts_detected").on(table.detectedAt),
  })
);

// API Keys for Network Agents
export const networkAgentKeys = pgTable(
  "network_agent_keys",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    apiKey: varchar("api_key").notNull().unique(),
    agentName: text("agent_name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true),
    lastUsedAt: timestamp("last_used_at"),
    createdBy: varchar("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_network_agent_keys_tenant").on(table.tenantId),
    idxApiKey: index("idx_network_agent_keys_api_key").on(table.apiKey),
  })
);

// Validation Schemas for Phase 3
export const insertOffboardingPlaybookSchema = createInsertSchema(offboardingPlaybooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOffboardingRequestSchema = createInsertSchema(offboardingRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  initiatedAt: true,
});

export const insertOffboardingTaskSchema = createInsertSchema(offboardingTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHrIntegrationSchema = createInsertSchema(hrIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Phase 3
export type OffboardingPlaybook = typeof offboardingPlaybooks.$inferSelect;
export type InsertOffboardingPlaybook = z.infer<typeof insertOffboardingPlaybookSchema>;
export type OffboardingRequest = typeof offboardingRequests.$inferSelect;
export type InsertOffboardingRequest = z.infer<typeof insertOffboardingRequestSchema>;
export type OffboardingTask = typeof offboardingTasks.$inferSelect;
export type InsertOffboardingTask = z.infer<typeof insertOffboardingTaskSchema>;
export type HrIntegration = typeof hrIntegrations.$inferSelect;
export type InsertHrIntegration = z.infer<typeof insertHrIntegrationSchema>;

// ========================================
// Phase 4: Policy Automation Engine
// ========================================

// Automated Policies Table
export const automatedPolicies = pgTable(
  "automated_policies",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").default(true),
    priority: integer("priority").default(0),

    // Trigger (IF)
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, any>>().notNull(),

    // Conditions
    conditions: jsonb("conditions").$type<Record<string, any>>(),

    // Actions (THEN)
    actions: jsonb("actions").$type<Array<{
      type: string;
      config: Record<string, any>;
    }>>().notNull(),

    // Execution settings
    cooldownMinutes: integer("cooldown_minutes").default(0),
    maxExecutionsPerDay: integer("max_executions_per_day"),
    requireApproval: boolean("require_approval").default(false),

    // Statistics
    executionCount: integer("execution_count").default(0),
    successCount: integer("success_count").default(0),
    failureCount: integer("failure_count").default(0),
    lastExecutedAt: timestamp("last_executed_at"),

    // Metadata
    createdBy: varchar("created_by").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_automated_policies_tenant").on(table.tenantId),
    idxTrigger: index("idx_automated_policies_trigger").on(table.triggerType, table.enabled),
    idxTenantEnabled: index("idx_automated_policies_tenant_enabled").on(table.tenantId, table.enabled),
  })
);

// Policy Executions Table
export const policyExecutions = pgTable(
  "policy_executions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    policyId: varchar("policy_id").notNull(),

    // Trigger context
    triggerEvent: text("trigger_event").notNull(),
    triggerData: jsonb("trigger_data").$type<Record<string, any>>().notNull(),

    // Execution details
    status: text("status").notNull().default('pending'),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),

    // Actions executed
    actionsExecuted: integer("actions_executed").default(0),
    actionsSucceeded: integer("actions_succeeded").default(0),
    actionsFailed: integer("actions_failed").default(0),

    // Results
    result: jsonb("result").$type<Record<string, any>>(),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_policy_executions_tenant").on(table.tenantId),
    idxPolicy: index("idx_policy_executions_policy").on(table.policyId),
    idxStatus: index("idx_policy_executions_status").on(table.status),
    idxCreated: index("idx_policy_executions_created").on(table.createdAt),
  })
);

// Policy Templates Table
export const policyTemplates = pgTable(
  "policy_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    icon: text("icon"),

    // Template configuration
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, any>>().notNull(),
    conditions: jsonb("conditions").$type<Record<string, any>>(),
    actions: jsonb("actions").$type<Array<{
      type: string;
      config: Record<string, any>;
    }>>().notNull(),

    // Metadata
    isSystem: boolean("is_system").default(false),
    popularity: integer("popularity").default(0),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    idxCategory: index("idx_policy_templates_category").on(table.category),
    idxPopularity: index("idx_policy_templates_popularity").on(table.popularity),
  })
);

// Policy Approvals Table
export const policyApprovals = pgTable(
  "policy_approvals",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),
    executionId: varchar("execution_id").notNull(),
    policyId: varchar("policy_id").notNull(),

    status: text("status").notNull().default('pending'),
    requestedAt: timestamp("requested_at").defaultNow(),
    requestedBy: varchar("requested_by"),

    approvedBy: varchar("approved_by"),
    approvedAt: timestamp("approved_at"),
    approvalNotes: text("approval_notes"),

    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_policy_approvals_tenant").on(table.tenantId),
    idxStatus: index("idx_policy_approvals_status").on(table.status),
    idxExecution: index("idx_policy_approvals_execution").on(table.executionId),
  })
);

// Validation Schemas for Phase 4
export const insertAutomatedPolicySchema = createInsertSchema(automatedPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executionCount: true,
  successCount: true,
  failureCount: true,
  lastExecutedAt: true,
});

export const insertPolicyExecutionSchema = createInsertSchema(policyExecutions).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export const insertPolicyTemplateSchema = createInsertSchema(policyTemplates).omit({
  id: true,
  createdAt: true,
  popularity: true,
});

export const insertPolicyApprovalSchema = createInsertSchema(policyApprovals).omit({
  id: true,
  createdAt: true,
  requestedAt: true,
});

// Types for Phase 4
export type AutomatedPolicy = typeof automatedPolicies.$inferSelect;
export type InsertAutomatedPolicy = z.infer<typeof insertAutomatedPolicySchema>;
export type PolicyExecution = typeof policyExecutions.$inferSelect;
export type InsertPolicyExecution = z.infer<typeof insertPolicyExecutionSchema>;
export type PolicyTemplate = typeof policyTemplates.$inferSelect;
export type InsertPolicyTemplate = z.infer<typeof insertPolicyTemplateSchema>;
export type PolicyApproval = typeof policyApprovals.$inferSelect;
export type InsertPolicyApproval = z.infer<typeof insertPolicyApprovalSchema>;

// ========================================
// Phase 5: Identity Governance & Access Reviews
// ========================================

// Access Review Campaigns
export const accessReviewCampaigns = pgTable(
  "access_review_campaigns",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Campaign details
    name: text("name").notNull(),
    description: text("description"),
    campaignType: text("campaign_type").notNull(), // 'quarterly', 'department', 'high_risk', 'admin', 'new_hire', 'departure'
    frequency: text("frequency"), // 'quarterly', 'semi_annual', 'annual', 'one_time'

    // Scope
    scopeType: text("scope_type").notNull().default("all"), // 'all', 'department', 'apps', 'users'
    scopeConfig: jsonb("scope_config").$type<Record<string, any>>(),

    // Schedule
    startDate: timestamp("start_date").notNull(),
    dueDate: timestamp("due_date").notNull(),
    autoApproveOnTimeout: boolean("auto_approve_on_timeout").default(false),

    // Status tracking
    status: text("status").notNull().default("draft"), // 'draft', 'active', 'completed', 'cancelled'
    totalItems: integer("total_items").default(0),
    reviewedItems: integer("reviewed_items").default(0),
    approvedItems: integer("approved_items").default(0),
    revokedItems: integer("revoked_items").default(0),
    deferredItems: integer("deferred_items").default(0),

    // Audit
    createdBy: varchar("created_by").notNull(),
    completedAt: timestamp("completed_at"),
    completionReportUrl: text("completion_report_url"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_access_review_campaigns_tenant").on(table.tenantId),
    idxStatus: index("idx_access_review_campaigns_status").on(table.tenantId, table.status),
    idxDue: index("idx_access_review_campaigns_due").on(table.dueDate),
  })
);

// Access Review Items
export const accessReviewItems = pgTable(
  "access_review_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    campaignId: varchar("campaign_id").notNull(),

    // What to review
    userId: varchar("user_id").notNull(),
    userName: text("user_name").notNull(),
    userEmail: text("user_email"),
    userDepartment: text("user_department"),
    userManager: text("user_manager"),

    appId: varchar("app_id").notNull(),
    appName: text("app_name").notNull(),
    accessType: text("access_type"),

    // Context
    grantedDate: timestamp("granted_date"),
    lastUsedDate: timestamp("last_used_date"),
    daysSinceLastUse: integer("days_since_last_use"),
    businessJustification: text("business_justification"),
    riskLevel: text("risk_level"), // 'low', 'medium', 'high', 'critical'

    // Review
    reviewerId: varchar("reviewer_id"),
    reviewerName: text("reviewer_name"),
    decision: text("decision").default("pending"), // 'pending', 'approved', 'revoked', 'deferred'
    decisionNotes: text("decision_notes"),
    reviewedAt: timestamp("reviewed_at"),

    // Execution
    executionStatus: text("execution_status").default("pending"), // 'pending', 'completed', 'failed'
    executedAt: timestamp("executed_at"),
    executionError: text("execution_error"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxCampaign: index("idx_access_review_items_campaign").on(table.campaignId),
    idxReviewer: index("idx_access_review_items_reviewer").on(table.reviewerId, table.decision),
    idxUser: index("idx_access_review_items_user").on(table.userId),
    idxApp: index("idx_access_review_items_app").on(table.appId),
  })
);

// Access Review Decisions
export const accessReviewDecisions = pgTable(
  "access_review_decisions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    campaignId: varchar("campaign_id").notNull(),
    reviewItemId: varchar("review_item_id").notNull(),

    // Decision
    decision: text("decision").notNull(), // 'approved', 'revoked', 'deferred'
    decisionNotes: text("decision_notes"),
    decisionRationale: text("decision_rationale"),

    // Reviewer
    reviewerId: varchar("reviewer_id").notNull(),
    reviewerName: text("reviewer_name").notNull(),
    reviewerEmail: text("reviewer_email"),

    // Execution
    executionStatus: text("execution_status").default("pending"),
    executedAt: timestamp("executed_at"),
    executionResult: jsonb("execution_result").$type<Record<string, any>>(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    idxCampaign: index("idx_access_review_decisions_campaign").on(table.campaignId),
    idxItem: index("idx_access_review_decisions_item").on(table.reviewItemId),
    idxReviewer: index("idx_access_review_decisions_reviewer").on(table.reviewerId),
  })
);

// Role Templates
export const roleTemplates = pgTable(
  "role_templates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Role details
    name: text("name").notNull(),
    description: text("description"),
    department: text("department"),
    level: text("level"), // 'individual_contributor', 'manager', 'director', 'executive'

    // Expected access
    expectedApps: jsonb("expected_apps").$type<Array<{
      appId: string;
      appName: string;
      accessType: string;
      required: boolean;
    }>>().notNull(),

    // Metadata
    userCount: integer("user_count").default(0),
    isActive: boolean("is_active").default(true),

    // Audit
    createdBy: varchar("created_by").notNull(),
    lastReviewedAt: timestamp("last_reviewed_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_role_templates_tenant").on(table.tenantId),
    idxDepartment: index("idx_role_templates_department").on(table.tenantId, table.department),
    uniqTenantName: uniqueIndex("uniq_role_templates_tenant_name").on(table.tenantId, table.name),
  })
);

// User Role Assignments
export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // Assignment
    userId: varchar("user_id").notNull(),
    roleTemplateId: varchar("role_template_id").notNull(),

    // Tracking
    effectiveDate: timestamp("effective_date").notNull().defaultNow(),
    expiryDate: timestamp("expiry_date"),
    assignedBy: varchar("assigned_by").notNull(),
    assignmentReason: text("assignment_reason"),

    // Review
    nextReviewDate: timestamp("next_review_date"),
    lastReviewedAt: timestamp("last_reviewed_at"),

    // Status
    isActive: boolean("is_active").default(true),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_user_role_assignments_tenant").on(table.tenantId),
    idxUser: index("idx_user_role_assignments_user").on(table.userId, table.isActive),
    idxRole: index("idx_user_role_assignments_role").on(table.roleTemplateId),
  })
);

// Privilege Drift Alerts
export const privilegeDriftAlerts = pgTable(
  "privilege_drift_alerts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // User and role
    userId: varchar("user_id").notNull(),
    userName: text("user_name").notNull(),
    userEmail: text("user_email"),
    userDepartment: text("user_department"),
    roleTemplateId: varchar("role_template_id"),
    roleName: text("role_name"),

    // Drift details
    expectedApps: jsonb("expected_apps").$type<Array<{ appId: string; appName: string }>>(),
    actualApps: jsonb("actual_apps").$type<Array<{ appId: string; appName: string }>>(),
    excessApps: jsonb("excess_apps").$type<Array<{ appId: string; appName: string }>>(),
    missingApps: jsonb("missing_apps").$type<Array<{ appId: string; appName: string }>>(),

    // Risk assessment
    riskScore: integer("risk_score").default(0),
    riskLevel: text("risk_level"), // 'low', 'medium', 'high', 'critical'
    riskFactors: jsonb("risk_factors").$type<string[]>(),

    // Recommended actions
    recommendedAction: text("recommended_action"),
    recommendedAppsToRevoke: jsonb("recommended_apps_to_revoke").$type<Array<{ appId: string; appName: string }>>(),

    // Status
    status: text("status").default("open"), // 'open', 'in_review', 'resolved', 'deferred', 'false_positive'
    resolutionNotes: text("resolution_notes"),
    resolvedBy: varchar("resolved_by"),
    resolvedAt: timestamp("resolved_at"),

    // Timestamps
    detectedAt: timestamp("detected_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_privilege_drift_alerts_tenant").on(table.tenantId),
    idxUser: index("idx_privilege_drift_alerts_user").on(table.userId, table.status),
    idxRisk: index("idx_privilege_drift_alerts_risk").on(table.tenantId, table.riskLevel, table.status),
    idxDetected: index("idx_privilege_drift_alerts_detected").on(table.detectedAt),
  })
);

// Overprivileged Accounts
export const overprivilegedAccounts = pgTable(
  "overprivileged_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: varchar("tenant_id").notNull(),

    // User details
    userId: varchar("user_id").notNull(),
    userName: text("user_name").notNull(),
    userEmail: text("user_email"),
    userDepartment: text("user_department"),
    userTitle: text("user_title"),

    // Overprivilege details
    adminAppCount: integer("admin_app_count").default(0),
    adminApps: jsonb("admin_apps").$type<Array<{
      appId: string;
      appName: string;
      accessType: string;
      grantedAt: string;
      lastUsedAt: string;
    }>>(),

    // Stale access
    staleAdminCount: integer("stale_admin_count").default(0),
    staleAdminApps: jsonb("stale_admin_apps").$type<Array<{
      appId: string;
      appName: string;
      daysSinceLastUse: number;
    }>>(),

    // Cross-department access
    crossDeptAdminCount: integer("cross_dept_admin_count").default(0),
    crossDeptAdminApps: jsonb("cross_dept_admin_apps").$type<Array<{
      appId: string;
      appName: string;
      appCategory: string;
    }>>(),

    // Risk assessment
    riskScore: integer("risk_score").default(0),
    riskLevel: text("risk_level"), // 'low', 'medium', 'high', 'critical'
    riskFactors: jsonb("risk_factors").$type<string[]>(),

    // Business justification
    hasJustification: boolean("has_justification").default(false),
    justificationText: text("justification_text"),
    justificationApprovedBy: varchar("justification_approved_by"),
    justificationExpiresAt: timestamp("justification_expires_at"),

    // Recommendations
    recommendedAction: text("recommended_action"),
    recommendedAppsToDowngrade: jsonb("recommended_apps_to_downgrade").$type<Array<{
      appId: string;
      appName: string;
      currentAccess: string;
      recommendedAccess: string;
    }>>(),
    leastPrivilegeAlternative: text("least_privilege_alternative"),

    // Status
    status: text("status").default("open"), // 'open', 'in_remediation', 'resolved', 'deferred', 'accepted_risk'
    remediationPlan: text("remediation_plan"),
    remediationDeadline: timestamp("remediation_deadline"),
    resolvedBy: varchar("resolved_by"),
    resolvedAt: timestamp("resolved_at"),
    resolutionNotes: text("resolution_notes"),

    // Timestamps
    detectedAt: timestamp("detected_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    idxTenant: index("idx_overprivileged_accounts_tenant").on(table.tenantId),
    idxUser: index("idx_overprivileged_accounts_user").on(table.userId, table.status),
    idxRisk: index("idx_overprivileged_accounts_risk").on(table.tenantId, table.riskLevel, table.status),
    idxDetected: index("idx_overprivileged_accounts_detected").on(table.detectedAt),
  })
);

// Validation schemas for Phase 5
export const insertAccessReviewCampaignSchema = createInsertSchema(accessReviewCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAccessReviewItemSchema = createInsertSchema(accessReviewItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAccessReviewDecisionSchema = createInsertSchema(accessReviewDecisions).omit({
  id: true,
  createdAt: true,
});

export const insertRoleTemplateSchema = createInsertSchema(roleTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserRoleAssignmentSchema = createInsertSchema(userRoleAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPrivilegeDriftAlertSchema = createInsertSchema(privilegeDriftAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOverprivilegedAccountSchema = createInsertSchema(overprivilegedAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Phase 5
export type AccessReviewCampaign = typeof accessReviewCampaigns.$inferSelect;
export type InsertAccessReviewCampaign = z.infer<typeof insertAccessReviewCampaignSchema>;
export type AccessReviewItem = typeof accessReviewItems.$inferSelect;
export type InsertAccessReviewItem = z.infer<typeof insertAccessReviewItemSchema>;
export type AccessReviewDecision = typeof accessReviewDecisions.$inferSelect;
export type InsertAccessReviewDecision = z.infer<typeof insertAccessReviewDecisionSchema>;
export type RoleTemplate = typeof roleTemplates.$inferSelect;
export type InsertRoleTemplate = z.infer<typeof insertRoleTemplateSchema>;
export type UserRoleAssignment = typeof userRoleAssignments.$inferSelect;
export type InsertUserRoleAssignment = z.infer<typeof insertUserRoleAssignmentSchema>;
export type PrivilegeDriftAlert = typeof privilegeDriftAlerts.$inferSelect;
export type InsertPrivilegeDriftAlert = z.infer<typeof insertPrivilegeDriftAlertSchema>;
export type OverprivilegedAccount = typeof overprivilegedAccounts.$inferSelect;
export type InsertOverprivilegedAccount = z.infer<typeof insertOverprivilegedAccountSchema>;

