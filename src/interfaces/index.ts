// ------------------------------
// Authenticated User Interface

import { ObjectId } from "mongodb";
import { MagicLinkRepository, UserRepository } from "../repositories/contracts";
import {
  SignupResult,
  LoginResult,
  AuthResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  ConsumeMagicLinkResult
} from "../types/index";

// ------------------------------
export interface AuthUser {
  id: string;
  email: string;
  username?: string;
}

// ------------------------------
// Repository Interface
// ------------------------------
export interface AuthDB {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
}

// ------------------------------
// Magic Link Token Type
// ------------------------------
export interface MagicLinkToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

export interface IAuthManager {
  changePassword: (
    userId: string | number,
    currentPassword: string,
    newPassword: string
  ) => Promise<AuthResult<ChangePasswordResult>>;
  requestMagicLink?: (email: string) => Promise<AuthResult<RequestMagicLinkResult>>;
  consumeMagicLink?: (token: string) => Promise<AuthResult<ConsumeMagicLinkResult>>;
  signup(email: string, username: string, password: string): Promise<AuthResult<SignupResult>>;
  login(email: string, password: string): Promise<AuthResult<LoginResult>>;
}

export interface MongoUserDoc {
  _id?: ObjectId;
  email: string;
  username: string;
  password: string;
}

export interface ColumnRow {
  column_name: string;
}

export interface FKRow {
  referenced_table: string;
  referenced_column: string;
}

/** Mongo document type for Magic Link */
export interface MongoMagicLinkDoc {
  _id?: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoUserDoc {
  _id?: ObjectId; // MongoDB ObjectId (optional when inserting)
  email: string;
  username: string;
  password: string;
  createdAt?: Date; // optional timestamps
  updatedAt?: Date;
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
