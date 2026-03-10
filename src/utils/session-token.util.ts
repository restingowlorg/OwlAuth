// src/utils/session-token.util.ts
import { Request } from "express";

/**
 * Typed cookies interface for auth
 */
interface AuthCookies {
  AUTH_SESSION?: string;
}

/**
 * Get session token from cookie or Authorization header
 */
export function getSessionToken(req: Request): string | null {
  const cookies = req.cookies as AuthCookies | undefined;

  // Try cookie first
  if (cookies?.AUTH_SESSION) return cookies.AUTH_SESSION;

  // Then Authorization header
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  return null;
}
