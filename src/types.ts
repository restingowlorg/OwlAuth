import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";

export type HandlerConfig = {
  db: AuthDB;
  sessionTtl: number;
  cookieName: string;
  cookieOptions: any;
  authTypes?: AuthType[]; // allow multiple
  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};
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
  sessionTtlSeconds?: number;

  cookieName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };

  magicLinkService?: MagicLinkService;
  magicLinkBaseUrl?: string;
};

export interface AuthDB {
  userRepo: any;
  sessionRepo: any;
  magicLinkRepo?: any;
}

export interface AuthHandlers {
  signup: any;
  login: any;
  logout: any;
  me: any;
  requireAuth: any;
  requestMagicLink?: any;
  consumeMagicLink?: any;
}

export interface FrameworkAdapter {
  createHandlers: (options: {
    db: AuthDB;
    authTypes: AuthType[];
    sessionTtl: number;
    cookieName: string;
    cookieOptions: any;
    magicLinkService?: MagicLinkService;
    magicLinkBaseUrl?: string;
  }) => AuthHandlers;
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
