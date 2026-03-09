// src/repositories/contracts.ts

import { Session, User, UserId, MagicLinkRecord, MagicLinkToken } from "../types";

/* ---------------------- USER REPOSITORY ---------------------- */

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByUsername?(username: string): Promise<User | null>;
}

/* ---------------------- SESSION REPOSITORY ---------------------- */

export interface SessionRepository {
  create(userId: UserId, expiresAt: Date): Promise<Session>;
  findById(id: string | number): Promise<Session | null>;
  delete(id: string): Promise<void>;
}

/* ---------------------- MAGIC LINK REPOSITORY ---------------------- */

export interface MagicLinkRepository {
  create(data: {
    userId: string | number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<MagicLinkToken>;

  findAll(): Promise<MagicLinkRecord[]>;
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  markUsed(id: string): Promise<void>;
}
