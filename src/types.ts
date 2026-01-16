import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";


export interface AuthUser {
  id: string;
  email: string;
}

export type AuthType = "credentials" | "magic-link";

export type AuthOptions = {
  dbType: "mongo" | "postgres" | "mysql" | string;
  mongoUri?: string;
  postgresUrl?: string;
  postgresUserTable?: InitPostgresOptions;
  authTypes?: AuthType[];
  blockedPasswords?: string[];
  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};

export interface AuthDB {
  userRepo: any;
  magicLinkRepo?: any;
}

export interface MagicLinkToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export interface AuthResult<T = any> {
  success: boolean;
  data?: T;
  httpCode: number;
  message: string;
}

export type InitPostgresOptions = {
  userTableName?: string;
};

export type AuthLogLevel = "info" | "warn" | "error";

