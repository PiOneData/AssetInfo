import express, { type Express, Request, Response, RequestHandler } from "express";
import { and, eq , sql, InferInsertModel, desc, ne, inArray, gte } from "drizzle-orm";
import * as s from "@shared/schema";
import { oaFetchDeviceSoftware, oaSubmitDeviceXML, oaFindDeviceId, oaUpdateDeviceOrg, oaLogin, oaFetchDevices } from "./utils/openAuditClient";
import { syncOpenAuditFirstPage } from "./services/openauditSync";
import { getSyncStatus,markSyncChanged } from "./utils/syncHeartbeat";
import { pool, db } from "./db";
import { createServer, type Server } from "http";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { auditLogger, AuditActions, ResourceTypes } from "./audit-logger";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import jwt from "jsonwebtoken";
import { 
  generateToken, 
  verifyToken, 
  hashPassword, 
  comparePassword, 
  checkPermission,
  canAssignRole,
  getAllowedRolesForAssignment,
  type JWTPayload 
} from "./services/auth";
import { generateAssetRecommendations, processITAMQuery, type ITAMQueryContext } from "./services/openai";
import { getComplianceOverview } from "./compliance/overview";
import { getComplianceScoreDetails } from "./compliance/scoreDetails";
import { generateTempPassword } from "./utils/password-generator";
import { sendEmail, generateSecurePassword, createWelcomeEmailTemplate } from "./services/email";
import { processEmailToTicket, validateEmailData, validateWebhookAuth } from "./services/email-to-ticket";
import { resolveTenantFromEnrollmentToken } from "./middleware/tenantContext";
import { 
  loginSchema, 
  registerSchema, 
  insertAssetSchema,
  insertSoftwareLicenseSchema,
  insertMasterDataSchema,
  updateUserProfileSchema,
  insertUserPreferencesSchema,
  updateOrgSettingsSchema,
  inviteUserSchema,
  acceptInvitationSchema,
  updateUserRoleSchema,
  insertTicketSchema,
  updateTicketSchema,
  insertTicketCommentSchema,
  AssetTypeEnum,
  type LoginRequest,
  type RegisterRequest,
  type UpdateUserProfile,
  type InsertUserPreferences,
  type UpdateOrgSettings,
  type InviteUser,
  type AcceptInvitation,
  type UpdateUserRole,
  type InsertEnrollmentToken,
  type User
} from "@shared/schema";
import { z } from "zod";


declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      authUser?: User;
    }
  }
}

