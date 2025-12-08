import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../middleware/auth.middleware";
import { auditLogger, AuditActions, ResourceTypes } from "../audit-logger";
import { insertIdentityProviderSchema } from "@shared/schema";
import { encrypt, decrypt } from "../services/encryption";
import { idpSyncScheduler } from "../services/idp/sync-scheduler";
import { AzureADConnector } from "../services/idp/azuread-connector";
import { GoogleWorkspaceConnector } from "../services/idp/google-connector";
import { z } from "zod";

const router = Router();

/**
 * @swagger
 * /api/identity-providers:
 *   get:
 *     summary: Get all identity providers
 *     tags: [Identity Providers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Identity providers retrieved successfully
 */
router.get("/", authenticateToken, requireRole("it-manager"), async (req: Request, res: Response) => {
  try {
    const providers = await storage.getIdentityProviders(req.user!.tenantId);

    // Decrypt client secrets for response (or redact them)
    const sanitizedProviders = providers.map(provider => ({
      ...provider,
      clientSecret: provider.clientSecret ? '********' : null // Redact secrets in list view
    }));

    res.json(sanitizedProviders);
  } catch (error) {
    console.error('Failed to fetch identity providers:', error);
    res.status(500).json({ message: "Failed to fetch identity providers" });
  }
});

/**
 * @swagger
 * /api/identity-providers/{id}:
 *   get:
 *     summary: Get a single identity provider
 *     tags: [Identity Providers]
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
 *         description: Identity provider retrieved successfully
 *       404:
 *         description: Identity provider not found
 */
router.get("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const provider = await storage.getIdentityProvider(req.params.id, req.user!.tenantId);

    if (!provider) {
      return res.status(404).json({ message: "Identity provider not found" });
    }

    // Decrypt client secret for editing (admin only)
    const providerWithSecret = {
      ...provider,
      clientSecret: provider.clientSecret ? decrypt(provider.clientSecret) : null
    };

    res.json(providerWithSecret);
  } catch (error) {
    console.error('Failed to fetch identity provider:', error);
    res.status(500).json({ message: "Failed to fetch identity provider" });
  }
});

/**
 * @swagger
 * /api/identity-providers:
 *   post:
 *     summary: Create a new identity provider
 *     tags: [Identity Providers]
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
 *         description: Identity provider created successfully
 */
router.post("/", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const providerData = insertIdentityProviderSchema.parse({
      ...req.body,
      tenantId: req.user!.tenantId,
    });

    // Encrypt client secret before storing
    if (providerData.clientSecret) {
      providerData.clientSecret = encrypt(providerData.clientSecret);
    }

    const provider = await storage.createIdentityProvider(providerData);

    // Audit log (without client secret)
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.CREATE,
        resourceType: ResourceTypes.IDENTITY_PROVIDER,
        resourceId: provider.id,
        description: `Created identity provider: ${provider.name} (${provider.type})`,
        afterState: auditLogger.sanitizeForLogging({ ...provider, clientSecret: '********' })
      },
      req
    );

    // Return with redacted secret
    res.status(201).json({
      ...provider,
      clientSecret: provider.clientSecret ? '********' : null
    });
  } catch (error) {
    console.error('Failed to create identity provider:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to create identity provider" });
  }
});

/**
 * @swagger
 * /api/identity-providers/{id}:
 *   put:
 *     summary: Update an identity provider
 *     tags: [Identity Providers]
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
 *         description: Identity provider updated successfully
 *       404:
 *         description: Identity provider not found
 */
router.put("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const originalProvider = await storage.getIdentityProvider(req.params.id, req.user!.tenantId);

    const providerData = insertIdentityProviderSchema.partial().parse(req.body);

    // Encrypt client secret if provided and not already encrypted
    if (providerData.clientSecret && !providerData.clientSecret.includes(':')) {
      // If it doesn't contain ':', it's not encrypted yet
      providerData.clientSecret = encrypt(providerData.clientSecret);
    }

    const provider = await storage.updateIdentityProvider(req.params.id, req.user!.tenantId, providerData);

    if (!provider) {
      return res.status(404).json({ message: "Identity provider not found" });
    }

    // Audit log (without secrets)
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.IDENTITY_PROVIDER,
        resourceId: provider.id,
        description: `Updated identity provider: ${provider.name}`,
        beforeState: originalProvider ? { ...originalProvider, clientSecret: '********' } : undefined,
        afterState: { ...provider, clientSecret: '********' }
      },
      req
    );

    // Return with redacted secret
    res.json({
      ...provider,
      clientSecret: provider.clientSecret ? '********' : null
    });
  } catch (error) {
    console.error('Failed to update identity provider:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.errors
      });
    }

    res.status(500).json({ message: "Failed to update identity provider" });
  }
});

