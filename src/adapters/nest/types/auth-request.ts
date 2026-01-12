import { Request } from "express";

export interface AuthSession {
  id: string;
  userId: string | number;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  sessionToken: string;
}

export interface AuthUser {
  id: string | number;
}

export interface AuthRequest extends Request {
  user: AuthUser;
  session: AuthSession;
}
