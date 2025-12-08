import { Express } from "express";
import { createServer, type Server } from "http";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "../swagger.config";
import authRoutes from "./auth.routes";
// Import other route modules as they are created
// import assetsRoutes from "./assets.routes";
// import usersRoutes from "./users.routes";
// import ticketsRoutes from "./tickets.routes";
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

  // Register modular routes
  app.use("/api/auth", authRoutes);

  // TODO: Uncomment as route modules are created
  // app.use("/api/assets", assetsRoutes);
  // app.use("/api/users", usersRoutes);
  // app.use("/api/tickets", ticketsRoutes);
  // app.use("/api/vendors", vendorsRoutes);
  // app.use("/api/licenses", licensesRoutes);
  // app.use("/api/recommendations", recommendationsRoutes);
  // app.use("/api/ai", aiRoutes);
  // app.use("/api/compliance", complianceRoutes);
  // app.use("/api/discovery", discoveryRoutes);
  // app.use("/api/reports", reportsRoutes);
  // app.use("/api/geographic", geographicRoutes);
  // app.use("/api/search", searchRoutes);
  // app.use("/api/notifications", notificationsRoutes);
  // app.use("/api/dashboard", dashboardRoutes);
  // app.use("/api/audit-logs", auditLogsRoutes);
  // app.use("/api/org", orgRoutes);
  // app.use("/api/webhook", webhookRoutes);

  // Register legacy routes (temporary - will be removed as routes are migrated)
  const server = await registerLegacyRoutes(app);

  return server;
}