/**
 * @swagger
 * /api/identity-providers/{id}/test:
 *   post:
 *     summary: Test identity provider connection
 *     tags: [Identity Providers]
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
 *         description: Connection test completed
 */
router.post("/:id/test", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const provider = await storage.getIdentityProvider(req.params.id, req.user!.tenantId);

    if (!provider) {
      return res.status(404).json({ message: "Identity provider not found" });
    }

    // Create connector and test connection
    const decryptedSecret = decrypt(provider.clientSecret);
    const config = {
      clientId: provider.clientId,
      clientSecret: decryptedSecret,
      tenantDomain: provider.tenantDomain || undefined,
      scopes: provider.scopes || [],
      customConfig: provider.config || {}
    };

    let connector;
    if (provider.type === 'azuread') {
      connector = new AzureADConnector(config, req.user!.tenantId, provider.id);
    } else if (provider.type === 'google') {
      connector = new GoogleWorkspaceConnector(config, req.user!.tenantId, provider.id);
    } else {
      return res.status(400).json({ message: `Unsupported provider type: ${provider.type}` });
    }

    const testResult = await connector.testConnection();

    res.json({
      success: testResult.success,
      message: testResult.success ? 'Connection successful' : testResult.error,
      provider: provider.type
    });
  } catch (error) {
    console.error('Failed to test identity provider:', error);
    res.status(500).json({ message: "Failed to test connection", error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * @swagger
 * /api/identity-providers/{id}/sync:
 *   post:
 *     summary: Trigger manual sync for identity provider
 *     tags: [Identity Providers]
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
 *         description: Sync triggered successfully
 */
router.post("/:id/sync", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const provider = await storage.getIdentityProvider(req.params.id, req.user!.tenantId);

    if (!provider) {
      return res.status(404).json({ message: "Identity provider not found" });
    }

    // Audit log
    await auditLogger.logActivity(
      auditLogger.createUserContext(req),
      {
        action: AuditActions.SYNC,
        resourceType: ResourceTypes.IDENTITY_PROVIDER,
        resourceId: provider.id,
        description: `Triggered sync for identity provider: ${provider.name}`
      },
      req
    );

    // Trigger sync asynchronously (don't wait for completion)
    idpSyncScheduler.triggerImmediateSync(req.user!.tenantId, provider.id).catch(error => {
      console.error('Sync error:', error);
    });

    res.json({
      success: true,
      message: "Sync triggered successfully",
      provider: provider.name
    });
  } catch (error) {
    console.error('Failed to trigger sync:', error);
    res.status(500).json({ message: "Failed to trigger sync" });
  }
});

/**
 * @swagger
 * /api/identity-providers/{id}:
 *   delete:
 *     summary: Delete an identity provider
 *     tags: [Identity Providers]
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
 *         description: Identity provider deleted successfully
 *       404:
 *         description: Identity provider not found
 */
router.delete("/:id", authenticateToken, requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const provider = await storage.getIdentityProvider(req.params.id, req.user!.tenantId);
    const success = await storage.deleteIdentityProvider(req.params.id, req.user!.tenantId);

    if (!success) {
      return res.status(404).json({ message: "Identity provider not found" });
    }

    // Audit log (without secret)
    if (provider) {
      await auditLogger.logActivity(
        auditLogger.createUserContext(req),
        {
          action: AuditActions.DELETE,
          resourceType: ResourceTypes.IDENTITY_PROVIDER,
          resourceId: req.params.id,
          description: `Deleted identity provider: ${provider.name}`,
          beforeState: { ...provider, clientSecret: '********' }
        },
        req
      );
    }

    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete identity provider:', error);
    res.status(500).json({ message: "Failed to delete identity provider" });
  }
});

export default router;
