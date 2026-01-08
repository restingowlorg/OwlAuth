// src/utils/session-token.util.ts
import { Request } from "express";

export function getSessionToken(req: Request): string | null {
  // Try cookie first
  if (req.cookies?.AUTH_SESSION) return req.cookies.AUTH_SESSION;

  // Then Authorization header
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  return null;
}
