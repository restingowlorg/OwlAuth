import { Request, Response, NextFunction } from "express";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";
import { UserRepository, SessionRepository, MagicLinkRepository } from "./repositories/contracts";

export interface AuthUser {
  id: string;
  email: string;
}
export type AuthRequest = Request & { user?: AuthUser };
export type AuthType = "credentials" | "magic-link";
export type DatabaseType = "mongo" | "postgres";

/* ------------------------------------------------ */
/* COOKIE OPTIONS */
/* ------------------------------------------------ */

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/* ------------------------------------------------ */
/* DATABASE REPOSITORIES */
/* ------------------------------------------------ */

export interface AuthDB {
  userRepo: UserRepository;
  sessionRepo: SessionRepository;
  magicLinkRepo?: MagicLinkRepository;
}

export type TableColumn = {
  column_name: string;
  is_nullable?: "YES" | "NO";
  data_type?: string;
};

/* ------------------------------------------------ */
/* AUTH CONFIG */
/* ------------------------------------------------ */
export type AuthOptions = {
  dbType: DatabaseType;
  mongoUri?: string;
  postgresUrl?: string;
  postgresUserTable?: InitPostgresOptions;
  authTypes?: AuthType[];
  sessionTtlSeconds?: number;
  cookieName?: string;
  cookieOptions?: CookieOptions;
  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};

/* ------------------------------------------------ */
/* HANDLER TYPES */
/* ------------------------------------------------ */

export type Handler = (req: Request, res: Response, next?: NextFunction) => Promise<void> | void;

export interface AuthHandlers {
  signup: Handler;
  login: Handler;
  logout: Handler;
  me: Handler;
  requireAuth: Handler;

  requestMagicLink?: Handler;
  consumeMagicLink?: Handler;
}

/* ------------------------------------------------ */
/* FRAMEWORK ADAPTER */
/* ------------------------------------------------ */

export interface FrameworkAdapter {
  createHandlers: (options: {
    db: AuthDB;
    authTypes: AuthType[];
    sessionTtl: number;
    cookieName: string;
    cookieOptions: CookieOptions;
    magicLinkService?: MagicLinkService;
    magicLinkBaseUrl?: string;
  }) => AuthHandlers;
}

/* ------------------------------------------------ */
/* MAGIC LINK TOKEN */
/* ------------------------------------------------ */

export interface MagicLinkToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

/* ------------------------------------------------ */
/* AUTH RESULT */
/* ------------------------------------------------ */
export interface SignupInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
export interface AuthResult<T = unknown> {
  success: boolean;
  data?: T;
  httpCode: number;
  message: string;
}

export interface User {
  id: string; // UUID or numeric ID depending on your DB
  email: string; // User email
  password: string; // Hashed password
  createdAt?: Date; // Optional: record creation timestamp
  updatedAt?: Date; // Optional: record update timestamp
}

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface MagicLinkTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at?: Date;
}

export interface MagicLinkToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export type UserId = string | number;

export type InitPostgresOptions = {
  userTableName?: string;
};
