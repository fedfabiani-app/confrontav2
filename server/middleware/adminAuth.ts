import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still run a constant-time comparison so length mismatches don't
    // return faster than a full comparison would.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Guards admin/cleanup endpoints. Fails closed: if ADMIN_SECRET isn't
 * configured, every request is rejected rather than falling back to a
 * known default.
 */
export function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = process.env.ADMIN_SECRET;
  if (!configuredSecret) {
    console.error(`[AdminAuth] ADMIN_SECRET is not configured - blocking ${req.method} ${req.path}`);
    return res.status(503).json({ error: "Admin endpoint not configured" });
  }

  const provided = req.headers["x-admin-secret"];
  if (typeof provided !== "string" || !safeCompare(provided, configuredSecret)) {
    console.warn(`[AdminAuth] Unauthorized attempt blocked for ${req.method} ${req.path}`);
    return res.status(401).json({ error: "Unauthorized - X-Admin-Secret header required" });
  }

  next();
}
