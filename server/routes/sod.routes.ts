/**
 * Segregation of Duties (SoD) API Routes (Phase 6.3)
 * SoD rule management and violation detection
 * @swagger
 * tags:
 *   name: SoD
 *   description: Segregation of Duties rules and violation detection
 */

import { Router } from "express";
import { storage } from "../storage";
import { SodService } from "../services/advanced/sod";
import type { Request, Response } from "express";

const router = Router();

// ============================================================================
// SoD Rules
// ============================================================================

/**
 * @swagger
 * /api/sod/rules:
 *   get:
 *     tags: [SoD]
 *     summary: Get all SoD rules
 *     description: Retrieve SoD rules with optional filtering by active status or severity
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter by active status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *     responses:
 *       200:
 *         description: List of SoD rules
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SodRule'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive, severity } = req.query;

    const rules = await storage.getSodRules(tenantId, {
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      severity: severity as string,
    });

    res.json(rules);
  } catch (error) {
    console.error("[SoD] Error fetching rules:", error);
    res.status(500).json({ error: "Failed to fetch SoD rules" });
  }
});

/**
 * @swagger
 * /api/sod/rules/{id}:
 *   get:
 *     tags: [SoD]
 *     summary: Get a specific SoD rule
 *     description: Retrieve details of a single SoD rule by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD rule ID
 *     responses:
 *       200:
 *         description: SoD rule details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SodRule'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.get("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const rule = await storage.getSodRule(req.params.id, tenantId);

    if (!rule) {
      return res.status(404).json({ error: "SoD rule not found" });
    }

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error fetching rule:", error);
    res.status(500).json({ error: "Failed to fetch SoD rule" });
  }
});

/**
 * @swagger
 * /api/sod/rules:
 *   post:
 *     tags: [SoD]
 *     summary: Create a new SoD rule
 *     description: Create a new Segregation of Duties rule defining conflicting applications
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - severity
 *               - appId1
 *               - appId2
 *               - rationale
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               appId1:
 *                 type: string
 *                 format: uuid
 *               appId2:
 *                 type: string
 *                 format: uuid
 *               rationale:
 *                 type: string
 *               complianceFramework:
 *                 type: string
 *                 enum: [SOX, GDPR, HIPAA, PCI-DSS, Custom]
 *               exemptedUsers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       201:
 *         description: SoD rule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SodRule'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/rules", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const rule = await service.createRule(req.body);

    res.status(201).json(rule);
  } catch (error) {
    console.error("[SoD] Error creating rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to create SoD rule"
    });
  }
});

/**
 * @swagger
 * /api/sod/rules/{id}:
 *   patch:
 *     tags: [SoD]
 *     summary: Update an SoD rule
 *     description: Update an existing Segregation of Duties rule
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD rule ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               rationale:
 *                 type: string
 *               complianceFramework:
 *                 type: string
 *                 enum: [SOX, GDPR, HIPAA, PCI-DSS, Custom]
 *               exemptedUsers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: SoD rule updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SodRule'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.patch("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const rule = await service.updateRule(req.params.id, req.body);

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error updating rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update SoD rule"
    });
  }
});

/**
 * @swagger
 * /api/sod/rules/{id}:
 *   delete:
 *     tags: [SoD]
 *     summary: Delete an SoD rule
 *     description: Delete a Segregation of Duties rule
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD rule ID
 *     responses:
 *       200:
 *         description: SoD rule deleted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.delete("/rules/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    await service.deleteRule(req.params.id);

    res.json({ message: "SoD rule deleted successfully" });
  } catch (error) {
    console.error("[SoD] Error deleting rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to delete SoD rule"
    });
  }
});

/**
 * @swagger
 * /api/sod/rules/{id}/toggle:
 *   post:
 *     tags: [SoD]
 *     summary: Toggle SoD rule active status
 *     description: Enable or disable an SoD rule
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD rule ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isActive
 *             properties:
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: SoD rule toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SodRule'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/rules/:id/toggle", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { isActive } = req.body;

    const service = new SodService(tenantId);
    const rule = await service.toggleRule(req.params.id, isActive);

    res.json(rule);
  } catch (error) {
    console.error("[SoD] Error toggling rule:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to toggle SoD rule"
    });
  }
});

// ============================================================================
// SoD Violations
// ============================================================================

/**
 * @swagger
 * /api/sod/violations:
 *   get:
 *     tags: [SoD]
 *     summary: Get all SoD violations
 *     description: Retrieve SoD violations with optional filtering by user, status, or severity
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, investigating, remediated, exempted]
 *         description: Filter by violation status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *     responses:
 *       200:
 *         description: List of SoD violations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SodViolation'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/violations", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, status, severity } = req.query;

    const violations = await storage.getSodViolations(tenantId, {
      userId: userId as string,
      status: status as string,
      severity: severity as string,
    });

    res.json(violations);
  } catch (error) {
    console.error("[SoD] Error fetching violations:", error);
    res.status(500).json({ error: "Failed to fetch SoD violations" });
  }
});

/**
 * @swagger
 * /api/sod/violations/{id}:
 *   get:
 *     tags: [SoD]
 *     summary: Get a specific SoD violation
 *     description: Retrieve details of a single SoD violation by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD violation ID
 *     responses:
 *       200:
 *         description: SoD violation details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SodViolation'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Server error
 */
