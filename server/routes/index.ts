import { Express } from "express";
import { createServer, type Server } from "http";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "../swagger.config";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import ticketsRoutes from "./tickets.routes";
import assetsRoutes from "./assets.routes";
import vendorsRoutes from "./vendors.routes";
import licensesRoutes from "./licenses.routes";
import dashboardRoutes from "./dashboard.routes";
import searchRoutes from "./search.routes";
import notificationsRoutes from "./notifications.routes";
import recommendationsRoutes from "./recommendations.routes";
import aiRoutes from "./ai.routes";
import orgRoutes from "./org.routes";
import masterRoutes from "./master.routes";
import syncRoutes from "./sync.routes";
import auditLogsRoutes from "./audit-logs.routes";
import geographicRoutes from "./geographic.routes";
import webhookRoutes from "./webhook.routes";
import agentRoutes from "./agent.routes";
import enrollmentRoutes from "./enrollment.routes";
import softwareRoutes from "./software.routes";
import debugRoutes from "./debug.routes";
// SaaS Governance routes (Phase 0)
import saasAppsRoutes from "./saas-apps.routes";
import saasContractsRoutes from "./saas-contracts.routes";
import identityProvidersRoutes from "./identity-providers.routes";
import governancePoliciesRoutes from "./governance-policies.routes";
// Phase 1: Discovery & Shadow IT
import discoveryRoutes from "./discovery.routes";
// Phase 2: Spend Management & License Intelligence
import spendRoutes from "./spend.routes";
// Phase 3: Offboarding Automation
import offboardingRoutes from "./offboarding.routes";
// All routes have been migrated from routes.legacy.ts

/**
 * Register all application routes
 * This function sets up all modular routes and applies appropriate middleware
 */
export async function registerAllRoutes(app: Express): Promise<Server> {
  // API Documentation (Swagger UI)
  if (process.env.NODE_ENV !== "production") {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: "AssetVault API Documentation",
    }));
    app.get("/api-docs.json", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.send(swaggerSpec);
    });
  }

  // Health check endpoint (no auth required)
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  // ========================================
  // MODULAR ROUTES (Fully Migrated)
  // ========================================
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);           // 19 routes - User management
  app.use("/api/tickets", ticketsRoutes);       // 12 routes - Service desk
  app.use("/api/assets", assetsRoutes);         // 12 routes - Asset management
  app.use("/api/vendors", vendorsRoutes);       // 4 routes - Vendor management
  app.use("/api/licenses", licensesRoutes);     // 2 routes - License tracking
  app.use("/api/dashboard", dashboardRoutes);   // 1 route - Dashboard metrics
  app.use("/api/search", searchRoutes);         // 1 route - Global search
  app.use("/api/notifications", notificationsRoutes); // 1 route - Notifications
  app.use("/api/recommendations", recommendationsRoutes); // 3 routes - AI recommendations
  app.use("/api/ai", aiRoutes);                 // 2 routes - AI queries
  app.use("/api/org", orgRoutes);               // 2 routes - Organization settings
  app.use("/api/master", masterRoutes);         // 3 routes - Master data
  app.use("/api/sync", syncRoutes);             // 1 route - Sync status
  app.use("/api/audit-logs", auditLogsRoutes);  // 2 routes - Audit logs
  app.use("/api/geographic", geographicRoutes); // 4 routes - Geographic data
  app.use("/api/webhook", webhookRoutes);       // 1 route - Email to ticket webhook
  app.use("/api/agent", agentRoutes);           // 1 route - Agent enrollment
  app.use("/api/software", softwareRoutes);     // 2 routes - Software management
  app.use("/api/debug", debugRoutes);           // 1 route - Debug endpoints

  // ========================================
  // SAAS GOVERNANCE ROUTES (Phase 0 & Phase 1 & Phase 2 & Phase 3)
  // ========================================
  app.use("/api/saas-apps", saasAppsRoutes);           // 8 routes - SaaS app management
  app.use("/api/saas-contracts", saasContractsRoutes); // 7 routes - Contract management
  app.use("/api/identity-providers", identityProvidersRoutes); // 7 routes - IdP configuration
  app.use("/api/governance-policies", governancePoliciesRoutes); // 6 routes - Policy automation
  app.use("/api/discovery", discoveryRoutes);          // 6 routes - Discovery dashboard (Phase 1)
  app.use("/api/spend", spendRoutes);                  // 7 routes - Spend management (Phase 2)
  app.use("/api/offboarding", offboardingRoutes);      // 12 routes - Offboarding automation (Phase 3)

  // SPECIAL ROUTES (Non-API)
  app.use("/enroll", enrollmentRoutes);         // 2 routes - Device enrollment pages

  // ========================================
  // ALL ROUTES MIGRATED ✅
  // All routes from routes.legacy.ts have been successfully migrated
  // ========================================

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
