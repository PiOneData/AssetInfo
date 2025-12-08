import { Express } from "express";
import { createServer, type Server } from "http";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "../swagger.config";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import ticketsRoutes from "./tickets.routes";
// Import other route modules as they are created
// import assetsRoutes from "./assets.routes";
// import vendorsRoutes from "./vendors.routes";
// ... etc

// Import legacy routes temporarily
import { registerRoutes as registerLegacyRoutes } from "../routes.legacy";

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

  // ========================================
  // TODO: MIGRATE THESE ROUTES
  // Priority order based on usage frequency
  // See /MIGRATION_GUIDE.md for instructions
  // ========================================

  // HIGH PRIORITY (Most Used)
  // app.use("/api/assets", assetsRoutes);         // 13 routes - Asset management

  // MEDIUM PRIORITY
  // app.use("/api/vendors", vendorsRoutes);       // 4 routes - Vendor management
  // app.use("/api/licenses", licensesRoutes);     // 2 routes - License tracking
  // app.use("/api/geographic", geographicRoutes); // 4 routes - Location data
  // app.use("/api/recommendations", recommendationsRoutes); // 3 routes - AI recommendations

  // LOW PRIORITY (Can migrate later)
  // app.use("/api/ai", aiRoutes);                 // 2 routes - AI queries
  // app.use("/api/dashboard", dashboardRoutes);   // 1 route - Dashboard metrics
  // app.use("/api/search", searchRoutes);         // 1 route - Global search
  // app.use("/api/notifications", notificationsRoutes); // 1 route - Notifications
  // app.use("/api/audit-logs", auditLogsRoutes);  // 2 routes - Audit logs
  // app.use("/api/org", orgRoutes);               // 2 routes - Organization settings
  // app.use("/api/master", masterRoutes);         // 3 routes - Master data
  // app.use("/api/software", softwareRoutes);     // 2 routes - Software management
  // app.use("/api/sync", syncRoutes);             // 2 routes - Sync status
  // app.use("/api/webhook", webhookRoutes);       // 1 route - Webhooks
  // app.use("/api/agent", agentRoutes);           // 1 route - Agent enrollment
  // app.use("/api/debug", debugRoutes);           // 1 route - Debug endpoints

  // SPECIAL ROUTES (Non-API)
  // app.use("/enroll", enrollmentRoutes);         // 2 routes - Device enrollment pages

  // ========================================
  // LEGACY ROUTES (Temporary)
  // All routes not yet migrated live here
  // This file will be deleted once all routes
  // are extracted into modular files above
  // ========================================
  const server = await registerLegacyRoutes(app);

  return server;
}
