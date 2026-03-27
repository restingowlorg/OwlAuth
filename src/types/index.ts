import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { PostgresUserSchema } from "../infra/databases/postgresql/schema";
import { ObjectId } from "mongodb";

export type AuthType = "credentials" | "magicLink";

// PostgreSQL & MongoDB DB options
export interface InitPostgresOptions {
  postgresUrl: string;
  userTableName: string;
  userSchema?: string;
  magicLinkTableName?: string;
  magicLinkSchema?: string;
}

export type InitMongoOptions = {
  mongoUri: string;
  magicLinkCollectionName?: string; // Optional, default will be "magic_links"
  userCollectionName: string;
};

export interface IDatabaseAdapter {
  connect(options: BaseAuthOptions): Promise<AuthDB>;
}

export interface ICryptoAdapter {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(length?: number): string;
  hashToken(token: string): Promise<string>;
  verifyToken(token: string, hash: string): Promise<boolean>;
}

export type BaseAuthOptions<T extends AuthType = AuthType> = {
  authTypes?: T[];
  blockedPasswords?: string[];
  magicLinkBaseUrl?: string;
  cryptoAdapter?: ICryptoAdapter;
  customMaskingKeys?: string[];
  pwnedPasswordFailClosed?: boolean;
};

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>
  ): void;
}

export type AuthResult<T = unknown> =
  | { success: true; data: T; httpCode: number; message: string }
  | { success: false; data?: undefined; httpCode: number; message: string };

export type AuthOptions<T extends AuthType = AuthType> = BaseAuthOptions<T> & {
  adapter: IDatabaseAdapter;
};

export type AuthLogLevel = "info" | "warn" | "error";

export type User = {
  id: string;
  email: string;
  username: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  username?: string;
};

export type AuthRequest = Request & { user?: AuthUser };

export type TableColumn = {
  column_name: string;
  is_nullable?: "YES" | "NO";
  data_type?: string;
};

export type ColumnRow = {
  column_name: string;
};

// Repository
export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
  close: () => Promise<void>;
};

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

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

export interface ICredentialsMethods {
  readonly signup: (
    email: string,
    username: string,
    password: string
  ) => Promise<AuthResult<SignupResult>>;
  readonly login: (email: string, password: string) => Promise<AuthResult<LoginResult>>;
  readonly changePassword: (
    userId: string | number,
    currentPassword: string,
    newPassword: string
  ) => Promise<AuthResult<ChangePasswordResult>>;
}

export interface IMagicLinkMethods {
  readonly request: (email: string) => Promise<AuthResult<RequestMagicLinkResult>>;
  readonly verify: (token: string) => Promise<AuthResult<VerifyMagicLinkResult>>;
  readonly consume: (token: string) => Promise<AuthResult<ConsumeMagicLinkResult>>;
}

export interface IAuthMethods {
  credentials: ICredentialsMethods;
  magicLink: IMagicLinkMethods;
}

export type IAuthManager<T extends AuthType = AuthType> = {
  [K in T]: IAuthMethods[K];
} & {
  readonly disconnectDB: () => Promise<void>;
};

export interface IMongoMagicLinkDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IMongoUserDoc {
  _id?: ObjectId; // MongoDB ObjectId (optional when inserting)
  email: string;
  username: string;
  password: string;
  created_at?: Date; // optional timestamps
  updated_at?: Date;
}

export interface FKRow {
  referenced_table: string;
  referenced_column: string;
}

export interface TableExistsRow {
  exists: boolean;
}

export interface ColumnInfoRow {
  column_name: string;
  is_nullable: "YES" | "NO";
}

export interface PrimaryKeyRow {
  column_name: string;
  data_type: string;
}

export type UserId = string | number;

export type LoginResult = {
  user: SafeUser;
};

export type SignupResult = {
  user: SafeUser;
};

export type ChangePasswordResult = {
  user: SafeUser;
};
export type RequestMagicLinkResult = string;
export type VerifyMagicLinkResult = {
  isValid: boolean;
  userId: string;
  tokenId: string;
};
export type ConsumeMagicLinkResult = {
  userId: string;
};

export type SafeUser = {
  id: string | number;
  email: string;
  username: string;
};

export type UserColumn = (typeof PostgresUserSchema.requiredColumns)[number];

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "SIGNUP"
  | "SIGNUP_FAILURE"
  | "PASSWORD_CHANGE"
  | "MAGIC_LINK_REQUESTED"
  | "MAGIC_LINK_VERIFIED"
  | "MAGIC_LINK_CONSUMED"
  | "MAGIC_LINK_FAILURE";

export type SecurityEvent = {
  type: SecurityEventType;
  userId?: string | number;
  email?: string;
  metadata?: Record<string, unknown>;
};

export interface IAuditLogger {
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, error: unknown, context?: unknown): void;
  audit(event: SecurityEvent): void;
}
