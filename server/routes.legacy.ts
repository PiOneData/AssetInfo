import express, { type Express, Request, Response, RequestHandler } from "express";
import { and, eq , sql, InferInsertModel } from "drizzle-orm";
import * as s from "@shared/schema";
import { oaFetchDeviceSoftware, oaSubmitDeviceXML, oaFindDeviceId } from "./utils/openAuditClient";
import { syncOpenAuditFirstPage } from "./services/openauditSync";
import { getSyncStatus,markSyncChanged } from "./utils/syncHeartbeat";
import { pool, db } from "./db";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";  
import { storage } from "./storage";
import { auditLogger, AuditActions, ResourceTypes } from "./audit-logger";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
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
import { generateTempPassword } from "./utils/password-generator";
import { sendEmail, generateSecurePassword, createWelcomeEmailTemplate } from "./services/email";
import { processEmailToTicket, validateEmailData, validateWebhookAuth } from "./services/email-to-ticket";
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
  type UpdateUserRole
} from "@shared/schema";
import { z } from "zod";


declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
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
const authenticateToken = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = payload;
  next();
};

// Middleware to validate authenticated user exists in database
const validateUserExists = async (req: Request, res: Response, next: Function) => {
  try {
    const user = await storage.getUser(req.user!.userId);
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

  // Simple OS-detecting enrollment page (no auth)
  app.get("/enroll", (req, res) => {
    // Allow manual override: /enroll?os=mac or /enroll?os=win or /enroll?os=linux
    const osOverride = String(req.query.os ?? "").toLowerCase();

    const ua = String(req.headers["user-agent"] || "").toLowerCase();
    const isMacUA = ua.includes("mac os x") || ua.includes("macintosh");
    const isWinUA = ua.includes("windows");
    const isLinuxUA = ua.includes("linux") && !ua.includes("android");

    const isMac = osOverride === "mac" ? true : osOverride === "win" || osOverride === "linux" ? false : isMacUA;
    const isWin = osOverride === "win" ? true : osOverride === "mac" || osOverride === "linux" ? false : isWinUA;
    const isLinux = osOverride === "linux" ? true : osOverride === "mac" || osOverride === "win" ? false : isLinuxUA;

    // Files placed under /static/installers/
    const macUrl = "/static/installers/itam-agent-mac-dev.pkg";
    const winUrl = "/static/installers/itam-agent-win.exe";
    const linuxUrl = "/enroll/linux-installer"; // Auto-terminal installer
    const linuxScriptUrl = "/static/installers/itam-agent-linux-gui.sh"; // Direct script download
    const linuxCliUrl = "/static/installers/itam-agent-linux.sh";

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
    <title>ITAM Agent Enrollment</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <style>
      :root{color-scheme:dark}
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:0;padding:2rem;background:#0b1220;color:#e6edf3}
      .card{max-width:720px;margin:0 auto;background:#111827;border:1px solid #263043;border-radius:16px;padding:1.5rem;box-shadow:0 10px 30px rgba(0,0,0,0.25)}
      h1{font-size:1.4rem;margin:0 0 .5rem}
      p{opacity:.9;line-height:1.6}
      .actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}
      a.btn{display:inline-block;padding:.75rem 1rem;border-radius:10px;border:1px solid #304156;text-decoration:none;color:#e6edf3}
      a.btn.primary{background:#1f6feb;border-color:#1f6feb}
      small{opacity:.75}
      code{background:#0d1626;padding:.2rem .35rem;border-radius:6px}
      .hint{margin-top:.75rem;color:#9fb3c8}
      .install-note{margin-top:1rem;padding:1rem;background:#0d1626;border-radius:8px;border-left:3px solid #1f6feb}
      .install-note code{background:#111827}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Install ITAM Agent</h1>
      <p>This will install the agent and register your device with the IT Asset Management system.</p>

      <div class="actions">
        <a class="btn primary" id="primary" href="${primaryUrl}">${primaryLabel}</a>
        <a class="btn" href="${winUrl}">Windows (.exe)</a>
        <a class="btn" href="${macUrl}">macOS (.pkg)</a>
        <a class="btn" href="${linuxUrl}">Linux (GUI)</a>
        <a class="btn" href="${linuxCliUrl}">Linux (CLI)</a>
      </div>

      <p class="hint"><small>The download should start automatically. If not, click the button above.</small></p>
      ${isLinux ? `
      <div class="install-note" style="background:#0d1929;border-left:3px solid #2ea043;padding:1.5rem;">
        <h3 style="margin-top:0;color:#58a6ff;font-size:1.2rem;">📋 Register Your Linux Device</h3>
        <p style="margin:0.75rem 0;line-height:1.6;">The audit script has been downloaded. Run this command in your terminal to register your device:</p>
        
        <div style="margin:1rem 0;padding:1rem;background:#0b1220;border-radius:8px;border:2px solid #1f6feb;">
          <code id="installCmd" style="display:block;color:#7ee787;font-size:15px;font-family:'Courier New',monospace;user-select:all;font-weight:500;">cd ~/Downloads && sudo bash audit_linux.sh</code>
        </div>
        
        <button onclick="copyInstallCmd()" style="padding:0.75rem 1.5rem;background:#2ea043;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;box-shadow:0 4px 6px rgba(0,0,0,0.2);">
          📋 Copy Command
        </button>
        
        <div style="margin-top:1.5rem;padding:1rem;background:#0b1220;border-radius:6px;border:1px solid #21262d;">
          <p style="margin:0 0 0.5rem;font-weight:600;color:#e6edf3;">ℹ️ What happens:</p>
          <ol style="margin:0.5rem 0 0 1.25rem;padding:0;line-height:1.8;opacity:0.9;">
            <li>Script collects device hardware and software information</li>
            <li>Device is automatically registered in the ITAM system</li>
            <li>View and manage your device in the Assets dashboard</li>
            <li>Asset information updates automatically</li>
          </ol>
        </div>
      </div>
      <script>
        function copyInstallCmd() {
          const cmd = document.getElementById('installCmd').textContent;
          navigator.clipboard.writeText(cmd).then(() => {
            event.target.textContent = '✅ Copied! Paste in your terminal';
            setTimeout(() => { event.target.textContent = '📋 Copy Command'; }, 3000);
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

  // Serve the official Open-AudIT audit_linux.sh script directly
  app.get("/enroll/linux-installer", async (req, res) => {
    try {
      const scriptPath = path.join(process.cwd(), "build/linux/agent/audit_linux.sh");
      
      // Check if file exists
      if (!fs.existsSync(scriptPath)) {
        res.status(404).send("Linux audit script not found");
        return;
      }

      // Read the audit script
      const auditScript = fs.readFileSync(scriptPath, "utf-8");
      
      res.setHeader("Content-Type", "application/x-shellscript");
      res.setHeader("Content-Disposition", 'attachment; filename="audit_linux.sh"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.status(200).send(auditScript);
    } catch (error) {
      console.error("Error serving Linux installer:", error);
      res.status(500).send("Error generating installer");
    }
  });

  // Receive one-shot enrollment from the agent, post to OA, upsert into ITAM
  app.post("/api/agent/enroll", async (req, res) => {
    try {
      // 1) Parse & normalize input
      const body = req.body ?? {};
      const hostname = String(body.hostname ?? "").trim();
      const serial = (body.serial ?? null) ? String(body.serial).trim() : null;
      const osName = body?.os?.name ? String(body.os.name).trim() : null;
      const osVersion = body?.os?.version ? String(body.os.version).trim() : null;
      const username = (body.username ?? null) ? String(body.username).trim() : null;
      const ipsArr: string[] = Array.isArray(body.ips) ? body.ips.map((x: any) => String(x)) : [];
      const uptimeSeconds =
        Number.isFinite(Number(body.uptimeSeconds)) ? Number(body.uptimeSeconds) : null;

      if (!hostname) {
        return res.status(400).json({ ok: false, error: "hostname is required" });
      }

      // 2) Choose tenant for dev (no auth in this step)
      const devTenant =
        process.env.ENROLL_DEFAULT_TENANT_ID ||
        process.env.OA_TENANT_ID ||
        process.env.DEFAULT_TENANT_ID;
      if (!devTenant) {
        return res.status(500).json({ ok: false, error: "No default tenant configured" });
      }

      // Optional: allow skipping OA during debugging
      const skipOA = (process.env.ENROLL_SKIP_OA ?? "false").toLowerCase() === "true";
      let oaId: string | null = null;

      // 3) Upsert (by serial if present else by name)
      type NewAsset = InferInsertModel<typeof s.assets>;
      const now = new Date();

      const baseRow: NewAsset = {
        tenantId: devTenant,
        name: hostname,
        type: "Hardware",
        category: "computer",
        manufacturer: null,
        model: null,
        serialNumber: serial,
        status: "in-stock",

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
            agentVersion: "dev",
            enrollMethod: "link",
            lastCheckInAt: now.toISOString(),
            firstEnrolledAt: now.toISOString(),
            uptimeSeconds,
            lastIPs: ipsArr,
          },
        } as any,

        notes: "Enrolled via /api/agent/enroll",

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

      if (serial && serial.trim() !== "") {
        // ✅ Serial present → safe to use ON CONFLICT on (tenantId, serialNumber)
        await db
          .insert(s.assets)
          .values(baseRow)
          .onConflictDoUpdate({
            target: [s.assets.tenantId, s.assets.serialNumber],
            set: {
              name: baseRow.name,
              type: baseRow.type,
              category: baseRow.category,
              assignedUserName: baseRow.assignedUserName,
              specifications: baseRow.specifications,
              notes: baseRow.notes,
              updatedAt: now,
            },
          });
      } else {
        // ❌ No serial → cannot use ON CONFLICT with the partial (tenantId,name) index.
        //    Manual merge: UPDATE first (only rows where serial_number IS NULL), INSERT if none updated.
        const updated = await db
          .update(s.assets)
          .set({
            type: baseRow.type,
            category: baseRow.category,
            assignedUserName: baseRow.assignedUserName,
            specifications: baseRow.specifications,
            notes: baseRow.notes,
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
          await db.insert(s.assets).values(baseRow);
        }
      }

      // Re-read the asset row to get its id
      let assetId: string | null = null;
      if (serial && serial.trim() !== "") {
        const [row] = await db
          .select({ id: s.assets.id })
          .from(s.assets)
          .where(and(eq(s.assets.tenantId, devTenant), eq(s.assets.serialNumber, serial)))
          .limit(1);
        assetId = row?.id ?? null;
      }
      if (!assetId) {
        const [row] = await db
          .select({ id: s.assets.id })
          .from(s.assets)
          .where(and(eq(s.assets.tenantId, devTenant), eq(s.assets.name, hostname)))
          .limit(1);
        assetId = row?.id ?? null;
      }

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
        await oaSubmitDeviceXML(xml);

        // 5) Resolve OA device id (prefer serial, fallback hostname)
        oaId = await oaFindDeviceId({ serial, hostname });

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

      return res.json({
        ok: true,
        assetId,
        oa: { deviceId: oaId ?? null },
        message: skipOA
          ? "Device enrolled (OA skipped by ENROLL_SKIP_OA=true)."
          : "Device enrolled and posted to Open-AudIT.",
      });
    } catch (e: any) {
      console.error("[POST /api/agent/enroll] fail:", e?.message ?? e);
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

      // Be tolerant of different shapes
      const specs: any = (row as any)?.specifications ?? {};
      const oaId =
        specs?.openaudit?.id ??
        specs?.openaudit_id ??
        specs?.oaId ??
        null;

      if (!oaId) {
        return res.status(400).json({
          error: "Asset has no Open-AudIT id",
          details:
            "Expected specifications.openaudit.id to be set (our OA sync should populate this).",
        });
      }

      // Will try /components first (with X-Requested-With), then fallbacks
      const items = await oaFetchDeviceSoftware(String(oaId));
      return res.json({ items });
    } catch (e: any) {
      // Add server-side visibility
      console.error("[/api/assets/:assetId/software] failed:", e?.message ?? e);
      return res.status(500).json({
        error: "Failed to fetch software",
        details: e?.message ?? String(e),
      });
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

        if (existing.length > 0) {
          // Update existing software
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
          // Insert new software
          await db
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
          });
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

      // For each device, check if it has this software installed
      const devicesWithSoftware = [];
      
      for (const device of allDevices) {
        try {
          // Try to get OpenAudit device ID from specifications
          // Check multiple possible locations where oaId might be stored
          const specs = device.specifications as any;
          const oaId = 
            specs?.openaudit?.id ||
            specs?.agent?.oaId || 
            specs?.oaId;
          
          if (oaId) {
            // Fetch software list from OpenAudit
            const deviceSoftware = await oaFetchDeviceSoftware(oaId);
            
            console.log(`[SOFTWARE DEVICES] Device "${device.name}" (${oaId}): ${deviceSoftware.length} software items`);
            
            // Check if this software is installed on the device
            const hasSoftware = deviceSoftware.some((sw: any) => {
              const swName = sw.name || sw.software_name || "";
              const swVersion = sw.version || "";
              
              // More flexible matching:
              // 1. Check if base names match (case-insensitive)
              const baseSwName = swName.replace(/\s+[\d.]+$/g, '').trim();
              const nameMatch = 
                swName.toLowerCase().includes(baseSoftwareName.toLowerCase()) ||
                baseSoftwareName.toLowerCase().includes(swName.toLowerCase()) ||
                baseSwName.toLowerCase() === baseSoftwareName.toLowerCase();
              
              if (nameMatch) {
                console.log(`[SOFTWARE DEVICES]   - Match found: "${swName}" (version: ${swVersion})`);
              }
              
              return nameMatch;
            });
            
            if (hasSoftware) {
              devicesWithSoftware.push(device);
              console.log(`[SOFTWARE DEVICES] ✓ Device "${device.name}" has the software`);
            }
          } else {
            console.log(`[SOFTWARE DEVICES] Device "${device.name}": No OpenAudit ID found`);
          }
        } catch (err) {
          // Skip devices that fail to fetch software
          console.error(`[SOFTWARE DEVICES] Failed to fetch software for device ${device.id}:`, err);
        }
      }

      console.log(`[SOFTWARE DEVICES] Total devices with software: ${devicesWithSoftware.length}`);

      return res.json({ devices: devicesWithSoftware, softwareName });
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

  // Organization Settings
  app.get("/api/org/settings", authenticateToken, async (req: Request, res: Response) => {
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

  app.patch("/api/org/settings", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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
  app.get("/api/vendors", authenticateToken, async (req: Request, res: Response) => {
    try {
      const vendors = await storage.getMasterData(req.user!.tenantId, "vendor");
      res.json(vendors);
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post("/api/vendors", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { value, description } = req.body;
      if (!value || value.trim() === '') {
        return res.status(400).json({ message: "Vendor name is required" });
      }

      const vendor = await storage.createMasterData({
        type: "vendor",
        value: value.trim(),
        description: description || "",
        tenantId: req.user!.tenantId
      });

      res.status(201).json(vendor);
    } catch (error) {
      console.error('Failed to create vendor:', error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  app.put("/api/vendors/:id", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { value, description } = req.body;
      if (!value || value.trim() === '') {
        return res.status(400).json({ message: "Vendor name is required" });
      }

      const vendor = await storage.updateMasterData(req.params.id, req.user!.tenantId, {
        value: value.trim(),
        description: description || ""
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

  app.delete("/api/vendors/:id", authenticateToken, async (req: Request, res: Response) => {
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

  // Asset routes
  app.get("/api/assets", authenticateToken, async (req: Request, res: Response) => {
    try {
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

      const assets = await storage.getAllAssets(req.user!.tenantId, filters);
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

  app.post("/api/assets", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

  app.put("/api/assets/:id", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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
  app.get("/api/assets/bulk/template", authenticateToken, requireRole("manager"), (req: Request, res: Response) => {
    const headers = [
      'name',
      'type',
      'status',
      'category',
      'manufacturer',
      'model',
      'serial_number',
      'location',
      'assigned_user_email',
      'assigned_user_name',
      'purchase_date',
      'purchase_cost',
      'warranty_expiry',
      'specifications',
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
        'hardware',
        'deployed',
        'laptop',
        'Apple',
        'MacBook Pro',
        'A1234567890',
        'Office Floor 2',
        'john.doe@techcorp.com',
        'John Doe',
        '2024-01-15',
        '2499.00',
        '2027-01-15',
        '{"ram":"16GB","storage":"512GB SSD","processor":"M1 Pro"}',
        'High-performance laptop for development team',
        '',
        '',
        '',
        '',
        '',
        '',
        'Apple Inc',
        'sales@apple.com',
        '+1-800-275-2273',
        'Apple Inc',
        ''
      ],
      [
        'Dell OptiPlex 7090',
        'hardware',
        'in-stock',
        'desktop',
        'Dell',
        'OptiPlex 7090',
        'D9876543210',
        'Storage Room A',
        '',
        '',
        '2024-02-01',
        '899.00',
        '2027-02-01',
        '{"ram":"8GB","storage":"256GB SSD","processor":"Intel i5"}',
        'Desktop computer for office use',
        '',
        '',
        '',
        '',
        '',
        '',
        'Dell Technologies',
        'support@dell.com',
        '+1-800-624-9896',
        'Dell Inc',
        ''
      ],
      [
        'Microsoft Office 365',
        'software',
        'deployed',
        'productivity',
        'Microsoft',
        'Office 365',
        '',
        'Cloud',
        '',
        '',
        '2024-02-01',
        '150.00',
        '2025-02-01',
        '{"edition":"Business Premium","users":"unlimited"}',
        'Annual subscription for productivity suite',
        'Microsoft Office 365',
        '2024',
        'subscription',
        'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        '50',
        '2025-02-01',
        'Microsoft',
        'support@microsoft.com',
        '+1-800-642-7676',
        'Microsoft Corporation',
        ''
      ],
      [
        'Adobe Creative Suite',
        'software',
        'in-repair',
        'design',
        'Adobe',
        'Creative Suite',
        '',
        'IT Department',
        '',
        '',
        '2023-06-15',
        '2400.00',
        '2024-06-15',
        '{"edition":"Premium","applications":"Photoshop,Illustrator,InDesign"}',
        'Design software - license renewal needed',
        'Adobe Creative Suite',
        '2023',
        'perpetual',
        'ADOBE-XXXXX-XXXXX-XXXXX',
        '10',
        '',
        'Adobe Inc',
        'licensing@adobe.com',
        '+1-800-833-6687',
        'Adobe Inc',
        ''
      ],
      [
        'HP LaserJet Pro 400',
        'peripheral',
        'deployed',
        'printer',
        'HP',
        'LaserJet Pro 400',
        'HP123456789',
        'Office Floor 1',
        '',
        '',
        '2023-08-20',
        '299.00',
        '2026-08-20',
        '{"type":"laser","color":"monochrome","speed":"35ppm"}',
        'Network printer for general office use',
        '',
        '',
        '',
        '',
        '',
        '',
        'HP Inc',
        'support@hp.com',
        '+1-800-474-6836',
        'HP Inc',
        ''
      ],
      [
        'Logitech Wireless Mouse',
        'peripheral',
        'disposed',
        'mouse',
        'Logitech',
        'MX Master 3',
        'LOG987654321',
        'IT Storage',
        '',
        '',
        '2022-03-10',
        '99.00',
        '2025-03-10',
        '{"type":"wireless","buttons":"7","battery":"rechargeable"}',
        'End of life - battery no longer holds charge',
        '',
        '',
        '',
        '',
        '',
        '',
        'Logitech',
        'support@logitech.com',
        '+1-646-454-3200',
        'Logitech International',
        ''
      ],
      [
        'Office Furniture Desk',
        'others',
        'deployed',
        'furniture',
        'IKEA',
        'BEKANT',
        'IKEA123456',
        'Office Floor 2',
        'jane.smith@techcorp.com',
        'Jane Smith',
        '2023-09-15',
        '199.00',
        '2028-09-15',
        '{"dimensions":"160x80cm","color":"white","material":"particleboard"}',
        'Office desk for employee workspace',
        '',
        '',
        '',
        '',
        '',
        '',
        'IKEA',
        'info@ikea.com',
        '+1-888-888-4532',
        'IKEA Inc',
        ''
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
  app.post("/api/assets/bulk/upload", authenticateToken, requireRole("manager"), upload.single('file'), async (req: Request, res: Response) => {
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
          } else if (!['hardware', 'software', 'peripheral', 'others'].includes(record.type.trim().toLowerCase())) {
            errors.push("Type must be hardware, software, peripheral, or others");
          }
          if (!record.status?.trim()) {
            errors.push("Status is required");
          } else if (!['in-stock', 'deployed', 'in-repair', 'disposed'].includes(record.status.trim().toLowerCase())) {
            errors.push("Status must be in-stock, deployed, in-repair, or disposed");
          }

          // Type-specific validation
          if (record.type?.trim().toLowerCase() === 'software' && !record.software_name?.trim()) {
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
            const cost = parseFloat(record.purchase_cost);
            if (isNaN(cost) || cost < 0) {
              errors.push("Purchase cost must be a valid positive number");
            }
          }

          if (record.used_licenses && record.used_licenses.trim()) {
            const licenses = parseInt(record.used_licenses);
            if (isNaN(licenses) || licenses < 0) {
              errors.push("Used licenses must be a valid non-negative integer");
            }
          }

          // Build asset object if no errors
          if (errors.length === 0) {
            const assetData: any = {
              name: record.name.trim(),
              type: record.type.trim().toLowerCase(), // Normalize to lowercase
              status: record.status.trim().toLowerCase(), // Normalize to lowercase
              tenantId: req.user!.tenantId,
              createdBy: req.user!.userId
            };

            // Add optional fields
            const optionalFields = [
              'category', 'manufacturer', 'model', 'serial_number', 'location',
              'assigned_user_name', 'notes', 'software_name', 'version',
              'license_type', 'license_key', 'vendor_name', 'vendor_email',
              'vendor_phone', 'company_name', 'company_gst_number'
            ];

            for (const field of optionalFields) {
              if (record[field] && record[field].trim()) {
                assetData[field === 'serial_number' ? 'serialNumber' : 
                          field === 'assigned_user_name' ? 'assignedUserName' :
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
              assetData.purchaseCost = record.purchase_cost.trim();
            }
            if (record.used_licenses && record.used_licenses.trim()) {
              assetData.usedLicenses = parseInt(record.used_licenses);
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
  app.post("/api/ai/query", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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
      const aiResponse = await processITAMQuery(context);

      // Save the response to database with proper scoping
      const savedResponse = await storage.createAIResponse({
        prompt,
        response: aiResponse,
        userId: req.user!.userId,
        tenantId: req.user!.tenantId
      });

      // Log the AI query activity
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

      res.json({ sessionId: savedResponse.id });
    } catch (error) {
      console.error("AI query error:", error);
      res.status(500).json({ message: "Failed to process AI query" });
    }
  });

  app.get("/api/ai/response/:sessionId", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

  app.post("/api/licenses", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

  // Recommendations routes
  app.get("/api/recommendations", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const recommendations = await storage.getRecommendations(
        req.user!.tenantId, 
        status as string
      );
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  app.post("/api/recommendations/generate", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
    try {
      const assets = await storage.getAssets(req.user!.tenantId);
      const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);
      
      // Get utilization data for all assets
      const utilizationPromises = assets.map(asset => 
        storage.getAssetUtilization(asset.id, req.user!.tenantId)
      );
      const utilizationResults = await Promise.all(utilizationPromises);
      const utilization = utilizationResults.flat();

      const aiRecommendations = await generateAssetRecommendations({
        assets,
        licenses,
        utilization,
      });

      // Save recommendations to storage
      const savedRecommendations = await Promise.all(
        aiRecommendations.map(rec => 
          storage.createRecommendation({
            ...rec,
            potentialSavings: rec.potentialSavings.toString(),
            tenantId: req.user!.tenantId,
          })
        )
      );

      res.json(savedRecommendations);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  app.put("/api/recommendations/:id", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!["pending", "accepted", "dismissed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const recommendation = await storage.updateRecommendation(
        req.params.id,
        req.user!.tenantId,
        { status }
      );

      if (!recommendation) {
        return res.status(404).json({ message: "Recommendation not found" });
      }

      res.json(recommendation);
    } catch (error) {
      res.status(500).json({ message: "Failed to update recommendation" });
    }
  });

  // Master Data routes
  app.get("/api/master", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { type, query } = req.query;
      if (!type || typeof type !== 'string') {
        return res.status(400).json({ message: "Master data type is required" });
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

  app.post("/api/master", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
    try {
      const masterDataInput = insertMasterDataSchema.parse({
        ...req.body,
        tenantId: req.user!.tenantId,
      });

      const masterData = await storage.addMasterData(masterDataInput);
      res.status(201).json(masterData);
    } catch (error) {
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
      
      if (!fs.existsSync(citiesPath)) {
        return res.status(404).json({ message: "Cities data not found" });
      }
      
      const citiesData = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
      
      // Filter cities by state ID
      const cities = citiesData.cities
        .filter((city: any) => city.state_id === stateId.toString())
        .map((city: any) => ({
          id: city.id,
          name: city.name,
          state_id: city.state_id
        }));
      
      res.json(cities);
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
  app.get("/api/users/technicians", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

      // Generate secure temporary password
      const temporaryPassword = generateSecurePassword(12); // Generate secure random password
      const hashedPassword = await hashPassword(temporaryPassword);

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
        mustChangePassword: true, // Force password change on first login
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

      // Get organization name for email
      const adminUser = await storage.getUser(req.user!.userId);
      const organizationName = adminUser?.firstName ? `${adminUser.firstName}'s Organization` : "Your Organization";
      
      // Send welcome email with credentials
      const emailTemplate = createWelcomeEmailTemplate(
        inviteData.firstName,
        inviteData.lastName,
        username,
        temporaryPassword,
        organizationName
      );
      
      // Attempt to send email (non-blocking)
      const emailSent = await sendEmail({
        to: inviteData.email,
        from: process.env.SENDGRID_FROM_EMAIL || "noreply@assetvault.com",
        subject: emailTemplate.subject,
        html: emailTemplate.html,
        text: emailTemplate.text
      });
      
      if (!emailSent) {
        console.warn(`Failed to send welcome email to ${inviteData.email}`);
      }

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
        createdAt: newUser.createdAt,
        message: emailSent 
          ? "User account created successfully. Login credentials have been sent via email." 
          : "User account created successfully. Please contact your administrator for login credentials."
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
  app.get("/api/tickets", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      let tickets;

      // Role-based access control
      switch (user.role) {
        case "employee":
          // Employees can only see their own tickets
          tickets = await storage.getTicketsByRequestor(user.userId, user.tenantId);
          break;
        case "technician":
          // Technicians can see tickets assigned to them
          tickets = await storage.getTicketsByAssignee(user.userId, user.tenantId);
          break;
        case "manager":
        case "admin":
          // Managers and admins can see all tickets in their tenant
          tickets = await storage.getAllTickets(user.tenantId);
          break;
        default:
          return res.status(403).json({ message: "Invalid role" });
      }

      res.json(tickets);
    } catch (error) {
      console.error("Failed to fetch tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // Get specific ticket
  app.get("/api/tickets/:id", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      const ticket = await storage.getTicket(ticketId, user.tenantId);
      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Role-based access control
      const canAccess = user.role === "admin" || 
                       user.role === "manager" ||
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
  app.post("/api/tickets", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      
      // Get full user details for name
      const fullUser = await storage.getUser(user.userId);
      if (!fullUser || fullUser.tenantId !== user.tenantId) {
        return res.status(401).json({ message: "User not found" });
      }

      // Parse and validate request body
      const ticketData = insertTicketSchema.parse({
        ...req.body,
        requestorId: user.userId,
        requestorName: `${fullUser.firstName} ${fullUser.lastName}`,
        tenantId: user.tenantId
      });

      const ticket = await storage.createTicket(ticketData);
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
  app.put("/api/tickets/:id", authenticateToken, async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      
      // Check if ticket exists and user has access
      const existingTicket = await storage.getTicket(ticketId, user.tenantId);
      if (!existingTicket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Role-based access control
      const canUpdate = user.role === "admin" || 
                       user.role === "manager" ||
                       existingTicket.requestorId === user.userId;
      
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
  app.put("/api/tickets/:id/assign", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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
  app.put("/api/tickets/:id/status", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
    try {
      const user = req.user!;
      const ticketId = req.params.id;
      const { status, resolution, resolutionNotes } = req.body;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Check if ticket exists and user has access
      const existingTicket = await storage.getTicket(ticketId, user.tenantId);
      if (!existingTicket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      // Role-based access control
      const canUpdateStatus = user.role === "admin" || 
                             user.role === "manager" ||
                             existingTicket.assignedToId === user.userId;
      
      if (!canUpdateStatus) {
        return res.status(403).json({ message: "Access denied" });
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

      const canAccess = user.role === "admin" || 
                       user.role === "manager" ||
                       ticket.requestorId === user.userId ||
                       ticket.assignedToId === user.userId;
      
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

      const canComment = user.role === "admin" || 
                        user.role === "manager" ||
                        ticket.requestorId === user.userId ||
                        ticket.assignedToId === user.userId;
      
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

    // Be tolerant of different shapes
    const specs: any = (row as any)?.specifications ?? {};
    const oaId =
      specs?.openaudit?.id ??
      specs?.openaudit_id ??
      specs?.oaId ??
      null;

    if (!oaId) {
      return res.status(400).json({
        error: "Asset has no Open-AudIT id",
        details:
          "Expected specifications.openaudit.id to be set (our OA sync should populate this).",
      });
    }

    // Will try /components first (with X-Requested-With), then fallbacks
    const items = await oaFetchDeviceSoftware(String(oaId));
    return res.json({ items });
  } catch (e: any) {
    // Add server-side visibility
    console.error("[/api/assets/:assetId/software] failed:", e?.message ?? e);
    return res.status(500).json({
      error: "Failed to fetch software",
      details: e?.message ?? String(e),
    });
  }
});

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

      const canAccess = user.role === "admin" || 
                       user.role === "manager" ||
                       ticket.requestorId === user.userId ||
                       ticket.assignedToId === user.userId;
      
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

  const httpServer = createServer(app);
  return httpServer;
}
