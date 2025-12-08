import "dotenv/config";
import path from "node:path";
import { startOpenAuditScheduler } from "./services/openauditScheduler";
import express, { type Request, Response, NextFunction } from "express";
import { registerAllRoutes } from "./routes";
import { log } from "./vite";
import { seedDatabase } from "./storage";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static assets from ./static
app.use(
  "/static",
  express.static(path.resolve(process.cwd(), "static"), {
    fallthrough: true,
    maxAge: "1h",
  })
);

// Request/response logging (API only)
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

  const server = await registerAllRoutes(app);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

  // Serve static files from dist/public
  const distPath = path.resolve(process.cwd(), "dist", "public");
  app.use(express.static(distPath));

  // Fall through to index.html for frontend routes (exclude backend routes)
  app.use((req, res, next) => {
    // Let backend handle these routes
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/enroll') || 
        req.path.startsWith('/static/')) {
      return next();
    }
    // Serve SPA for all other routes
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  const port = parseInt(process.env.PORT ?? "5926", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  server.listen(port, host, () => {
    log(`serving on http://${host}:${port}`);
    startOpenAuditScheduler();
  });
})();