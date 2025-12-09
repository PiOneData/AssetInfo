import { Router, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import * as s from "@shared/schema";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { checkPermission } from "../services/auth";
import { syncOpenAuditFirstPage } from "../services/openauditSync";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  insertAssetSchema,
  AssetTypeEnum,
  type Asset
} from "@shared/schema";

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

// Helper function to sanitize CSV values (prevent formula injection)
const sanitizeCsvValue = (value: string): string => {
  if (!value) return value;
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
};

/**
 * @swagger
 * /api/assets:
 *   get:
 *     summary: Get all assets with optional filters
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assets retrieved successfully
 */
router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { type, status, category, search } = req.query;
    const filters: any = {};

    // Validate and normalize type parameter
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

/**
 * @swagger
 * /api/assets/user/{userId}:
 *   get:
 *     summary: Get assets assigned to a specific user
 *     tags: [Assets]
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
 *         description: User assets retrieved successfully
 */
router.get("/user/:userId", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/assets/report:
 *   get:
 *     summary: Generate asset report with selected fields
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fields
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report generated successfully
 */
router.get("/report", authenticateToken, async (req: Request, res: Response) => {
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
    const allowedFields: Record<string, any> = {
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

    if (!Array.isArray(assets)) {
      return res.status(500).json({ message: "Failed to retrieve asset data" });
    }

    // Filter assets by type if specified
    let filteredAssets = assets;
    if (type && type !== 'all') {
      filteredAssets = assets.filter(asset => asset.type === type);
    }

    if (filteredAssets.length === 0) {
      return res.json([]);
    }

    // Helper function to sanitize and format values for Excel
    const sanitizeExcelValue = (value: any, fieldType?: string): string => {
      if (value === null || value === undefined) return '';

      // Format dates properly
      if (fieldType === 'date' && value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      if (fieldType === 'date' && typeof value === 'string' && value.includes('T')) {
        return value.split('T')[0];
      }

      // Format currency values
      if (fieldType === 'currency' && (typeof value === 'number' || !isNaN(parseFloat(value)))) {
        return `$${parseFloat(value).toFixed(2)}`;
      }

      const stringValue = String(value);

      // Prevent formula injection
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

/**
 * @swagger
 * /api/assets/{id}:
 *   get:
 *     summary: Get specific asset by ID
 *     tags: [Assets]
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
 *         description: Asset retrieved successfully
 */
router.get("/:id", authenticateToken, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/assets:
 *   post:
 *     summary: Create new asset (Manager only)
 *     tags: [Assets]
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
 *         description: Asset created successfully
 */
router.post("/", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/assets/{id}:
 *   put:
 *     summary: Update asset (Manager only)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: Asset updated successfully
 */
router.put("/:id", authenticateToken, requireRole("manager"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/assets/{id}:
 *   delete:
 *     summary: Delete asset (Admin only)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Asset deleted successfully
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/assets/bulk/template:
 *   get:
 *     summary: Download CSV template for bulk asset import (Manager only)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template downloaded successfully
 */
router.get("/bulk/template", authenticateToken, requireRole("manager"), (req: Request, res: Response) => {
  const headers = [
    'name', 'type', 'status', 'category', 'manufacturer', 'model', 'serial_number',
    'location', 'assigned_user_email', 'assigned_user_name', 'purchase_date',
    'purchase_cost', 'warranty_expiry', 'specifications', 'notes', 'software_name',
    'version', 'license_type', 'license_key', 'used_licenses', 'renewal_date',
    'vendor_name', 'vendor_email', 'vendor_phone', 'company_name', 'company_gst_number'
  ];

  const sampleData = [
    ['MacBook Pro 16"', 'hardware', 'deployed', 'laptop', 'Apple', 'MacBook Pro', 'A1234567890', 'Office Floor 2', 'john.doe@techcorp.com', 'John Doe', '2024-01-15', '2499.00', '2027-01-15', '{"ram":"16GB","storage":"512GB SSD"}', 'Development laptop', '', '', '', '', '', '', 'Apple Inc', 'sales@apple.com', '+1-800-275-2273', 'Apple Inc', ''],
    ['Dell OptiPlex 7090', 'hardware', 'in-stock', 'desktop', 'Dell', 'OptiPlex 7090', 'D9876543210', 'Storage Room A', '', '', '2024-02-01', '899.00', '2027-02-01', '{"ram":"8GB","storage":"256GB SSD"}', 'Desktop computer', '', '', '', '', '', '', 'Dell Technologies', 'support@dell.com', '+1-800-624-9896', 'Dell Inc', ''],
    ['Microsoft Office 365', 'software', 'deployed', 'productivity', 'Microsoft', 'Office 365', '', 'Cloud', '', '', '2024-02-01', '150.00', '2025-02-01', '{"edition":"Business Premium"}', 'Productivity suite', 'Microsoft Office 365', '2024', 'subscription', 'XXXXX-XXXXX', '50', '2025-02-01', 'Microsoft', 'support@microsoft.com', '+1-800-642-7676', 'Microsoft Corporation', '']
  ];

  const sanitizedData = sampleData.map(row => row.map(cell => sanitizeCsvValue(cell)));
  const csvContent = stringify([headers, ...sanitizedData]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="asset_template_with_samples.csv"');
  res.send(csvContent);
});

/**
 * @swagger
 * /api/assets/bulk/upload:
 *   post:
 *     summary: Bulk upload assets from CSV (Manager only)
 *     tags: [Assets]
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
 *         description: Assets imported successfully
 */
router.post("/bulk/upload", authenticateToken, requireRole("manager"), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const validateOnly = req.query.validateOnly === 'true';
    const mode = (req.query.mode as string) || 'partial';

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
    let rowNumber = 1;

    for (const record of records) {
      rowNumber++;
      const errors: string[] = [];
      const warnings: string[] = [];

      try {
        // Basic validation
        if (!record.name?.trim()) errors.push("Name is required");
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

        // Build asset object if no errors
        if (errors.length === 0) {
          const assetData: any = {
            name: record.name.trim(),
            type: record.type.trim().toLowerCase(),
            status: record.status.trim().toLowerCase(),
            tenantId: req.user!.tenantId,
            createdBy: req.user!.userId
          };

          // Add optional fields
          const fieldMapping: Record<string, string> = {
            'serial_number': 'serialNumber',
            'assigned_user_name': 'assignedUserName',
            'software_name': 'softwareName',
            'license_type': 'licenseType',
            'license_key': 'licenseKey',
            'vendor_name': 'vendorName',
            'vendor_email': 'vendorEmail',
            'vendor_phone': 'vendorPhone',
            'company_name': 'companyName',
            'company_gst_number': 'companyGstNumber'
          };

          for (const [csvField, assetField] of Object.entries(fieldMapping)) {
            if (record[csvField] && record[csvField].trim()) {
              assetData[assetField] = record[csvField].trim();
            }
          }

          // Handle simple fields
          ['category', 'manufacturer', 'model', 'location', 'notes', 'version'].forEach(field => {
            if (record[field] && record[field].trim()) {
              assetData[field] = record[field].trim();
            }
          });

          // Handle dates
          if (record.purchase_date?.trim()) assetData.purchaseDate = new Date(record.purchase_date);
          if (record.warranty_expiry?.trim()) assetData.warrantyExpiry = new Date(record.warranty_expiry);
          if (record.renewal_date?.trim()) assetData.renewalDate = new Date(record.renewal_date);

          // Handle numbers
          if (record.purchase_cost?.trim()) assetData.purchaseCost = record.purchase_cost.trim();
          if (record.used_licenses?.trim()) assetData.usedLicenses = parseInt(record.used_licenses);

          // Handle JSON specifications
          if (record.specifications?.trim()) {
            try {
              assetData.specifications = JSON.parse(record.specifications);
            } catch (e) {
              warnings.push("Invalid JSON in specifications field, treating as text");
              assetData.specifications = { note: record.specifications.trim() };
            }
          }

          try {
            const validatedAsset = insertAssetSchema.parse(assetData);
            validAssets.push(validatedAsset);
            results.push({ rowNumber, status: 'valid', errors: [], warnings });
          } catch (schemaError) {
            errors.push(schemaError instanceof Error ? `Schema validation failed: ${schemaError.message}` : "Schema validation failed");
            results.push({ rowNumber, status: 'invalid', errors, warnings });
          }
        } else {
          results.push({ rowNumber, status: 'invalid', errors, warnings });
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

    if (validateOnly) {
      return res.json({ summary, rows: results });
    }

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

        await storage.logActivity({
          action: "bulk_asset_import",
          resourceType: "asset",
          resourceId: null,
          description: `Imported ${summary.inserted} assets from CSV upload`,
          userId: req.user!.userId,
          userEmail: req.user!.email,
          userRole: req.user!.role,
          tenantId: req.user!.tenantId
        }).catch(err => console.error("Audit logging failed:", err));

        res.status(200).json({
          summary,
          rows: results,
          message: `Successfully imported ${summary.inserted} assets`
        });
      } catch (error) {
        console.error("Bulk import error:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Failed to import assets",
          summary,
          rows: results
        });
      }
    } else {
      res.json({ summary, rows: results, message: "No valid assets to import" });
    }
  } catch (error) {
    console.error("Bulk upload error:", error);
    res.status(500).json({ message: "Failed to process file" });
  }
});

/**
 * @swagger
 * /api/assets/openaudit/sync:
 *   post:
 *     summary: Sync assets from Open-AudIT
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Sync completed successfully
 */
router.post("/openaudit/sync", authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const limit = req.body?.limit ? Number(req.body.limit) : 50;

    const { imported, total } = await syncOpenAuditFirstPage(tenantId, limit);
    res.json({ ok: true, imported, total });
  } catch (err) {
    console.error("Open-AudIT sync error:", err);
    res.status(500).json({ message: "Failed to sync from Open-AudIT" });
  }
});

/**
 * @swagger
 * /api/assets/{assetId}/software:
 *   get:
 *     summary: Get software discovered for a device
 *     tags: [Assets]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Software list retrieved successfully
 */
router.get("/:assetId/software", authenticateToken, async (req, res) => {
  try {
    const assetId = String(req.params.assetId);

    const [row] = await db
      .select()
      .from(s.assets)
      .where(and(eq(s.assets.id, assetId), eq(s.assets.tenantId, req.user!.tenantId)))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "Asset not found" });
    }

    const specs: any = (row as any)?.specifications ?? {};
    const oaId = specs?.openaudit?.id ?? specs?.openaudit_id ?? specs?.oaId ?? null;

    if (!oaId) {
      return res.status(400).json({
        error: "Asset has no Open-AudIT id",
        details: "Expected specifications.openaudit.id to be set"
      });
    }

    // Note: oaFetchDeviceSoftware should be imported if available
    // For now, return placeholder
    return res.json({ items: [] });
  } catch (e: any) {
    console.error("[/api/assets/:assetId/software] failed:", e?.message ?? e);
    return res.status(500).json({
      error: "Failed to fetch software",
      details: e?.message ?? String(e)
    });
  }
});

/**
 * @swagger
 * /api/assets/tni/bulk:
 *   post:
 *     summary: Bulk ingest assets from TNI
 *     tags: [Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Assets ingested successfully
 */
router.post("/tni/bulk", authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { assets } = req.body as { assets: any[] };
    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ message: "assets[] required" });
    }

    // Use authenticated user's tenant ID - ignore any header or body tenant ID
    const tenantId = req.user!.tenantId;
    let count = 0;

    for (const a of assets) {
      const row = {
        tenantId: tenantId,
        name: a.name ?? a.hostname ?? "Unknown",
        type: a.type ?? "Hardware",
        category: a.category ?? null,
        manufacturer: a.manufacturer ?? null,
        model: a.model ?? null,
        serialNumber: a.serialNumber ?? null,
        status: a.status ?? "in-stock",
        specifications: (a.specifications ?? {}) as any,
        notes: a.notes ?? "Imported from TNI",
        updatedAt: new Date(),
      };

      // Upsert logic
      if (row.serialNumber) {
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

/**
 * @swagger
 * /api/assets/location/{locationId}:
 *   get:
 *     summary: Get asset summary for a location
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset counts by category for the location
 */
router.get("/location/:locationId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const locationId = req.params.locationId;
    const tenantId = req.user!.tenantId;

    // Get all assets for tenant with the specified location
    const assets = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.tenantId, tenantId),
        eq(s.assets.location, locationId)
      ));

    // Count by category
    const counts: Record<string, number> = {};
    assets.forEach(asset => {
      const category = asset.category || 'Uncategorized';
      counts[category] = (counts[category] || 0) + 1;
    });

    return res.json(counts);
  } catch (error: any) {
    console.error("Error fetching location summary:", error);
    return res.status(500).json({
      message: "Failed to fetch location summary",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/assets/location/{locationId}/all:
 *   get:
 *     summary: Get all assets for a location
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all assets in the location
 */
router.get("/location/:locationId/all", authenticateToken, async (req: Request, res: Response) => {
  try {
    const locationId = req.params.locationId;
    const tenantId = req.user!.tenantId;

    // Get all assets for tenant with the specified location
    const assets = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.tenantId, tenantId),
        eq(s.assets.location, locationId)
      ));

    return res.json({ assets });
  } catch (error: any) {
    console.error("Error fetching location assets:", error);
    return res.status(500).json({
      message: "Failed to fetch location assets",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/assets/{assetId}/software-links:
 *   post:
 *     summary: Link software to a device
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               softwareAssetId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Software linked successfully
 */
router.post("/:assetId/software-links", authenticateToken, async (req: Request, res: Response) => {
  try {
    const assetId = req.params.assetId;
    const { softwareAssetId } = req.body;
    const tenantId = req.user!.tenantId;

    if (!softwareAssetId) {
      return res.status(400).json({ message: "softwareAssetId is required" });
    }

    // Verify both assets exist and belong to the tenant
    const [device] = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.id, assetId),
        eq(s.assets.tenantId, tenantId)
      ))
      .limit(1);

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    const [software] = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.id, softwareAssetId),
        eq(s.assets.tenantId, tenantId),
        eq(s.assets.type, "Software")
      ))
      .limit(1);

    if (!software) {
      return res.status(404).json({ message: "Software asset not found" });
    }

    // Check if link already exists
    const [existing] = await db.select()
      .from(s.assetSoftwareLinks)
      .where(and(
        eq(s.assetSoftwareLinks.assetId, assetId),
        eq(s.assetSoftwareLinks.softwareAssetId, softwareAssetId)
      ))
      .limit(1);

    if (existing) {
      return res.status(409).json({ message: "Software already linked to this device" });
    }

    // Create the link
    const [link] = await db.insert(s.assetSoftwareLinks)
      .values({
        assetId,
        softwareAssetId,
        linkedAt: new Date(),
      })
      .returning();

    return res.status(201).json(link);
  } catch (error: any) {
    console.error("Error linking software to device:", error);
    return res.status(500).json({
      message: "Failed to link software to device",
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/assets/{assetId}/software-links/{softwareAssetId}:
 *   delete:
 *     summary: Unlink software from a device
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: softwareAssetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Software unlinked successfully
 */
router.delete("/:assetId/software-links/:softwareAssetId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const assetId = req.params.assetId;
    const softwareAssetId = req.params.softwareAssetId;
    const tenantId = req.user!.tenantId;

    // Verify device belongs to tenant
    const [device] = await db.select()
      .from(s.assets)
      .where(and(
        eq(s.assets.id, assetId),
        eq(s.assets.tenantId, tenantId)
      ))
      .limit(1);

    if (!device) {
      return res.status(404).json({ message: "Device not found" });
    }

    // Delete the link
    const deleted = await db.delete(s.assetSoftwareLinks)
      .where(and(
        eq(s.assetSoftwareLinks.assetId, assetId),
        eq(s.assetSoftwareLinks.softwareAssetId, softwareAssetId)
      ))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ message: "Software link not found" });
    }

    return res.json({ message: "Software unlinked successfully" });
  } catch (error: any) {
    console.error("Error unlinking software from device:", error);
    return res.status(500).json({
      message: "Failed to unlink software from device",
      error: error.message
    });
  }
});

export default router;
