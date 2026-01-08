export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<any>;
  findByEmail(email: string): Promise<any | null>;
  findById(id: string): Promise<any | null>;
  findByUsername?(username: string): Promise<any | null>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export interface SessionRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    lastUsedAt: Date;
  }): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    lastUsedAt: Date;
    revokedAt: Date | null;
  }>;

  findByTokenHash(tokenHash: string): Promise<{
    id: string;
    userId: string;
    expiresAt: Date;
    lastUsedAt: Date;
    revokedAt: Date | null;
  } | null>;

  updateLastUsed(tokenHash: string, date: Date): Promise<void>;

  revokeByTokenHash(tokenHash: string): Promise<void>;

  revokeOldestForUser(userId: string, keepLatest: number): Promise<void>;

  revokeAllExcept(userId: string, keepSessionId: string): Promise<void>;
}

export interface MagicLinkToken {
  id: string;
  userId: string; // Always a string
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
}

export interface MagicLinkRepository {
  // Create a new magic link token record
  create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken>;

  // Find a magic link record by its hashed token
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;

  // Mark a magic link as used
  markUsed(id: string): Promise<void>;

  // Get all unexpired and unused magic link tokens
  findAll(): Promise<MagicLinkToken[]>;
}
