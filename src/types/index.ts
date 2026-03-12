import { MagicLinkService } from "../services/magic-link.service";
import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { PostgresUserSchema } from "../infra/postgresql/schema";

// ------------------------------
export type AuthType = "credentials" | "magic-link";

// ------------------------------
// PostgreSQL & MongoDB DB options
// ------------------------------
export interface InitPostgresOptions {
  postgresUrl: string;

  userTableName: string;
  userSchema?: string; // NEW (default: public)

  magicLinkTableName?: string;
  magicLinkSchema?: string; // NEW (default: public)
}

export type InitMongoOptions = {
  mongoUri: string;
  magicLinkCollectionName?: string; // Optional, default will be "magic_links"
  userCollectionName: string;
};

// ------------------------------
// Type-safe options for AuthManager.init()
// ------------------------------
export type BaseAuthOptions = {
  authTypes?: AuthType[];
  blockedPasswords?: string[];
  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};

export type AuthResult<T = unknown> = {
  success: boolean;
  data?: T | undefined;
  httpCode: number;
  message: string;
};

export type AuthOptions =
  | (BaseAuthOptions & {
      dbType: "postgres";
      dbOptions: InitPostgresOptions;
    })
  | (BaseAuthOptions & {
      dbType: "mongo";
      dbOptions: InitMongoOptions;
    });

export type AuthLogLevel = "info" | "warn" | "error";

export type User = {
  id: string;
  email: string;
  username: string;
  password: string;
};

// ------------------------------
// Authenticated User Interface
// ------------------------------
export type AuthUser = {
  id: string;
  email: string;
  username?: string;
};

export type AuthRequest = Request & { user?: AuthUser };
export type DatabaseType = "mongo" | "postgres";

/* ------------------------------------------------ */
/* COOKIE OPTIONS */
/* ------------------------------------------------ */

export type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
};

/* ------------------------------------------------ */
/* DATABASE REPOSITORIES */
/* ------------------------------------------------ */

export type TableColumn = {
  column_name: string;
  is_nullable?: "YES" | "NO";
  data_type?: string;
};

export type ColumnRow = {
  column_name: string;
};

// Repository Interface
export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
};

/* ------------------------------------------------ */
/* AUTH INPUT / RESULT TYPES */
/* ------------------------------------------------ */

export type SignupInput = {
  email: string;
  username: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

// DB row as returned by Postgres
export type MagicLinkRow = {
  id: number | string;
  user_id: number | string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
};

// Application-facing token type (camelCase)
export type MagicLinkToken = {
  id: number | string;
  userId: string | number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

// Input object for creating a token
export type CreateMagicLinkInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
};

export type UserId = string | number;

export type LoginResponse = {
  user: SafeUser;
};

export type SignupResponse = {
  user: SafeUser;
};

export type ChangePasswordResponse = undefined;
export type RequestMagicLinkResponse = string;
export type ConsumeMagicLinkResponse = {
  userId: string;
};

export type SafeUser = {
  id: string;
  email: string;
  username: string;
};

export type UserColumn = (typeof PostgresUserSchema.requiredColumns)[number];
