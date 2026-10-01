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

/**
 * Durable account policy state.
 *
 * `disabled` is an administrative decision that denies authentication until it is reversed.
 * It is not a temporary brute-force lockout: OwlAuth stores no failed-attempt counters,
 * source addresses, or lockout timers. Apply throttling at the endpoint instead.
 */
export type AccountStatus = "active" | "pending_email_verification" | "disabled";

/**
 * Every valid account status. Kept beside the type so the two cannot drift. Used to
 * validate the datastore constraint that restricts the stored column.
 */
export const ACCOUNT_STATUSES: readonly AccountStatus[] = [
  "active",
  "pending_email_verification",
  "disabled"
];

export type AccountSecurityRecord = {
  userId: UserId;
  status: AccountStatus;
  emailVerifiedAt: Date | null;
  updatedAt: Date;
};

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  username: string;
}

/**
 * Raised by a repository when a database uniqueness constraint rejects a user create.
 * Services use this to return a safe conflict response when concurrent signups race.
 */
export class DuplicateUserError extends Error {
  constructor() {
    super("A user with this email or username already exists");
    this.name = "DuplicateUserError";
  }
}

export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
  accountSecurityRepo?: AccountSecurityRepository;
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

/**
 * Optional store for account identity state. When it is absent, OwlAuth applies no
 * account-status policy and behaves exactly as it does without the feature.
 */
export interface AccountSecurityRepository {
  create(input: {
    userId: UserId;
    status: AccountStatus;
    emailVerifiedAt?: Date | null;
  }): Promise<AccountSecurityRecord>;

  findByUserId(userId: UserId): Promise<AccountSecurityRecord | null>;
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
