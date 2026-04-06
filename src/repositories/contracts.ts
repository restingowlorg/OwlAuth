export type UserId = string | number;

export type SafeUser = {
  id: string | number;
  email: string;
  username: string;
};

export type User = {
  id: UserId;
  email: string;
  username: string;
  password: string;
};

export type MagicLinkToken = {
  id: number | string;
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

export type CreateMagicLinkInput = {
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
};

export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
  close: () => Promise<void>;
};

export interface UserRepository {
  create(input: CreateUserInput): Promise<SafeUser>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
  findByUsername?(username: string): Promise<User | null>;
  updatePassword(userId: UserId, passwordHash: string): Promise<boolean>;
}

export interface MagicLinkRepository {
  create(data: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<MagicLinkToken>;

  findAll(): Promise<MagicLinkToken[]>;
  findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null>;
  findById(id: UserId): Promise<MagicLinkToken | null>;
  consume(id: UserId): Promise<boolean>;
  invalidateByUserId(userId: UserId): Promise<boolean>;
  deleteByUserId(userId: UserId): Promise<boolean>;
}
