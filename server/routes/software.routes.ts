import { Router, Request, Response } from "express";
import { db } from "../db";
import * as s from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authenticateToken } from "../middleware/auth.middleware";
import { oaFetchDeviceSoftware } from "../utils/openAuditClient";

const router = Router();

/**
 * @swagger
 * /api/software/import:
 *   post:
 *     summary: Import software items for a tenant
 *     tags: [Software]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - items
 *             properties:
 *               tenantId:
 *                 type: string
 *               deviceAssetId:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     publisher:
 *                       type: string
 *     responses:
 *       200:
 *         description: Software imported successfully
 *       400:
 *         description: Invalid request data
 */
router.post("/import", async (req: Request, res: Response) => {
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
 * @swagger
 * /api/software/{softwareId}/devices:
 *   get:
 *     summary: Get devices that have specific software installed
 *     tags: [Software]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: softwareId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of devices with this software
 *       404:
 *         description: Software not found
 */
router.get("/:softwareId/devices", authenticateToken, async (req: Request, res: Response) => {
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

export default router;
