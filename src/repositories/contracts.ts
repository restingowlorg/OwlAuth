import { User, MagicLinkRow, MagicLinkToken, CreateUserInput, SafeUser } from "../types";

export interface UserRepository {
  create(input: CreateUserInput): Promise<SafeUser>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string | number): Promise<User | null>;
  findByUsername?(username: string): Promise<User | null>;
  updatePassword(userId: string | number, passwordHash: string): Promise<boolean>;
}

/* ---------------------- MAGIC LINK REPOSITORY ---------------------- */

export interface MagicLinkRepository {
  create(data: {
    userId: string | number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<MagicLinkToken>;

  findAll(): Promise<MagicLinkRow[]>;
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  findById(id: string | number): Promise<MagicLinkToken | null>;
  consume(id: string | number): Promise<boolean>;
  invalidateByUserId(userId: string | number): Promise<boolean>;
  deleteByUserId(userId: string | number): Promise<boolean>;
}
