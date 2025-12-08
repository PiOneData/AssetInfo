import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, decimal, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
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
