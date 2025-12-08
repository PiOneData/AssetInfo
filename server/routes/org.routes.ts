import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { updateOrgSettingsSchema, type UpdateOrgSettings } from "@shared/schema";

const router = Router();

/**
 * @swagger
 * /api/org/settings:
 *   get:
 *     summary: Get organization settings
 *     tags: [Organization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 */
router.get("/settings", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/org/settings:
 *   patch:
 *     summary: Update organization settings (Admin only)
 *     tags: [Organization]
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
 *         description: Settings updated successfully
 */
router.patch("/settings", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

export default router;
