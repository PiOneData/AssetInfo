import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { auditLogger, AuditActions } from "../audit-logger";
import {
  generateToken,
  hashPassword,
  comparePassword,
} from "../services/auth";
import {
  loginSchema,
  registerSchema,
  type LoginRequest,
  type RegisterRequest,
} from "@shared/schema";
import { authenticateToken } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/security.middleware";

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = loginSchema.parse(req.body);

    let user;
    try {
      user = await storage.getUserByEmail(email);
    } catch (dbError) {
      console.error("Database connection failed during login:", dbError);
      return res.status(503).json({
        message: "Service temporarily unavailable. Database connection failed.",
        code: "DATABASE_UNAVAILABLE",
      });
    }

    if (!user) {
      // Log failed login attempt
      try {
        await auditLogger.logAuthActivity(
          AuditActions.LOGIN,
          email,
          "unknown",
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
        userId: user.id,
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
      { tenantName: tenant?.name },
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

/**
 * POST /api/auth/register
 * Register a new organization and create first admin user
 */
router.post("/register", authLimiter, async (req: Request, res: Response) => {
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
        code: "DATABASE_UNAVAILABLE",
      });
    }

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Check if organization already exists
    let tenant;
    try {
      tenant = await storage.getTenantByName(tenantName);
    } catch (dbError) {
      console.error("Database connection failed during tenant lookup:", dbError);
      return res.status(503).json({
        message: "Service temporarily unavailable. Database connection failed.",
        code: "DATABASE_UNAVAILABLE",
      });
    }

    if (!tenant) {
      const slug = tenantName.toLowerCase().replace(/\s+/g, "-");
      tenant = await storage.createTenant({
        name: tenantName,
        slug: slug,
      });
    }

    const hashedPassword = await hashPassword(password);

    const result = await storage.createFirstAdminUser(
      {
        username: email,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: "super-admin",
        tenantId: tenant.id,
      },
      tenant.id
    );

    if (!result.success) {
      if (result.alreadyExists) {
        await auditLogger.logAuthActivity(
          AuditActions.SIGNUP,
          email,
          tenant.id,
          req,
          false,
          {
            reason: "admin_already_exists",
            tenantName: tenant.name,
            attemptedRole: "admin",
          }
        );

        return res.status(403).json({
          message: "Direct signup is not allowed for this organization",
          code: "SIGNUP_RESTRICTED",
          details: {
            organizationName: tenant.name,
            adminExists: true,
            invitationRequired: true,
            message:
              "An administrator already exists for this organization. Please contact your admin to receive an invitation.",
          },
        });
      } else {
        await auditLogger.logAuthActivity(
          AuditActions.SIGNUP,
          email,
          tenant.id,
          req,
          false,
          { reason: "server_error", tenantName: tenant.name }
        );

        return res.status(500).json({
          message: "Unable to create account due to a server error.",
          code: "SERVER_ERROR",
        });
      }
    }

    const user = result.user!;

    await auditLogger.logAuthActivity(
      AuditActions.SIGNUP,
      email,
      tenant.id,
      req,
      true,
      {
        tenantName: tenant.name,
        isFirstAdmin: true,
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
        wasDowngraded: false,
      },
    });
  } catch (error) {
    console.error("Registration validation error:", error);
    if (error instanceof z.ZodError) {
      console.error("Zod validation errors:", error.errors);
      return res.status(400).json({
        message: "Invalid registration data",
        errors: error.errors,
      });
    }
    res.status(400).json({ message: "Invalid request data" });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token and return user info
 */
router.get("/verify", authenticateToken, async (req: Request, res: Response) => {
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

export default router;
