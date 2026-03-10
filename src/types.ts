import { Request, Response, NextFunction } from "express";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";
import {
  UserRepository,
  SessionRepository,
  MagicLinkRepository as MLRepoContract
} from "./repositories/contracts";

/* ------------------------------------------------ */
/* AUTH USER / REQUEST TYPES */
/* ------------------------------------------------ */

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
  magicLinkRepo?: MLRepoContract;
}

export type TableColumn = {
  column_name: string;
  is_nullable?: "YES" | "NO";
  data_type?: string;
};

/* ------------------------------------------------ */
/* AUTH CONFIG OPTIONS */
/* ------------------------------------------------ */

export type AuthOptions = {
  dbType: DatabaseType;
  mongoUri?: string;
  postgresUrl?: string;
  postgresUserTable?: InitPostgresOptions;
  authTypes?: AuthType[];
  sessionTtlSeconds?: number;
  idleTtlSeconds?: number;
  maxSessionsPerUser?: number;
  blockedPasswords?: string[];
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
/* USER / SESSION TYPES */
/* ------------------------------------------------ */

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SessionRow {
  id: string | number;
  user_id: string;
  created_at: Date;
  expires_at: Date;
}

export interface Session {
  id: string | number;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

/* ------------------------------------------------ */
/* AUTH INPUT / RESULT TYPES */
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

/* ------------------------------------------------ */
/* MAGIC LINK TYPES */
/* ------------------------------------------------ */

// DB row as returned by Postgres
export interface MagicLinkRow {
  id: number | string;
  user_id: number | string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

// Application-facing token type (camelCase)
export interface MagicLinkToken {
  id: number | string;
  userId: string | number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// Input object for creating a token
export interface CreateMagicLinkInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

// Repository contract
export interface MagicLinkRepository {
  create(token: CreateMagicLinkInput): Promise<MagicLinkToken>;
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  markUsed(id: string): Promise<void>;
  findAll(): Promise<MagicLinkToken[]>;
}

export type UserId = string | number;
export type InitPostgresOptions = {
  userTableName?: string;
};

export type AuthLogLevel = "info" | "warn" | "error";
