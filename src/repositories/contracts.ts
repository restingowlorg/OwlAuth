// src/repositories/contracts.ts

import { Session, MagicLinkToken, User, UserId } from "../types";

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
  findById(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
}

/* ---------------------- MAGIC LINK REPOSITORY ---------------------- */

export interface MagicLinkRepository {
  create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken>;

  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;

  markUsed(id: string): Promise<void>;

  findAll(): Promise<MagicLinkToken[]>;
}
