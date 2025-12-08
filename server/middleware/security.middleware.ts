import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import compression from "compression";
import { Request, Response, NextFunction } from "express";

/**
 * CORS Configuration
 * Allows requests from specified origins
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      process.env.CLIENT_URL || "http://localhost:5050",
      "http://localhost:3000", // Dev frontend
      "http://localhost:5173", // Vite dev server
    ];

    // In production, allow only production URL
    if (process.env.NODE_ENV === "production" && process.env.PRODUCTION_URL) {
      allowedOrigins.push(process.env.PRODUCTION_URL);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === "development") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours
});

/**
 * Helmet Security Headers
 * Protects against common web vulnerabilities
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for React dev
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Required for some map libraries
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * General API Rate Limiter
 * Applies to all API endpoints
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === "development";
  },
});

/**
 * Strict Rate Limiter for Authentication Routes
 * Protects against brute force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many authentication attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Moderate Rate Limiter for Sensitive Operations
 * For operations like password reset, user creation, etc.
 */
export const sensitiveOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per hour
  message: "Too many requests for this operation, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Response Compression Middleware
 * Compresses HTTP responses for better performance
 */
export const compressionMiddleware = compression({
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6, // Balance between speed and compression ratio
});

/**
 * Security Headers Middleware
 * Additional custom security headers
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  );

  next();
};

/**
 * Development Route Protection
 * Blocks access to /api/dev/* routes in production
 */
export const protectDevRoutes = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/dev/") && process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }
  next();
};
