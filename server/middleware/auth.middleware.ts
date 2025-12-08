import { Request, Response, NextFunction } from "express";
import { verifyToken, checkPermission, type JWTPayload } from "../services/auth";
import { storage } from "../storage";

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT tokens
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  req.user = payload;
  next();
};

/**
 * Middleware to validate that the authenticated user exists in the database
 */
export const validateUserExists = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await storage.getUser(req.user.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid authentication" });
    }
    next();
  } catch (error) {
    console.error("User validation error:", error);
    return res.status(401).json({ message: "Authentication error" });
  }
};

/**
 * Middleware to require a specific role or higher
 */
export const requireRole = (role: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !checkPermission(req.user.role, role)) {
    return res.status(403).json({ message: "Insufficient permissions" });
  }
  next();
};

/**
 * Combined authentication and user validation middleware
 */
export const authenticateAndValidate = [authenticateToken, validateUserExists];
