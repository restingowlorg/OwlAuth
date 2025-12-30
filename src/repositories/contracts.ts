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
}


export interface SessionRepository {
  create(userId: string, expiresAt: Date): Promise<any>;
  findById(id: Number): Promise<any | null>;
  delete(id: string): Promise<void>;
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
