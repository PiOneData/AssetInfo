import { Router, Request, Response } from "express";
import { db } from "../db";
import * as s from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { buildMinimalOAXml, oaSubmitDeviceXML, oaFindDeviceId } from "../utils/openAuditClient";
import { markSyncChanged } from "../utils/syncHeartbeat";

const router = Router();

/**
 * @swagger
 * /api/agent/enroll:
 *   post:
 *     summary: Agent enrollment endpoint
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hostname
 *             properties:
 *               hostname:
 *                 type: string
 *               serial:
 *                 type: string
 *               os:
 *                 type: object
 *               username:
 *                 type: string
 *               ips:
 *                 type: array
 *               uptimeSeconds:
 *                 type: number
 *     responses:
 *       200:
 *         description: Device enrolled successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Enrollment failed
 */
router.post("/enroll", async (req: Request, res: Response) => {
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

export default router;
