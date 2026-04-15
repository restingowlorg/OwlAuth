export type UserId = string;

export type SafeUser = {
  id: string;
  email: string;
  username: string;
};

export type User = {
  id: string;
  email: string;
  username: string;
  password: string;
};

export type MagicLinkToken = {
  id: string;
  userId: string;
  lookupKey: string;
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

export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
  close: () => Promise<void>;
};

export interface UserRepository {
  create(input: CreateUserInput): Promise<SafeUser>;
  findByEmail(email: string): Promise<SafeUser | null>;
  findById(id: UserId): Promise<SafeUser | null>;
  findByUsername?(username: string): Promise<SafeUser | null>;
  findWithPasswordByEmail(email: string): Promise<User | null>;
  findWithPasswordById(id: UserId): Promise<User | null>;
  updatePassword(userId: UserId, passwordHash: string): Promise<boolean>;
}

export interface MagicLinkRepository {
  create(data: {
    userId: UserId;
    lookupKey: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<MagicLinkToken>;

  findByLookupKey(lookupKey: string): Promise<MagicLinkToken | null>;
  consume(lookupKey: string): Promise<boolean>;
  invalidateByUserId(userId: UserId): Promise<boolean>;
  deleteByUserId(userId: UserId): Promise<boolean>;
}