function buildMinimalOAXml(input: {
  hostname: string;
  ip?: string | null;
  serial?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}) {
  // Keep it minimal; OA accepts sparse XML
  // NOTE: OpenAudit IGNORES <org_id> in XML - devices always go to default org
  // Organization must be assigned via POST-submission PATCH call
  const now = new Date();
  const ts = now.toISOString().slice(0, 19).replace("T", " ");
  const esc = (s: any) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<system>
  <sys>
    <script_version>5.6.x</script_version>
    <timestamp>${ts}</timestamp>
    <hostname>${esc(input.hostname)}</hostname>
    ${input.ip ? `<ip>${esc(input.ip)}</ip>` : ""}

    <type>computer</type>

    ${input.osName ? `<os_name>${esc(input.osName)}</os_name>` : ""}
    ${input.osVersion ? `<os_version>${esc(input.osVersion)}</os_version>` : ""}

    ${input.manufacturer ? `<manufacturer>${esc(input.manufacturer)}</manufacturer>` : ""}
    ${input.model ? `<model>${esc(input.model)}</model>` : ""}
    ${input.serial ? `<serial>${esc(input.serial)}</serial>` : ""}

    <last_seen_by>agent</last_seen_by>
  </sys>
</system>`;
}


// Auth middleware
const authenticateToken = async (req: Request, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: "Access token required" });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userRecord = await storage.getUser(payload.userId);
    if (!userRecord || !userRecord.isActive) {
      return res.status(401).json({ message: "Invalid authentication" });
    }

    req.user = {
      ...payload,
      role: userRecord.role,
      tenantId: userRecord.tenantId,
    };
    req.authUser = userRecord;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};

// Middleware to validate authenticated user exists in database
const validateUserExists = async (req: Request, res: Response, next: Function) => {
  try {
    let user = req.authUser;
    if (!user && req.user?.userId) {
      user = await storage.getUser(req.user.userId);
      if (user) {
        req.authUser = user;
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid authentication" });
    }
    next();
  } catch (error) {
    console.error("User validation error:", error);
    return res.status(401).json({ message: "Authentication error" });
  }
};

const requireRole = (role: string) => (req: Request, res: Response, next: Function) => {
  if (!req.user || !checkPermission(req.user.role, role)) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Development/maintenance route - Backfill admin locks
  app.post("/api/dev/backfill-admin-locks", async (req: Request, res: Response) => {
    try {
      const result = await storage.backfillTenantAdminLocks();
      res.json({
        message: "Backfill completed",
        result
      });
    } catch (error) {
      console.error("Backfill error:", error);
      res.status(500).json({ message: "Backfill failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Test endpoint to check if discovery tables exist
  app.get("/api/dev/test-discovery-tables", async (req: Request, res: Response) => {
    try {
      console.log('[Test] Checking discovery tables...');
      
      // Try to query discoveryJobs table
      const jobs = await db.select().from(s.discoveryJobs).limit(1);
      console.log('[Test] discoveryJobs query successful, found:', jobs.length);
      
      // Try to query discoveryTokens table
      const tokens = await db.select().from(s.discoveryTokens).limit(1);
      console.log('[Test] discoveryTokens query successful, found:', tokens.length);
      
      res.json({
        success: true,
        message: "Discovery tables exist and are queryable",
        jobsCount: jobs.length,
        tokensCount: tokens.length
      });
    } catch (error: any) {
      console.error('[Test] Error querying discovery tables:', error);
      res.status(500).json({
        success: false,
        message: "Discovery tables test failed",
        error: error.message,
        code: error.code
      });
    }
  });

  // Development/maintenance route - Migrate existing users to add userID values
  app.post("/api/dev/migrate-user-ids", async (req: Request, res: Response) => {
    try {
      await storage.migrateExistingUsersWithUserIDs();
      res.json({
        message: "User ID migration completed successfully"
      });
    } catch (error) {
      console.error("User ID migration error:", error);
      res.status(500).json({ message: "User ID migration failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Debug endpoint - verify authentication is working
  app.get("/api/debug/whoami", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      console.log('[DEBUG /api/debug/whoami]', {
        userId: user.userId,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        hasAuthHeader: !!req.headers.authorization,
        authHeaderPrefix: req.headers.authorization?.substring(0, 20)
      });
      
      res.json({
        authenticated: true,
        user: {
          userId: user.userId,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role
        },
        token: {
          hasAuthHeader: !!req.headers.authorization,
          authHeaderPrefix: req.headers.authorization?.substring(0, 20) + '...'
        }
      });
    } catch (error) {
      console.error('[DEBUG /api/debug/whoami] Error:', error);
      res.status(500).json({ message: "Debug endpoint failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password }: LoginRequest = loginSchema.parse(req.body);
      
      let user;
      try {
        user = await storage.getUserByEmail(email);
      } catch (dbError) {
        console.error("Database connection failed during login:", dbError);
        return res.status(503).json({ 
          message: "Service temporarily unavailable. Database connection failed.",
          code: "DATABASE_UNAVAILABLE"
        });
      }
      
      if (!user) {
        // Log failed login attempt
        try {
          await auditLogger.logAuthActivity(
            AuditActions.LOGIN,
            email,
            "unknown", // Don't know tenant yet
            req,
            false,
            { reason: "user_not_found" }
          );
        } catch (auditError) {
          console.warn("Failed to log auth activity:", auditError);
        }
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        // Log failed login attempt with known user
        try {
          await auditLogger.logAuthActivity(
            AuditActions.LOGIN,
            email,
            user.tenantId,
            req,
            false,
            { reason: "invalid_password" },
            user.id,
            user.role
          );
        } catch (auditError) {
          console.warn("Failed to log auth activity:", auditError);
        }
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        await auditLogger.logAuthActivity(
          AuditActions.LOGIN,
          email,
          user.tenantId,
          req,
          false,
          { reason: "account_deactivated" },
          user.id,
          user.role
        );
        return res.status(403).json({
          success: false,
          code: "ACCOUNT_DEACTIVATED",
          message: "Your account has been deactivated. Please contact your administrator to reactivate your account.",
        });
      }

      // Check if user must change password on first login
      if (user.mustChangePassword) {
        // Log login attempt with password change required
        await auditLogger.logAuthActivity(
          AuditActions.LOGIN,
          email,
          user.tenantId,
          req,
          false,
          { reason: "password_change_required" },
          user.id,
          user.role
        );
        return res.status(401).json({ 
          message: "Password change required",
          requirePasswordChange: true,
          userId: user.id
        });
      }

      const token = generateToken(user);
      const tenant = await storage.getTenant(user.tenantId);

      // Ensure tenant has a default enrollment token
      if (tenant) {
        ensureDefaultEnrollmentToken(tenant.id, tenant.name).catch(err => 
          console.error("Failed to ensure default enrollment token:", err)
        );
      }

      // Log successful login
      await auditLogger.logAuthActivity(
        AuditActions.LOGIN,
        email,
        user.tenantId,
        req,
        true,
        { 
          tenantName: tenant?.name 
        },
        user.id,
        user.role
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId,
        },
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: "Invalid request data" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      
      const { email, password, firstName, lastName, tenantName }: RegisterRequest = 
        registerSchema.parse(req.body);

      // Check database connectivity first
      let existingUser;
      try {
        existingUser = await storage.getUserByEmail(email);
      } catch (dbError) {
        console.error("Database connection failed during registration:", dbError);
        return res.status(503).json({ 
          message: "Service temporarily unavailable. Database connection failed.",
          code: "DATABASE_UNAVAILABLE"
        });
      }
      
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Check if organization already exists by name (case-insensitive)
      let tenant;
      try {
        tenant = await storage.getTenantByName(tenantName);
      } catch (dbError) {
        console.error("Database connection failed during tenant lookup:", dbError);
        return res.status(503).json({ 
          message: "Service temporarily unavailable. Database connection failed.",
          code: "DATABASE_UNAVAILABLE"
        });
      }
      
      if (!tenant) {
        // Create new organization if it doesn't exist
        const slug = tenantName.toLowerCase().replace(/\s+/g, '-');
        tenant = await storage.createTenant({
          name: tenantName,
          slug: slug,
        });
        
        // Automatically create organization in OpenAudit
        try {
          const { oaCreateOrganization } = await import("./utils/openAuditClient");
          const oaOrgId = await oaCreateOrganization(tenantName);
          
          // Update tenant with OpenAudit org ID and enable sync
          await db
            .update(s.tenants)
            .set({
              openauditOrgId: oaOrgId,
              openauditUrl: process.env.OA_BASE_URL || 'https://open-audit.vistrivetech.com',
              openauditUsername: process.env.OA_USERNAME || 'admin',
              openauditPassword: process.env.OA_PASSWORD || 'vistrivetech',
              openauditSyncEnabled: true,
              openauditSyncCron: '*/5 * * * *', // Sync every 5 minutes
            })
            .where(eq(s.tenants.id, tenant.id));
          
          console.log(`✅ Created OpenAudit organization '${tenantName}' with ID: ${oaOrgId}`);
        } catch (error) {
          console.error(`⚠️  Failed to create OpenAudit organization for ${tenantName}:`, error);
          // Don't fail registration if OpenAudit org creation fails
        }
        
        // Create default enrollment token for the new tenant
        try {
          await ensureDefaultEnrollmentToken(tenant.id, tenant.name);
          console.log(`✅ Created default enrollment token for '${tenantName}'`);
        } catch (error) {
          console.error(`⚠️  Failed to create enrollment token for ${tenantName}:`, error);
        }
      }

      // SECURITY RESTRICTION: Atomic first admin user creation to prevent race conditions
      const hashedPassword = await hashPassword(password);
      
      const result = await storage.createFirstAdminUser({
        username: email,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: "super-admin", // Will be forced to super-admin by the method
        tenantId: tenant.id,
      }, tenant.id);
      
      if (!result.success) {
        if (result.alreadyExists) {
          // Log failed signup attempt - admin already exists
          await auditLogger.logAuthActivity(
            AuditActions.SIGNUP,
            email,
            tenant.id,
            req,
            false,
            { 
              reason: "admin_already_exists", 
              tenantName: tenant.name,
              attemptedRole: "admin"
            }
          );
          
          // Admin already exists - block direct signup and redirect to invitation flow
          return res.status(403).json({ 
            message: "Direct signup is not allowed for this organization",
            code: "SIGNUP_RESTRICTED",
            details: {
              organizationName: tenant.name,
              adminExists: true,
              invitationRequired: true,
              message: "An administrator already exists for this organization. Please contact your admin to receive an invitation, or check your email for an existing invitation."
            }
          });
        } else {
          // Log failed signup attempt - server error
          await auditLogger.logAuthActivity(
            AuditActions.SIGNUP,
            email,
            tenant.id,
            req,
            false,
            { reason: "server_error", tenantName: tenant.name }
          );
          
          // Unexpected error during first admin creation
          return res.status(500).json({ 
            message: "Unable to create account due to a server error. Please try again later.",
            code: "SERVER_ERROR"
          });
        }
      }
      
      const user = result.user!;

      // Log successful signup
      await auditLogger.logAuthActivity(
        AuditActions.SIGNUP,
        email,
        tenant.id,
        req,
        true,
        { 
          tenantName: tenant.name,
          isFirstAdmin: true
        },
        user.id,
        user.role
      );

      const token = generateToken(user);

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId,
        },
        tenant: { id: tenant.id, name: tenant.name },
        roleAssignment: {
          requested: "admin",
          assigned: "admin",
          isFirstUser: true,
          wasElevated: false,
          wasDowngraded: false
        }
      });
    } catch (error) {
      console.error("Registration validation error:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", error.errors);
        return res.status(400).json({ 
          message: "Invalid registration data", 
          errors: error.errors 
        });
      }
      res.status(400).json({ message: "Invalid request data" });
    }
  });

  app.get("/api/auth/verify", authenticateToken, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.user!.userId);
    const tenant = await storage.getTenant(req.user!.tenantId);
    
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
      },
      tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
    });
  });

    // Sync Open-AudIT devices into assets
  app.post("/api/assets/openaudit/sync", authenticateToken, async (req, res) => {
    try {
      const tenantId = req.user!.tenantId; // use authenticated tenant
      const limit = req.body?.limit ? Number(req.body.limit) : 50;

      const { imported, total } = await syncOpenAuditFirstPage(tenantId, limit);
      res.json({ ok: true, imported, total });
    } catch (err) {
      console.error("Open-AudIT sync error:", err);
      res.status(500).json({ message: "Failed to sync from Open-AudIT" });
    }
  });

  // ==========================
  // NETWORK DISCOVERY SCANNER DOWNLOAD (like /enroll)
  // ==========================
  app.get("/discover", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      
      if (!token) {
        return res.status(400).send("Missing discovery token");
      }

      // Verify token and get job info
      let tokenData: any;
      try {
        tokenData = jwt.verify(token, process.env.SESSION_SECRET || "secret");
      } catch (error) {
        return res.status(401).send("Invalid or expired discovery token");
      }

      // Detect OS from User-Agent
      const osOverride = String(req.query.os ?? "").toLowerCase();
      const ua = String(req.headers["user-agent"] || "").toLowerCase();
      const isMacUA = ua.includes("mac os x") || ua.includes("macintosh");
      const isWinUA = ua.includes("windows");
      const isLinuxUA = ua.includes("linux") && !ua.includes("android");

      const isMac = osOverride === "mac" ? true : osOverride === "win" || osOverride === "linux" ? false : isMacUA;
      const isWin = osOverride === "win" ? true : osOverride === "mac" || osOverride === "linux" ? false : isWinUA;
      const isLinux = osOverride === "linux" ? true : osOverride === "mac" || osOverride === "win" ? false : isLinuxUA;

      // Scanner download URLs (to be built)
      const macUrl = `/api/discovery/download/${tokenData.jobIdShort}/macos`;
      const winUrl = `/api/discovery/download/${tokenData.jobIdShort}/windows`;
      const linuxUrl = `/api/discovery/download/${tokenData.jobIdShort}/linux`;

      const primaryUrl = isMac ? macUrl : isLinux ? linuxUrl : winUrl;
      const primaryLabel = isMac
        ? "Download Scanner for macOS"
        : isLinux
        ? "Download Scanner for Linux"
        : "Download Scanner for Windows";

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Network Discovery Scanner</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root{color-scheme:dark}
    body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:0;padding:2rem;background:#0b1220;color:#e6edf3}
    .card{max-width:720px;margin:0 auto;background:#111827;border:1px solid #263043;border-radius:16px;padding:1.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.25)}
    h1{font-size:1.4rem;margin:0 0 .5rem}
    p{opacity:.9;line-height:1.6}
    .actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}
    a.btn{display:inline-block;padding:.75rem 1rem;border-radius:10px;border:1px solid #304156;text-decoration:none;color:#e6edf3}
    a.btn.primary{background:#1f6feb;border-color:#1f6feb}
    .hint{margin-top:.75rem;color:#9fb3c8;font-size:0.9rem}
    code{background:#0d1626;padding:.2rem .35rem;border-radius:6px}
  </style>
</head>
<body>
  <div class="card">
    <h1>🔍 Network Discovery Scanner</h1>
    <p>This will download and run the SNMP network scanner to discover devices on your network.</p>

    <div class="actions">
      <a class="btn primary" id="primary" href="${primaryUrl}">${primaryLabel}</a>
      <a class="btn" href="${winUrl}">Windows</a>
      <a class="btn" href="${macUrl}">macOS</a>
      <a class="btn" href="${linuxUrl}">Linux</a>
    </div>

    <p class="hint">📝 <strong>Instructions:</strong></p>
    <ol class="hint">
      <li>The installer will download automatically (.pkg for macOS, .bat for Windows, .sh for Linux)</li>
      <li><strong>macOS:</strong> Double-click the .pkg file → Installation wizard appears → Click Continue/Install</li>
      <li><strong>Windows:</strong> Double-click the .bat file → Command window opens</li>
      <li><strong>Linux:</strong> Run with sudo: <code>sudo ./itam-discovery-*.sh</code></li>
      <li>A Terminal window will open showing scan progress with a progress bar</li>
      <li>Results will upload automatically to your dashboard</li>
      <li>Review and import discovered devices from the dashboard modal</li>
    </ol>

    <p class="hint"><small>Job ID: <code>${tokenData.jobIdShort}</code> • Token expires in 30 minutes</small></p>
  </div>

  <script>
    // Auto-trigger download after 1 second
    setTimeout(function(){
      var a = document.getElementById('primary');
      if (a && a.href) window.location.href = a.href;
    }, 1000);
  </script>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);

    } catch (error) {
      console.error("Discovery download error:", error);
      res.status(500).send("Failed to initiate discovery download");
    }
  });

  // Direct enrollment script for quick testing (bash pipe-able)
  // URL format: /enroll-direct/:token
  app.get("/enroll-direct/:token", async (req, res) => {
    const enrollmentToken = req.params.token;
    
    if (!enrollmentToken) {
      return res.status(400).send("# ERROR: No enrollment token provided\nexit 1\n");
    }
    
    try {
      const scriptPath = path.join(process.cwd(), "static/installers/enroll-quick.sh");
      
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).send("# ERROR: Enrollment script not found\nexit 1\n");
      }
      
      let script = fs.readFileSync(scriptPath, "utf-8");
      
      // Inject the enrollment token and server URL into the script
      script = script.replace(
        'ENROLLMENT_TOKEN="${ENROLLMENT_TOKEN:-$1}"',
        `ENROLLMENT_TOKEN="${enrollmentToken}"`
      );
      
      res.setHeader("Content-Type", "application/x-shellscript");
      res.setHeader("Content-Disposition", 'inline; filename="enroll.sh"');
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(script);
    } catch (error) {
      console.error("Error serving enrollment script:", error);
      res.status(500).send("# ERROR: Failed to generate enrollment script\nexit 1\n");
    }
  });

  // Tenant-specific OS-detecting enrollment page
  // URL format: /enroll/:token or /enroll?token=xxx
  app.get("/enroll/:token?", async (req, res) => {
    // Get enrollment token from URL or query param
    const enrollmentToken = req.params.token || String(req.query.token || "");
    
    if (!enrollmentToken) {
      return res.status(400).send(`
        <!doctype html>
        <html lang="en">
        <head><meta charset="utf-8" /><title>Enrollment Error</title>
        <style>body{font-family:system-ui;max-width:600px;margin:4rem auto;padding:2rem;text-align:center;background:#0b1220;color:#e6edf3}
        .error{padding:2rem;background:#dc2626;border-radius:12px;color:white}</style></head>
        <body><div class="error"><h1>❌ Invalid Enrollment Link</h1>
        <p>This enrollment link is missing or invalid. Please contact your IT administrator for a valid enrollment link.</p></div></body></html>
      `);
    }

    // Validate token and get tenant info
    const mockReq = { 
      body: { enrollmentToken },
      headers: {},
      query: {}
    } as Request;
    const tenant = await resolveTenantFromEnrollmentToken(mockReq);
    
    if (!tenant) {
      return res.status(401).send(`
        <!doctype html>
        <html lang="en">
        <head><meta charset="utf-8" /><title>Enrollment Error</title>
        <style>body{font-family:system-ui;max-width:600px;margin:4rem auto;padding:2rem;text-align:center;background:#0b1220;color:#e6edf3}
        .error{padding:2rem;background:#dc2626;border-radius:12px;color:white}</style></head>
        <body><div class="error"><h1>❌ Invalid or Expired Token</h1>
        <p>This enrollment token is invalid, expired, or has reached its usage limit. Please contact your IT administrator for a new enrollment link.</p></div></body></html>
      `);
    }

    // Allow manual override: /enroll/token?os=mac or /enroll/token?os=win or /enroll/token?os=linux
    const osOverride = String(req.query.os ?? "").toLowerCase();

    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const isMacUA = ua.includes("mac os x") || ua.includes("macintosh");
    const isWinUA = ua.includes("windows");
    const isLinuxUA = ua.includes("linux") && !ua.includes("android");

    const isMac = osOverride === "mac" ? true : osOverride === "win" || osOverride === "linux" ? false : isMacUA;
    const isWin = osOverride === "win" ? true : osOverride === "mac" || osOverride === "linux" ? false : isWinUA;
    const isLinux = osOverride === "linux" ? true : osOverride === "mac" || osOverride === "win" ? false : isLinuxUA;

    // Files placed under /static/installers/ - NOW WITH TOKEN
    const macUrl = `/api/enroll/${enrollmentToken}/mac-installer`;
    const winUrl = `/api/enroll/${enrollmentToken}/win-installer`;
    const linuxUrl = `/enroll/${enrollmentToken}/linux-installer`; // Auto-terminal installer
    const linuxScriptUrl = `/static/installers/itam-agent-linux-gui.sh?token=${enrollmentToken}`; // Direct script download
    const linuxCliUrl = `/static/installers/itam-agent-linux.sh?token=${enrollmentToken}`;

    const primaryUrl = isMac ? macUrl : isLinux ? linuxUrl : winUrl;
    const primaryLabel = isMac
      ? "Download for macOS (.pkg)"
      : isLinux
      ? "Download Auto-Installer (.sh)"
      : "Download for Windows (.exe)";

    const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ITAM Agent Enrollment - ${tenant.name}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <style>
      :root{color-scheme:dark}
      *{box-sizing:border-box}
      body{
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;
        margin:0;
        padding:0;
        min-height:100vh;
        background:linear-gradient(135deg,#1E1E1E 0%,#232323 50%,#1A1C1E 100%);
        color:#e6edf3;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:2rem;
        letter-spacing:0.01em;
        font-weight:500;
      }
      .card{
        max-width:900px;
        width:100%;
        background:rgba(17,24,39,0.8);
        backdrop-filter:blur(24px);
        -webkit-backdrop-filter:blur(24px);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:24px;
        padding:3rem;
        box-shadow:0 8px 32px rgba(0,0,0,0.3),inset 0 0 0 1px rgba(255,255,255,0.05);
        animation:fadeInUp 0.5s cubic-bezier(0.4,0,0.2,1);
      }
      @keyframes fadeInUp{
        from{opacity:0;transform:translateY(8px)}
        to{opacity:1;transform:translateY(0)}
      }
      .header{text-align:center;margin-bottom:2.5rem}
      .org-badge{
        display:inline-flex;
        align-items:center;
        gap:0.5rem;
        padding:0.5rem 1.25rem;
        background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(99,102,241,0.15));
        border:1px solid rgba(59,130,246,0.3);
        border-radius:12px;
        margin-bottom:1.5rem;
        font-size:0.875rem;
        font-weight:600;
        color:#60A5FA;
      }
      h1{
        font-size:2.5rem;
        margin:0 0 1rem;
        font-weight:600;
        background:linear-gradient(90deg,#60A5FA,#A78BFA);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
        line-height:1.2;
      }
      .subtitle{
        font-size:1.125rem;
        color:#9CA3AF;
        line-height:1.6;
        margin:0;
      }
      .subtitle strong{color:#E5E7EB}
      .actions{
        display:flex;
        gap:0.75rem;
        flex-wrap:wrap;
        margin:2rem 0;
        justify-content:center;
      }
      a.btn{
        display:inline-flex;
        align-items:center;
        gap:0.5rem;
        padding:0.875rem 1.5rem;
        border-radius:12px;
        text-decoration:none;
        font-weight:600;
        font-size:0.9375rem;
        transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
        border:1px solid rgba(255,255,255,0.2);
        background:rgba(255,255,255,0.05);
        color:#E5E7EB;
      }
      a.btn:hover{
        background:rgba(255,255,255,0.1);
        border-color:rgba(59,130,246,0.5);
        transform:translateY(-1px);
        box-shadow:0 4px 12px rgba(0,0,0,0.2);
      }
      a.btn.primary{
        background:linear-gradient(135deg,#3B82F6,#6366F1);
        border-color:transparent;
        color:white;
        box-shadow:0 4px 6px rgba(0,0,0,0.1);
      }
      a.btn.primary:hover{
        background:linear-gradient(135deg,#2563EB,#4F46E5);
        box-shadow:0 0 20px rgba(59,130,246,0.4),0 4px 12px rgba(0,0,0,0.3);
        transform:translateY(-2px);
      }
      .hint{
        margin-top:1.5rem;
        color:#6B7280;
        text-align:center;
        font-size:0.875rem;
      }
      code{
        background:rgba(0,0,0,0.3);
        padding:0.25rem 0.5rem;
        border-radius:6px;
        font-family:'SF Mono',Monaco,'Courier New',monospace;
        font-size:0.875rem;
        color:#93C5FD;
      }
      .install-note{
        margin-top:2rem;
        padding:2rem;
        background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(99,102,241,0.1));
        border-radius:16px;
        border:2px solid rgba(59,130,246,0.3);
        box-shadow:0 0 20px rgba(59,130,246,0.15);
      }
      .install-note h3{
        margin:0 0 1rem;
        color:#60A5FA;
        font-size:1.5rem;
        font-weight:600;
      }
      .install-note p{
        color:#D1D5DB;
        line-height:1.7;
        margin:0 0 1.25rem;
      }
      .cmd-container{
        margin:1.5rem 0;
        padding:1.25rem;
        background:rgba(0,0,0,0.5);
        border-radius:12px;
        border:2px solid rgba(59,130,246,0.3);
      }
      .cmd-container code{
        display:block;
        color:#4ADE80;
        font-size:0.9375rem;
        user-select:all;
        background:transparent;
        padding:0;
      }
      .copy-btn{
        margin-top:1.25rem;
        padding:0.875rem 1.75rem;
        background:linear-gradient(135deg,#3B82F6,#6366F1);
        color:white;
        border:none;
        border-radius:12px;
        cursor:pointer;
        font-size:0.9375rem;
        font-weight:600;
        font-family:inherit;
        box-shadow:0 4px 6px rgba(0,0,0,0.2);
        transition:all 0.2s cubic-bezier(0.4,0,0.2,1);
        display:inline-flex;
        align-items:center;
        gap:0.5rem;
      }
      .copy-btn:hover{
        background:linear-gradient(135deg,#2563EB,#4F46E5);
        box-shadow:0 0 20px rgba(59,130,246,0.4);
        transform:translateY(-2px);
      }
      .info-box{
        margin-top:1.5rem;
        padding:1.25rem;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:12px;
      }
      .info-box h4{
        margin:0 0 1rem;
        color:#E5E7EB;
        font-size:1.125rem;
        font-weight:600;
        display:flex;
        align-items:center;
        gap:0.5rem;
      }
      .info-box ol{
        margin:0 0 0 1.25rem;
        padding:0;
        color:#D1D5DB;
        line-height:1.8;
        font-size:0.9375rem;
      }
      .info-box .note{
        margin:1rem 0 0;
        padding-top:1rem;
        border-top:1px solid rgba(255,255,255,0.1);
        color:#9CA3AF;
        font-size:0.875rem;
      }
      .info-box .note strong{color:#E5E7EB}
      @media(max-width:640px){
        .card{padding:2rem 1.5rem}
        h1{font-size:2rem}
        .actions{flex-direction:column}
        a.btn{width:100%;justify-content:center}
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <div class="org-badge">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
          ${tenant.name}
        </div>
        <h1>Install ITAM Agent</h1>
        <p class="subtitle">This will install the agent and register your device with <strong>${tenant.name}</strong>'s IT Asset Management system.</p>
      </div>

      <div class="actions">
        <a class="btn primary" id="primary" href="${primaryUrl}">${primaryLabel}</a>
        <a class="btn" href="${winUrl}">Windows (.exe)</a>
        <a class="btn" href="${macUrl}">macOS (.pkg)</a>
        <a class="btn" href="${linuxUrl}">Linux (GUI)</a>
        <a class="btn" href="${linuxCliUrl}">Linux (CLI)</a>
      </div>

      <p class="hint"><small>The download should start automatically. If not, click the button above.</small></p>
      ${isLinux ? `
      <div class="install-note">
        <h3>
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="display:inline-block;vertical-align:middle;margin-right:0.5rem"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          Register Your Linux Device
        </h3>
        <p>The ITAM installer has been downloaded. Run this command in your terminal to install and register your device:</p>
        
        <div class="cmd-container">
          <code id="installCmd">cd ~/Downloads && sudo bash itam_installer_${tenant.name}.sh</code>
        </div>
        
        <button class="copy-btn" onclick="copyInstallCmd()">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          Copy Command
        </button>
        
        <div class="info-box">
          <h4>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            What happens:
          </h4>
          <ol>
            <li>Creates <code>/opt/itam-agent</code> directory with enrollment configuration</li>
            <li>Installs audit script and collects device information</li>
            <li>Automatically registers device with your organization</li>
            <li>Device appears immediately in your Assets dashboard</li>
            <li>Logs saved to <code>/opt/itam-agent/logs/</code></li>
          </ol>
          <p class="note">
            <strong>Note:</strong> Must be run with <code>sudo</code> (requires root privileges)
          </p>
        </div>
      </div>
      <script>
        function copyInstallCmd() {
          const cmd = document.getElementById('installCmd').textContent;
          navigator.clipboard.writeText(cmd).then(() => {
            const btn = event.target.closest('button');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Copied! Paste in your terminal';
            setTimeout(() => { btn.innerHTML = originalHTML; }, 3000);
          });
        }
      </script>
      ` : '<p class="hint"><small>No terminal or VPN required.</small></p>'}
      <p class="hint"><small>Tip: append <code>?os=mac</code>, <code>?os=win</code>, or <code>?os=linux</code> to test platform detection.</small></p>
    </div>

    <script>
      // Auto-trigger the primary download after a short delay
      setTimeout(function(){
        var a = document.getElementById('primary');
        if (a && a.href) window.location.href = a.href;
      }, 1000);
    </script>
  </body>
  </html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  // Serve Linux installer script with embedded enrollment token
  app.get("/enroll/:token/linux-installer", async (req, res) => {
    try {
      const enrollmentToken = req.params.token;
      
      if (!enrollmentToken) {
        return res.status(400).send("# ERROR: Enrollment token required\nexit 1\n");
      }
      
      // Validate token
      const mockReq = { 
        body: { enrollmentToken },
        headers: {},
        query: {}
      } as Request;
      const tenant = await resolveTenantFromEnrollmentToken(mockReq);
      
      if (!tenant) {
        return res.status(401).send("# ERROR: Invalid or expired enrollment token\nexit 1\n");
      }
      
      const scriptPath = path.join(process.cwd(), "build/linux/agent/audit_linux.sh");
      
      // Check if file exists
      if (!fs.existsSync(scriptPath)) {
        res.status(404).send("# ERROR: Linux audit script not found\nexit 1\n");
        return;
      }

      // Read the audit script
      let auditScript = fs.readFileSync(scriptPath, "utf-8");
      
      // Create the enrollment configuration setup script
      const serverUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const tenantName = tenant.name || 'default';
      
      const enrollmentSetup = `#!/bin/bash
# ============================================
# ITAM Multi-Tenant Enrollment Installer
# Organization: ${tenantName}
# Generated: ${new Date().toISOString()}
# ============================================

# Ensure running as root
if [ "$EUID" -ne 0 ]; then 
  echo "❌ ERROR: This installer must be run as root (use sudo)"
  exit 1
fi

echo "🚀 ITAM Agent Installer for Organization: ${tenantName}"
echo "================================================"

# Create ITAM agent directory
ITAM_DIR="/opt/itam-agent"
ITAM_LOGS_DIR="$ITAM_DIR/logs"
ENROLLMENT_CONF="$ITAM_DIR/enrollment.conf"

echo "📁 Creating directories..."
mkdir -p "$ITAM_DIR"
mkdir -p "$ITAM_LOGS_DIR"

# Create enrollment configuration file
echo "📝 Writing enrollment configuration..."
cat > "$ENROLLMENT_CONF" <<'ENROLLMENT_EOF'
# ITAM Enrollment Configuration
# Organization: ${tenantName}
# Auto-generated - DO NOT EDIT MANUALLY

ENROLLMENT_TOKEN=${enrollmentToken}
ITAM_SERVER_URL=${serverUrl}
TENANT_NAME=${tenantName}
ENROLLMENT_EOF

# Set proper permissions
chmod 600 "$ENROLLMENT_CONF"
chmod 755 "$ITAM_DIR"
chmod 755 "$ITAM_LOGS_DIR"

echo "✅ Configuration file created at $ENROLLMENT_CONF"

# Write the audit script
echo "📝 Installing audit script..."
cat > "$ITAM_DIR/audit_linux.sh" <<'AUDIT_SCRIPT_EOF'
${auditScript}
AUDIT_SCRIPT_EOF

chmod +x "$ITAM_DIR/audit_linux.sh"

echo "✅ Audit script installed at $ITAM_DIR/audit_linux.sh"

# Run the audit script to enroll the device
echo ""
echo "🔄 Running enrollment..."
echo "================================================"

cd "$ITAM_DIR"
bash "$ITAM_DIR/audit_linux.sh" -d 2 2>&1 | tee "$ITAM_LOGS_DIR/enroll_$(date +%Y%m%d_%H%M%S).log"

ENROLL_STATUS=$?

echo ""
echo "================================================"
if [ $ENROLL_STATUS -eq 0 ]; then
  echo "✅ Installation and enrollment completed successfully!"
  echo "📋 Configuration: $ENROLLMENT_CONF"
  echo "📜 Audit script: $ITAM_DIR/audit_linux.sh"
  echo "📂 Logs: $ITAM_LOGS_DIR/"
else
  echo "⚠️  Installation completed but enrollment may have failed"
  echo "   Check logs in: $ITAM_LOGS_DIR/"
  echo "   To retry: sudo bash $ITAM_DIR/audit_linux.sh -d 2"
fi
echo "================================================"

exit $ENROLL_STATUS
`;
      
      res.setHeader("Content-Type", "application/x-shellscript");
      res.setHeader("Content-Disposition", `attachment; filename="itam_installer_${tenantName}.sh"`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(enrollmentSetup);
    } catch (error) {
      console.error("Error serving Linux installer:", error);
      res.status(500).send("# ERROR: Failed to generate installer\nexit 1\n");
    }
  });

  // Serve macOS PKG installer with embedded enrollment token
  // Endpoint for macOS agent to claim enrollment session (nonce-based)
  app.post("/api/agent/claim", async (req, res) => {
    try {
      const { nonce, serial, hostname, osv } = req.body;
      
      if (!nonce) {
        return res.status(400).json({ error: "Nonce required" });
      }
      
      // Look up enrollment session from storage
      const sessionKey = `enrollment_session:${nonce}`;
      const sessionData = await storage.getEnrollmentSession(nonce);
      
      if (!sessionData) {
        console.error(`Invalid or expired nonce: ${nonce}`);
        return res.status(404).json({ error: "Invalid or expired enrollment session" });
      }
      
      // Check if already consumed
      if (sessionData.status === 'consumed') {
        console.error(`Nonce already consumed: ${nonce}`);
        return res.status(409).json({ error: "Enrollment session already used" });
      }
      
      // Mark as consumed
      await storage.consumeEnrollmentSession(nonce, {
        serial,
        hostname,
        osv,
        claimedAt: new Date().toISOString()
      });
      
      // Return tenant-specific enrollment URL
      const serverUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const enrollUrl = `${serverUrl}/api/agent/enroll?token=${sessionData.tenantToken}`;
      
      console.log(`✓ Enrollment session claimed: ${nonce.substring(0, 8)}... → Tenant: ${sessionData.tenantId} → Device: ${hostname} (${serial})`);
      
      res.json({
        enrollUrl,
        tenantId: sessionData.tenantId,
        serverUrl
      });
      
    } catch (error) {
      console.error("Error claiming enrollment session:", error);
      res.status(500).json({ error: "Error claiming enrollment session" });
    }
  });

  // Serve macOS PKG installer with nonce-based enrollment session
  app.get("/api/enroll/:token/mac-installer", async (req, res) => {
    try {
      const enrollmentToken = req.params.token;
      
      if (!enrollmentToken) {
        return res.status(400).send("Enrollment token required");
      }
      
      // Validate token
      const mockReq = { 
        body: { enrollmentToken },
        headers: {},
        query: {}
      } as Request;
      const tenant = await resolveTenantFromEnrollmentToken(mockReq);
      
      if (!tenant) {
        return res.status(401).send("Invalid or expired enrollment token");
      }
      
      // Determine server URL from request
      const serverUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      
      // Use pre-built PKG template (built on macOS, stored on server)
      const templatePath = path.join(process.cwd(), "static/installers/itam-agent-macos-template.pkg");
      
      if (!fs.existsSync(templatePath)) {
        console.error("PKG template not found at:", templatePath);
        return res.status(500).send(`
          <h1>macOS Installer Not Available</h1>
          <p>The PKG template has not been built yet.</p>
          <p><strong>Instructions for server administrator:</strong></p>
          <ol>
            <li>On a macOS machine, run: <code>bash build/mac/build-pkg-template.sh</code></li>
            <li>Copy the generated <code>itam-agent-macos-template.pkg</code> file</li>
            <li>Upload it to: <code>static/installers/itam-agent-macos-template.pkg</code> on the server</li>
          </ol>
        `);
      }
      
      // Create one-time enrollment session with cryptographic nonce
      const crypto = await import('crypto');
      const nonce = crypto.randomBytes(16).toString('base64url');
      
      // Store enrollment session with server URL (expires in 15 minutes)
      await storage.createEnrollmentSession(nonce, {
        tenantId: tenant.id,
        tenantToken: enrollmentToken,
        userAgent: req.headers['user-agent'] || '',
        ipHash: req.ip || '',
        status: 'issued',
        serverUrl: serverUrl, // Include server URL in session
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      });
      
      console.log(`✓ Created enrollment session for tenant: ${tenant.name} (nonce: ${nonce.substring(0, 8)}..., server: ${serverUrl})`);
      
      // Serve the static PKG with nonce in filename
      // The postinstall script will extract this nonce from /var/log/install.log
      // and exchange it for the enrollment URL via /api/agent/claim
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="itam-agent-${nonce}.pkg"`);
      res.sendFile(templatePath);
      
    } catch (error) {
      console.error("Error serving macOS installer:", error);
      res.status(500).send("Error generating installer");
    }
  });

  // Serve Windows installer with embedded enrollment token
  app.get("/api/enroll/:token/win-installer", async (req, res) => {
    try {
      const enrollmentToken = req.params.token;
      
      if (!enrollmentToken) {
        return res.status(400).send("ERROR: Enrollment token required");
      }
      
      // Validate token
      const mockReq = { 
        body: { enrollmentToken },
        headers: {},
        query: {}
      } as Request;
      const tenant = await resolveTenantFromEnrollmentToken(mockReq);
      
      if (!tenant) {
        return res.status(401).send("ERROR: Invalid or expired enrollment token");
      }

      const serverUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      
      console.log(`Building Windows installer for tenant: ${tenant.name}`);
      
      // Create enrollment configuration file content
      const enrollmentConfig = `# ITAM Enrollment Configuration for ${tenant.name}
# This file will be read by the ITAM agent during installation
ENROLLMENT_TOKEN=${enrollmentToken}
ITAM_SERVER_URL=${serverUrl}
TENANT_NAME=${tenant.name}
`;
      
      // Create a temporary directory for building custom installer
      const tmpDir = `/tmp/itam-win-${Date.now()}`;
      fs.mkdirSync(tmpDir, { recursive: true });
      
      try {
        // Copy the entire build/win directory structure
        const winBuildDir = path.join(process.cwd(), "build/win");
        execSync(`cp -R "${winBuildDir}/files" "${tmpDir}/files"`);
        execSync(`cp "${winBuildDir}/installer.nsi" "${tmpDir}/installer.nsi"`);
        
        // Create enrollment.conf file in the temp directory
        fs.writeFileSync(path.join(tmpDir, "enrollment.conf"), enrollmentConfig);
        
        // Build the installer with NSIS
        const buildResult = execSync(`cd "${tmpDir}" && makensis installer.nsi 2>&1`, { 
          encoding: 'utf-8'
        });
        
        console.log("NSIS build output:", buildResult);
        
        const customExePath = path.join(tmpDir, "itam-agent-win.exe");
        
        if (!fs.existsSync(customExePath)) {
          throw new Error("NSIS build completed but exe not found at expected location");
        }
        
        console.log(`Successfully built installer for ${tenant.name}`);
        
        // Send the custom installer
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="ITAM-Agent-${tenant.name}.exe"`);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        
        const fileStream = fs.createReadStream(customExePath);
        fileStream.pipe(res);
        
        fileStream.on("end", () => {
          // Cleanup temp directory
          setTimeout(() => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              console.log(`Cleaned up temp directory: ${tmpDir}`);
            } catch (e) {
              console.error("Cleanup error:", e);
            }
          }, 1000);
        });
        
        fileStream.on("error", (error) => {
          console.error("Error streaming installer:", error);
          fs.rmSync(tmpDir, { recursive: true, force: true });
        });
        
      } catch (error: any) {
        console.error("Error building Windows installer:", error);
        console.error("Error details:", error.message);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        
        if (!res.headersSent) {
          res.status(500).send(`ERROR: Failed to build installer: ${error.message}`);
        }
      }
      
    } catch (error: any) {
      console.error("Error serving Windows installer:", error);
      if (!res.headersSent) {
        res.status(500).send(`ERROR: Failed to generate installer: ${error.message}`);
      }
    }
  });

  // Receive one-shot enrollment from the agent, post to OA, upsert into ITAM
  app.post("/api/agent/enroll", async (req, res) => {
    try {
      // 1) Parse & normalize input
      const body = req.body ?? {};
      
      console.log("🔵 [ENROLL] Received enrollment request:");
      console.log("  Body keys:", Object.keys(body));
      console.log("  Body:", JSON.stringify(body, null, 2));
      
      const hostname = String(body.hostname ?? "").trim();
      const serial = (body.serial ?? null) ? String(body.serial).trim() : null;
      const manufacturer = (body.manufacturer ?? null) ? String(body.manufacturer).trim() : null;
      const model = (body.model ?? null) ? String(body.model).trim() : null;
      const osName = body?.os?.name ? String(body.os.name).trim() : null;
      const osVersion = body?.os?.version ? String(body.os.version).trim() : null;
      const osArchitecture = body?.os?.architecture ? String(body.os.architecture).trim() : null;
      const osBit = body?.os?.bit ? String(body.os.bit).trim() : null;
      const username = (body.username ?? null) ? String(body.username).trim() : null;
      const ipsArr: string[] = Array.isArray(body.ips) ? body.ips.map((x: any) => String(x)) : [];
      const uptimeSeconds =
        Number.isFinite(Number(body.uptimeSeconds)) ? Number(body.uptimeSeconds) : null;
      const enrollmentToken = body.enrollmentToken ? String(body.enrollmentToken).trim() : null;
      
      // Hardware specifications
      const hardware = body.hardware ?? {};
      const memoryKb = hardware.memory_kb ? Number(hardware.memory_kb) : null;
      const processor = hardware.processor ? String(hardware.processor).trim() : null;
      const processorCores = hardware.processor_cores ? Number(hardware.processor_cores) : null;
      const processorLogical = hardware.processor_logical ? Number(hardware.processor_logical) : null;
      const processorSpeedMhz = hardware.processor_speed_mhz ? Number(hardware.processor_speed_mhz) : null;

      console.log("🔵 [ENROLL] Parsed data:");
      console.log("  hostname:", hostname);
      console.log("  serial:", serial);
      console.log("  enrollmentToken:", enrollmentToken ? enrollmentToken.substring(0, 20) + "..." : "null");

      if (!hostname) {
        console.log("🔴 [ENROLL] ERROR: hostname is required");
        return res.status(400).json({ ok: false, error: "hostname is required" });
      }

      // 2) Resolve tenant from enrollment token (DYNAMIC TENANT RESOLUTION)
      let tenantId: string;
      let tenantName: string = "Unknown";
      let openauditOrgId: string | null = null;
      
      if (enrollmentToken) {
        // Token-based enrollment (recommended)
        console.log("🔵 [ENROLL] Token-based enrollment, resolving tenant...");
        const tenantContext = await import("./middleware/tenantContext");
        const mockReq = { body: { enrollmentToken }, headers: {}, query: {} } as Request;
        const tenant = await tenantContext.resolveTenantFromEnrollmentToken(mockReq);
        
        if (!tenant) {
          console.log("🔴 [ENROLL] ERROR: Invalid or expired enrollment token");
          return res.status(401).json({ 
            ok: false, 
            error: "Invalid or expired enrollment token",
            details: "The enrollment token is invalid, expired, or has reached its maximum usage limit"
          });
        }
        
        tenantId = tenant.id;
        tenantName = tenant.name;
        
        console.log("🟢 [ENROLL] Tenant resolved:");
        console.log("  tenantId:", tenantId);
        console.log("  tenantName:", tenantName);
        
        // Get full tenant details including OpenAudit org ID
        const [fullTenant] = await db
          .select()
          .from(s.tenants)
          .where(eq(s.tenants.id, tenant.id))
          .limit(1);
        
        openauditOrgId = fullTenant?.openauditOrgId ?? null;
        console.log("  openauditOrgId:", openauditOrgId);
        
        // Increment token usage count
        try {
          await storage.incrementEnrollmentTokenUsage(enrollmentToken);
          console.log("🟢 [ENROLL] Token usage incremented");
        } catch (error) {
          console.error("🔴 [ENROLL] Failed to increment token usage:", error);
          // Don't fail the enrollment if usage tracking fails
        }
      } else {
        // Fallback to environment variable for backward compatibility (DEPRECATED)
        const devTenant =
          process.env.ENROLL_DEFAULT_TENANT_ID ||
          process.env.OA_TENANT_ID ||
          process.env.DEFAULT_TENANT_ID;
        
        if (!devTenant) {
          return res.status(400).json({ 
            ok: false, 
            error: "Enrollment token required",
            details: "Please provide an enrollmentToken from your organization's admin panel. Direct enrollment without a token is deprecated."
          });
        }
        
        tenantId = devTenant;
        console.warn("⚠️  Agent enrollment using deprecated environment variable. Please use enrollment tokens instead.");
      }

      // Optional: allow skipping OA during debugging
      const skipOA = (process.env.ENROLL_SKIP_OA ?? "false").toLowerCase() === "true";
      let oaId: string | null = null;

      // 3) Upsert (by serial if present else by name)
      type NewAsset = InferInsertModel<typeof s.assets>;
      const now = new Date();

      const baseRow: NewAsset = {
        tenantId: tenantId,
        name: hostname,
        type: "Hardware",
        category: "computer",
        manufacturer: manufacturer,
        model: model,
        serialNumber: serial,
        status: "in-stock",
        addedViaEnrollment: true,

        location: null,
        country: null,
        state: null,
        city: null,

        assignedUserId: null,
        assignedUserName: username ?? null,
        assignedUserEmail: null,
        assignedUserEmployeeId: null,

        purchaseDate: null,
        purchaseCost: null,
        warrantyExpiry: null,
        amcExpiry: null,

        specifications: {
          agent: {
            platform: osName ?? null,
            agentVersion: "1.0",
            enrollMethod: enrollmentToken ? "token" : "env-fallback",
            lastCheckInAt: now.toISOString(),
            firstEnrolledAt: now.toISOString(),
            uptimeSeconds,
            lastIPs: ipsArr,
          },
          hardware: {
            memory_kb: memoryKb,
            memory_gb: memoryKb ? (memoryKb / 1024 / 1024).toFixed(2) : null,
            processor: processor,
            processor_cores: processorCores,
            processor_logical: processorLogical,
            processor_speed_mhz: processorSpeedMhz,
            architecture: osArchitecture,
            os_bit: osBit,
          },
          os: {
            name: osName,
            version: osVersion,
            architecture: osArchitecture,
            bit: osBit,
          },
        } as any,

        notes: `Enrolled to ${tenantName}`,

        softwareName: null,
        version: null,
        licenseType: null,
        licenseKey: null,
        usedLicenses: null,
        renewalDate: null,

        vendorName: null,
        vendorEmail: null,
        vendorPhone: null,

        companyName: null,
        companyGstNumber: null,

        createdAt: now,
        updatedAt: now,
      };

      // Upsert asset and get assetId
      let assetId: string;

      if (serial && serial.trim() !== "") {
        // ✅ Serial present → safe to use ON CONFLICT on (tenantId, serialNumber)
        const upsertResult = await db
          .insert(s.assets)
          .values(baseRow)
          .onConflictDoUpdate({
            target: [s.assets.tenantId, s.assets.serialNumber],
            set: {
              name: baseRow.name,
              type: baseRow.type,
              category: baseRow.category,
              manufacturer: baseRow.manufacturer,
              model: baseRow.model,
              assignedUserName: baseRow.assignedUserName,
              specifications: baseRow.specifications,
              notes: baseRow.notes,
              addedViaEnrollment: true,
              updatedAt: now,
            },
          })
          .returning({ id: s.assets.id });
        
        if (!upsertResult?.[0]?.id) {
          console.error("🔴 [ENROLL] DB upsert with serial returned no ID");
          return res.status(500).json({ 
            ok: false, 
            error: "Database upsert failed",
            details: "Failed to insert or update device in database"
          });
        }
        assetId = upsertResult[0].id;
        console.log("🟢 [ENROLL] Asset upserted with serial, assetId:", assetId);
      } else {
        // ❌ No serial → cannot use ON CONFLICT with the partial (tenantId,name) index.
        //    Manual merge: UPDATE first (only rows where serial_number IS NULL), INSERT if none updated.
        const updated = await db
          .update(s.assets)
          .set({
            type: baseRow.type,
            category: baseRow.category,
            manufacturer: baseRow.manufacturer,
            model: baseRow.model,
            assignedUserName: baseRow.assignedUserName,
            specifications: baseRow.specifications,
            notes: baseRow.notes,
            addedViaEnrollment: true,
            updatedAt: now,
          })
          .where(
            and(
              eq(s.assets.tenantId, baseRow.tenantId),
              eq(s.assets.name, baseRow.name),
              sql`${s.assets.serialNumber} IS NULL`
            )
          )
          .returning({ id: s.assets.id });

        if (updated.length === 0) {
          const insertResult = await db.insert(s.assets).values(baseRow).returning({ id: s.assets.id });
          if (!insertResult?.[0]?.id) {
            console.error("🔴 [ENROLL] DB insert without serial returned no ID");
            return res.status(500).json({ 
              ok: false, 
              error: "Database insert failed",
              details: "Failed to insert device in database"
            });
          }
          assetId = insertResult[0].id;
          console.log("🟢 [ENROLL] Asset inserted without serial, assetId:", assetId);
        } else {
          assetId = updated[0].id;
          console.log("🟢 [ENROLL] Asset updated without serial, assetId:", assetId);
        }
      }

      // Verify we have an assetId
      if (!assetId) {
        console.error("🔴 [ENROLL] No assetId after upsert");
        return res.status(500).json({ 
          ok: false, 
          error: "Database operation failed",
          details: "Device data could not be saved"
        });
      }

      // Re-read the asset row to get its id (REMOVED - we already have it from returning())
      // We now have assetId from the upsert operations above

      // 4) Build minimal OA XML and POST to OA (unless skipping for debug)
      if (!skipOA) {
        const primaryIp = ipsArr.find((ip) => ip && ip.includes(".")) || ipsArr[0] || null;
        const xml = buildMinimalOAXml({
          hostname,
          ip: primaryIp ?? null,
          serial,
          osName,
          osVersion,
          manufacturer: null,
          model: null,
        });
        console.log(`📤 Submitting device to OpenAudit...`);
        await oaSubmitDeviceXML(xml);

        // 5) Resolve OA device id (prefer serial, fallback hostname)
        oaId = await oaFindDeviceId({ serial, hostname });
        
        if (oaId) {
          console.log(`✅ Device submitted to OpenAudit. OA ID: ${oaId}`);
          
          // 5b) Move device to tenant's specific Open-AudIT organization
          if (openauditOrgId) {
            try {
              console.log(`🔄 Moving device ${oaId} to tenant org ${openauditOrgId} (${tenantName})...`);
              await oaUpdateDeviceOrg(
                oaId,
                openauditOrgId,
                hostname,
                serial || "",
                process.env.OPEN_AUDIT_URL,
                process.env.OPEN_AUDIT_USERNAME,
                process.env.OPEN_AUDIT_PASSWORD
              );
              console.log(`✅ Device moved to tenant organization ${tenantName} (OA Org: ${openauditOrgId})`);
            } catch (orgError: any) {
              console.error(`⚠️  Failed to move device to tenant org: ${orgError.message}`);
              // Don't fail enrollment if org assignment fails
            }
          } else {
            console.log(`⚠️  Tenant ${tenantName} has no OpenAudit org mapping, device stays in default org`);
          }
        } else {
          console.log(`⚠️  Could not find device in OpenAudit after submission`);
        }

        // 6) Patch asset.specifications.openaudit.id if we got it
        if (assetId && oaId) {
          await db
            .update(s.assets)
            .set({
              specifications: {
                ...(baseRow.specifications as any),
                openaudit: {
                  id: oaId,
                  hostname,
                  ip: primaryIp,
                  os: { name: osName, version: osVersion },
                },
              } as any,
              updatedAt: new Date(),
            })
            .where(eq(s.assets.id, assetId));
        }
      }

      // 7) Notify heartbeat and return
      markSyncChanged();

      console.log("🟢 [ENROLL] Success! Returning response:");
      console.log("  assetId:", assetId);
      console.log("  oaId:", oaId);
      console.log("  tenantId:", tenantId);
      console.log("  tenantName:", tenantName);

      return res.status(201).json({
        ok: true,
        assetId,
        oa: { deviceId: oaId ?? null },
        message: skipOA
          ? "Device enrolled (OA skipped by ENROLL_SKIP_OA=true)."
          : "Device enrolled and posted to Open-AudIT.",
      });
    } catch (e: any) {
      console.error("🔴 [POST /api/agent/enroll] fail:", e?.message ?? e);
      console.error("🔴 [POST /api/agent/enroll] stack:", e?.stack);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to enroll device", details: e?.message ?? String(e) });
    }
  });

  // Heartbeat (unchanged)
  app.get("/api/sync/status", (_req, res) => {
    res.json(getSyncStatus());
  });

  /**
   * GET software discovered for a device (by our Asset id).
   * - Looks up the asset
   * - Reads specifications.openaudit.id (with a few tolerant aliases)
   * - Calls oaFetchDeviceSoftware and returns normalized items
   */
  app.get("/api/assets/:assetId/software", async (req, res) => {
    try {
      const assetId = String(req.params.assetId);

      // Load asset
      const [row] = await db
        .select()
        .from(s.assets)
        .where(eq(s.assets.id, assetId))
        .limit(1);

      if (!row) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const manualLinks = await storage.getAssetSoftwareLinks(assetId, row.tenantId);
      const manualItems = manualLinks.map((link) => ({
        id: link.id,
        softwareAssetId: link.softwareAssetId,
        name: link.softwareName,
        version: link.softwareVersion,
        manufacturer: link.softwareManufacturer,
        assignedAt: link.createdAt,
      }));

      if (!row.addedViaEnrollment) {
        return res.json({
          status: "no-enrollment",
          message:
            "This device was not added through the tenant-specific enrollment link, so software inventory is unavailable.",
          manualItems,
        });
      }

      // Be tolerant of different shapes
      const specs: any = (row as any)?.specifications ?? {};
      const oaId =
        specs?.openaudit?.id ??
        specs?.openaudit_id ??
        specs?.oaId ??
        null;

      if (!oaId) {
        return res.json({ items: [], manualItems });
      }

      // Fetch software using shared OpenAudit credentials
      const items = await oaFetchDeviceSoftware(String(oaId));
      return res.json({ items, manualItems });
    } catch (e: any) {
      // Add server-side visibility
      console.error("[/api/assets/:assetId/software] failed:", e?.message ?? e);
      return res.status(500).json({
        error: "Failed to fetch software",
        details: e?.message ?? String(e),
      });
    }
  });

  app.post("/api/assets/:assetId/software-links", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const deviceAssetId = req.params.assetId;
      const softwareAssetId = typeof req.body?.softwareAssetId === "string" ? req.body.softwareAssetId : "";

      if (!softwareAssetId) {
        return res.status(400).json({ message: "softwareAssetId is required" });
      }

      const device = await storage.getAsset(deviceAssetId, tenantId);
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      if ((device.type || "").toLowerCase() !== "hardware") {
        return res.status(400).json({ message: "Software can only be assigned to hardware assets" });
      }

      const softwareAsset = await storage.getAsset(softwareAssetId, tenantId);
      if (!softwareAsset || (softwareAsset.type || "").toLowerCase() !== "software") {
        return res.status(400).json({ message: "Invalid software asset" });
      }

      try {
        await storage.createAssetSoftwareLink({
          tenantId,
          assetId: deviceAssetId,
          softwareAssetId,
          createdBy: req.user!.userId,
        });
      } catch (err: any) {
        if (err?.code !== "23505") {
          throw err;
        }
      }

      const manualLinks = await storage.getAssetSoftwareLinks(deviceAssetId, tenantId);
      const link = manualLinks.find((item) => item.softwareAssetId === softwareAssetId) || null;

      res.status(201).json({ link });
    } catch (error) {
      console.error("Failed to assign software:", error);
      res.status(500).json({ message: "Failed to assign software to device" });
    }
  });

  app.delete("/api/assets/:assetId/software-links/:softwareAssetId", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const tenantId = req.user!.tenantId;
      const { assetId, softwareAssetId } = req.params;

      if (!softwareAssetId) {
        return res.status(400).json({ message: "softwareAssetId is required" });
      }

      const device = await storage.getAsset(assetId, tenantId);
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }

      const removed = await storage.deleteAssetSoftwareLink(assetId, softwareAssetId, tenantId);
      if (!removed) {
        return res.status(404).json({ message: "Software assignment not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to unassign software:", error);
      res.status(500).json({ message: "Failed to unassign software from device" });
    }
  });

  /**
   * POST add selected software into inventory (as assets with type=Software).
   * - Manually checks for existing software and updates/inserts accordingly
   * - No ON CONFLICT to avoid constraint issues
   */
  app.post("/api/software/import", async (req, res) => {
    try {
      const { tenantId, deviceAssetId, items } = req.body as {
        tenantId: string;
        deviceAssetId?: string;
        items: Array<{ name: string; version?: string | null; publisher?: string | null }>;
      };

      if (!tenantId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "tenantId and items are required" });
      }

      const now = new Date();
      let created = 0;

      for (const it of items) {
        const baseName = (it.name || "").trim();
        if (!baseName) continue;

        const version = (it.version ?? "").trim();
        // Include version in name to make it unique (e.g., "Chrome 120.0" vs "Chrome 121.0")
        const fullName = version ? `${baseName} ${version}` : baseName;

        // Check if software already exists  
        const existing = await db
          .select()
          .from(s.assets)
          .where(
            and(
              eq(s.assets.tenantId, tenantId),
              eq(s.assets.name, fullName),
              eq(s.assets.type, "Software")
            )
          )
          .limit(1);

        let softwareAssetId: string | null = null;

        if (existing.length > 0) {
          softwareAssetId = existing[0].id;
          await db
            .update(s.assets)
            .set({
              version: version || null,
              manufacturer: it.publisher ?? null,
              updatedAt: now,
              notes: deviceAssetId
                ? `Added from device ${deviceAssetId}`
                : "Added from OA discovery",
            })
            .where(eq(s.assets.id, existing[0].id));
        } else {
          const inserted = await db
            .insert(s.assets)
            .values({
            tenantId,
            type: "Software",
            name: fullName,
            version: version || null,
            manufacturer: it.publisher ?? null,
            status: "in-stock",
            category: "Application",
            notes: deviceAssetId
              ? `Added from device ${deviceAssetId}`
              : "Added from OA discovery",

            // keep the rest null to satisfy schema
            specifications: null,
            location: null,
            country: null,
            state: null,
            city: null,
            assignedUserId: null,
            assignedUserName: null,
            assignedUserEmail: null,
            assignedUserEmployeeId: null,
            purchaseDate: null,
            purchaseCost: null,
            warrantyExpiry: null,
            amcExpiry: null,
            softwareName: null,
            licenseType: null,
            licenseKey: null,
            usedLicenses: null,
            renewalDate: null,
            vendorName: null,
            vendorEmail: null,
            vendorPhone: null,
            companyName: null,
            companyGstNumber: null,
            createdAt: now,
            updatedAt: now,
          })
            .returning({ id: s.assets.id });

          softwareAssetId = inserted?.[0]?.id ?? null;
        }

        if (softwareAssetId && deviceAssetId) {
          try {
            await storage.createAssetSoftwareLink({
              tenantId,
              assetId: deviceAssetId,
              softwareAssetId,
              createdBy: req.user?.userId ?? null,
            });
          } catch (linkError: any) {
            if (linkError?.code !== "23505") {
              console.error("Failed to create enrollment software link:", linkError);
            }
          }
        }

        created += 1;
      }

      return res.json({ ok: true, created });
    } catch (e: any) {
      console.error("[/api/software/import] failed:", e?.message ?? e);
      return res
        .status(500)
        .json({ error: "Failed to import software", details: e?.message ?? String(e) });
    }
  });

  /**
   * DEBUG: Check device specifications structure
   */
  app.get("/api/debug/devices-specs", async (req, res) => {
    try {
      const devices = await db
        .select()
        .from(s.assets)
        .where(eq(s.assets.type, "Hardware"))
        .limit(5);

      const debugInfo = devices.map(d => ({
        id: d.id,
        name: d.name,
        specifications: d.specifications,
        hasOaId: !!(d.specifications as any)?.openaudit?.id,
        oaIdValue: (d.specifications as any)?.openaudit?.id || 'NOT FOUND'
      }));

      return res.json({ devices: debugInfo });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  /**
   * GET devices that have a specific software installed
   * Returns list of device assets that have this software in their software list
   */
  app.get("/api/software/:softwareId/devices", authenticateToken, async (req, res) => {
    try {
      const { softwareId } = req.params;
      const user = req.user!;
      
      // Get the software asset details
      const software = await db
        .select()
        .from(s.assets)
        .where(and(
          eq(s.assets.id, softwareId),
          eq(s.assets.type, "Software"),
          eq(s.assets.tenantId, user.tenantId)
        ))
        .limit(1);

      if (software.length === 0) {
        return res.status(404).json({ error: "Software not found" });
      }

      const softwareName = software[0].name;
      const softwareVersion = software[0].version;

      // Extract base software name (remove version numbers from the name)
      // e.g., "Google Chrome 141.0.7390.108" -> "Google Chrome"
      const baseSoftwareName = softwareName.replace(/\s+[\d.]+$/g, '').trim();

      console.log(`[SOFTWARE DEVICES] Looking for: "${softwareName}" (base: "${baseSoftwareName}", version: "${softwareVersion}")`);

      // Get all hardware devices for this tenant
      const allDevices = await db
        .select()
        .from(s.assets)
        .where(and(
          eq(s.assets.type, "Hardware"),
          eq(s.assets.tenantId, user.tenantId)
        ));

      console.log(`[SOFTWARE DEVICES] Found ${allDevices.length} hardware devices to check`);

      const linkedDevices = await storage.getSoftwareLinkedDevices(softwareId, user.tenantId);

      console.log(`[SOFTWARE DEVICES] Total linked devices: ${linkedDevices.length}`);

      return res.json({ devices: linkedDevices, softwareName });
    } catch (e: any) {
      console.error("[/api/software/:id/devices] failed:", e?.message ?? e);
      return res.status(500).json({ error: "Failed to fetch devices", details: e?.message ?? String(e) });
    }
  });


  // User Profile Management
  app.get("/api/users/me", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user || user.tenantId !== req.user!.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        department: user.department,
        jobTitle: user.jobTitle,
        manager: user.manager,
        avatar: user.avatar,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        userID: user.userID,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user profile" });
    }
  });

  // Get user by ID (for user detail page) - supports both UUID and numeric User ID
  app.get("/api/users/:id", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      let user: User | undefined;
      
      // Try to find user by numeric User ID first (if it's a number)
      if (/^\d+$/.test(id)) {
        user = await storage.getUserByEmployeeId(id, req.user!.tenantId);
      }
      
      // If not found or not a number, try UUID lookup
      if (!user) {
        user = await storage.getUser(id);
      }
      
      if (!user || user.tenantId !== req.user!.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        department: user.department,
        jobTitle: user.jobTitle,
        manager: user.manager,
        avatar: user.avatar,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        userID: user.userID,
      });
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });

  // Find user by email or employee ID
  app.get("/api/users/find", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
    try {
      const { email, employeeId } = req.query;
      
      console.log("Debug /api/users/find - Params:", { email, employeeId });
      console.log("Debug /api/users/find - User tenant:", req.user!.tenantId);
      
      if (!email && !employeeId) {
        return res.status(400).json({ message: "Either email or employeeId parameter is required" });
      }
      
      let user: User | undefined;
      
      if (email && typeof email === 'string') {
        console.log("Debug - Looking up user by email:", email, "tenant:", req.user!.tenantId);
        user = await storage.getUserByEmail(email, req.user!.tenantId);
        console.log("Debug - User found by email:", !!user, user?.id);
      } else if (employeeId && typeof employeeId === 'string') {
        console.log("Debug - Looking up user by employeeId:", employeeId, "tenant:", req.user!.tenantId);
        user = await storage.getUserByEmployeeId(employeeId, req.user!.tenantId);
        console.log("Debug - User found by employeeId:", !!user, user?.id);
      }
      
      if (!user) {
        console.log("Debug - No user found");
        return res.status(404).json({ message: "User not found" });
      }
      
      if (user.tenantId !== req.user!.tenantId) {
        console.log("Debug - Tenant mismatch:", user.tenantId, "vs", req.user!.tenantId);
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        department: user.department,
        jobTitle: user.jobTitle,
        manager: user.manager,
        avatar: user.avatar,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        userID: user.userID,
      });
    } catch (error) {
      console.error("Error finding user:", error);
      res.status(500).json({ message: "Failed to find user" });
    }
  });

  app.patch("/api/users/me", authenticateToken, async (req: Request, res: Response) => {
    try {
      const profileData: UpdateUserProfile = updateUserProfileSchema.parse(req.body);
      
      // SECURITY: Whitelist only safe profile fields, prevent privilege escalation
      const safeProfileData: UpdateUserProfile = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone,
        department: profileData.department,
        jobTitle: profileData.jobTitle,
        manager: profileData.manager,
      };
      
      const updatedUser = await storage.updateUserProfile(req.user!.userId, req.user!.tenantId, safeProfileData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_profile_updated",
        resourceType: "user",
        resourceId: req.user!.userId,
        userEmail: updatedUser.email,
        userRole: updatedUser.role,
        description: `User profile updated: ${Object.keys(safeProfileData).join(', ')}`,
      });

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        department: updatedUser.department,
        jobTitle: updatedUser.jobTitle,
        manager: updatedUser.manager,
        avatar: updatedUser.avatar,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        lastLoginAt: updatedUser.lastLoginAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid profile data" });
    }
  });

  // User Preferences Management
  app.get("/api/users/me/preferences", authenticateToken, async (req: Request, res: Response) => {
    try {
      const preferences = await storage.getUserPreferences(req.user!.userId, req.user!.tenantId);
      
      if (!preferences) {
        // Return default preferences if none exist
        const defaults = {
          emailNotifications: true,
          pushNotifications: true,
          aiRecommendationAlerts: true,
          weeklyReports: true,
          assetExpiryAlerts: true,
          theme: "light" as const,
          language: "en",
          timezone: "UTC",
          dateFormat: "MM/dd/yyyy",
          dashboardLayout: "default",
          itemsPerPage: 25,
        };
        return res.json(defaults);
      }

      res.json(preferences);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user preferences" });
    }
  });

  app.patch("/api/users/me/preferences", authenticateToken, async (req: Request, res: Response) => {
    try {
      const preferencesData: Partial<InsertUserPreferences> = insertUserPreferencesSchema.partial().parse(req.body);
      
      let preferences = await storage.getUserPreferences(req.user!.userId, req.user!.tenantId);
      
      if (!preferences) {
        // Create new preferences if they don't exist - SECURITY: Only allow preference fields
        const safePreferencesData = {
          emailNotifications: preferencesData.emailNotifications,
          pushNotifications: preferencesData.pushNotifications,
          aiRecommendationAlerts: preferencesData.aiRecommendationAlerts,
          weeklyReports: preferencesData.weeklyReports,
          assetExpiryAlerts: preferencesData.assetExpiryAlerts,
          theme: preferencesData.theme,
          language: preferencesData.language,
          timezone: preferencesData.timezone,
          dateFormat: preferencesData.dateFormat,
          dashboardLayout: preferencesData.dashboardLayout,
          itemsPerPage: preferencesData.itemsPerPage,
        };
        
        const newPreferences: InsertUserPreferences = {
          userId: req.user!.userId,
          tenantId: req.user!.tenantId,
          emailNotifications: safePreferencesData.emailNotifications ?? true,
          pushNotifications: safePreferencesData.pushNotifications ?? true,
          aiRecommendationAlerts: safePreferencesData.aiRecommendationAlerts ?? true,
          weeklyReports: safePreferencesData.weeklyReports ?? true,
          assetExpiryAlerts: safePreferencesData.assetExpiryAlerts ?? true,
          theme: safePreferencesData.theme ?? "light",
          language: safePreferencesData.language ?? "en",
          timezone: safePreferencesData.timezone ?? "UTC",
          dateFormat: safePreferencesData.dateFormat ?? "MM/dd/yyyy",
          dashboardLayout: safePreferencesData.dashboardLayout ?? "default",
          itemsPerPage: safePreferencesData.itemsPerPage ?? 25,
        };
        preferences = await storage.createUserPreferences(newPreferences);
      } else {
        // SECURITY: Only allow preference fields, block identity field tampering
        const safePreferencesUpdate = {
          emailNotifications: preferencesData.emailNotifications,
          pushNotifications: preferencesData.pushNotifications,
          aiRecommendationAlerts: preferencesData.aiRecommendationAlerts,
          weeklyReports: preferencesData.weeklyReports,
          assetExpiryAlerts: preferencesData.assetExpiryAlerts,
          theme: preferencesData.theme,
          language: preferencesData.language,
          timezone: preferencesData.timezone,
          dateFormat: preferencesData.dateFormat,
          dashboardLayout: preferencesData.dashboardLayout,
          itemsPerPage: preferencesData.itemsPerPage,
        };
        preferences = await storage.updateUserPreferences(req.user!.userId, req.user!.tenantId, safePreferencesUpdate);
      }

      if (!preferences) {
        return res.status(404).json({ message: "Failed to update preferences" });
      }

      // Log the activity  
      const user = await storage.getUser(req.user!.userId);
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_preferences_updated",
        resourceType: "user_preferences",
        resourceId: preferences.id,
        userEmail: user?.email || "",
        userRole: user?.role || "read-only",
        description: `User preferences updated: ${Object.keys(preferencesData).join(', ')}`,
      });

      res.json(preferences);
    } catch (error) {
      res.status(400).json({ message: "Invalid preferences data" });
    }
  });

  // Password Change
  app.post("/api/users/me/change-password", authenticateToken, async (req: Request, res: Response) => {
    try {
      // SECURITY: Proper validation schema for password change
      const passwordChangeSchema = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(8, "New password must be at least 8 characters long"),
        confirmNewPassword: z.string().min(1, "Password confirmation is required"),
      }).refine((data) => data.newPassword === data.confirmNewPassword, {
        message: "New password and confirmation do not match",
        path: ["confirmNewPassword"],
      });

      const { currentPassword, newPassword, confirmNewPassword } = passwordChangeSchema.parse(req.body);

      const user = await storage.getUser(req.user!.userId);
      if (!user || user.tenantId !== req.user!.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValidPassword = await comparePassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password and update
      const hashedNewPassword = await hashPassword(newPassword);
      const success = await storage.updateUserPassword(req.user!.userId, req.user!.tenantId, hashedNewPassword);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      // Clear the mustChangePassword flag since user has changed password
      await storage.updateUser(req.user!.userId, { mustChangePassword: false });

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "password_changed",
        resourceType: "user",
        resourceId: req.user!.userId,
        userEmail: user.email,
        userRole: user.role,
        description: "User changed their password",
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid password data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.delete("/api/users/me", authenticateToken, async (req: Request, res: Response) => {
    try {
      const authUser = req.authUser || (req.user?.userId ? await storage.getUser(req.user.userId) : null);
      if (!authUser || authUser.tenantId !== req.user!.tenantId) {
        return res.status(404).json({ message: "User not found" });
      }

      const tenantUsers = await storage.getTenantUsers(authUser.tenantId);
      const otherActiveUsers = tenantUsers.filter((member) => member.isActive && member.id !== authUser.id);

      if (authUser.role === "super-admin") {
        const otherSuperAdmins = otherActiveUsers.filter((member) => member.role === "super-admin");
        if (otherSuperAdmins.length === 0) {
          return res.status(400).json({ message: "Cannot delete the last Super Admin account." });
        }
      }

      const rolePriority: Record<string, number> = {
        "super-admin": 0,
        "admin": 1,
        "it-manager": 2,
        "technician": 3,
      };

      const fallbackUser = otherActiveUsers
        .sort((a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99))[0];

      if (!fallbackUser) {
        return res.status(400).json({ message: "Unable to delete account because no other active users exist in this organization." });
      }

      const deleted = await storage.deleteUserAndCleanup(authUser.id, authUser.tenantId, fallbackUser);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }

      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.USER_DELETE,
          resourceType: ResourceTypes.USER,
          resourceId: authUser.id,
          description: "User deleted their own account",
        },
        req
      );

      res.json({ success: true, message: "Account deleted successfully." });
    } catch (error) {
      console.error("Error deleting user account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Organization Settings
  app.get("/api/org/settings", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const tenant = await storage.getTenant(req.user!.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json({
        id: tenant.id,
        name: tenant.name,
        timezone: tenant.timezone,
        currency: tenant.currency,
        dateFormat: tenant.dateFormat,
        autoRecommendations: tenant.autoRecommendations,
        dataRetentionDays: tenant.dataRetentionDays,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch organization settings" });
    }
  });

  app.patch("/api/org/settings", authenticateToken, requireRole("super-admin"), async (req: Request, res: Response) => {
    try {
      const settingsData: UpdateOrgSettings = updateOrgSettingsSchema.parse(req.body);
      
      const updatedTenant = await storage.updateOrgSettings(req.user!.tenantId, settingsData);
      if (!updatedTenant) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Log the activity
      const user = await storage.getUser(req.user!.userId);
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "org_settings_updated",
        resourceType: "tenant",
        resourceId: req.user!.tenantId,
        userEmail: user?.email || "",
        userRole: user?.role || "read-only",
        description: `Organization settings updated: ${Object.keys(settingsData).join(', ')}`,
      });

      res.json({
        id: updatedTenant.id,
        name: updatedTenant.name,
        timezone: updatedTenant.timezone,
        currency: updatedTenant.currency,
        dateFormat: updatedTenant.dateFormat,
        autoRecommendations: updatedTenant.autoRecommendations,
        dataRetentionDays: updatedTenant.dataRetentionDays,
        createdAt: updatedTenant.createdAt,
        updatedAt: updatedTenant.updatedAt,
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid settings data" });
    }
  });

  // User Activity History
  app.get("/api/users/me/activity", authenticateToken, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const activities = await storage.getAuditLogs(req.user!.tenantId, {
        userId: req.user!.userId,
        limit,
        offset,
      });

      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch user activity" });
    }
  });

  // Dashboard routes
  app.get("/api/dashboard/metrics", authenticateToken, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getDashboardMetrics(req.user!.tenantId);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard metrics" });
    }
  });

  app.get("/api/compliance/overview", authenticateToken, async (req: Request, res: Response) => {
    try {
      const overview = await getComplianceOverview(req.user!.tenantId);
      res.json(overview);
    } catch (error) {
      console.error("Compliance overview error:", error);
      res.status(500).json({ message: "Failed to fetch compliance overview" });
    }
  });

  const handleComplianceScoreDetails: RequestHandler = async (req, res) => {
    try {
      const details = await getComplianceScoreDetails(req.user!.tenantId);
      res.json(details);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch compliance score details" });
    }
  };

  app.get("/api/compliance/score-details", authenticateToken, handleComplianceScoreDetails);
  app.get("/api/compliance/score", authenticateToken, handleComplianceScoreDetails);

  // Global Search API
  app.get("/api/search", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { query, type, limit = 10 } = req.query;
      const user = req.user!;
      const tenantId = user.tenantId;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const searchLimit = Math.min(parseInt(limit as string) || 10, 50); // Max 50 results
      const searchResults = await storage.performGlobalSearch(
        tenantId, 
        query, 
        type as string,
        user.role,
        searchLimit
      );

      res.json(searchResults);
    } catch (error) {
      console.error('Global search error:', error);
      res.status(500).json({ error: 'Failed to perform search' });
    }
  });

  // Vendors API routes
  const listVendorsHandler: RequestHandler = async (req, res) => {
    try {
      const vendors = await storage.getMasterData(req.user!.tenantId, "vendor");
      res.json(vendors);
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  };

  app.get("/api/vendors", authenticateToken, requireRole("it-manager"), listVendorsHandler);
  app.get("/api/vendors/list", authenticateToken, requireRole("it-manager"), listVendorsHandler);

  app.get("/api/vendors/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const vendor = await storage.getMasterDataById(req.params.id, req.user!.tenantId);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      console.error('Failed to fetch vendor:', error);
      res.status(500).json({ message: "Failed to fetch vendor" });
    }
  });

  app.post("/api/vendors", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const parsed = vendorPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid vendor data" });
      }

      let mapped;
      try {
        mapped = mapVendorPayloadToRecord(parsed.data);
      } catch (mappingError: any) {
        return res.status(400).json({ message: mappingError?.message || "Invalid vendor data" });
      }

      const vendor = await storage.addMasterData({
        type: "vendor",
        value: mapped.value,
        description: mapped.description,
        metadata: mapped.metadata,
        tenantId: req.user!.tenantId,
        createdBy: req.user!.userId,
        isActive: true,
      });

      res.status(201).json(vendor);
    } catch (error) {
      console.error('Failed to create vendor:', error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.put("/api/vendors/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const parsed = vendorPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid vendor data" });
      }

      let mapped;
      try {
        mapped = mapVendorPayloadToRecord(parsed.data);
      } catch (mappingError: any) {
        return res.status(400).json({ message: mappingError?.message || "Invalid vendor data" });
      }

      const vendor = await storage.updateMasterData(req.params.id, req.user!.tenantId, {
        value: mapped.value,
        description: mapped.description,
        metadata: mapped.metadata,
      });

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json(vendor);
    } catch (error) {
      console.error('Failed to update vendor:', error);
      res.status(500).json({ message: "Failed to update vendor" });
    }
  });

  app.delete("/api/vendors/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const success = await storage.deleteMasterData(req.params.id, req.user!.tenantId);
      if (!success) {
        return res.status(404).json({ message: "Vendor not found" });
      }
      res.json({ message: "Vendor deleted successfully" });
    } catch (error) {
      console.error('Failed to delete vendor:', error);
      res.status(500).json({ message: "Failed to delete vendor" });
    }
  });

  // Role-specific notifications API
  app.get("/api/notifications", authenticateToken, async (req: Request, res: Response) => {
    try {
      const notifications = await storage.getRoleNotifications(req.user!.tenantId, req.user!.role);
      res.json(notifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // OpenAudit Devices endpoint - fetches devices directly from OpenAudit with org-scoped filtering
  // This endpoint enforces organization-level isolation: users can ONLY see devices belonging to their organization
  app.get("/api/devices", authenticateToken, async (req: Request, res: Response) => {
    try {
      // Extract authenticated user's tenant ID from JWT (server-side only, cannot be tampered)
      const tenantId = req.user!.tenantId;
      
      // Fetch tenant configuration including OpenAudit credentials and org ID
      const tenant = await storage.getTenant(tenantId);
      
      if (!tenant) {
        console.error(`Tenant not found for ID: ${tenantId}`);
        return res.status(404).json({ message: "Organization not found" });
      }

      // Validate OpenAudit configuration
      if (!tenant.openauditUrl || !tenant.openauditUsername || !tenant.openauditPassword) {
        console.warn(`OpenAudit not configured for tenant: ${tenant.name}`);
        return res.status(400).json({ 
          message: "OpenAudit integration is not configured for your organization. Please contact your administrator." 
        });
      }

      // CRITICAL: Use the tenant's openauditOrgId to enforce organization-level filtering
      // This ensures users can NEVER access devices from other organizations
      const oaOrgId = tenant.openauditOrgId;
      
      if (!oaOrgId) {
        console.warn(`OpenAudit org ID not set for tenant: ${tenant.name}`);
        return res.status(400).json({ 
          message: "OpenAudit organization ID is not configured. Please contact your administrator." 
        });
      }

      // Parse pagination parameters
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Log the request for security auditing
      console.log(`🔒 Fetching OpenAudit devices for tenant: ${tenant.name} (ID: ${tenantId}), org_id: ${oaOrgId}, limit: ${limit}, offset: ${offset}`);

      // Login to OpenAudit with tenant-specific credentials
      const cookie = await oaLogin(tenant.openauditUrl, tenant.openauditUsername, tenant.openauditPassword);

      // Fetch devices with MANDATORY org_id filtering
      // The org_id parameter is enforced server-side and cannot be overridden by client
      const devices = await oaFetchDevices(
        cookie, 
        limit, 
        offset, 
        tenant.openauditUrl,
        oaOrgId  // CRITICAL: This ensures organization-level isolation
      );

      console.log(`✅ Successfully fetched ${devices?.data?.length || 0} devices for tenant: ${tenant.name}`);

      // Return OpenAudit devices response
      res.json(devices);

    } catch (error: any) {
      console.error("❌ Error fetching devices from OpenAudit:", error.message);
      
      // Handle specific error cases
      if (error.message?.includes("login failed") || error.message?.includes("HTTP 401")) {
        return res.status(401).json({ 
          message: "Failed to authenticate with OpenAudit. Please check your OpenAudit credentials." 
        });
      }
      
      if (error.message?.includes("HTTP 403")) {
        return res.status(403).json({ 
          message: "Access denied by OpenAudit. Please verify your organization permissions." 
        });
      }

      res.status(500).json({ 
        message: "Failed to fetch devices from OpenAudit. Please try again later.",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  });

  // Asset routes
  app.get("/api/assets", authenticateToken, async (req: Request, res: Response) => {
    try {
      console.log('[GET /api/assets] Request received', {
        tenantId: req.user!.tenantId,
        email: req.user!.email,
        userId: req.user!.userId,
        query: req.query
      });
      
      const { type, status, category, search } = req.query;
      const filters: any = {};
      
      // Validate and normalize type parameter to Title Case asset types
      if (type && type !== "all") {
        const validationResult = AssetTypeEnum.safeParse(type);
        if (validationResult.success) {
          filters.type = validationResult.data;
        } else {
          return res.status(400).json({ message: "Invalid asset type. Must be Hardware, Software, Peripherals, or Others" });
        }
      }
      if (status && status !== "all") filters.status = status as string;
      if (category && category !== "all") filters.category = category as string;
      if (search && typeof search === 'string' && search.trim()) filters.search = search;

      console.log('[GET /api/assets] Filters applied:', filters);

      const assets = await storage.getAllAssets(req.user!.tenantId, filters);
      
      console.log('[GET /api/assets] Assets retrieved:', {
        count: assets.length,
        tenantId: req.user!.tenantId,
        sampleNames: assets.slice(0, 3).map(a => a.name)
      });
      
      // Add tenant ID header for debugging
      res.setHeader('X-Tenant-Id', req.user!.tenantId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  // Get assets by user ID
  app.get("/api/assets/user/:userId", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      let assets: Asset[] = [];
      
      // Try to find assets by numeric User ID first (if it's a number)
      if (/^\d+$/.test(userId)) {
        assets = await storage.getAssetsByUserEmployeeId(userId, req.user!.tenantId);
      }
      
      // If not found or not a number, try UUID lookup
      if (assets.length === 0) {
        assets = await storage.getAssetsByUserId(userId, req.user!.tenantId);
      }
      
      res.json(assets);
    } catch (error) {
      console.error("Error fetching assets by user ID:", error);
      res.status(500).json({ message: "Failed to fetch user assets" });
    }
  });

  // Assets Report endpoint (must come before /api/assets/:id to avoid route conflict)
  app.get("/api/assets/report", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { fields, type } = req.query;
      
      if (!fields || typeof fields !== 'string') {
        return res.status(400).json({ message: "Fields parameter is required" });
      }
      
      const selectedFields = fields.split(',').filter(Boolean);
      if (selectedFields.length === 0) {
        return res.status(400).json({ message: "At least one field must be selected" });
      }

      // Define allowed fields and their role requirements
      const allowedFields = {
        'name': { required: false },
        'type': { required: false },
        'category': { required: false },
        'status': { required: false },
        'serialNumber': { required: false },
        'manufacturer': { required: false },
        'model': { required: false },
        'location': { required: false },
        'assignedTo': { required: false },
        'assignedDate': { required: false },
        'purchaseDate': { requiredRole: 'manager' },
        'purchasePrice': { requiredRole: 'manager' },
        'warrantyExpiry': { required: false },
        'amcExpiry': { required: false },
        'specifications': { required: false },
        'notes': { required: false },
        'createdAt': { required: false },
        'updatedAt': { required: false }
      };

      const allowedTypes = ['all', 'hardware', 'software', 'peripheral', 'others'];
      
      // Validate fields
      const invalidFields = selectedFields.filter(field => !allowedFields[field]);
      if (invalidFields.length > 0) {
        return res.status(400).json({ 
          message: `Invalid fields: ${invalidFields.join(', ')}` 
        });
      }

      // Validate type
      if (type && !allowedTypes.includes(type as string)) {
        return res.status(400).json({ 
          message: `Invalid type. Must be one of: ${allowedTypes.join(', ')}` 
        });
      }

      // Check role permissions for sensitive fields
      const userRole = req.user!.role;
      const restrictedFields = selectedFields.filter(field => {
        const fieldConfig = allowedFields[field];
        return fieldConfig?.requiredRole && !checkPermission(userRole, fieldConfig.requiredRole);
      });

      if (restrictedFields.length > 0) {
        return res.status(403).json({ 
          message: `Access denied to fields: ${restrictedFields.join(', ')}. Requires ${allowedFields[restrictedFields[0]]?.requiredRole} role or higher.` 
        });
      }
      
      const assets = await storage.getAllAssets(req.user!.tenantId);
      
      // Validate that assets were retrieved successfully
      if (!Array.isArray(assets)) {
        return res.status(500).json({ message: "Failed to retrieve asset data" });
      }
      
      // Filter assets by type if specified
      let filteredAssets = assets;
      if (type && type !== 'all') {
        filteredAssets = assets.filter(asset => asset.type === type);
      }
      
      // Check if we have any assets after filtering
      if (filteredAssets.length === 0) {
        return res.json([]); // Return empty array for frontend to handle
      }
      
      // Helper function to sanitize and format values for Excel
      const sanitizeExcelValue = (value: any, fieldType?: string): string => {
        if (value === null || value === undefined) return '';
        
        // Format dates properly
        if (fieldType === 'date' && value instanceof Date) {
          return value.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
        if (fieldType === 'date' && typeof value === 'string' && value.includes('T')) {
          return value.split('T')[0]; // Convert ISO string to date
        }
        
        // Format currency values
        if (fieldType === 'currency' && (typeof value === 'number' || !isNaN(parseFloat(value)))) {
          return `$${parseFloat(value).toFixed(2)}`;
        }
        
        const stringValue = String(value);
        
        // If value starts with risky characters, prefix with single quote to prevent formula injection
        if (/^[=+\-@]/.test(stringValue)) {
          return `'${stringValue}`;
        }
        
        return stringValue;
      };

      // Transform data to include only selected fields with proper labels
      const reportData = filteredAssets.map(asset => {
        const reportRecord: any = {};
        
        selectedFields.forEach(fieldId => {
          switch (fieldId) {
            case 'name':
              reportRecord['Asset Name'] = sanitizeExcelValue(asset.name);
              break;
            case 'type':
              reportRecord['Asset Type'] = sanitizeExcelValue(asset.type);
              break;
            case 'category':
              reportRecord['Category'] = sanitizeExcelValue(asset.category);
              break;
            case 'status':
              reportRecord['Status'] = sanitizeExcelValue(asset.status);
              break;
            case 'serialNumber':
              reportRecord['Serial Number'] = sanitizeExcelValue(asset.serialNumber || '');
              break;
            case 'manufacturer':
              reportRecord['Manufacturer'] = sanitizeExcelValue(asset.manufacturer || '');
              break;
            case 'model':
              reportRecord['Model'] = sanitizeExcelValue(asset.model || '');
              break;
            case 'location':
              reportRecord['Location'] = sanitizeExcelValue(asset.location || '');
              break;
            case 'assignedTo':
              reportRecord['Assigned To'] = sanitizeExcelValue(asset.assignedUserName || '');
              break;
            case 'assignedDate':
              reportRecord['Assigned Date'] = sanitizeExcelValue(asset.assignedDate || '', 'date');
              break;
            case 'purchaseDate':
              reportRecord['Purchase Date'] = sanitizeExcelValue(asset.purchaseDate || '', 'date');
              break;
            case 'purchasePrice':
              reportRecord['Purchase Price'] = sanitizeExcelValue(asset.purchasePrice || '', 'currency');
              break;
            case 'warrantyExpiry':
              reportRecord['Warranty Expiry'] = sanitizeExcelValue(asset.warrantyExpiry || '', 'date');
              break;
            case 'amcExpiry':
              reportRecord['AMC Expiry'] = sanitizeExcelValue(asset.amcExpiry || '', 'date');
              break;
            case 'specifications':
              reportRecord['Specifications'] = sanitizeExcelValue(
                typeof asset.specifications === 'object' 
                  ? JSON.stringify(asset.specifications) 
                  : (asset.specifications || '')
              );
              break;
            case 'notes':
              reportRecord['Notes'] = sanitizeExcelValue(asset.notes || '');
              break;
            case 'createdAt':
              reportRecord['Created Date'] = sanitizeExcelValue(asset.createdAt || '', 'date');
              break;
            case 'updatedAt':
              reportRecord['Last Updated'] = sanitizeExcelValue(asset.updatedAt || '', 'date');
              break;
            default:
              // Skip unknown fields
              break;
          }
        });
        
        return reportRecord;
      });

      // Log report generation activity
      await storage.logActivity({
        action: "report_generation",
        resourceType: "asset",
        resourceId: null,
        details: `Generated report with fields: ${selectedFields.join(', ')}, type: ${type || 'all'}, records: ${reportData.length}`,
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        userEmail: req.user!.email || "",
        userRole: req.user!.role || "read-only",
        description: `Generated asset report with ${reportData.length} records`
      });
      
      res.json(reportData);
    } catch (error) {
      console.error("Report generation error:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.get("/api/assets/:id", authenticateToken, async (req: Request, res: Response) => {
    try {
      const asset = await storage.getAsset(req.params.id, req.user!.tenantId);
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch asset" });
    }
  });

  app.post("/api/assets", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const assetData = insertAssetSchema.parse({
        ...req.body,
        tenantId: req.user!.tenantId,
      });

      const asset = await storage.createAsset(assetData);
      
      // Log asset creation
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.ASSET_CREATE,
          resourceType: ResourceTypes.ASSET,
          resourceId: asset.id,
          description: `Created asset: ${asset.name} (${asset.assetTag})`,
          afterState: auditLogger.sanitizeForLogging(asset)
        },
        req
      );
      
      res.status(201).json(asset);
    } catch (error) {
      console.error("Asset creation error:", error);
      res.status(400).json({ message: "Invalid asset data" });
    }
  });

  app.put("/api/assets/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      // Get original asset for audit logging
      const originalAsset = await storage.getAsset(req.params.id, req.user!.tenantId);
      
      const assetData = insertAssetSchema.partial().parse(req.body);
      const asset = await storage.updateAsset(req.params.id, req.user!.tenantId, assetData);
      
      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }
      
      // Log asset update
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.ASSET_UPDATE,
          resourceType: ResourceTypes.ASSET,
          resourceId: asset.id,
          description: `Updated asset: ${asset.name} (${asset.assetTag})`,
          beforeState: originalAsset ? auditLogger.sanitizeForLogging(originalAsset) : null,
          afterState: auditLogger.sanitizeForLogging(asset)
        },
        req
      );
      
      res.json(asset);
    } catch (error) {
      console.error("Asset update error:", error);
      res.status(400).json({ message: "Invalid asset data" });
    }
  });

  app.delete("/api/assets/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      // Get asset before deletion for audit logging
      const asset = await storage.getAsset(req.params.id, req.user!.tenantId);
      
      const deleted = await storage.deleteAsset(req.params.id, req.user!.tenantId);
      if (!deleted) {
        return res.status(404).json({ message: "Asset not found" });
      }
      
      // Log asset deletion
      if (asset) {
        await auditLogger.logActivity(
          auditLogger.createUserContext(req),
          {
            action: AuditActions.ASSET_DELETE,
            resourceType: ResourceTypes.ASSET,
            resourceId: req.params.id,
            description: `Deleted asset: ${asset.name} (${asset.assetTag})`,
            beforeState: auditLogger.sanitizeForLogging(asset)
          },
          req
        );
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Asset deletion error:", error);
      res.status(500).json({ message: "Failed to delete asset" });
    }
  });

  // Bulk upload endpoints
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed'));
      }
    }
  });

  // Helper function to sanitize CSV values (prevent formula injection)
  const sanitizeCsvValue = (value: string): string => {
    if (!value) return value;
    // If value starts with risky characters, prefix with single quote
    if (/^[=+\-@]/.test(value)) {
      return `'${value}`;
    }
    return value;
  };

  // Helper function to generate username from email
  const generateUsername = (email: string): string => {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  };


  // Download comprehensive CSV template with sample data
  app.get("/api/assets/bulk/template", authenticateToken, requireRole("it-manager"), (req: Request, res: Response) => {
    const headers = [
      'name',
      'type',
      'status',
      'category',
      'manufacturer',
      'model',
      'serial_number',
      'location',
      'country',
      'state',
      'city',
      'assigned_user_name',
      'assigned_user_email',
      'assigned_user_employee_id',
      'purchase_date',
      'purchase_cost',
      'warranty_expiry',
      'notes',
      'software_name',
      'version',
      'license_type',
      'license_key',
      'used_licenses',
      'renewal_date',
      'vendor_name',
      'vendor_email',
      'vendor_phone',
      'company_name',
      'company_gst_number'
    ];

    const sampleData = [
      [
        'MacBook Pro 16"',
        'Hardware',
        'deployed',
        'Laptop',
        'Apple',
        'MacBook Pro 16',
        'A1234567890',
        'Headquarters - Floor 2',
        'United States',
        'California',
        'San Francisco',
        'John Doe',
        'john.doe@techcorp.com',
        'EMP1001',
        '2024-01-15',
        '2499.00',
        '2027-01-15',
        'High-performance laptop for engineering team',
        '',
        '',
        '',
        '',
        '',
        '',
        'Apple Inc',
        'sales@apple.com',
        '+1-800-275-2273',
        'TechCorp Inc',
        '22AAAAA0000A1Z5'
      ],
      [
        'Dell OptiPlex 7090',
        'Hardware',
        'in-stock',
        'Desktop',
        'Dell',
        'OptiPlex 7090',
        'D9876543210',
        'Warehouse A',
        'United States',
        'Texas',
        'Austin',
        '',
        '',
        '',
        '2024-02-01',
        '899.00',
        '2027-02-01',
        'Spare desktop ready for deployment',
        '',
        '',
        '',
        '',
        '',
        '',
        'Dell Technologies',
        'support@dell.com',
        '+1-800-624-9896',
        'TechCorp Inc',
        '22AAAAA0000A1Z5'
      ],
      [
        'Microsoft Office 365',
        'Software',
        'deployed',
        'Productivity',
        'Microsoft',
        'Office 365 Business',
        '',
        'Cloud Subscription',
        'United States',
        'Washington',
        'Seattle',
        '',
        '',
        '',
        '2024-02-01',
        '150.00',
        '2025-02-01',
        'Annual subscription for collaboration suite',
        'Microsoft Office 365',
        '2024',
        'subscription',
        'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        '50',
        '2025-02-01',
        'Microsoft Corporation',
        'support@microsoft.com',
        '+1-800-642-7676',
        'TechCorp Inc',
        '22AAAAA0000A1Z5'
      ],
      [
        'HP LaserJet Pro 400',
        'Peripherals',
        'deployed',
        'Printer',
        'HP',
        'LaserJet Pro 400',
        'HP123456789',
        'Finance Wing',
        'United States',
        'New York',
        'New York City',
        '',
        '',
        '',
        '2023-08-20',
        '299.00',
        '2026-08-20',
        'Shared monochrome network printer',
        '',
        '',
        '',
        '',
        '',
        '',
        'HP Inc',
        'support@hp.com',
        '+1-800-474-6836',
        'TechCorp Inc',
        '22AAAAA0000A1Z5'
      ],
      [
        'Office Furniture Desk',
        'Others',
        'deployed',
        'Furniture',
        'IKEA',
        'BEKANT',
        'IKEA123456',
        'Headquarters - Floor 3',
        'United States',
        'California',
        'San Jose',
        'Jane Smith',
        'jane.smith@techcorp.com',
        'EMP1042',
        '2023-09-15',
        '199.00',
        '2028-09-15',
        'Assigned workstation for design team member',
        '',
        '',
        '',
        '',
        '',
        '',
        'IKEA Inc',
        'info@ikea.com',
        '+1-888-888-4532',
        'TechCorp Inc',
        '22AAAAA0000A1Z5'
      ]
    ];

    // Sanitize sample data to prevent CSV formula injection
    const sanitizedData = sampleData.map(row => row.map(cell => sanitizeCsvValue(cell)));
    
    // Use proper CSV serialization to handle commas, quotes, and special characters
    const csvContent = stringify([headers, ...sanitizedData]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="asset_template_with_samples.csv"');
    res.send(csvContent);
  });

  // Bulk upload endpoint
  app.post("/api/assets/bulk/upload", authenticateToken, requireRole("it-manager"), upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const validateOnly = req.query.validateOnly === 'true';
      const mode = (req.query.mode as string) || 'partial'; // partial or atomic
      
      // Parse CSV
      const csvContent = req.file.buffer.toString('utf8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      if (records.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      if (records.length > 5000) {
        return res.status(400).json({ message: "Maximum 5000 rows allowed" });
      }

      const results: any[] = [];
      const validAssets: any[] = [];
      let rowNumber = 1; // Start from 1 (header is row 0)

      for (const record of records) {
        rowNumber++;
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
          // Basic validation
          if (!record.name?.trim()) {
            errors.push("Name is required");
          }
          if (!record.type?.trim()) {
            errors.push("Type is required");
          } else if (!['hardware', 'software', 'peripheral', 'peripherals', 'others'].includes(record.type.trim().toLowerCase())) {
            errors.push("Type must be hardware, software, peripherals, or others");
          }
          if (!record.status?.trim()) {
            errors.push("Status is required");
          } else if (!['in-stock', 'deployed', 'in-repair', 'disposed'].includes(record.status.trim().toLowerCase())) {
            errors.push("Status must be in-stock, deployed, in-repair, or disposed");
          }

          // Type-specific validation
          const normalizedType = record.type?.trim().toLowerCase();

          if (normalizedType === 'software' && !record.software_name?.trim()) {
            errors.push("Software name is required for software assets");
          }

          // Date validation
          const dateFields = ['purchase_date', 'warranty_expiry', 'renewal_date'];
          for (const field of dateFields) {
            if (record[field] && record[field].trim()) {
              const date = new Date(record[field]);
              if (isNaN(date.getTime())) {
                errors.push(`${field} must be a valid date (YYYY-MM-DD or MM/DD/YYYY)`);
              }
            }
          }

          // Number validation
          if (record.purchase_cost && record.purchase_cost.trim()) {
            const sanitizedCost = record.purchase_cost.replace(/,/g, "");
            const cost = parseFloat(sanitizedCost);
            if (isNaN(cost) || cost < 0) {
              errors.push("Purchase cost must be a valid positive number");
            }
          }

          if (record.used_licenses && record.used_licenses.trim()) {
            const licenses = parseInt(record.used_licenses, 10);
            if (isNaN(licenses) || licenses < 0) {
              errors.push("Used licenses must be a valid non-negative integer");
            }
          }

          // Build asset object if no errors
          if (errors.length === 0) {
            const typeMap: Record<string, string> = {
              hardware: "Hardware",
              software: "Software",
              peripheral: "Peripherals",
              peripherals: "Peripherals",
              others: "Others",
            };
            const mappedType = normalizedType ? (typeMap[normalizedType] || record.type.trim()) : record.type.trim();

            const assetData: any = {
              name: record.name.trim(),
              type: mappedType,
              status: record.status.trim().toLowerCase(), // Normalize to lowercase
              tenantId: req.user!.tenantId,
              createdBy: req.user!.userId
            };

            // Add optional fields
            const optionalFields = [
              'category', 'manufacturer', 'model', 'serial_number', 'location',
              'country', 'state', 'city',
              'assigned_user_name', 'assigned_user_email', 'assigned_user_employee_id',
              'notes', 'software_name', 'version',
              'license_type', 'license_key', 'vendor_name', 'vendor_email',
              'vendor_phone', 'company_name', 'company_gst_number'
            ];

            for (const field of optionalFields) {
              if (record[field] && record[field].trim()) {
                assetData[field === 'serial_number' ? 'serialNumber' : 
                          field === 'assigned_user_name' ? 'assignedUserName' :
                          field === 'assigned_user_email' ? 'assignedUserEmail' :
                          field === 'assigned_user_employee_id' ? 'assignedUserEmployeeId' :
                          field === 'software_name' ? 'softwareName' :
                          field === 'license_type' ? 'licenseType' :
                          field === 'license_key' ? 'licenseKey' :
                          field === 'vendor_name' ? 'vendorName' :
                          field === 'vendor_email' ? 'vendorEmail' :
                          field === 'vendor_phone' ? 'vendorPhone' :
                          field === 'company_name' ? 'companyName' :
                          field === 'company_gst_number' ? 'companyGstNumber' :
                          field] = record[field].trim();
              }
            }

            // Handle dates
            if (record.purchase_date && record.purchase_date.trim()) {
              assetData.purchaseDate = new Date(record.purchase_date);
            }
            if (record.warranty_expiry && record.warranty_expiry.trim()) {
              assetData.warrantyExpiry = new Date(record.warranty_expiry);
            }
            if (record.renewal_date && record.renewal_date.trim()) {
              assetData.renewalDate = new Date(record.renewal_date);
            }

            // Handle numbers
            if (record.purchase_cost && record.purchase_cost.trim()) {
              const sanitizedCost = record.purchase_cost.replace(/,/g, "").trim();
              const cost = parseFloat(sanitizedCost);
              if (!isNaN(cost)) {
                assetData.purchaseCost = cost;
              }
            }
            if (record.used_licenses && record.used_licenses.trim()) {
              assetData.usedLicenses = parseInt(record.used_licenses, 10);
            }

            // Handle JSON specifications
            if (record.specifications && record.specifications.trim()) {
              try {
                assetData.specifications = JSON.parse(record.specifications);
              } catch (e) {
                warnings.push("Invalid JSON in specifications field, treating as text");
                assetData.specifications = { note: record.specifications.trim() };
              }
            }

            // Validate with schema before adding to validAssets
            try {
              const validatedAsset = insertAssetSchema.parse(assetData);
              validAssets.push(validatedAsset);
              
              results.push({
                rowNumber,
                status: 'valid',
                errors: [],
                warnings
              });
            } catch (schemaError) {
              if (schemaError instanceof Error) {
                errors.push(`Schema validation failed: ${schemaError.message}`);
              } else {
                errors.push("Schema validation failed");
              }
              
              results.push({
                rowNumber,
                status: 'invalid',
                errors,
                warnings
              });
            }
          } else {
            results.push({
              rowNumber,
              status: 'invalid',
              errors,
              warnings
            });
          }
        } catch (error) {
          results.push({
            rowNumber,
            status: 'invalid',
            errors: [error instanceof Error ? error.message : 'Validation failed'],
            warnings
          });
        }
      }

      const summary = {
        total: records.length,
        valid: validAssets.length,
        invalid: records.length - validAssets.length,
        inserted: 0
      };

      // If validation only, return results
      if (validateOnly) {
        return res.json({ summary, rows: results });
      }

      // Insert assets if not validation-only
      if (validAssets.length > 0) {
        if (mode === 'atomic' && summary.invalid > 0) {
          return res.status(400).json({
            message: "Atomic mode: Cannot import any assets because some rows have errors",
            summary,
            rows: results
          });
        }

        try {
          const insertedAssets = await storage.createAssetsBulk(validAssets);
          summary.inserted = insertedAssets.length;

          // Log audit activity (with safety wrapper to avoid breaking import if logging fails)
          try {
            await storage.logActivity({
              action: "bulk_asset_import",
              resourceType: "asset",
              resourceId: null,
              description: `Imported ${summary.inserted} assets from CSV upload`,
              userId: req.user!.userId,
              userEmail: req.user!.email,
              userRole: req.user!.role,
              tenantId: req.user!.tenantId
            });
          } catch (auditError) {
            console.error("Audit logging failed for bulk import:", auditError);
            // Continue with successful import response even if audit logging fails
          }

          res.status(200).json({ 
            summary, 
            rows: results,
            message: `Successfully imported ${summary.inserted} assets`
          });
        } catch (error) {
          console.error("Bulk import error:", error);
          
          // Provide more detailed error information
          let errorMessage = "Failed to import assets";
          if (error instanceof Error) {
            errorMessage = error.message;
            // Check for specific database errors
            if (error.message.includes('duplicate key')) {
              errorMessage = "Import failed: Duplicate asset found. Please check for existing serial numbers or names.";
            } else if (error.message.includes('constraint')) {
              errorMessage = "Import failed: Data validation error. Please check your asset data format.";
            } else if (error.message.includes('timeout') || error.message.includes('connection')) {
              errorMessage = "Import failed: Database connection issue. Please try again.";
            }
          }
          
          res.status(500).json({ 
            message: errorMessage,
            summary,
            rows: results,
            details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : error) : undefined
          });
        }
      } else {
        res.json({ 
          summary, 
          rows: results,
          message: "No valid assets to import"
        });
      }

    } catch (error) {
      console.error("Bulk upload error:", error);
      res.status(500).json({ message: "Failed to process file" });
    }
  });


  // AI Assistant routes
  app.post("/api/ai/query", authenticateToken, async (req: Request, res: Response) => {
    try {
      const aiQuerySchema = z.object({
        prompt: z.string().min(1, "Prompt is required").max(2000, "Prompt too long")
      });
      
      const validation = aiQuerySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validation.error.issues 
        });
      }
      
      const { prompt } = validation.data;

      // Get current ITAM context
      const assets = await storage.getAllAssets(req.user!.tenantId);
      const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);
      
      // Get utilization data for all assets
      const utilizationPromises = assets.map(asset => 
        storage.getAssetUtilization(asset.id, req.user!.tenantId)
      );
      const utilizationResults = await Promise.all(utilizationPromises);
      const utilization = utilizationResults.flat();

      // Get dashboard metrics for context
      const metrics = await storage.getDashboardMetrics(req.user!.tenantId);

      const context: ITAMQueryContext = {
        assets,
        licenses,
        utilization,
        totalAssets: metrics.totalAssets || assets.length,
        activeLicenses: metrics.activeLicenses || licenses.length,
        userQuery: prompt
      };

      // Process query with AI
      const answer = await processITAMQuery(context);
      const summary = answer
        .split(/[\n\.]/)
        .map((segment) => segment.trim())
        .find((segment) => segment.length > 0)
        || answer.slice(0, 140);

      const savedResponse = await storage.createAIResponse({
        prompt,
        response: answer,
        userId: req.user!.userId,
        tenantId: req.user!.tenantId
      });

      await storage.logActivity({
        action: "ai_query",
        resourceType: "ai_assistant",
        resourceId: savedResponse.id,
        details: `AI query: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
        userId: req.user!.userId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        tenantId: req.user!.tenantId
      });

      res.json({ answer, summary, sessionId: savedResponse.id });
    } catch (error) {
      console.error("AI query error:", error);
      res.status(500).json({ message: "Failed to process AI query" });
    }
  });

  app.get("/api/ai/response/:sessionId", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }
      
      const response = await storage.getAIResponse(sessionId, req.user!.tenantId);
      
      if (!response) {
        return res.status(404).json({ message: "AI response not found" });
      }
      
      // Additional security: ensure the response belongs to this user
      if (response.userId !== req.user!.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(response);
    } catch (error) {
      console.error("Error fetching AI response:", error);
      res.status(500).json({ message: "Failed to fetch AI response" });
    }
  });

  // Software License routes
  app.get("/api/licenses", authenticateToken, async (req: Request, res: Response) => {
    try {
      const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);
      res.json(licenses);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch licenses" });
    }
  });

  app.post("/api/licenses", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const licenseData = insertSoftwareLicenseSchema.parse({
        ...req.body,
        tenantId: req.user!.tenantId,
      });

      const license = await storage.createSoftwareLicense(licenseData);
      
      // Log license creation
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.LICENSE_CREATE,
          resourceType: ResourceTypes.LICENSE,
          resourceId: license.id,
          description: `Created software license: ${license.softwareName} (${license.licenseType})`,
          afterState: auditLogger.sanitizeForLogging(license)
        },
        req
      );
      
      res.status(201).json(license);
    } catch (error) {
      console.error("License creation error:", error);
      res.status(400).json({ message: "Invalid license data" });
    }
  });

  // Audit Logs routes
  app.get("/api/audit-logs", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { 
        action, 
        resourceType, 
        userId, 
        limit = "100", 
        offset = "0",
        startDate,
        endDate 
      } = req.query;

      // Get basic audit logs
      let logs = await storage.getAuditLogs(req.user!.tenantId);

      // Apply filters
      if (action) {
        logs = logs.filter(log => log.action === action);
      }
      if (resourceType) {
        logs = logs.filter(log => log.resourceType === resourceType);
      }
      if (userId) {
        logs = logs.filter(log => log.userId === userId);
      }
      if (startDate) {
        const start = new Date(startDate as string);
        logs = logs.filter(log => log.createdAt >= start);
      }
      if (endDate) {
        const end = new Date(endDate as string);
        logs = logs.filter(log => log.createdAt <= end);
      }

      // Apply pagination
      const limitNum = Math.min(parseInt(limit as string) || 100, 1000); // Max 1000
      const offsetNum = parseInt(offset as string) || 0;
      const paginatedLogs = logs.slice(offsetNum, offsetNum + limitNum);

      // Log the audit log viewing activity
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: "audit_logs_viewed",
          resourceType: "audit_log",
          description: `Viewed audit logs with filters: ${JSON.stringify({ action, resourceType, userId, startDate, endDate })}`,
          metadata: { 
            resultCount: paginatedLogs.length,
            totalCount: logs.length,
            filters: { action, resourceType, userId, startDate, endDate }
          }
        },
        req
      );

      res.json({
        logs: paginatedLogs,
        pagination: {
          total: logs.length,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < logs.length
        }
      });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Get audit log statistics
  app.get("/api/audit-logs/stats", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAuditLogs(req.user!.tenantId);
      
      // Calculate statistics
      const stats = {
        totalLogs: logs.length,
        actionBreakdown: logs.reduce((acc, log) => {
          acc[log.action] = (acc[log.action] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        resourceTypeBreakdown: logs.reduce((acc, log) => {
          acc[log.resourceType] = (acc[log.resourceType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        userActivityBreakdown: logs.reduce((acc, log) => {
          const userKey = `${log.userEmail} (${log.userRole})`;
          acc[userKey] = (acc[userKey] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        recentActivity: logs.slice(0, 10), // Last 10 activities
        dailyActivity: logs.reduce((acc, log) => {
          const date = log.createdAt.toISOString().split('T')[0];
          acc[date] = (acc[date] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      // Log the statistics viewing
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: "audit_stats_viewed",
          resourceType: "audit_log",
          description: "Viewed audit log statistics",
          metadata: { statsGenerated: true, totalLogs: stats.totalLogs }
        },
        req
      );

      res.json(stats);
    } catch (error) {
      console.error("Error generating audit log stats:", error);
      res.status(500).json({ message: "Failed to generate audit log statistics" });
    }
  });

const CONTRACT_TYPE_VALUES = ["Annual", "Monthly", "One-time"] as const;

const vendorPayloadSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  contactPerson: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  contractStartDate: z.string().optional().or(z.literal("")),
  contractEndDate: z.string().optional().or(z.literal("")),
  contractValue: z.union([
    z.number(),
    z.string().min(1, "Contract value is required"),
  ]),
  contractType: z.enum(CONTRACT_TYPE_VALUES, {
    required_error: "Contract type is required",
  }),
});

const sanitizeOptionalString = (value?: string) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const normalizeContractDate = (value?: string) => {
  const normalized = sanitizeOptionalString(value);
  if (!normalized) return undefined;
  const parsedDate = new Date(normalized);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Invalid contract date");
  }
  return parsedDate.toISOString();
};

const parseContractValue = (value: string | number) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Contract value must be a valid number");
  }
  if (numeric < 0) {
    throw new Error("Contract value must be greater than or equal to 0");
  }
  return numeric;
};

const mapVendorPayloadToRecord = (payload: z.infer<typeof vendorPayloadSchema>) => {
  const contractValue = parseContractValue(payload.contractValue);
  const contractStartDate = normalizeContractDate(payload.contractStartDate);
  const contractEndDate = normalizeContractDate(payload.contractEndDate);

  const metadataSource = {
    email: sanitizeOptionalString(payload.email),
    phone: sanitizeOptionalString(payload.phone),
    contactPerson: sanitizeOptionalString(payload.contactPerson),
    address: sanitizeOptionalString(payload.address),
    contractStartDate,
    contractEndDate,
    contractValue,
    contractType: payload.contractType,
  };

  const metadata = Object.fromEntries(
    Object.entries(metadataSource).filter(([, value]) => value !== undefined)
  );

  return {
    value: payload.name.trim(),
    description: sanitizeOptionalString(payload.notes),
    metadata,
  };
};

const allowedRecommendationTypes = new Map<string, string>([
    ["license optimization", "License Optimization"],
    ["license-optimization", "License Optimization"],
    ["downgrade", "Cost Reduction"],
    ["cost reduction", "Cost Reduction"],
    ["cost-optimization", "Cost Reduction"],
    ["upgrade", "Hardware Refresh"],
    ["hardware refresh", "Hardware Refresh"],
    ["security risk", "Security Risk"],
    ["security", "Security Risk"],
    ["reallocation", "Asset Consolidation"],
    ["asset consolidation", "Asset Consolidation"],
    ["asset utilization", "Asset Utilization"],
    ["asset-utilization", "Asset Utilization"],
    ["general", "General Optimization"],
    ["general optimization", "General Optimization"],
  ]);

  const normalizeRecommendationType = (value?: string) => {
    if (!value) return "General Optimization";
    const key = value.toLowerCase().trim();
    return allowedRecommendationTypes.get(key) || allowedRecommendationTypes.get(key.replace(/_/g, " ")) || "General Optimization";
  };

  const normalizeSeverity = (value?: string) => {
    switch ((value || "").toLowerCase()) {
      case "high":
        return "high";
      case "low":
        return "low";
      default:
        return "medium";
    }
  };

  const cleanRecommendationTitleText = (title?: string | null, fallback?: string) => {
    if (!title && fallback) return fallback;
    if (!title) return fallback || "AI Insight";
    let cleaned = title
      .replace(/^(optimization|recommendation|insight)\s*recommendation\s*\d*[:\-]?\s*/i, "")
      .replace(/^(optimization|recommendation|insight)\s*\d*[:\-]?\s*/i, "")
      .replace(/^\d+[:\.\-]\s*/i, "")
      .trim();
    const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 8);
    if (words.length >= 4) {
      cleaned = words.join(" ");
    }
    if (!cleaned) {
      return fallback || "AI Insight";
    }
    return cleaned;
  };

  const mapRecommendationResponse = (rec: s.Recommendation) => ({
    ...rec,
    type: normalizeRecommendationType(rec.type),
    title: cleanRecommendationTitleText(rec.title, rec.title || undefined),
    description: rec.description?.trim() || "No description available for this recommendation.",
    severity: rec.priority || "medium",
  });

  const runRecommendationGeneration = async (tenantId: string) => {
    const [assetsForTenant, licensesForTenant, ticketsForTenant, usersForTenant] = await Promise.all([
      storage.getAllAssets(tenantId),
      storage.getAllSoftwareLicenses(tenantId),
      storage.getAllTickets(tenantId),
      storage.getTenantUsers(tenantId),
    ]);

    if (!assetsForTenant.length && !licensesForTenant.length) {
      return {
        status: "no-data",
        message: "Your inventory is empty. Add hardware or software to generate insights.",
        recommendations: [],
      };
    }

    const utilizationResults = await Promise.all(
      assetsForTenant.map((asset) => storage.getAssetUtilization(asset.id, tenantId))
    );
    const utilization = utilizationResults.flat();

    const aiRecommendations = await generateAssetRecommendations({
      assets: assetsForTenant,
      licenses: licensesForTenant,
      utilization,
      tickets: ticketsForTenant,
      users: usersForTenant,
    });

    if (!aiRecommendations.length) {
      return {
        status: "no-data",
        message: "Not enough ITAM data to generate recommendations.",
        recommendations: [],
      };
    }

    const normalized = aiRecommendations
      .map((rec, index) => ({
        type: normalizeRecommendationType(rec.type),
        title: cleanRecommendationTitleText(rec.title?.trim(), `AI Insight ${index + 1}`),
        description: rec.description?.trim() || "No description available for this recommendation.",
        potentialSavings: Number(rec.potentialSavings || 0).toFixed(2),
        priority: normalizeSeverity(rec.priority || rec.severity),
        assetIds: Array.isArray(rec.assetIds) ? rec.assetIds : [],
      }))
      .filter((rec) => rec.title && rec.description);

    if (!normalized.length) {
      return {
        status: "no-data",
        message: "Not enough ITAM data to generate recommendations.",
        recommendations: [],
      };
    }

    await storage.deleteRecommendationsByTenant(tenantId);

    const recommendations = await Promise.all(
      normalized.map((rec) =>
        storage.createRecommendation({
          type: rec.type,
          title: rec.title,
          description: rec.description,
          potentialSavings: rec.potentialSavings,
          priority: rec.priority as any,
          status: "pending",
          assetIds: rec.assetIds,
          tenantId,
        })
      )
    );

    return { status: "success", recommendations: recommendations.map(mapRecommendationResponse) };
  };

  // Recommendations routes
  app.get("/api/recommendations", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const recommendationsList = await storage.getRecommendations(
        req.user!.tenantId,
        typeof status === "string" ? status : undefined
      );
      res.json(recommendationsList.map(mapRecommendationResponse));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/recommendations/generate", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const result = await runRecommendationGeneration(req.user!.tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  app.get("/api/ai/recommendations", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const recommendationsList = await storage.getRecommendations(
        req.user!.tenantId,
        typeof status === "string" ? status : undefined
      );
      res.json(recommendationsList.map(mapRecommendationResponse));
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/ai/recommendations/run", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const result = await runRecommendationGeneration(req.user!.tenantId);
      res.json(result);
    } catch (error) {
      console.error("Error generating AI recommendations:", error);
      res.status(500).json({ message: "Failed to generate AI recommendations" });
    }
  });

  app.put("/api/recommendations/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!["pending", "accepted", "dismissed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const recommendation = await storage.updateRecommendationStatus(
        req.params.id,
        req.user!.tenantId,
        status
      );

      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found" });
      }

      res.json(recommendation);
    } catch (error) {
      res.status(500).json({ message: "Failed to update recommendation" });
    }
  });

  app.delete("/api/recommendations/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteRecommendation(req.params.id, req.user!.tenantId);
      if (!deleted) {
        return res.status(404).json({ message: "Recommendation not found" });
      }
      res.json({ message: "Recommendation deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete recommendation" });
    }
  });

  // Master Data routes
  app.get("/api/master", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { type, query } = req.query;
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ message: "Master data type is required" });
      }

      if (type === "vendor" && !checkPermission(req.user!.role, "it-manager")) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const masterData = await storage.getMasterData(
        req.user!.tenantId,
        type,
        query as string | undefined
      );
      res.json(masterData);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch master data" });
    }
  });

  app.post("/api/master", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const rawType = typeof req.body?.type === "string" ? req.body.type.trim() : "";
      const rawValue = typeof req.body?.value === "string" ? req.body.value.trim() : "";
      const rawDescription = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const metadata = typeof req.body?.metadata === "object" ? req.body.metadata : undefined;

      if (!rawType || !rawValue) {
        return res.status(400).json({ message: "Type and value are required" });
      }

      const masterDataInput = insertMasterDataSchema.parse({
        type: rawType,
        value: rawValue,
        description: rawDescription || undefined,
        metadata,
        tenantId: req.user!.tenantId,
        createdBy: req.user!.userId,
        isActive: true,
      });

      const masterData = await storage.addMasterData(masterDataInput);
      res.status(201).json(masterData);
    } catch (error) {
      console.error("Master data creation error:", error);
      res.status(400).json({ message: "Invalid master data" });
    }
  });

  app.get("/api/master/distinct", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { field } = req.query;
      if (!field || typeof field !== 'string') {
        return res.status(400).json({ message: "Field parameter is required" });
      }

      const distinctValues = await storage.getDistinctFromAssets(
        req.user!.tenantId,
        field
      );
      res.json(distinctValues);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch distinct values" });
    }
  });

  // Geographic data endpoints - with coordinates for map display
  app.get("/api/geographic/coordinates", authenticateToken, async (req: Request, res: Response) => {
    try {
      const worldDataPath = path.join(process.cwd(), 'server', 'data', 'world_complete.json');
      
      if (!fs.existsSync(worldDataPath)) {
        return res.status(404).json({ message: "Geographic coordinates data not found" });
      }
      
      const worldData = JSON.parse(fs.readFileSync(worldDataPath, 'utf8'));
      
      // Build a flat coordinate map: { "Country Name": { lat, lng }, "Country,State": { lat, lng }, "Country,State,City": { lat, lng } }
      const coordinates: Record<string, { lat: number, lng: number }> = {};
      
      for (const country of worldData) {
        // Add country coordinates
        if (country.latitude && country.longitude) {
          coordinates[country.name] = {
            lat: parseFloat(country.latitude),
            lng: parseFloat(country.longitude)
          };
        }
        
        // Add state coordinates
        if (country.states && Array.isArray(country.states)) {
          for (const state of country.states) {
            if (state.latitude && state.longitude) {
              const stateKey = `${country.name},${state.name}`;
              coordinates[stateKey] = {
                lat: parseFloat(state.latitude),
                lng: parseFloat(state.longitude)
              };
            }
            
            // Add city coordinates
            if (state.cities && Array.isArray(state.cities)) {
              for (const city of state.cities) {
                if (city.latitude && city.longitude) {
                  const cityKey = `${country.name},${state.name},${city.name}`;
                  coordinates[cityKey] = {
                    lat: parseFloat(city.latitude),
                    lng: parseFloat(city.longitude)
                  };
                }
              }
            }
          }
        }
      }
      
      console.log(`✓ Generated coordinates for ${Object.keys(coordinates).length} locations`);
      res.json(coordinates);
    } catch (error) {
      console.error('Failed to load geographic coordinates:', error);
      res.status(500).json({ message: "Failed to fetch geographic coordinates" });
    }
  });

  // Geographic data endpoints for location selector
  app.get("/api/geographic/countries", authenticateToken, async (req: Request, res: Response) => {
    try {
      const countriesPath = path.join(process.cwd(), 'server', 'data', 'countries.json');
      
      if (!fs.existsSync(countriesPath)) {
        return res.status(404).json({ message: "Countries data not found" });
      }
      
      const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
      // Return simplified country list for dropdowns
      const countries = countriesData.map((country: any) => ({
        id: country.id,
        name: country.name,
        iso2: country.iso2,
        iso3: country.iso3
      }));
      
      res.json(countries);
    } catch (error) {
      console.error('Failed to load countries:', error);
      res.status(500).json({ message: "Failed to fetch countries data" });
    }
  });

  app.get("/api/geographic/states", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { countryId } = req.query;
      if (!countryId) {
        return res.status(400).json({ message: "Country ID is required" });
      }

      const statesPath = path.join(process.cwd(), 'server', 'data', 'states.json');
      
      if (!fs.existsSync(statesPath)) {
        return res.status(404).json({ message: "States data not found" });
      }
      
      const statesData = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
      // Filter states by country ID
      const states = statesData
        .filter((state: any) => state.country_id === parseInt(countryId as string))
        .map((state: any) => ({
          id: state.id,
          name: state.name,
          country_id: state.country_id,
          iso2: state.iso2
        }));
      
      res.json(states);
    } catch (error) {
      console.error('Failed to load states:', error);
      res.status(500).json({ message: "Failed to fetch states data" });
    }
  });

  app.get("/api/geographic/cities", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { stateId } = req.query;
      if (!stateId) {
        return res.status(400).json({ message: "State ID is required" });
      }

      const citiesPath = path.join(process.cwd(), 'server', 'data', 'cities.json');
      const statesPath = path.join(process.cwd(), 'server', 'data', 'states.json');
      
      if (!fs.existsSync(citiesPath)) {
        return res.status(404).json({ message: "Cities data not found" });
      }
      
      if (!fs.existsSync(statesPath)) {
        return res.status(404).json({ message: "States data not found" });
      }
      
      const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
      const statesData = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
      
      // Find the selected state to get its fips_code and country
      const selectedState = statesData.find((state: any) => state.id === parseInt(stateId as string));
      
      if (!selectedState) {
        return res.json([]); // Return empty array if state not found
      }
      
      // Try multiple matching strategies due to incompatible ID systems between datasets
      let cities: any[] = [];
      let bestMatch = { cities: [], strategy: '' };
      
      // Strategy 1: Direct state_id match (works for some datasets)
      const directCities = citiesData.cities.filter((city: any) => city.state_id === stateId.toString());
      if (directCities.length > bestMatch.cities.length) {
        bestMatch = { cities: directCities, strategy: 'direct' };
      }
      
      // Strategy 2: For Indian states, try offset mapping (4000 offset pattern)
      // Indian states have IDs 4000+ but cities use simple sequential IDs
      if (selectedState.country_id === 101) {
        const offset = parseInt(stateId as string) - 4000;
        const offsetCities = citiesData.cities.filter((city: any) => 
          city.state_id === offset.toString()
        );
        if (offsetCities.length > bestMatch.cities.length) {
          bestMatch = { cities: offsetCities, strategy: 'india-offset' };
        }
      }
      
      // Strategy 3: Try matching using fips_code (fallback for other countries)
      if (selectedState.fips_code && bestMatch.cities.length < 50) {
        const fipsCities = citiesData.cities.filter((city: any) => 
          city.state_id === selectedState.fips_code
        );
        if (fipsCities.length > bestMatch.cities.length) {
          bestMatch = { cities: fipsCities, strategy: 'fips' };
        }
      }
      
      cities = bestMatch.cities;
      
      // Log for debugging
      if (cities.length > 0) {
        console.log(`[Cities API] State ${selectedState.name} (ID: ${stateId}): Found ${cities.length} cities using ${bestMatch.strategy} strategy`);
      }
      
      // Filter and prioritize major cities over localities
      // If we have too many results (>100), likely contains localities - filter to major cities only
      if (cities.length > 100) {
        cities = cities
          .filter((city: any) => {
            const name = city.name.toLowerCase();
            const localityKeywords = ['village', 'colony', 'nagar', 'puram', 'pet', 'pally', 'patti', 'pur', 'guda'];
            return !localityKeywords.some(keyword => name.endsWith(keyword));
          })
          .sort((a: any, b: any) => {
            if (a.name.length !== b.name.length) {
              return a.name.length - b.name.length;
            }
            return a.name.localeCompare(b.name);
          });
        // No limit: return all major cities
        console.log(`[Cities API] Filtered ${selectedState.name} from ${bestMatch.cities.length} to ${cities.length} major cities`);
      }
      
      // Map and return cities
      const mappedCities = cities
        .map((city: any) => ({
          id: city.id,
          name: city.name,
          state_id: city.state_id
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name)); // Sort alphabetically
      
      res.json(mappedCities);
    } catch (error) {
      console.error('Failed to load cities:', error);
      res.status(500).json({ message: "Failed to fetch cities data" });
    }
  });

  // Get location coordinates for mapping
  app.get("/api/geographic/coordinates", authenticateToken, async (req: Request, res: Response) => {
    try {
      const countriesPath = path.join(process.cwd(), 'server', 'data', 'countries.json');
      const statesPath = path.join(process.cwd(), 'server', 'data', 'states.json');
      const citiesPath = path.join(process.cwd(), 'server', 'data', 'cities.json');
      
      const coordinates: any = {};
      
      // Get country coordinates
      if (fs.existsSync(countriesPath)) {
        const countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
        countriesData.forEach((country: any) => {
          if (country.latitude && country.longitude) {
            coordinates[country.name] = {
              lat: parseFloat(country.latitude),
              lng: parseFloat(country.longitude),
              type: 'country'
            };
          }
        });
      }
      
      // Get state coordinates if available
      if (fs.existsSync(statesPath)) {
        const statesData = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
        statesData.forEach((state: any) => {
          if (state.latitude && state.longitude) {
            coordinates[`${state.country_name},${state.name}`] = {
              lat: parseFloat(state.latitude),
              lng: parseFloat(state.longitude),
              type: 'state'
            };
          }
        });
      }
      
      // Get city coordinates if available  
      if (fs.existsSync(citiesPath)) {
        const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
        if (citiesData.cities) {
          citiesData.cities.forEach((city: any) => {
            if (city.latitude && city.longitude) {
              coordinates[`${city.country_name},${city.state_name},${city.name}`] = {
                lat: parseFloat(city.latitude),
                lng: parseFloat(city.longitude),
                type: 'city'
              };
            }
          });
        }
      }
      
      res.json(coordinates);
    } catch (error) {
      console.error('Failed to load location coordinates:', error);
      res.status(500).json({ message: "Failed to fetch location coordinates" });
    }
  });

  // Get technicians for ticket assignment (Managers and Admins only)
  app.get("/api/users/technicians", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const users = await storage.getTenantUsers(req.user!.tenantId);
      
      // Filter to only technicians and remove sensitive information
      const technicians = users
        .filter(user => user.role === "technician" && user.isActive)
        .map(user => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          department: user.department,
          jobTitle: user.jobTitle,
        }));

      res.json(technicians);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch technicians" });
    }
  });

  // User Management Routes (Admin only)
  app.get("/api/users", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const users = await storage.getTenantUsers(req.user!.tenantId);
      
      // Remove sensitive information
      const safeUsers = users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        jobTitle: user.jobTitle,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        invitedBy: user.invitedBy,
        createdAt: user.createdAt,
      }));

      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users/invite", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const inviteData: InviteUser = inviteUserSchema.parse(req.body);
      
      // Validate role assignment permissions using centralized function
      if (!canAssignRole(req.user!.role, inviteData.role)) {
        const allowedRoles = getAllowedRolesForAssignment(req.user!.role);
        return res.status(403).json({ 
          message: `Insufficient permissions to create user with role '${inviteData.role}'. You can only create users with roles: ${allowedRoles.join(', ')}` 
        });
      }
      
      // Check if user already exists (globally, since email constraint is global)
      const existingUser = await storage.getUserByEmail(inviteData.email);
      if (existingUser) {
        // Use neutral messaging to prevent cross-tenant email enumeration
        return res.status(400).json({ message: "This email address is not available for registration" });
      }

      const defaultPassword = process.env.DEFAULT_TEAM_PASSWORD || "admin123";
      const hashedPassword = await hashPassword(defaultPassword);

      // Generate unique username from email (before @ symbol)
      const baseUsername = inviteData.email.split('@')[0];
      let username = baseUsername;
      let counter = 1;
      
      // Ensure username uniqueness
      while (await storage.getUserByUsername(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      // Create user account directly
      const newUser = await storage.createUser({
        username,
        email: inviteData.email,
        password: hashedPassword,
        firstName: inviteData.firstName,
        lastName: inviteData.lastName,
        role: inviteData.role,
        tenantId: req.user!.tenantId,
        invitedBy: req.user!.userId,
        mustChangePassword: false,
        isActive: true,
      });

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_created",
        resourceType: "user",
        resourceId: newUser.id,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Created user account for ${inviteData.email} with role ${inviteData.role}`,
      });

      // Return success response (don't include sensitive data)
      res.status(201).json({
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        isActive: newUser.isActive,
        mustChangePassword: newUser.mustChangePassword,
        createdAt: newUser.createdAt
      });
    } catch (error) {
      console.error("User creation error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create user account" });
    }
  });

  app.get("/api/users/invitations", authenticateToken, validateUserExists, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const invitations = await storage.getTenantInvitations(req.user!.tenantId);
      
      // Include inviter information with proper error handling
      const invitationsWithInviter = await Promise.all(
        invitations.map(async (invitation) => {
          try {
            const inviter = await storage.getUser(invitation.invitedBy);
            return {
              ...invitation,
              inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "Unknown",
            };
          } catch (inviterError) {
            console.warn(`Failed to fetch inviter for invitation ${invitation.id}:`, inviterError);
            return {
              ...invitation,
              inviterName: "Unknown",
            };
          }
        })
      );
      
      res.json(invitationsWithInviter);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ message: "Failed to fetch invitations" });
    }
  });

  // Cancel invitation
  app.delete("/api/users/invitations/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const invitationId = req.params.id;
      
      // Verify the invitation belongs to the admin's tenant
      const cancelledInvitation = await storage.cancelInvitation(invitationId, req.user!.tenantId);
      
      if (!cancelledInvitation) {
        return res.status(404).json({ message: "Invitation not found or already canceled" });
      }

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "invitation_cancelled",
        resourceType: "user_invitation",
        resourceId: cancelledInvitation.id,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Cancelled invitation for ${cancelledInvitation.email}`,
      });

      res.json({ 
        message: "Invitation cancelled successfully",
        invitation: {
          id: cancelledInvitation.id,
          email: cancelledInvitation.email,
          firstName: cancelledInvitation.firstName,
          lastName: cancelledInvitation.lastName,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel invitation" });
    }
  });

  app.patch("/api/users/:userId/role", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      const roleData: UpdateUserRole = updateUserRoleSchema.parse(req.body);
      
      // Prevent self-role modification
      if (userId === req.user!.userId) {
        return res.status(400).json({ message: "Cannot modify your own role" });
      }

      // Validate role assignment permissions
      if (!canAssignRole(req.user!.role, roleData.role)) {
        const allowedRoles = getAllowedRolesForAssignment(req.user!.role);
        return res.status(403).json({ 
          message: `Insufficient permissions to assign role '${roleData.role}'. You can only assign roles: ${allowedRoles.join(', ')}` 
        });
      }

      const updatedUser = await storage.updateUserRole(userId, req.user!.tenantId, roleData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_role_updated",
        resourceType: "user",
        resourceId: userId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Updated user role to ${roleData.role}`,
      });

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid role data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.patch("/api/users/:userId/deactivate", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      
      // Prevent self-deactivation
      if (userId === req.user!.userId) {
        return res.status(400).json({ message: "Cannot deactivate your own account" });
      }

      const success = await storage.deactivateUser(userId, req.user!.tenantId);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_deactivated",
        resourceType: "user",
        resourceId: userId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: "User account deactivated",
      });

      res.json({ message: "User deactivated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to deactivate user" });
    }
  });

  app.patch("/api/users/:userId/activate", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId;
      
      const success = await storage.activateUser(userId, req.user!.tenantId);
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }

      // Log the activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "user_activated",
        resourceType: "user",
        resourceId: userId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: "User account activated",
      });

      res.json({ message: "User activated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to activate user" });
    }
  });

  // ===== Enrollment Token Management =====
  
  // Auto-create default enrollment token for tenants that don't have any
  async function ensureDefaultEnrollmentToken(tenantId: string, tenantName: string) {
    try {
      const existing = await storage.getEnrollmentTokens(tenantId);
      if (existing.length === 0) {
        console.log(`Creating default enrollment token for tenant: ${tenantName}`);
        await storage.createEnrollmentToken({
          token: randomUUID(),
          name: "Default Enrollment Token",
          description: "Automatically created default token",
          tenantId,
          maxUses: null,
          usageCount: 0,
          isActive: true,
          expiresAt: null,
          createdBy: "system",
          siteId: null,
          siteName: null,
          lastUsedAt: null,
        });
      }
    } catch (error) {
      console.error(`Failed to create default enrollment token for ${tenantName}:`, error);
    }
  }

  // Migration endpoint: Create default token if tenant doesn't have one
  app.post("/api/enrollment-tokens/ensure-default", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const tenant = await storage.getTenant(req.user!.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const existing = await storage.getEnrollmentTokens(req.user!.tenantId);
      
      if (existing.length > 0) {
        return res.json({ 
          message: "Organization already has enrollment tokens",
          tokens: existing
        });
      }

      // Create default token
      const token = randomUUID();
      const enrollmentToken = await storage.createEnrollmentToken({
        token,
        name: "Default Enrollment Token",
        description: "Automatically created default token for device enrollment",
        tenantId: req.user!.tenantId,
        maxUses: null,
        usageCount: 0,
        isActive: true,
        expiresAt: null,
        createdBy: req.user!.userId,
        siteId: null,
        siteName: null,
        lastUsedAt: null,
      });

      // Log activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "enrollment_token_created",
        resourceType: "enrollment_token",
        resourceId: enrollmentToken.id,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: "Created default enrollment token",
      });

      res.json({ 
        message: "Default enrollment token created successfully",
        token: enrollmentToken
      });
    } catch (error) {
      console.error("Error creating default enrollment token:", error);
      res.status(500).json({ message: "Failed to create enrollment token" });
    }
  });
  
  // Create enrollment token
  app.post("/api/enrollment-tokens", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const { name, description, maxUses, expiresAt } = req.body;
      
      if (!name?.trim()) {
        return res.status(400).json({ message: "Token name is required" });
      }

      // Generate unique token
      const token = randomUUID();

      const enrollmentToken = await storage.createEnrollmentToken({
        token,
        name: name.trim(),
        description: description?.trim() || null,
        tenantId: req.user!.tenantId,
        maxUses: maxUses ? parseInt(maxUses) : null,
        usageCount: 0,
        isActive: true,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: req.user!.userId,
        siteId: null,
        siteName: null,
        lastUsedAt: null,
      });

      // Log activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "enrollment_token_created",
        resourceType: "enrollment_token",
        resourceId: enrollmentToken.id,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Created enrollment token: ${name}`,
      });

      res.json(enrollmentToken);
    } catch (error) {
      console.error("Error creating enrollment token:", error);
      res.status(500).json({ message: "Failed to create enrollment token" });
    }
  });

  // Get all enrollment tokens for tenant
  app.get("/api/enrollment-tokens", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const tokens = await storage.getEnrollmentTokens(req.user!.tenantId);
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching enrollment tokens:", error);
      res.status(500).json({ message: "Failed to fetch enrollment tokens" });
    }
  });

  // Get first active enrollment token (for displaying enrollment URL to users)
  app.get("/api/enrollment-tokens/active", authenticateToken, async (req: Request, res: Response) => {
    try {
      const tokens = await storage.getEnrollmentTokens(req.user!.tenantId);
      const activeToken = tokens.find(t => t.isActive && (!t.expiresAt || new Date(t.expiresAt) > new Date()));
      
      if (!activeToken) {
        return res.json({ token: null, message: "No active enrollment tokens. Admin should create one." });
      }
      
      res.json(activeToken);
    } catch (error) {
      console.error("Error fetching active enrollment token:", error);
      res.status(500).json({ message: "Failed to fetch enrollment token" });
    }
  });

  // Update enrollment token (activate/deactivate, change limits)
  app.patch("/api/enrollment-tokens/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const tokenId = req.params.id;
      const { isActive, maxUses, expiresAt, name, description } = req.body;

      const updates: Partial<InsertEnrollmentToken> = {};
      if (typeof isActive === 'boolean') updates.isActive = isActive;
      if (maxUses !== undefined) updates.maxUses = maxUses ? parseInt(maxUses) : null;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (name) updates.name = name.trim();
      if (description !== undefined) updates.description = description?.trim() || null;

      const updated = await storage.updateEnrollmentToken(tokenId, req.user!.tenantId, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Enrollment token not found" });
      }

      // Log activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "enrollment_token_updated",
        resourceType: "enrollment_token",
        resourceId: tokenId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Updated enrollment token: ${updated.name}`,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating enrollment token:", error);
      res.status(500).json({ message: "Failed to update enrollment token" });
    }
  });

  // Delete/revoke enrollment token
  app.delete("/api/enrollment-tokens/:id", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const tokenId = req.params.id;
      
      // Get token info before deletion for logging
      const token = await storage.getEnrollmentToken(tokenId, req.user!.tenantId);
      
      if (!token) {
        return res.status(404).json({ message: "Enrollment token not found" });
      }

      const deleted = await storage.deleteEnrollmentToken(tokenId, req.user!.tenantId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Enrollment token not found" });
      }

      // Log activity
      await storage.logActivity({
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        action: "enrollment_token_deleted",
        resourceType: "enrollment_token",
        resourceId: tokenId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Deleted enrollment token: ${token.name}`,
      });

      res.json({ message: "Enrollment token deleted successfully" });
    } catch (error) {
      console.error("Error deleting enrollment token:", error);
      res.status(500).json({ message: "Failed to delete enrollment token" });
    }
  });

  // ===== End Enrollment Token Management =====

  // Bulk User Upload Routes
  // Download comprehensive CSV template with sample data
  app.get("/api/users/bulk/template", authenticateToken, requireRole("admin"), (req: Request, res: Response) => {
    const headers = [
      'first_name',
      'last_name',
      'email',
      'role',
      'department',
      'job_title'
    ];

    const sampleData = [
      [
        'John',
        'Doe',
        'john.doe@company.com',
        'admin',
        'IT Department',
        'IT Manager'
      ],
      [
        'Jane',
        'Smith', 
        'jane.smith@company.com',
        'it-manager',
        'IT Department',
        'Senior IT Manager'
      ],
      [
        'Mike',
        'Johnson',
        'mike.johnson@company.com',
        'technician',
        'IT Support',
        'IT Technician'
      ]
    ];

    // Sanitize all values for CSV safety
    const sanitizedData = sampleData.map(row => 
      row.map(cell => sanitizeCsvValue(cell.toString()))
    );

    // Generate CSV content
    const csvContent = [headers, ...sanitizedData]
      .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users_template.csv"');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Add UTF-8 BOM for better Excel compatibility
    const bom = '\uFEFF';
    res.send(bom + csvContent);
  });

  // Validate bulk user upload CSV file
  app.post("/api/users/bulk/validate", authenticateToken, requireRole("admin"), upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const csvData = req.file.buffer.toString('utf-8');
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
      
      // Transform headers to lowercase with underscores
      const results = records.map((record: any) => {
        const transformedRecord: any = {};
        Object.keys(record).forEach(key => {
          const transformedKey = key.toLowerCase().replace(/\s+/g, '_');
          transformedRecord[transformedKey] = record[key];
        });
        return transformedRecord;
      });

      const validUsers: any[] = [];
      const errors: any[] = [];
      const warnings: any[] = [];
      const requiredFields = ['first_name', 'last_name', 'email', 'role'];
      
      // Get allowed roles using centralized function
      const validRoles = getAllowedRolesForAssignment(req.user!.role);
      
      if (validRoles.length === 0) {
        return res.status(403).json({ message: 'Insufficient permissions to create users' });
      }

      // Validate each row
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const rowNumber = i + 2; // +2 because index starts at 0 and we have header
        let hasErrors = false;

        // Check required fields
        for (const field of requiredFields) {
          if (!row[field] || row[field].toString().trim() === '') {
            errors.push({
              row: rowNumber,
              field: field,
              message: `${field.replace('_', ' ')} is required`
            });
            hasErrors = true;
          }
        }

        if (!hasErrors) {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email)) {
            errors.push({
              row: rowNumber,
              field: 'email',
              message: 'Invalid email format'
            });
            hasErrors = true;
          }

          // Validate role
          if (!validRoles.includes(row.role.toLowerCase())) {
            errors.push({
              row: rowNumber,
              field: 'role',
              message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
            });
            hasErrors = true;
          }

          // Check for duplicate emails in the file
          const duplicateInFile = validUsers.find(user => user.email.toLowerCase() === row.email.toLowerCase());
          if (duplicateInFile) {
            errors.push({
              row: rowNumber,
              field: 'email',
              message: 'Duplicate email found in file'
            });
            hasErrors = true;
          }

          // Check if email already exists in database (globally, since email constraint is global)
          try {
            const existingUser = await storage.getUserByEmail(row.email);
            if (existingUser) {
              // Use neutral messaging to prevent cross-tenant email enumeration
              warnings.push({
                row: rowNumber,
                field: 'email',
                message: 'Email address is not available for registration and will be skipped'
              });
            }
          } catch (error) {
            // User doesn't exist, which is good
          }
        }

        if (!hasErrors) {
          validUsers.push({
            firstName: row.first_name.trim(),
            lastName: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            role: row.role.toLowerCase(),
            department: row.department ? row.department.trim() : null,
            jobTitle: row.job_title ? row.job_title.trim() : null,
            rowNumber
          });
        }
      }

      res.json({
        totalRows: results.length,
        validCount: validUsers.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors,
        warnings,
        validUsers: validUsers.slice(0, 5) // Only send first 5 for preview
      });

    } catch (error) {
      console.error('Bulk upload validation error:', error);
      res.status(500).json({ message: 'Failed to validate file' });
    }
  });

  // Import bulk users from validated CSV
  app.post("/api/users/bulk/import", authenticateToken, requireRole("admin"), upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const onlyValid = req.body.onlyValid === 'true';
      const csvData = req.file.buffer.toString('utf-8');
      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
      
      // Transform headers to lowercase with underscores
      const results = records.map((record: any) => {
        const transformedRecord: any = {};
        Object.keys(record).forEach(key => {
          const transformedKey = key.toLowerCase().replace(/\s+/g, '_');
          transformedRecord[transformedKey] = record[key];
        });
        return transformedRecord;
      });

      const usersToCreate: any[] = [];
      const errors: any[] = [];
      const skipped: any[] = [];
      const requiredFields = ['first_name', 'last_name', 'email', 'role'];
      
      // Get allowed roles using centralized function
      const validRoles = getAllowedRolesForAssignment(req.user!.role);
      
      if (validRoles.length === 0) {
        return res.status(403).json({ message: 'Insufficient permissions to create users' });
      }

      // Validate and prepare users for creation
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const rowNumber = i + 2;
        let hasErrors = false;

        // Check required fields
        for (const field of requiredFields) {
          if (!row[field] || row[field].toString().trim() === '') {
            if (!onlyValid) {
              errors.push({
                row: rowNumber,
                message: `${field.replace('_', ' ')} is required`
              });
            }
            hasErrors = true;
            break;
          }
        }

        if (!hasErrors) {
          // Validate email and role
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email) || !validRoles.includes(row.role.toLowerCase())) {
            if (!onlyValid) {
              errors.push({
                row: rowNumber,
                message: 'Invalid email or role format'
              });
            }
            hasErrors = true;
          }

          // Check if user already exists (globally, since email constraint is global)
          try {
            const existingUser = await storage.getUserByEmail(row.email);
            if (existingUser) {
              // Use neutral messaging to prevent cross-tenant email enumeration
              skipped.push({
                row: rowNumber,
                email: row.email,
                message: 'Email address is not available for registration'
              });
              hasErrors = true;
            }
          } catch (error) {
            // User doesn't exist, continue
          }
        }

        if (!hasErrors) {
          usersToCreate.push({
            firstName: row.first_name.trim(),
            lastName: row.last_name.trim(),
            email: row.email.trim().toLowerCase(),
            role: row.role.toLowerCase(),
            department: row.department ? row.department.trim() : null,
            jobTitle: row.job_title ? row.job_title.trim() : null,
            rowNumber
          });
        }
      }

      // If not onlyValid mode and there are errors, return error
      if (!onlyValid && errors.length > 0) {
        return res.status(400).json({
          message: 'Validation errors found. Please fix them or import valid users only.',
          errors,
          totalRows: results.length,
          validCount: usersToCreate.length,
          errorCount: errors.length,
          skippedCount: skipped.length
        });
      }

      // Create users
      const createdUsers: any[] = [];
      const createErrors: any[] = [];

      for (const userData of usersToCreate) {
        try {
          const username = generateUsername(userData.email);
          const temporaryPassword = generateSecurePassword(12);
          const hashedPassword = await hashPassword(temporaryPassword);

          const newUser = await storage.createUser({
            email: userData.email,
            password: hashedPassword,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role as any,
            username: username,
            isActive: true,
            mustChangePassword: true,
            tenantId: req.user!.tenantId,
            department: userData.department,
            jobTitle: userData.jobTitle
          });

          createdUsers.push({
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            rowNumber: userData.rowNumber
          });

          // Get organization name for email
          const adminUser = await storage.getUser(req.user!.userId);
          const organizationName = adminUser?.firstName ? `${adminUser.firstName}'s Organization` : "Your Organization";
          
          // Send welcome email with credentials
          const emailTemplate = createWelcomeEmailTemplate(
            userData.firstName,
            userData.lastName,
            username,
            temporaryPassword,
            organizationName
          );
          
          // Attempt to send email (non-blocking)
          const emailSent = await sendEmail({
            to: userData.email,
            from: process.env.SENDGRID_FROM_EMAIL || "noreply@assetvault.com",
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text
          });
          
          if (!emailSent) {
            console.warn(`Failed to send welcome email to ${userData.email}`);
          }

          // Log user creation in audit log
          await storage.logActivity({
            tenantId: req.user!.tenantId,
            action: 'bulk_user_created',
            resourceType: 'user',
            resourceId: newUser.id,
            userId: req.user!.userId,
            userEmail: req.user!.email,
            userRole: req.user!.role,
            description: `Bulk created user account for ${newUser.email} with role ${newUser.role}`,
          });

        } catch (error) {
          console.error(`Error creating user for row ${userData.rowNumber}:`, error);
          createErrors.push({
            row: userData.rowNumber,
            email: userData.email,
            message: 'Failed to create user account'
          });
        }
      }

      // Log bulk import action
      await storage.logActivity({
        tenantId: req.user!.tenantId,
        action: 'bulk_user_import',
        resourceType: 'user',
        userId: req.user!.userId,
        userEmail: req.user!.email,
        userRole: req.user!.role,
        description: `Bulk imported ${createdUsers.length} users from CSV file`,
      });

      res.json({
        message: 'Bulk import completed',
        imported: createdUsers.length,
        errors: createErrors.length,
        skipped: skipped.length,
        createdUsers: createdUsers,
        createErrors,
        skipped
      });

    } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({ message: 'Failed to import users' });
    }
  });

  // Invitation acceptance route (public - no auth required)
  app.post("/api/auth/accept-invitation", async (req: Request, res: Response) => {
    try {
      const acceptData: AcceptInvitation = acceptInvitationSchema.parse(req.body);
      
      const result = await storage.acceptInvitation(acceptData.token, acceptData.password);
      if (!result) {
        return res.status(400).json({ message: "Invalid or expired invitation" });
      }

      const { user, invitation } = result;
      const token = generateToken(user);
      const tenant = await storage.getTenant(user.tenantId);

      // Log the activity
      await storage.logActivity({
        userId: user.id,
        tenantId: user.tenantId,
        action: "invitation_accepted",
        resourceType: "user",
        resourceId: user.id,
        userEmail: user.email,
        userRole: user.role,
        description: "User accepted invitation and joined organization",
      });

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          tenantId: user.tenantId,
        },
        tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid invitation data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Get invitation details (public - no auth required)
  app.get("/api/auth/invitation/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const invitation = await storage.getInvitation(token);
      
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      const tenant = await storage.getTenant(invitation.tenantId);
      const inviter = await storage.getUser(invitation.invitedBy);

      res.json({
        email: invitation.email,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        role: invitation.role,
        organizationName: tenant?.name || "Unknown Organization",
        inviterName: inviter ? `${inviter.firstName} ${inviter.lastName}` : "Unknown",
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invitation details" });
    }
  });

  // ====================== TICKET MANAGEMENT API ======================
  
  // Get tickets (role-based access)
  app.get("/api/tickets", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      let tickets;

      // Role-based access control - apply role migration for backward compatibility
      const migratedRole = user.role; // Already migrated in JWT token generation
      
      console.log(`[GET /api/tickets] User: ${user.email}, Role: ${migratedRole}`);
      
      switch (migratedRole) {
        case "technician":
          // Technicians can see tickets assigned to them
          tickets = await storage.getTicketsByAssignee(user.userId, user.tenantId);
          break;
        case "it-manager":
        case "admin":
        case "super-admin":
          // Managers, admins, and super-admins can see all tickets in their tenant
          tickets = await storage.getAllTickets(user.tenantId);
          break;
        default:
          // Fallback for any unknown roles - log and deny
          console.error(`[GET /api/tickets] Unknown role: ${migratedRole} for user ${user.email}`);
          return res.status(403).json({ message: "Invalid role" });
      }

      res.json(tickets);
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Get specific ticket
  app.get("/api/tickets/:id", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      const ticket = await storage.getTicket(ticketId, user.tenantId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Role-based access control
      const canAccess = user.role === "super-admin" ||
                       user.role === "admin" || 
                       user.role === "it-manager" ||
                       ticket.requestorId === user.userId ||
                       ticket.assignedToId === user.userId;
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(ticket);
    } catch (error) {
      console.error("Failed to fetch ticket:", error);
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

// POST /api/assets/tni/bulk
// Body: { assets: Array<InsertAsset-like> }
app.post("/api/assets/tni/bulk", async (req, res) => {
  try {
    const { assets } = req.body as { assets: any[] };
    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ message: "assets[] required" });
    }

    const tenantFromHeader = (req.header("x-tenant-id") || "").trim();
    let count = 0;

    for (const a of assets) {
      const row = {
        tenantId: tenantFromHeader || a.tenantId,
        name: a.name ?? a.hostname ?? "Unknown",
        type: a.type ?? "Hardware",
        category: a.category ?? null,
        manufacturer: a.manufacturer ?? null,
        model: a.model ?? null,
        serialNumber: a.serialNumber ?? null,
        status: a.status ?? "in-stock",
        specifications: (a.specifications ?? {}) as any, // jsonb
        notes: a.notes ?? "Imported from TNI",
        updatedAt: new Date(),
      };

      if (!row.tenantId) {
        return res
          .status(400)
          .json({ message: "tenantId missing (x-tenant-id header or body)" });
      }

      // --- Two-step UPSERT (no unique index required) ---
      if (row.serialNumber) {
        // Upsert by (tenantId, serialNumber)
        const updated = await db
          .update(s.assets)
          .set({
            name: row.name,
            type: row.type,
            category: row.category,
            manufacturer: row.manufacturer,
            model: row.model,
            status: row.status,
            specifications: row.specifications,
            notes: row.notes,
            updatedAt: row.updatedAt!,
          })
          .where(
            and(
              eq(s.assets.tenantId, row.tenantId),
              eq(s.assets.serialNumber, row.serialNumber)
            )
          )
          .returning({ id: s.assets.id });

        if (updated.length === 0) {
          await db.insert(s.assets).values(row as any);
        }
      } else {
        // No serial number: upsert by (tenantId, name)
        const updated = await db
          .update(s.assets)
          .set({
            type: row.type,
            category: row.category,
            manufacturer: row.manufacturer,
            model: row.model,
            status: row.status,
            specifications: row.specifications,
            notes: row.notes,
            updatedAt: row.updatedAt!,
          })
          .where(and(eq(s.assets.tenantId, row.tenantId), eq(s.assets.name, row.name)))
          .returning({ id: s.assets.id });

        if (updated.length === 0) {
          await db.insert(s.assets).values(row as any);
        }
      }

      count++;
    }

    return res.json({ ok: true, count });
  } catch (err: any) {
    console.error("TNI bulk ingest error:", err?.message || err);
    return res.status(500).json({ message: "failed to ingest assets", error: err?.message });
  }
});

  // Create new ticket
  app.post("/api/tickets", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      // Technicians cannot create tickets
      if (user.role === "technician") {
        return res.status(403).json({ message: "Technicians cannot create tickets" });
      }
      
      // Get full user details for name
      const fullUser = await storage.getUser(user.userId);
      if (!fullUser || fullUser.tenantId !== user.tenantId) {
        return res.status(401).json({ message: "User not found" });
      }

      // Determine the requestor (either specified user for admins or current user)
      let requestorId = user.userId;
      let requestorName = `${fullUser.firstName} ${fullUser.lastName}`;
      let requestorEmail = fullUser.email;

      // If admin/super-admin/it-manager is creating on behalf of someone else
      if (['super-admin', 'admin', 'it-manager'].includes(user.role) && req.body.requestorId) {
        const requestorUser = await storage.getUser(req.body.requestorId);
        if (!requestorUser || requestorUser.tenantId !== user.tenantId) {
          return res.status(400).json({ message: "Invalid requestor user" });
        }
        requestorId = requestorUser.id;
        requestorName = req.body.requestorName || `${requestorUser.firstName} ${requestorUser.lastName}`;
        requestorEmail = req.body.requestorEmail || requestorUser.email;
      }

      // Handle ticket assignment if provided
      let assignmentData: any = {};
      if (req.body.assignedToId) {
        const assignee = await storage.getUser(req.body.assignedToId);
        if (!assignee || assignee.tenantId !== user.tenantId || assignee.role !== 'technician') {
          return res.status(400).json({ message: "Invalid technician for assignment" });
        }
        assignmentData = {
          assignedToId: assignee.id,
          assignedToName: req.body.assignedToName || `${assignee.firstName} ${assignee.lastName}`,
          assignedById: user.userId,
          assignedByName: `${fullUser.firstName} ${fullUser.lastName}`,
          assignedAt: new Date(),
          status: 'in-progress', // Auto-progress status when assigned
        };
      }

      // Parse and validate request body
      const ticketData = insertTicketSchema.parse({
        ...req.body,
        requestorId,
        requestorName,
        requestorEmail,
        ...assignmentData,
        tenantId: user.tenantId
      });

      const ticket = await storage.createTicket(ticketData);
      
      // Log ticket creation
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.TICKET_CREATE,
          resourceType: ResourceTypes.TICKET,
          resourceId: ticket.id,
          description: `Created ticket: ${ticket.title} (${ticket.ticketNumber})${requestorId !== user.userId ? ` on behalf of ${requestorName}` : ''}${assignmentData.assignedToId ? ` and assigned to ${assignmentData.assignedToName}` : ''}`,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            category: ticket.category,
            priority: ticket.priority,
            requestorId,
            assignedToId: assignmentData.assignedToId
          }
        },
        req
      );

      res.status(201).json(ticket);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid ticket data", 
          errors: error.errors 
        });
      }
      console.error("Failed to create ticket:", error);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  // Update ticket details (only specific fields allowed)
  app.put("/api/tickets/:id", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      // Check if ticket exists and user has access
      const existingTicket = await storage.getTicket(ticketId, user.tenantId);
      if (!existingTicket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const elevatedRoles = ["super-admin", "admin", "it-manager"];
      const isElevated = elevatedRoles.includes(user.role);
      const isRequestor = existingTicket.requestorId === user.userId;
      
      // Role-based access control
      const canUpdate = isElevated || (isRequestor && user.role !== "technician");
      
      if (!canUpdate) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse and validate update data (only description, category, priority, assetId, assetName allowed)
      const updateData = updateTicketSchema.parse(req.body);
      
      const updatedTicket = await storage.updateTicket(ticketId, user.tenantId, updateData);
      res.json(updatedTicket);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid update data", 
          errors: error.errors 
        });
      }
      console.error("Failed to update ticket:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // Assign ticket (managers and admins only)
  app.put("/api/tickets/:id/assign", authenticateToken, validateUserExists, requireRole("it-manager"), async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      const { assignedToId, assignedToName } = req.body;
      
      if (!assignedToId || !assignedToName) {
        return res.status(400).json({ message: "assignedToId and assignedToName are required" });
      }

      // Verify the assignee exists and belongs to the same tenant
      const assignee = await storage.getUser(assignedToId);
      if (!assignee || assignee.tenantId !== user.tenantId) {
        return res.status(400).json({ message: "Invalid assignee" });
      }

      // Get full user details for name
      const fullUser = await storage.getUser(user.userId);
      if (!fullUser || fullUser.tenantId !== user.tenantId) {
        return res.status(401).json({ message: "User not found" });
      }

      const updatedTicket = await storage.assignTicket(
        ticketId, 
        user.tenantId, 
        assignedToId, 
        assignedToName,
        user.userId,
        `${fullUser.firstName} ${fullUser.lastName}`
      );
      
      if (!updatedTicket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error("Failed to assign ticket:", error);
      res.status(500).json({ message: "Failed to assign ticket" });
    }
  });

  // Update ticket status (technicians, managers, and admins only)
  app.put("/api/tickets/:id/status", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      const { status, resolution, resolutionNotes } = req.body;
      
      console.log(`[Update Ticket Status] User: ${user.email}, Role: ${user.role}, Ticket ID: ${ticketId}, Status: ${status}`);
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Check if ticket exists and user has access
      const existingTicket = await storage.getTicket(ticketId, user.tenantId);
      if (!existingTicket) {
        console.log(`[Update Ticket Status] Ticket not found: ${ticketId}`);
        return res.status(404).json({ message: "Ticket not found" });
      }

      console.log(`[Update Ticket Status] Ticket found - Requestor: ${existingTicket.requestorId}, Assigned To: ${existingTicket.assignedToId}`);

      // Role-based access control - allow super-admin, admin, and it-manager
      const canUpdateStatus = user.role === "super-admin" ||
                             user.role === "admin" || 
                             user.role === "it-manager";
      
      console.log(`[Update Ticket Status] Can update: ${canUpdateStatus} (role: ${user.role})`);
      
      if (!canUpdateStatus) {
        console.log(`[Update Ticket Status] Access denied - User role: ${user.role}, User ID: ${user.userId}, Assigned To: ${existingTicket.assignedToId}`);
        return res.status(403).json({ 
          message: "Access denied",
          debug: { userRole: user.role, assignedTo: existingTicket.assignedToId }
        });
      }

      const updatedTicket = await storage.updateTicketStatus(
        ticketId, 
        user.tenantId, 
        status, 
        resolution, 
        resolutionNotes
      );

      res.json(updatedTicket);
    } catch (error) {
      console.error("Failed to update ticket status:", error);
      res.status(500).json({ message: "Failed to update ticket status" });
    }
  });

  // Delete ticket (admins only)
  app.delete("/api/tickets/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      const success = await storage.deleteTicket(ticketId, user.tenantId);
      if (!success) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      res.json({ message: "Ticket deleted successfully" });
    } catch (error) {
      console.error("Failed to delete ticket:", error);
      res.status(500).json({ message: "Failed to delete ticket" });
    }
  });

  // Get ticket comments
  app.get("/api/tickets/:id/comments", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      // Check if ticket exists and user has access
      const ticket = await storage.getTicket(ticketId, user.tenantId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const isTechnician = user.role === "technician";
      const canAccess = isTechnician
        ? ticket.assignedToId === user.userId
        : (
            user.role === "super-admin" ||
            user.role === "admin" || 
            user.role === "it-manager" ||
            ticket.requestorId === user.userId
          );
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const comments = await storage.getTicketComments(ticketId, user.tenantId);
      res.json(comments);
    } catch (error) {
      console.error("Failed to fetch ticket comments:", error);
      res.status(500).json({ message: "Failed to fetch ticket comments" });
    }
  });

  // Add ticket comment
  app.post("/api/tickets/:id/comments", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      // Check if ticket exists and user has access
      const ticket = await storage.getTicket(ticketId, user.tenantId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const isTechnician = user.role === "technician";
      const canComment = !isTechnician && (
        user.role === "super-admin" ||
        user.role === "admin" || 
        user.role === "it-manager" ||
        ticket.requestorId === user.userId
      );
      
      if (!canComment) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get full user details for name
      const fullUser = await storage.getUser(user.userId);
      if (!fullUser || fullUser.tenantId !== user.tenantId) {
        return res.status(401).json({ message: "User not found" });
      }

      // Parse and validate comment data
      const commentData = insertTicketCommentSchema.parse({
        ...req.body,
        ticketId,
        authorId: user.userId,
        authorName: `${fullUser.firstName} ${fullUser.lastName}`,
        authorRole: user.role,
        tenantId: user.tenantId
      });

      const comment = await storage.addTicketComment(commentData);
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid comment data", 
          errors: error.errors 
        });
      }
      console.error("Failed to add ticket comment:", error);
      res.status(500).json({ message: "Failed to add ticket comment" });
    }
  });



  // Update ticket comment
  app.put("/api/tickets/:id/comments/:commentId", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const commentId = req.params.commentId;
      const { content } = req.body;

      if (user.role === "technician") {
        return res.status(403).json({ message: "Technicians cannot modify comments" });
      }
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Content is required" });
      }

      const updatedComment = await storage.updateTicketComment(commentId, user.tenantId, content);
      if (!updatedComment) {
        return res.status(404).json({ message: "Comment not found" });
      }

      res.json(updatedComment);
    } catch (error) {
      console.error("Failed to update ticket comment:", error);
      res.status(500).json({ message: "Failed to update ticket comment" });
    }
  });

  // Delete ticket comment
  app.delete("/api/tickets/:id/comments/:commentId", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const commentId = req.params.commentId;

      if (user.role === "technician") {
        return res.status(403).json({ message: "Technicians cannot modify comments" });
      }
      
      const success = await storage.deleteTicketComment(commentId, user.tenantId);
      if (!success) {
        return res.status(404).json({ message: "Comment not found" });
      }

      res.json({ message: "Comment deleted successfully" });
    } catch (error) {
      console.error("Failed to delete ticket comment:", error);
      res.status(500).json({ message: "Failed to delete ticket comment" });
    }
  });

