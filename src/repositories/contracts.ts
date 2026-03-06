// src/repositories/contracts.ts

import { User, Session, MagicLinkToken, UserId } from "../types";

/* ---------------------- USER REPOSITORY ---------------------- */

export interface UserRepository {
  create(email: string, passwordHash: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
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
