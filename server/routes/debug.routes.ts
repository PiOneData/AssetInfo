import { Router, Request, Response } from "express";
import { db } from "../db";
import * as s from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";

const router = Router();

/**
 * @swagger
 * /api/debug/devices-specs:
 *   get:
 *     summary: Debug endpoint to inspect device specifications
 *     tags: [Debug]
 *     responses:
 *       200:
 *         description: Device specifications debug info
 */
router.get("/devices-specs", authenticateToken, requireRole('admin'), async (req: Request, res: Response) => {
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

export default router;
