import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, validateUserExists, requireRole } from "../middleware/auth.middleware";
import {
  hashPassword,
  comparePassword,
  canAssignRole,
  getAllowedRolesForAssignment
} from "../services/auth";
import { sendEmail, generateSecurePassword, createWelcomeEmailTemplate } from "../services/email";
import multer from "multer";
import { parse } from "csv-parse/sync";
import {
  updateUserProfileSchema,
  insertUserPreferencesSchema,
  inviteUserSchema,
  updateUserRoleSchema,
  type UpdateUserProfile,
  type InsertUserPreferences,
  type InviteUser,
  type UpdateUserRole,
  type Asset
} from "@shared/schema";
import { z } from "zod";

const router = Router();

// Configure multer for CSV file uploads
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

// Helper function to sanitize CSV values for Excel safety
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

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await storage.getUser(req.user!.userId);
    if (!user || user.tenantId !== req.user!.tenantId) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return safe user data (exclude password)
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
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *       404:
 *         description: User not found
 */
router.get("/:id", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    let user = null;

    // Try to find by UUID first
    user = await storage.getUser(userId);

    // If not found and the ID is numeric, try looking up by numeric User ID
    if (!user && /^\d+$/.test(userId)) {
      const users = await storage.getTenantUsers(req.user!.tenantId);
      user = users.find(u => u.userID?.toString() === userId);
    }

    if (!user || user.tenantId !== req.user!.tenantId) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return safe user data (exclude password and sensitive info)
    res.json({
      id: user.id,
      userID: user.userID,
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
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/**
 * @swagger
 * /api/users/find:
 *   get:
 *     summary: Find user by email or employeeId
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
router.get("/find", authenticateToken, requireRole("technician"), async (req: Request, res: Response) => {
  try {
    const { email, employeeId } = req.query;

    if (!email && !employeeId) {
      return res.status(400).json({ message: "Either email or employeeId is required" });
    }

    let user = null;

    if (email) {
      user = await storage.getUserByEmail(email as string);
      // Verify tenant
      if (user && user.tenantId !== req.user!.tenantId) {
        user = null; // Security: Don't reveal cross-tenant users
      }
    } else if (employeeId) {
      const users = await storage.getTenantUsers(req.user!.tenantId);
      user = users.find(u => u.userID?.toString() === employeeId);
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Return safe user data
    res.json({
      id: user.id,
      userID: user.userID,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      department: user.department,
      jobTitle: user.jobTitle,
      role: user.role,
      isActive: user.isActive,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to find user" });
  }
});

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.patch("/me", authenticateToken, async (req: Request, res: Response) => {
  try {
    const profileData: UpdateUserProfile = updateUserProfileSchema.parse(req.body);

    // SECURITY: Prevent privilege escalation - only allow profile fields
    const safeProfileData: Partial<UpdateUserProfile> = {
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      phone: profileData.phone,
      department: profileData.department,
      jobTitle: profileData.jobTitle,
      manager: profileData.manager,
      avatar: profileData.avatar,
    };

    const updatedUser = await storage.updateUser(req.user!.userId, safeProfileData);
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

/**
 * @swagger
 * /api/users/me/preferences:
 *   get:
 *     summary: Get current user preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
 */
router.get("/me/preferences", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/me/preferences:
 *   patch:
 *     summary: Update current user preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 */
router.patch("/me/preferences", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/me/change-password:
 *   post:
 *     summary: Change current user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.post("/me/change-password", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/me/activity:
 *   get:
 *     summary: Get current user activity history
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Activity history retrieved successfully
 */
router.get("/me/activity", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/technicians:
 *   get:
 *     summary: Get list of active technicians
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Technicians list retrieved successfully
 */
router.get("/technicians", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users list retrieved successfully
 */
router.get("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/invite:
 *   post:
 *     summary: Invite a new user (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: User invited successfully
 */
router.post("/invite", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/invitations:
 *   get:
 *     summary: Get all pending invitations (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invitations retrieved successfully
 */
router.get("/invitations", authenticateToken, validateUserExists, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/invitations/{id}:
 *   delete:
 *     summary: Cancel an invitation (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation cancelled successfully
 */
router.delete("/invitations/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/{userId}/role:
 *   patch:
 *     summary: Update user role (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User role updated successfully
 */
router.patch("/:userId/role", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/{userId}/deactivate:
 *   patch:
 *     summary: Deactivate user account (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated successfully
 */
router.patch("/:userId/deactivate", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/{userId}/activate:
 *   patch:
 *     summary: Activate user account (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User activated successfully
 */
router.patch("/:userId/activate", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/bulk/template:
 *   get:
 *     summary: Download CSV template for bulk user import (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template downloaded successfully
 */
router.get("/bulk/template", authenticateToken, requireRole("admin"), (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/bulk/validate:
 *   post:
 *     summary: Validate bulk user upload CSV file (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Validation results
 */
router.post("/bulk/validate", authenticateToken, requireRole("admin"), upload.single('file'), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/users/bulk/import:
 *   post:
 *     summary: Import bulk users from validated CSV (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Users imported successfully
 */
router.post("/bulk/import", authenticateToken, requireRole("admin"), upload.single('file'), async (req: Request, res: Response) => {
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
      createErrors
    });

  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ message: 'Failed to import users' });
  }
});

export default router;
