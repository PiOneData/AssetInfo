import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { insertSoftwareLicenseSchema } from "@shared/schema";

const router = Router();

/**
 * @swagger
 * /api/licenses:
 *   get:
 *     summary: Get all software licenses
 *     tags: [Licenses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Licenses retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const licenses = await storage.getAllSoftwareLicenses(req.user!.tenantId);
    res.json(licenses);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch licenses" });
  }
});

/**
 * @swagger
 * /api/licenses:
 *   post:
 *     summary: Create a new software license (Manager only)
 *     tags: [Licenses]
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
 *         description: License created successfully
 */
router.post("/", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

export default router;