// Heartbeat (unchanged)
app.get("/api/sync/status", (_req, res) => {
  res.json(getSyncStatus());
});

/**
 * GET software discovered for a device (by our Asset id).
 * - Looks up the asset
 * - Reads specifications.openaudit.id (with a few tolerant aliases)
 * - Calls oaFetchDeviceSoftware and returns normalized items
 */
  // Get ticket activities
  app.get("/api/tickets/:id/activities", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      // Check if ticket exists and user has access
      const ticket = await storage.getTicket(ticketId, user.tenantId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const isTechnician = user.role === "technician";
      const canAccess = isTechnician
        ? ticket.assignedToId === user.userId
        : (
            user.role === "super-admin" ||
            user.role === "admin" ||
            user.role === "it-manager" ||
            ticket.requestorId === user.userId
          );
      
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const activities = await storage.getTicketActivities(ticketId, user.tenantId);
      res.json(activities);
    } catch (error) {
      console.error("Failed to fetch ticket activities:", error);
      res.status(500).json({ message: "Failed to fetch ticket activities" });
    }
  });

  // Email-to-ticket webhook endpoint (SendGrid Inbound Parse)
  app.post("/api/webhook/email-to-ticket", upload.any(), async (req: Request, res: Response) => {
    try {
      console.log("Received email webhook:", {
        from: req.body.from,
        to: req.body.to,
        subject: req.body.subject
      });
      
      // Basic webhook validation
      if (!validateWebhookAuth(req)) {
        console.warn("Unauthorized webhook request blocked");
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Validate email data
      const emailData = validateEmailData(req.body);
      if (!emailData) {
        console.error("Invalid email data received");
        return res.status(400).json({ message: "Invalid email data" });
      }
      
      // Process email to create ticket
      const result = await processEmailToTicket(emailData);
      
      if (result.success) {
        console.log(`Successfully created ticket ${result.ticketId} from email`);
        res.status(200).json({ 
          message: "Ticket created successfully",
          ticketId: result.ticketId 
        });
      } else {
        console.warn(`Failed to create ticket from email: ${result.error}`);
        // Still return 200 to prevent SendGrid retries for user errors
        res.status(200).json({ 
          message: "Email received but ticket creation failed",
          error: result.error 
        });
      }
      
    } catch (error) {
      console.error("Error processing email webhook:", error);
      // Return 500 to trigger SendGrid retry for system errors
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ============================================
  // Network Discovery Routes
  // ============================================

  // Create a new discovery job
  app.post("/api/discovery/jobs", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const { siteId, siteName, networkRange } = req.body;
      const user = req.user!;
      
      console.log('[Discovery API] Creating job for user:', user.userId, user.email);
      
      // Generate short alphanumeric jobId (8 characters)
      const jobId = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      console.log('[Discovery API] Generated jobId:', jobId);
      
      // Detect OS from User-Agent
      const userAgent = req.headers['user-agent'] || '';
      let osType = 'unknown';
      if (/Windows/i.test(userAgent)) osType = 'windows';
      else if (/Macintosh|Mac OS/i.test(userAgent)) osType = 'macos';
      else if (/Linux/i.test(userAgent)) osType = 'linux';
      
      console.log('[Discovery API] Detected OS:', osType);
      
      // Token expires in 30 minutes
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      
      console.log('[Discovery API] Inserting job into database...');
      
      // Create discovery job
      const [job] = await db.insert(s.discoveryJobs).values({
        jobId,
        status: 'pending',
        initiatedBy: user.userId,
        initiatedByName: user.email, // Use email since firstName/lastName not in JWT
        osType,
        siteId: siteId || null,
        siteName: siteName || null,
        networkRange: networkRange || null,
        expiresAt,
        tenantId: user.tenantId,
      }).returning();
      
      console.log('[Discovery API] Job created:', job.id);
      
      // Generate discovery token (JWT with jobId)
      const tokenPayload = {
        jobId: job.id,
        jobIdShort: jobId,
        tenantId: user.tenantId,
        siteId: siteId || null,
        exp: Math.floor(expiresAt.getTime() / 1000),
      };
      const token = jwt.sign(tokenPayload, process.env.SESSION_SECRET || 'secret');
      
      console.log('[Discovery API] Token generated');
      
      // Store token
      await db.insert(s.discoveryTokens).values({
        token,
        jobId: job.id,
        tenantId: user.tenantId,
        siteId: siteId || null,
        expiresAt,
      });
      
      console.log('[Discovery API] Token stored, returning response');
      
      res.json({
        success: true,
        job: {
          id: job.id,
          jobId: job.jobId,
          status: job.status,
          osType: job.osType,
          expiresAt: job.expiresAt,
        },
        token,
        downloadUrl: `/api/discovery/download/${jobId}/${osType}`,
      });
      
    } catch (error: any) {
      console.error("[Discovery API] Error creating discovery job:", error);
      console.error("[Discovery API] Error stack:", error.stack);
      console.error("[Discovery API] Error details:", {
        message: error.message,
        code: error.code,
        detail: error.detail
      });
      res.status(500).json({ 
        success: false,
        message: "Failed to create discovery job",
        error: error.message 
      });
    }
  });
  
  // Get all recent discovery jobs (for automatic monitoring)
  app.get("/api/discovery/jobs/recent", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      // Get jobs from the last 24 hours, sorted by most recent first
      const jobs = await db
        .select()
        .from(s.discoveryJobs)
        .where(
          and(
            eq(s.discoveryJobs.tenantId, user.tenantId),
            gte(s.discoveryJobs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
          )
        )
        .orderBy(desc(s.discoveryJobs.createdAt))
        .limit(10);
      
      res.json({
        success: true,
        jobs: jobs.map(job => ({
          id: job.id,
          jobId: job.jobId,
          status: job.status,
          osType: job.osType,
          totalHosts: job.totalHosts,
          scannedHosts: job.scannedHosts,
          successfulHosts: job.successfulHosts,
          partialHosts: job.partialHosts,
          unreachableHosts: job.unreachableHosts,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          createdAt: job.createdAt,
        })),
      });
      
    } catch (error) {
      console.error("Error fetching recent discovery jobs:", error);
      res.status(500).json({ message: "Failed to fetch recent discovery jobs" });
    }
  });
  
  // Get discovery job status
  app.get("/api/discovery/jobs/:jobId", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const user = req.user!;
      
      const [job] = await db
        .select()
        .from(s.discoveryJobs)
        .where(
          and(
            eq(s.discoveryJobs.jobId, jobId),
            eq(s.discoveryJobs.tenantId, user.tenantId)
          )
        );
      
      if (!job) {
        return res.status(404).json({ message: "Discovery job not found" });
      }
      
      // Get discovered devices for this job
      const devices = await db
        .select()
        .from(s.discoveredDevices)
        .where(eq(s.discoveredDevices.jobId, job.id));
      
      res.json({
        success: true,
        job: {
          id: job.id,
          jobId: job.jobId,
          status: job.status,
          osType: job.osType,
          totalHosts: job.totalHosts,
          scannedHosts: job.scannedHosts,
          successfulHosts: job.successfulHosts,
          partialHosts: job.partialHosts,
          unreachableHosts: job.unreachableHosts,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          expiresAt: job.expiresAt,
        },
        devices,
      });
      
    } catch (error) {
      console.error("Error fetching discovery job:", error);
      res.status(500).json({ message: "Failed to fetch discovery job" });
    }
  });
  
  // Update discovery job progress (called by scanner agent during scan)
  app.patch("/api/discovery/jobs/:jobId/progress", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      
      if (!token) {
        return res.status(401).json({ message: "Authorization token required" });
      }
      
      // Verify discovery token
      let tokenData: any;
      try {
        tokenData = jwt.verify(token, process.env.SESSION_SECRET || 'secret');
      } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      
      // Check if token matches jobId
      if (tokenData.jobIdShort !== jobId) {
        return res.status(403).json({ message: "Token does not match job ID" });
      }
      
      const { status, progressMessage, progressPercent } = req.body;
      
      // Update job progress
      await db
        .update(s.discoveryJobs)
        .set({
          status: status || 'running',
          progressMessage: progressMessage,
          progressPercent: progressPercent || 0,
          ...(status === 'running' && !progressMessage ? { startedAt: new Date() } : {}),
          ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
        })
        .where(eq(s.discoveryJobs.jobId, jobId));
      
      res.json({ success: true, message: "Progress updated" });
      
    } catch (error) {
      console.error("Error updating discovery progress:", error);
      res.status(500).json({ message: "Failed to update progress" });
    }
  });
  
  // Upload discovery results (called by scanner agent)
  app.post("/api/discovery/jobs/:jobId/results", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.body.token;
      const { devices } = req.body;
      
      if (!token) {
        return res.status(401).json({ message: "Discovery token required" });
      }
      
      // Verify discovery token
      let tokenData: any;
      try {
        tokenData = jwt.verify(token, process.env.SESSION_SECRET || 'secret');
      } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      
      // Check if token matches jobId
      if (tokenData.jobIdShort !== jobId) {
        return res.status(403).json({ message: "Token does not match job ID" });
      }
      
      // Get the job
      const [job] = await db
        .select()
        .from(s.discoveryJobs)
        .where(
          and(
            eq(s.discoveryJobs.jobId, jobId),
            eq(s.discoveryJobs.tenantId, tokenData.tenantId)
          )
        );
      
      if (!job) {
        return res.status(404).json({ message: "Discovery job not found" });
      }
      
      // Check if job is expired
      if (new Date() > new Date(job.expiresAt)) {
        await db
          .update(s.discoveryJobs)
          .set({ status: 'expired' })
          .where(eq(s.discoveryJobs.id, job.id));
        return res.status(410).json({ message: "Discovery job has expired" });
      }
      
      // Update job status to running
      if (job.status === 'pending') {
        await db
          .update(s.discoveryJobs)
          .set({ 
            status: 'running',
            startedAt: new Date(),
          })
          .where(eq(s.discoveryJobs.id, job.id));
      }
      
      // Process and insert discovered devices
      let successfulCount = 0;
      let partialCount = 0;
      let failedCount = 0;
      
      for (const device of devices) {
        // Check for duplicates in existing assets
        let isDuplicate = false;
        let duplicateAssetId = null;
        let duplicateMatchField = null;
        
        // Check by serial number first
        if (device.serialNumber) {
          const [existingAsset] = await db
            .select()
            .from(s.assets)
            .where(
              and(
                eq(s.assets.serialNumber, device.serialNumber),
                eq(s.assets.tenantId, tokenData.tenantId)
              )
            )
            .limit(1);
          
          if (existingAsset) {
            isDuplicate = true;
            duplicateAssetId = existingAsset.id;
            duplicateMatchField = 'serial';
          }
        }
        
        // Check by MAC address if no serial match
        if (!isDuplicate && device.macAddress) {
          const existingAssets = await db
            .select()
            .from(s.assets)
            .where(eq(s.assets.tenantId, tokenData.tenantId));
          
          for (const asset of existingAssets) {
            if (asset.specifications && typeof asset.specifications === 'object') {
              const specs = asset.specifications as any;
              if (specs.macAddress === device.macAddress) {
                isDuplicate = true;
                duplicateAssetId = asset.id;
                duplicateMatchField = 'mac';
                break;
              }
            }
          }
        }
        
        // Check by IP address if no other match
        if (!isDuplicate && device.ipAddress) {
          const existingAssets = await db
            .select()
            .from(s.assets)
            .where(eq(s.assets.tenantId, tokenData.tenantId));
          
          for (const asset of existingAssets) {
            if (asset.specifications && typeof asset.specifications === 'object') {
              const specs = asset.specifications as any;
              if (specs.ipAddress === device.ipAddress) {
                isDuplicate = true;
                duplicateAssetId = asset.id;
                duplicateMatchField = 'ip';
                break;
              }
            }
          }
        }
        
        // Insert discovered device
        await db.insert(s.discoveredDevices).values({
          jobId: job.id,
          ipAddress: device.ipAddress,
          macAddress: device.macAddress || null,
          hostname: device.hostname || null,
          sysName: device.sysName || null,
          sysDescr: device.sysDescr || null,
          sysObjectID: device.sysObjectID || null,
          serialNumber: device.serialNumber || null,
          manufacturer: device.manufacturer || null,
          model: device.model || null,
          interfaces: device.interfaces || null,
          osName: device.osName || null,
          osVersion: device.osVersion || null,
          discoveryMethod: device.discoveryMethod,
          status: device.status,
          credentialProfileId: device.credentialProfileId || null,
          openPorts: device.openPorts || null,
          portFingerprint: device.portFingerprint || null,
          macOui: device.macOui || null,
          isDuplicate,
          duplicateAssetId,
          duplicateMatchField,
          siteId: job.siteId || null,
          siteName: job.siteName || null,
          rawData: device.rawData || null,
          tenantId: tokenData.tenantId,
        });
        
        if (device.status === 'discovered') successfulCount++;
        else if (device.status === 'partial') partialCount++;
        else failedCount++;
      }
      
      // Update job statistics
      await db
        .update(s.discoveryJobs)
        .set({
          scannedHosts: (job.scannedHosts || 0) + devices.length,
          successfulHosts: (job.successfulHosts || 0) + successfulCount,
          partialHosts: (job.partialHosts || 0) + partialCount,
          unreachableHosts: (job.unreachableHosts || 0) + failedCount,
          totalHosts: (job.totalHosts || 0) + devices.length,
        })
        .where(eq(s.discoveryJobs.id, job.id));
      
      res.json({
        success: true,
        message: `Processed ${devices.length} devices`,
        statistics: {
          successful: successfulCount,
          partial: partialCount,
          failed: failedCount,
        },
      });
      
    } catch (error) {
      console.error("Error uploading discovery results:", error);
      res.status(500).json({ message: "Failed to upload discovery results" });
    }
  });
  
  // Server-Sent Events endpoint for real-time updates
  app.get("/api/discovery/jobs/:jobId/stream", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const user = req.user!;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);
    
    // Poll for updates every 2 seconds
    const intervalId = setInterval(async () => {
      try {
        const [job] = await db
          .select()
          .from(s.discoveryJobs)
          .where(
            and(
              eq(s.discoveryJobs.jobId, jobId),
              eq(s.discoveryJobs.tenantId, user.tenantId)
            )
          );
        
        if (!job) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Job not found' })}\n\n`);
          clearInterval(intervalId);
          res.end();
          return;
        }
        
        // Get device count
        const devices = await db
          .select()
          .from(s.discoveredDevices)
          .where(eq(s.discoveredDevices.jobId, job.id));
        
        // Send update
        res.write(`data: ${JSON.stringify({
          type: 'update',
          job: {
            id: job.id,
            jobId: job.jobId,
            status: job.status,
            totalHosts: job.totalHosts,
            scannedHosts: job.scannedHosts,
            successfulHosts: job.successfulHosts,
            partialHosts: job.partialHosts,
            unreachableHosts: job.unreachableHosts,
          },
          deviceCount: devices.length,
        })}\n\n`);
        
        // Stop if job is complete or expired
        if (job.status === 'completed' || job.status === 'expired' || job.status === 'failed') {
          clearInterval(intervalId);
          res.end();
        }
      } catch (error) {
        console.error("SSE error:", error);
        clearInterval(intervalId);
        res.end();
      }
    }, 2000);
    
    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
    });
  });
  
  // Import discovered devices into assets
  app.post("/api/discovery/import", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const { jobId, deviceIds, siteId, siteName, tags } = req.body;
      const user = req.user!;
      
      // Get the job
      const [job] = await db
        .select()
        .from(s.discoveryJobs)
        .where(
          and(
            eq(s.discoveryJobs.id, jobId),
            eq(s.discoveryJobs.tenantId, user.tenantId)
          )
        );
      
      if (!job) {
        return res.status(404).json({ message: "Discovery job not found" });
      }
      
      // Get devices to import
      const devicesToImport = await db
        .select()
        .from(s.discoveredDevices)
        .where(
          and(
            eq(s.discoveredDevices.jobId, jobId),
            inArray(s.discoveredDevices.id, deviceIds)
          )
        );
      
      let importedCount = 0;
      let skippedCount = 0;
      const importedAssets = [];
      
      for (const device of devicesToImport) {
        // Skip if already imported
        if (device.isImported) {
          skippedCount++;
          continue;
        }
        
        // Skip duplicates
        if (device.isDuplicate) {
          skippedCount++;
          continue;
        }
        
        // Create asset from discovered device
        const [newAsset] = await db.insert(s.assets).values({
          name: device.hostname || device.sysName || device.ipAddress,
          type: 'Hardware',
          category: device.portFingerprint || 'network-device',
          manufacturer: device.manufacturer || null,
          model: device.model || null,
          serialNumber: device.serialNumber || null,
          status: 'in-stock',
          country: null,
          state: null,
          city: siteName || job.siteName || null,
          specifications: {
            ipAddress: device.ipAddress,
            macAddress: device.macAddress,
            hostname: device.hostname,
            sysName: device.sysName,
            sysDescr: device.sysDescr,
            sysObjectID: device.sysObjectID,
            interfaces: device.interfaces,
            osName: device.osName,
            osVersion: device.osVersion,
            discoveryMethod: device.discoveryMethod,
            openPorts: device.openPorts,
            portFingerprint: device.portFingerprint,
            macOui: device.macOui,
          },
          tags: tags || [],
          tenantId: user.tenantId,
          lastSyncAt: new Date(),
          lastSyncSource: 'network-discovery',
        }).returning();
        
        // Mark device as imported
        await db
          .update(s.discoveredDevices)
          .set({
            isImported: true,
            importedAt: new Date(),
            importedAssetId: newAsset.id,
          })
          .where(eq(s.discoveredDevices.id, device.id));
        
        importedCount++;
        importedAssets.push(newAsset);
      }
      
      // Update job status to completed if all devices processed
      const remainingDevices = await db
        .select()
        .from(s.discoveredDevices)
        .where(
          and(
            eq(s.discoveredDevices.jobId, jobId),
            eq(s.discoveredDevices.isImported, false)
          )
        );
      
      if (remainingDevices.length === 0) {
        await db
          .update(s.discoveryJobs)
          .set({
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(s.discoveryJobs.id, jobId));
      }
      
      res.json({
        success: true,
        message: `Imported ${importedCount} devices, skipped ${skippedCount} duplicates`,
        imported: importedCount,
        skipped: skippedCount,
        assets: importedAssets,
      });
      
    } catch (error) {
      console.error("Error importing discovered devices:", error);
      res.status(500).json({ message: "Failed to import discovered devices" });
    }
  });
  
  // Download discovery scanner package
  app.get("/api/discovery/download/:jobId/:osType", async (req: Request, res: Response) => {
    try {
      const { jobId, osType } = req.params;
      
      // Get job and token
      const job = await db
        .select()
        .from(s.discoveryJobs)
        .where(eq(s.discoveryJobs.jobId, jobId))
        .limit(1);
      
      if (!job.length) {
        return res.status(404).json({ message: "Discovery job not found" });
      }
      
      const [token] = await db
        .select()
        .from(s.discoveryTokens)
        .where(eq(s.discoveryTokens.jobId, job[0].id))
        .limit(1);
      
      if (!token) {
        return res.status(404).json({ message: "Discovery token not found" });
      }
      
      // Get server URL from request
      const protocol = req.protocol;
      let host = req.get('host') || 'localhost:5050';
      
      // Replace 0.0.0.0 with localhost or actual hostname
      if (host.startsWith('0.0.0.0:')) {
        // Try to get actual hostname from request headers
        const forwardedHost = req.get('x-forwarded-host');
        const referer = req.get('referer');
        
        if (forwardedHost) {
          host = forwardedHost;
        } else if (referer) {
          // Extract host from referer URL
          try {
            const refererUrl = new URL(referer);
            host = refererUrl.host;
          } catch (e) {
            host = 'localhost:5050';
          }
        } else {
          // Default to localhost with same port
          const port = host.split(':')[1] || '5050';
          host = `localhost:${port}`;
        }
      }
      
      const serverUrl = `${protocol}://${host}`;
      console.log('[Download] Server URL for agent:', serverUrl);
      
      const configJson = {
        jobId: jobId,
        token: token.token,
        serverUrl: serverUrl
      };
      
      let scriptContent: string | Buffer = '';
      let fileName = '';
      let contentType = 'application/octet-stream';
      
      if (osType === 'macos') {
        // macOS .pkg installer with GUI wizard
        console.log('[Download] Creating .pkg installer for macOS');
        fileName = `ITAM-Discovery-${jobId}.pkg`;
        contentType = 'application/x-newton-compatible-pkg';
        
        try {
          // Create pkg using shell script (execSync already imported at top)
          const tmpDir = '/tmp/itam-pkg-' + Date.now();
          
          const createPkgScript = path.join(process.cwd(), 'discovery-scanner/macos/create-pkg-installer.sh');
          console.log('[Download] Using pkg script:', createPkgScript);
          
          // Make script executable
          execSync(`chmod +x "${createPkgScript}"`);
          
          // Run pkg creation script
          const pkgPath = `${tmpDir}/ITAM-Discovery-${jobId}.pkg`;
          console.log('[Download] Creating pkg at:', pkgPath);
          
          const output = execSync(
            `bash "${createPkgScript}" "${jobId}" "${token.token}" "${serverUrl}" "${tmpDir}"`,
            { encoding: 'utf-8' }
          );
          console.log('[Download] Pkg creation output:', output);
          
          // Read the generated pkg file
          scriptContent = fs.readFileSync(pkgPath);
          console.log('[Download] Pkg file size:', scriptContent.length, 'bytes');
          console.log('[Download] Serving as:', fileName, 'with content-type:', contentType);
          
          // Clean up temp directory (but keep for a moment to allow download)
          setTimeout(() => {
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
              console.log('[Download] Cleaned up temp directory:', tmpDir);
            } catch (e) {
              console.error('Failed to clean up temp pkg directory:', e);
            }
          }, 60000); // Clean up after 1 minute
          
        } catch (error: any) {
          console.error('[Download] Failed to create pkg installer:', error);
          console.error('[Download] Error stack:', error.stack);
          return res.status(500).json({ 
            message: 'Failed to create installer package',
            error: error.message 
          });
        }
        
      } else if (osType === 'macos-old') {
        // Old macOS .command file - double-clickable
        fileName = `ITAM-Discovery-${jobId}.command`;
        scriptContent = `#!/bin/bash
# ITAM Network Discovery Scanner for macOS
# Double-click this file to run the network scan

clear
echo "============================================"
echo "ITAM Network Discovery Scanner"
echo "============================================"
echo "Job ID: ${jobId}"
echo ""

# Configuration
JOB_ID="${jobId}"
TOKEN="${token.token}"
SERVER_URL="${serverUrl}"

# Check and install dependencies
if ! command -v snmpget &> /dev/null; then
    echo "Installing net-snmp via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install net-snmp
    else
        echo "ERROR: Homebrew not installed. Please install Homebrew first."
        read -p "Press Enter to exit..."
        exit 1
    fi
fi

if ! command -v jq &> /dev/null; then
    echo "Installing jq via Homebrew..."
    brew install jq
fi

echo "Dependencies installed successfully!"
echo ""
echo "Starting network scan..."
echo "This will scan your local network for devices using SNMP"
echo ""

# Get network range
NETWORK_RANGE=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d'.' -f1-3).0/24

echo "Scanning network: $NETWORK_RANGE"
echo ""

# Initialize results
DEVICES='[]'
DISCOVERED=0

# Scan network
for i in {1..254}; do
    IP=$(echo $NETWORK_RANGE | cut -d'/' -f1 | cut -d'.' -f1-3).$i
    
    # Quick ping test
    if ping -c 1 -W 1 $IP &>/dev/null; then
        echo "Found host: $IP - Testing SNMP..."
        
        # Try SNMP
        HOSTNAME=""
        SYS_DESCR=""
        
        for COMMUNITY in public private; do
            HOSTNAME=$(snmpget -v2c -c $COMMUNITY -t 1 -r 0 $IP 1.3.6.1.2.1.1.5.0 2>/dev/null | awk '{print $NF}' | tr -d '"')
            if [ ! -z "$HOSTNAME" ]; then
                SYS_DESCR=$(snmpget -v2c -c $COMMUNITY -t 1 -r 0 $IP 1.3.6.1.2.1.1.1.0 2>/dev/null | cut -d'=' -f2 | tr -d '"')
                
                # Create device object
                DEVICE=$(cat <<EOF
{
  "ipAddress": "$IP",
  "hostname": "$HOSTNAME",
  "sysDescr": "$SYS_DESCR",
  "discoveryMethod": "snmpv2c",
  "status": "discovered",
  "scanTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
                DEVICES=$(echo "$DEVICES" | jq ". += [$DEVICE]")
                DISCOVERED=$((DISCOVERED + 1))
                echo "  ✓ Discovered: $HOSTNAME ($IP)"
                break
            fi
        done
        
        if [ -z "$HOSTNAME" ]; then
            echo "  ⚠ No SNMP response from $IP"
        fi
    fi
done

echo ""
echo "============================================"
echo "Scan Complete!"
echo "Found $DISCOVERED devices"
echo "============================================"
echo ""

# Upload results
if [ $DISCOVERED -gt 0 ]; then
    echo "Uploading results to server..."
    
    PAYLOAD=$(cat <<EOF
{
  "devices": $DEVICES
}
EOF
)
    
    RESPONSE=$(curl -s -X POST \$
        -H "Content-Type: application/json" \$
        -H "Authorization: Bearer $TOKEN" \$
        -d "$PAYLOAD" \$
        "$SERVER_URL/api/discovery/jobs/$JOB_ID/results")
    
    if echo "$RESPONSE" | grep -q "success"; then
        echo "✓ Results uploaded successfully!"
        echo "✓ Check your ITAM dashboard to review and import devices"
    else
        echo "✗ Failed to upload results"
    fi
else
    echo "No devices found to upload"
fi

echo ""
echo "Press Enter to close this window..."
read
`;
        
      } else if (osType === 'windows') {
        // Windows .bat file
        fileName = `ITAM-Discovery-${jobId}.bat`;
        scriptContent = `@echo off
REM ITAM Network Discovery Scanner for Windows
REM Double-click this file to run the network scan

title ITAM Network Discovery Scanner
color 0A

echo ============================================
echo ITAM Network Discovery Scanner
echo ============================================
echo Job ID: ${jobId}
echo.

REM Configuration
set JOB_ID=${jobId}
set TOKEN=${token.token}
set SERVER_URL=${serverUrl}

echo Checking dependencies...

REM Check for PowerShell
where powershell >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell not found
    pause
    exit /b 1
)

echo Starting network scan...
echo This will scan your local network for devices using SNMP
echo.

REM Create temporary PowerShell script
set TEMP_PS=%TEMP%\\itam-discovery-%JOB_ID%.ps1

(
echo $JOB_ID = "%JOB_ID%"
echo $TOKEN = "%TOKEN%"
echo $SERVER_URL = "%SERVER_URL%"
echo.
echo Write-Host "Scanning network..." -ForegroundColor Cyan
echo.
echo # Get local network
echo $NetworkAdapter = Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notmatch "^127\\." } ^| Select-Object -First 1
echo $IP = $NetworkAdapter.IPAddress
echo $Prefix = $NetworkAdapter.PrefixLength
echo $BaseIP = ($IP -split "\\.")^[0..2^] -join "."
echo.
echo Write-Host "Scanning $BaseIP.0/$Prefix"
echo.
echo $Devices = @^(^)
echo $Discovered = 0
echo.
echo # Scan network
echo 1..254 ^| ForEach-Object {
echo     $TargetIP = "$BaseIP.$_"
echo     if ^(Test-Connection -ComputerName $TargetIP -Count 1 -Quiet -TimeoutSeconds 1^) {
echo         Write-Host "Found host: $TargetIP - Testing SNMP..." -ForegroundColor Yellow
echo         
echo         # Try SNMP with snmpget if available
echo         try {
echo             $snmpResult = snmpget -v2c -c public -t 1 -r 0 $TargetIP 1.3.6.1.2.1.1.5.0 2^>$null
echo             if ^($snmpResult^) {
echo                 $hostname = ^($snmpResult -split "="^)^[1^].Trim^(^)
echo                 
echo                 $device = @{
echo                     ipAddress = $TargetIP
echo                     hostname = $hostname
echo                     discoveryMethod = "snmpv2c"
echo                     status = "discovered"
echo                     scanTimestamp = ^(Get-Date^).ToUniversalTime^(^).ToString^("yyyy-MM-ddTHH:mm:ssZ"^)
echo                 }
echo                 
echo                 $Devices += $device
echo                 $Discovered++
echo                 Write-Host "  OK Discovered: $hostname ^($TargetIP^)" -ForegroundColor Green
echo             }
echo         } catch {
echo             Write-Host "  WARNING No SNMP response from $TargetIP" -ForegroundColor DarkYellow
echo         }
echo     }
echo }
echo.
echo Write-Host "============================================" -ForegroundColor Cyan
echo Write-Host "Scan Complete!" -ForegroundColor Green
echo Write-Host "Found $Discovered devices" -ForegroundColor Green
echo Write-Host "============================================" -ForegroundColor Cyan
echo.
echo.
echo # Upload results
echo if ^($Discovered -gt 0^) {
echo     Write-Host "Uploading results to server..." -ForegroundColor Cyan
echo     
echo     $payload = @{
echo         devices = $Devices
echo     } ^| ConvertTo-Json -Depth 10
echo     
echo     $headers = @{
echo         "Content-Type" = "application/json"
echo         "Authorization" = "Bearer $TOKEN"
echo     }
echo     
echo     try {
echo         $response = Invoke-RestMethod -Uri "$SERVER_URL/api/discovery/jobs/$JOB_ID/results" -Method Post -Headers $headers -Body $payload
echo         Write-Host "OK Results uploaded successfully!" -ForegroundColor Green
echo         Write-Host "OK Check your ITAM dashboard to review and import devices" -ForegroundColor Green
echo     } catch {
echo         Write-Host "ERROR Failed to upload results" -ForegroundColor Red
echo     }
echo } else {
echo     Write-Host "No devices found to upload" -ForegroundColor Yellow
echo }
echo.
echo Write-Host "Press any key to close this window..."
echo $null = $Host.UI.RawUI.ReadKey^("NoEcho,IncludeKeyDown"^)
) > "%TEMP_PS%"

REM Run PowerShell script
powershell -ExecutionPolicy Bypass -File "%TEMP_PS%"

REM Cleanup
del "%TEMP_PS%" >nul 2>nul

pause
`;
        
      } else {
        // Linux .sh file with shebang
        fileName = `itam-discovery-${jobId}.sh`;
        scriptContent = `#!/bin/bash
# ITAM Network Discovery Scanner for Linux
# Make executable: chmod +x ${fileName}
# Run: ./${fileName}

clear
echo "============================================"
echo "ITAM Network Discovery Scanner"
echo "============================================"
echo "Job ID: ${jobId}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script needs root privileges for network scanning"
    echo "Please run with sudo:"
    echo "  sudo ./${fileName}"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Configuration
JOB_ID="${jobId}"
TOKEN="${token.token}"
SERVER_URL="${serverUrl}"

# Install dependencies
echo "Checking dependencies..."
if ! command -v snmpget &> /dev/null; then
    echo "Installing SNMP tools..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y snmp jq
    elif command -v yum &> /dev/null; then
        yum install -y net-snmp-utils jq
    elif command -v dnf &> /dev/null; then
        dnf install -y net-snmp-utils jq
    fi
fi

echo "Dependencies ready!"
echo ""
echo "Starting network scan..."
echo ""

# Get network range
NETWORK_RANGE=$(ip route | grep -v default | grep -m1 "/" | awk '{print $1}')

echo "Scanning network: $NETWORK_RANGE"
echo ""

# Initialize results
DEVICES='[]'
DISCOVERED=0

# Extract base IP and scan
BASE_IP=$(echo $NETWORK_RANGE | cut -d'/' -f1 | cut -d'.' -f1-3)

for i in {1..254}; do
    IP="$BASE_IP.$i"
    
    if ping -c 1 -W 1 $IP &>/dev/null; then
        echo "Found host: $IP - Testing SNMP..."
        
        HOSTNAME=""
        for COMMUNITY in public private; do
            HOSTNAME=$(snmpget -v2c -c $COMMUNITY -t 1 -r 0 $IP 1.3.6.1.2.1.1.5.0 2>/dev/null | awk '{print $NF}' | tr -d '"')
            if [ ! -z "$HOSTNAME" ]; then
                SYS_DESCR=$(snmpget -v2c -c $COMMUNITY -t 1 -r 0 $IP 1.3.6.1.2.1.1.1.0 2>/dev/null | cut -d'=' -f2 | tr -d '"')
                
                DEVICE=$(cat <<EOF
{
  "ipAddress": "$IP",
  "hostname": "$HOSTNAME",
  "sysDescr": "$SYS_DESCR",
  "discoveryMethod": "snmpv2c",
  "status": "discovered",
  "scanTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
                DEVICES=$(echo "$DEVICES" | jq ". += [$DEVICE]")
                DISCOVERED=$((DISCOVERED + 1))
                echo "  ✓ Discovered: $HOSTNAME ($IP)"
                break
            fi
        done
    fi
done

echo ""
echo "============================================"
echo "Scan Complete!"
echo "Found $DISCOVERED devices"
echo "============================================"
echo ""

# Upload results
if [ $DISCOVERED -gt 0 ]; then
    echo "Uploading results to server..."
    
    PAYLOAD=$(cat <<EOF
{
  "devices": $DEVICES
}
EOF
)
    
    RESPONSE=$(curl -s -X POST \$
        -H "Content-Type: application/json" \$
        -H "Authorization: Bearer $TOKEN" \$
        -d "$PAYLOAD" \$
        "$SERVER_URL/api/discovery/jobs/$JOB_ID/results")
    
    if echo "$RESPONSE" | grep -q "success"; then
        echo "✓ Results uploaded successfully!"
        echo "✓ Check your ITAM dashboard to review and import devices"
    else
        echo "✗ Failed to upload results"
    fi
fi

echo ""
read -p "Press Enter to close..."
`;
      }
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', contentType);
      res.send(scriptContent);
      
    } catch (error) {
      console.error("Error downloading scanner:", error);
      res.status(500).json({ message: "Failed to download scanner package" });
    }

  // ============================================
  // Network Monitoring Agent Routes
  // ============================================
  
  // Agent heartbeat - called by network monitor agent
  app.post("/api/network/agent/heartbeat", async (req: Request, res: Response) => {
    try {
      const { agentId, agentName, osType, version, agentIpAddress, networkRange, apiKey } = req.body;
      
      // Validate API key - check if agent exists with this key
      const existingAgents = await db
        .select()
        .from(s.networkMonitorAgents)
        .where(eq(s.networkMonitorAgents.apiKey, apiKey));
      
      if (existingAgents.length === 0) {
        return res.status(401).json({ message: "Invalid API key" });
      }
      
      const existingAgent = existingAgents[0];
      
      // Update or insert agent record
      const [agent] = await db
        .insert(s.networkMonitorAgents)
        .values({
          agentId: agentId,
          agentName: agentName || `Agent \${agentId.substring(0, 8)}`,
          osType: osType,
          version: version,
          apiKey: apiKey,
          status: 'active',
          lastHeartbeat: new Date(),
          agentIpAddress: agentIpAddress,
          networkRange: networkRange,
          tenantId: existingAgent.tenantId,
          installedBy: existingAgent.installedBy,
        })
        .onConflictDoUpdate({
          target: s.networkMonitorAgents.agentId,
          set: {
            agentName: agentName || `Agent \${agentId.substring(0, 8)}`,
            osType: osType,
            version: version,
            status: 'active',
            lastHeartbeat: new Date(),
            agentIpAddress: agentIpAddress,
            networkRange: networkRange,
            updatedAt: new Date(),
          },
        })
        .returning();
      
      res.json({ success: true, message: "Heartbeat received", agent });
    } catch (error) {
      console.error("Error processing agent heartbeat:", error);
      res.status(500).json({ message: "Failed to process heartbeat" });
    }
  });
  
  // Update Wi-Fi presence data - called by network monitor agent
  app.post("/api/network/presence/update", async (req: Request, res: Response) => {
    try {
      const { agentId, apiKey, devices } = req.body;
      
      // Validate API key
      const [agent] = await db
        .select()
        .from(s.networkMonitorAgents)
        .where(
          and(
            eq(s.networkMonitorAgents.agentId, agentId),
            eq(s.networkMonitorAgents.apiKey, apiKey)
          )
        );
      
      if (!agent) {
        return res.status(401).json({ message: "Invalid agent or API key" });
      }
      
      const tenantId = agent.tenantId;
      const now = new Date();
      
      // Get all assets for this tenant to check authorization
      const tenantAssets = await db
        .select()
        .from(s.assets)
        .where(eq(s.assets.tenantId, tenantId));
      
      // Create a map of MAC addresses to asset IDs
      const macToAssetMap = new Map();
      tenantAssets.forEach(asset => {
        if (asset.specifications && typeof asset.specifications === 'object') {
          const specs = asset.specifications as any;
          if (specs.macAddress) {
            macToAssetMap.set(specs.macAddress.toLowerCase(), {
              id: asset.id,
              name: asset.name,
            });
          }
        }
      });
      
      let updatedCount = 0;
      let newDeviceCount = 0;
      let unauthorizedCount = 0;
      
      for (const device of devices) {
        const macAddress = device.macAddress.toLowerCase();
        const assetInfo = macToAssetMap.get(macAddress);
        const isAuthorized = !!assetInfo;
        
        // Check if device exists
        const existing = await db
          .select()
          .from(s.wifiPresence)
          .where(
            and(
              eq(s.wifiPresence.tenantId, tenantId),
              eq(s.wifiPresence.macAddress, macAddress)
            )
          );
        
        if (existing.length > 0) {
          // Update existing record
          const existingDevice = existing[0];
          const connectionDuration = Math.floor((now.getTime() - new Date(existingDevice.firstSeen).getTime()) / 1000);
          
          await db
            .update(s.wifiPresence)
            .set({
              ipAddress: device.ipAddress,
              hostname: device.hostname || existingDevice.hostname,
              manufacturer: device.manufacturer || existingDevice.manufacturer,
              lastSeen: now,
              isActive: true,
              connectionDuration: connectionDuration,
              updatedAt: now,
            })
            .where(eq(s.wifiPresence.id, existingDevice.id));
          
          updatedCount++;
        } else {
          // Insert new record
          await db.insert(s.wifiPresence).values({
            tenantId: tenantId,
            macAddress: macAddress,
            ipAddress: device.ipAddress,
            hostname: device.hostname || null,
            manufacturer: device.manufacturer || null,
            assetId: assetInfo?.id || null,
            assetName: assetInfo?.name || null,
            isAuthorized: isAuthorized,
            firstSeen: now,
            lastSeen: now,
            isActive: true,
            connectionDuration: 0,
            deviceType: null,
            metadata: {},
          });
          
          newDeviceCount++;
          
          // Create alert for unauthorized device
          if (!isAuthorized) {
            await db.insert(s.unknownDeviceAlerts).values({
              tenantId: tenantId,
              macAddress: macAddress,
              ipAddress: device.ipAddress,
              hostname: device.hostname || null,
              manufacturer: device.manufacturer || null,
              detectedAt: now,
              status: 'pending',
              deviceInfo: {
                agent: agentId,
                networkRange: agent.networkRange,
              },
            });
            
            unauthorizedCount++;
          }
        }
      }
      
      // Mark devices not in current scan as inactive
      const currentMacs = devices.map((d: any) => d.macAddress.toLowerCase());
      await db
        .update(s.wifiPresence)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(s.wifiPresence.tenantId, tenantId),
            not(inArray(s.wifiPresence.macAddress, currentMacs))
          )
        );
      
      res.json({
        success: true,
        message: "Presence data updated",
        stats: {
          updated: updatedCount,
          new: newDeviceCount,
          unauthorized: unauthorizedCount,
        },
      });
    } catch (error) {
      console.error("Error updating presence data:", error);
      res.status(500).json({ message: "Failed to update presence data" });
    }
  });
  
  // Get live Wi-Fi presence data
  app.get("/api/network/presence/live", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      // Get all active devices
      const devices = await db
        .select()
        .from(s.wifiPresence)
        .where(
          and(
            eq(s.wifiPresence.tenantId, user.tenantId),
            eq(s.wifiPresence.isActive, true)
          )
        )
        .orderBy(desc(s.wifiPresence.lastSeen));
      
      res.json({ success: true, devices });
    } catch (error) {
      console.error("Error fetching live presence:", error);
      res.status(500).json({ message: "Failed to fetch live presence data" });
    }
  });
  
  // Server-Sent Events for real-time presence updates
  app.get("/api/network/presence/stream", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    const user = req.user!;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // Send initial connection message
    res.write(`data: \${JSON.stringify({ type: 'connected' })}\n\n`);
    
    // Poll for updates every 3 seconds
    const intervalId = setInterval(async () => {
      try {
        const devices = await db
          .select()
          .from(s.wifiPresence)
          .where(
            and(
              eq(s.wifiPresence.tenantId, user.tenantId),
              eq(s.wifiPresence.isActive, true)
            )
          )
          .orderBy(desc(s.wifiPresence.lastSeen));
        
        res.write(`data: \${JSON.stringify({
          type: 'update',
          devices: devices,
        })}\n\n`);
      } catch (error) {
        console.error("SSE error:", error);
        clearInterval(intervalId);
        res.end();
      }
    }, 3000);
    
    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
    });
  });
  
  // Get unauthorized device alerts
  app.get("/api/network/alerts", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      const alerts = await db
        .select()
        .from(s.unknownDeviceAlerts)
        .where(eq(s.unknownDeviceAlerts.tenantId, user.tenantId))
        .orderBy(desc(s.unknownDeviceAlerts.detectedAt));
      
      res.json({ success: true, alerts });
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });
  
  // Acknowledge an alert
  app.post("/api/network/alerts/:alertId/acknowledge", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;
      const user = req.user!;
      
      const [alert] = await db
        .update(s.unknownDeviceAlerts)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date(),
          acknowledgedBy: user.id,
          notes: notes || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(s.unknownDeviceAlerts.id, parseInt(alertId)),
            eq(s.unknownDeviceAlerts.tenantId, user.tenantId)
          )
        )
        .returning();
      
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json({ success: true, alert });
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });
  
  // Generate API key for new agent
  app.post("/api/network/agent/generate-key", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const { agentName } = req.body;
      
      // Generate random API key
      const apiKey = require('crypto').randomBytes(32).toString('hex');
      
      // Create agent record with pending status
      const [agent] = await db.insert(s.networkMonitorAgents).values({
        agentId: require('crypto').randomUUID(),
        agentName: agentName || 'New Agent',
        osType: 'unknown',
        version: '1.0.0',
        apiKey: apiKey,
        status: 'pending',
        lastHeartbeat: new Date(),
        tenantId: user.tenantId,
        installedBy: user.id,
      }).returning();
      
      res.json({ success: true, agent, apiKey });
    } catch (error) {
      console.error("Error generating API key:", error);
      res.status(500).json({ message: "Failed to generate API key" });
    }
  });
  
  // Get all agents for tenant
  app.get("/api/network/agents", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      const agents = await db
        .select()
        .from(s.networkMonitorAgents)
        .where(eq(s.networkMonitorAgents.tenantId, user.tenantId))
        .orderBy(desc(s.networkMonitorAgents.lastHeartbeat));
      
      res.json({ success: true, agents });
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  });

  });
  
  // Credential Profile Management Routes
  
  // Get all credential profiles for tenant
  app.get("/api/discovery/credentials", authenticateToken, validateUserExists, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      const profiles = await db
        .select()
        .from(s.credentialProfiles)
        .where(eq(s.credentialProfiles.tenantId, user.tenantId))
        .orderBy(desc(s.credentialProfiles.priority));
      
      res.json({ success: true, profiles });
      
    } catch (error) {
      console.error("Error fetching credential profiles:", error);
      res.status(500).json({ message: "Failed to fetch credential profiles" });
    }
  });
  
  // Create credential profile
  app.post("/api/discovery/credentials", authenticateToken, validateUserExists, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const profileData = req.body;
      
      // If isDefault is true, unset other defaults
      if (profileData.isDefault) {
        await db
          .update(s.credentialProfiles)
          .set({ isDefault: false })
          .where(eq(s.credentialProfiles.tenantId, user.tenantId));
      }
      
      const [profile] = await db.insert(s.credentialProfiles).values({
        ...profileData,
        tenantId: user.tenantId,
      }).returning();
      
      res.json({ success: true, profile });
      
    } catch (error) {
      console.error("Error creating credential profile:", error);
      res.status(500).json({ message: "Failed to create credential profile" });
    }
  });
  
  // Update credential profile
  app.put("/api/discovery/credentials/:id", authenticateToken, validateUserExists, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const profileData = req.body;
      
      // If isDefault is true, unset other defaults
      if (profileData.isDefault) {
        await db
          .update(s.credentialProfiles)
          .set({ isDefault: false })
          .where(
            and(
              eq(s.credentialProfiles.tenantId, user.tenantId),
              ne(s.credentialProfiles.id, id)
            )
          );
      }
      
      const [profile] = await db
        .update(s.credentialProfiles)
        .set(profileData)
        .where(
          and(
            eq(s.credentialProfiles.id, id),
            eq(s.credentialProfiles.tenantId, user.tenantId)
          )
        )
        .returning();
      
      if (!profile) {
        return res.status(404).json({ message: "Credential profile not found" });
      }
      
      res.json({ success: true, profile });
      
    } catch (error) {
      console.error("Error updating credential profile:", error);
      res.status(500).json({ message: "Failed to update credential profile" });
    }
  });
  
  // Delete credential profile
  app.delete("/api/discovery/credentials/:id", authenticateToken, validateUserExists, requireRole('admin'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      
      await db
        .delete(s.credentialProfiles)
        .where(
          and(
            eq(s.credentialProfiles.id, id),
            eq(s.credentialProfiles.tenantId, user.tenantId)
          )
        );
      
      res.json({ success: true, message: "Credential profile deleted" });
      
    } catch (error) {
      console.error("Error deleting credential profile:", error);
      res.status(500).json({ message: "Failed to delete credential profile" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
