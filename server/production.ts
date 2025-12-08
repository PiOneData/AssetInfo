import "dotenv/config";
import path from "node:path";
import { startOpenAuditScheduler } from "./services/openauditScheduler";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./vite";
import { seedDatabase } from "./storage";
import {
  corsMiddleware,
  helmetMiddleware,
  apiLimiter,
  compressionMiddleware,
  securityHeaders,
  protectDevRoutes,
} from "./middleware/security.middleware";

const app = express();

// Security middleware (must be first)
app.use(corsMiddleware);
app.use(helmetMiddleware);
app.use(securityHeaders);
app.use(protectDevRoutes);
app.use(compressionMiddleware);

// Body parsers
app.use(express.json({ limit: "10mb" })); // Limit payload size
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// API rate limiting
app.use("/api", apiLimiter);

// Serve static assets from ./static (e.g., /static/installers/itam-agent-*.{msi,pkg})
app.use(
  "/static",
  express.static(path.resolve(process.cwd(), "static"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

// Request/response logging (API only), with basic redaction
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // SECURITY: Never log sensitive endpoints or their responses
      if (capturedJsonResponse && !path.includes("/auth/")) {
        const safeResponse = { ...capturedJsonResponse };
        delete (safeResponse as any).token;
        delete (safeResponse as any).password;

        if (Object.keys(safeResponse).length > 0) {
          try {
            logLine += ` :: ${JSON.stringify(safeResponse)}`;
          } catch {
            // ignore JSON stringify errors
          }
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await seedDatabase();
  } catch (error) {
    console.warn("Warning: Failed to seed database. Database may not be available.");
    console.warn("The application will continue to run but may have limited functionality.");
    console.warn("Error details:", error instanceof Error ? error.message : String(error));
  }

  const server = await registerRoutes(app);

  // Global error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    log(`Error ${status}: ${message}`);
    console.error(err);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // Serve static files in production
  serveStatic(app);

  const port = parseInt(process.env.PORT ?? "5050", 10);
  const host = process.env.HOST ?? "0.0.0.0"; // bind to all interfaces so the VM can reach it

  server.listen(port, host, () => {
    log(`Production server running on http://${host}:${port}`);
    startOpenAuditScheduler(); // Start the Open-AudIT sync scheduler
  });
})();
