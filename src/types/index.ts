import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { PostgresUserSchema } from "../infra/postgresql/schema";
import { ObjectId } from "mongodb";

export type AuthType = "credentials" | "magic-link";

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

export type BaseAuthOptions = {
  authTypes?: AuthType[];
  blockedPasswords?: string[];
  magicLinkBaseUrl?: string;
  cryptoAdapter?: ICryptoAdapter;
};

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

export interface IAuthStrategy {
  register(target: Mutable<Partial<IAuthManager>>, db: AuthDB, options: AuthOptions): void;
}

export type AuthResult<T = unknown> = {
  success: boolean;
  data?: T | undefined;
  httpCode: number;
  message: string;
};

export type AuthOptions = BaseAuthOptions & {
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

export interface IAuthManager {
  readonly credentials?: ICredentialsMethods;
  readonly magicLink?: IMagicLinkMethods;
}

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

export type ChangePasswordResult = undefined;
export type RequestMagicLinkResult = string;
export type VerifyMagicLinkResult = {
  isValid: boolean;
  userId?: string;
  tokenId?: string;
};
export type ConsumeMagicLinkResult = {
  userId: string;
};

export type SafeUser = {
  id: string;
  email: string;
  username: string;
};

export type UserColumn = (typeof PostgresUserSchema.requiredColumns)[number];