router.get("/violations/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const violation = await storage.getSodViolation(req.params.id, tenantId);

    if (!violation) {
      return res.status(404).json({ error: "SoD violation not found" });
    }

    res.json(violation);
  } catch (error) {
    console.error("[SoD] Error fetching violation:", error);
    res.status(500).json({ error: "Failed to fetch SoD violation" });
  }
});

/**
 * @swagger
 * /api/sod/violations/user/{userId}:
 *   get:
 *     tags: [SoD]
 *     summary: Get violations for a specific user
 *     description: Retrieve all SoD violations associated with a specific user
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of user violations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SodViolation'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/violations/user/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const service = new SodService(tenantId);
    const violations = await service.getUserViolations(req.params.userId);

    res.json(violations);
  } catch (error) {
    console.error("[SoD] Error fetching user violations:", error);
    res.status(500).json({ error: "Failed to fetch user violations" });
  }
});

/**
 * @swagger
 * /api/sod/violations/{id}/remediate:
 *   post:
 *     tags: [SoD]
 *     summary: Remediate a violation
 *     description: Remediate an SoD violation by revoking one of the conflicting accesses
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD violation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - revokeAppId
 *             properties:
 *               revokeAppId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the application to revoke access from
 *               notes:
 *                 type: string
 *                 description: Remediation notes
 *     responses:
 *       200:
 *         description: Violation remediated successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/violations/:id/remediate", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { revokeAppId, notes } = req.body;

    const service = new SodService(tenantId);
    await service.remediateViolation(req.params.id, revokeAppId, userId, notes);

    res.json({ message: "Violation remediated successfully" });
  } catch (error) {
    console.error("[SoD] Error remediating violation:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to remediate violation"
    });
  }
});

/**
 * @swagger
 * /api/sod/violations/{id}/accept:
 *   post:
 *     tags: [SoD]
 *     summary: Accept a violation with justification
 *     description: Mark an SoD violation as exempted/accepted with a business justification
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: SoD violation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - justification
 *             properties:
 *               justification:
 *                 type: string
 *                 description: Business justification for accepting the violation
 *     responses:
 *       200:
 *         description: Violation accepted successfully
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/violations/:id/accept", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { justification } = req.body;

    const service = new SodService(tenantId);
    await service.acceptViolation(req.params.id, userId, justification);

    res.json({ message: "Violation accepted successfully" });
  } catch (error) {
    console.error("[SoD] Error accepting violation:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to accept violation"
    });
  }
});

// ============================================================================
// SoD Checks & Scanning
// ============================================================================

/**
 * @swagger
 * /api/sod/check:
 *   post:
 *     tags: [SoD]
 *     summary: Check for SoD violations
 *     description: Check if granting access to a user for a specific application would violate any SoD rules
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - appId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: User ID to check
 *               appId:
 *                 type: string
 *                 format: uuid
 *                 description: Application ID to check
 *     responses:
 *       200:
 *         description: SoD check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 violations:
 *                   type: array
 *                   items:
 *                     type: object
 *                 hasViolations:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/check", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, appId } = req.body;

    const service = new SodService(tenantId);
    const violations = await service.checkViolation(userId, appId);

    res.json({ violations, hasViolations: violations.length > 0 });
  } catch (error) {
    console.error("[SoD] Error checking violations:", error);
    res.status(500).json({ error: "Failed to check SoD violations" });
  }
});

/**
 * @swagger
 * /api/sod/scan:
 *   post:
 *     tags: [SoD]
 *     summary: Scan for SoD violations
 *     description: Scan all users (or for a specific rule) to detect SoD violations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ruleId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional specific rule ID to scan for (scans all rules if omitted)
 *     responses:
 *       200:
 *         description: Scan completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 violationsFound:
 *                   type: integer
 *                 scannedRules:
 *                   type: integer
 *                 scannedUsers:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.post("/scan", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { ruleId } = req.body;

    const service = new SodService(tenantId);
    const result = await service.scanForViolations(ruleId);

    res.json(result);
  } catch (error) {
    console.error("[SoD] Error scanning for violations:", error);
    res.status(500).json({ error: "Failed to scan for violations" });
  }
});

/**
 * @swagger
 * /api/sod/compliance-report:
 *   get:
 *     tags: [SoD]
 *     summary: Get compliance report
 *     description: Generate a comprehensive SoD compliance report with optional framework filtering
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: framework
 *         schema:
 *           type: string
 *           enum: [SOX, GDPR, HIPAA, PCI-DSS, Custom]
 *         description: Filter by specific compliance framework
 *     responses:
 *       200:
 *         description: Compliance report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 framework:
 *                   type: string
 *                 totalRules:
 *                   type: integer
 *                 activeRules:
 *                   type: integer
 *                 totalViolations:
 *                   type: integer
 *                 openViolations:
 *                   type: integer
 *                 remediatedViolations:
 *                   type: integer
 *                 exemptedViolations:
 *                   type: integer
 *                 violationsBySeverity:
 *                   type: object
 *                 complianceScore:
 *                   type: number
 *                 generatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Server error
 */
router.get("/compliance-report", async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { framework } = req.query;

    const service = new SodService(tenantId);
    const report = await service.getComplianceReport(framework as string);

    res.json(report);
  } catch (error) {
    console.error("[SoD] Error generating compliance report:", error);
    res.status(500).json({ error: "Failed to generate compliance report" });
  }
});

export default router;
