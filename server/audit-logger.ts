import { storage } from "./storage";
import type { InsertAuditLog, User } from "@shared/schema";
import type { Request } from "express";

// Comprehensive audit event types
export const AuditActions = {
  // Authentication
  LOGIN: "login",
  SIGNUP: "signup", 
  LOGOUT: "logout",
  PASSWORD_CHANGE: "password_change",
  
  // Assets
  ASSET_CREATE: "asset_create",
  ASSET_UPDATE: "asset_update", 
  ASSET_DELETE: "asset_delete",
  ASSET_BULK_IMPORT: "asset_bulk_import",
  ASSET_BULK_UPDATE: "asset_bulk_update",
  
  // Software Licenses
  LICENSE_CREATE: "license_create",
  LICENSE_UPDATE: "license_update",
  LICENSE_DELETE: "license_delete",
  LICENSE_ASSIGN: "license_assign",
  LICENSE_UNASSIGN: "license_unassign",
  
  // Users & Team Management
  USER_CREATE: "user_create",
  USER_UPDATE: "user_update",
  USER_DELETE: "user_delete",
  USER_INVITE: "user_invite",
  USER_INVITE_ACCEPT: "user_invite_accept",
  USER_INVITE_CANCEL: "user_invite_cancel",
  USER_ROLE_UPDATE: "user_role_update",
  USER_PROFILE_UPDATE: "user_profile_update",
  
  // Tickets
  TICKET_CREATE: "ticket_create",
  TICKET_UPDATE: "ticket_update",
  TICKET_DELETE: "ticket_delete",
  TICKET_ASSIGN: "ticket_assign",
  TICKET_STATUS_CHANGE: "ticket_status_change",
  TICKET_COMMENT_ADD: "ticket_comment_add",
  TICKET_COMMENT_UPDATE: "ticket_comment_update",
  TICKET_COMMENT_DELETE: "ticket_comment_delete",
  
  // Settings & Preferences
  USER_PREFERENCES_UPDATE: "user_preferences_update",
  ORG_SETTINGS_UPDATE: "org_settings_update",
  SYSTEM_SETTINGS_UPDATE: "system_settings_update",
  
  // AI & Recommendations
  AI_QUERY: "ai_query",
  RECOMMENDATION_CREATE: "recommendation_create",
  RECOMMENDATION_ACCEPT: "recommendation_accept",
  RECOMMENDATION_DISMISS: "recommendation_dismiss",
  
  // Data Export/Import
  DATA_EXPORT: "data_export",
  DATA_IMPORT: "data_import",
  
  // System Administration
  TENANT_CREATE: "tenant_create",
  TENANT_UPDATE: "tenant_update",
  
  // Reports & Analytics
  REPORT_GENERATE: "report_generate",
  REPORT_EXPORT: "report_export",

  // Generic CRUD actions (for new features)
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",
  SYNC: "sync",
} as const;

export const ResourceTypes = {
  USER: "user",
  ASSET: "asset",
  LICENSE: "software_license",
  TICKET: "ticket",
  COMMENT: "comment",
  INVITATION: "invitation",
  TENANT: "tenant",
  PREFERENCES: "preferences",
  SETTINGS: "settings",
  AI_ASSISTANT: "ai_assistant",
  RECOMMENDATION: "recommendation",
  REPORT: "report",
  SYSTEM: "system",
  // SaaS Governance (Phase 0)
  SAAS_APP: "saas_app",
  SAAS_CONTRACT: "saas_contract",
  USER_APP_ACCESS: "user_app_access",
  OAUTH_TOKEN: "oauth_token",
  IDENTITY_PROVIDER: "identity_provider",
  SAAS_INVOICE: "saas_invoice",
  GOVERNANCE_POLICY: "governance_policy",
} as const;

interface AuditLogOptions {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  description?: string;
  beforeState?: any;
  afterState?: any;
  metadata?: Record<string, any>;
}

interface UserContext {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
}

class AuditLogger {
  /**
   * Log an activity with user context from authenticated request
   */
  async logActivity(
    userContext: UserContext,
    options: AuditLogOptions,
    req?: Request
  ): Promise<void> {
    try {
      const logEntry: InsertAuditLog = {
        action: options.action,
        resourceType: options.resourceType,
        resourceId: options.resourceId || null,
        userId: userContext.userId,
        userEmail: userContext.email,
        userRole: userContext.role,
        tenantId: userContext.tenantId,
        description: options.description || `${options.action} ${options.resourceType}`,
        beforeState: options.beforeState ? this.sanitizeForLogging(options.beforeState) : null,
        afterState: options.afterState ? this.sanitizeForLogging(options.afterState) : null,
        ipAddress: req ? this.extractClientIP(req) : null,
        userAgent: req?.headers['user-agent'] || null,
      };

      await storage.logActivity(logEntry);
    } catch (error) {
      console.error("Failed to log audit activity:", error);
      // Don't throw - audit logging should not break main operations
    }
  }

  /**
   * Log system activities (no user context)
   */
  async logSystemActivity(
    tenantId: string,
    options: AuditLogOptions
  ): Promise<void> {
    try {
      const logEntry: InsertAuditLog = {
        action: options.action,
        resourceType: options.resourceType,
        resourceId: options.resourceId || null,
        userId: "system",
        userEmail: "system@internal",
        userRole: "system",
        tenantId: tenantId,
        description: options.description || `System ${options.action} ${options.resourceType}`,
        beforeState: options.beforeState ? this.sanitizeForLogging(options.beforeState) : null,
        afterState: options.afterState ? this.sanitizeForLogging(options.afterState) : null,
        ipAddress: null,
        userAgent: "system",
      };

      await storage.logActivity(logEntry);
    } catch (error) {
      console.error("Failed to log system audit activity:", error);
    }
  }

  /**
   * Log authentication activities
   */
  async logAuthActivity(
    action: string,
    email: string,
    tenantId: string,
    req: Request,
    success: boolean = true,
    additionalInfo?: Record<string, any>,
    userId?: string,
    userRole?: string
  ): Promise<void> {
    try {
      const logEntry: InsertAuditLog = {
        action,
        resourceType: ResourceTypes.USER,
        resourceId: userId || null,
        userId: userId || "auth_attempt",
        userEmail: email,
        userRole: userRole || "unauthenticated",
        tenantId: tenantId || "unknown",
        description: `${action} ${success ? 'successful' : 'failed'} for ${email}`,
        beforeState: null,
        afterState: additionalInfo ? this.sanitizeForLogging({ success, ...additionalInfo }) : { success },
        ipAddress: this.extractClientIP(req),
        userAgent: req.headers['user-agent'] || null,
      };

      await storage.logActivity(logEntry);
    } catch (error) {
      console.error("Failed to log auth audit activity:", error);
    }
  }

  /**
   * Extract client IP from request
   */
  private extractClientIP(req: Request): string {
    return (
      req.headers['x-forwarded-for'] as string ||
      req.headers['x-real-ip'] as string ||
      req.socket.remoteAddress ||
      'unknown'
    ).split(',')[0].trim();
  }

  /**
   * Helper to create user context from authenticated request
   */
  createUserContext(req: any): UserContext {
    if (!req.user) {
      throw new Error("Request is not authenticated");
    }
    
    return {
      userId: req.user.userId,
      email: req.user.email,
      role: req.user.role,
      tenantId: req.user.tenantId,
    };
  }

  /**
   * Helper to sanitize sensitive data before logging
   */
  sanitizeForLogging(data: any): any {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
    
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeForLogging(sanitized[key]);
      }
    });
    
    return sanitized;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();

// Export types for use in other modules
export type { UserContext, AuditLogOptions };