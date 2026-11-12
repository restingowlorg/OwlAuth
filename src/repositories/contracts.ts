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
 * What a stored action token authorises. A token is bound to exactly one purpose, and the
 * purpose is part of every lookup, so a token minted for one action cannot be spent on
 * another even if its row is found.
 *
 * These are local authentication actions only. An action token is never an application
 * credential: it is not a bearer, access, refresh or JWT token, and it grants nothing until
 * it is exchanged through the flow that issued it.
 */
export type ActionTokenPurpose = "password_recovery";

/**
 * Every valid purpose. Kept beside the type so the two cannot drift, and used to validate
 * the datastore constraint that restricts the stored column.
 */
export const ACTION_TOKEN_PURPOSES: readonly ActionTokenPurpose[] = ["password_recovery"];

/**
 * A single-use token for a local authentication action.
 *
 * `selector` is stored in the clear and identifies the row; `tokenHash` is the hash of the
 * secret half, which is never stored. Finding a row therefore proves nothing — the secret
 * still has to verify against the hash.
 */
export type ActionToken = {
  id: string;
  userId: UserId;
  purpose: ActionTokenPurpose;
  selector: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

/**
 * Optional store for single-use action tokens. Required only by the flows that issue them,
 * such as password recovery.
 */
export interface ActionTokenRepository {
  create(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken>;

  findBySelector(selector: string, purpose: ActionTokenPurpose): Promise<ActionToken | null>;

  /**
   * Spend the token, as one atomic conditional write.
   *
   * Marks it used only if it is currently unused and unexpired, and reports whether this
   * call was the one that did so. The unused condition is part of the same write, so two
   * concurrent callers cannot both be told yes — which is what stops a token being redeemed
   * twice. Implementations judge expiry with whichever clock they can read atomically, so
   * callers must not rely on it alone; the service checks expiry itself as well.
   */
  consume(selector: string, purpose: ActionTokenPurpose): Promise<boolean>;

  /** Mark every outstanding token of this purpose for the user as used. */
  invalidateByUserId(userId: UserId, purpose: ActionTokenPurpose): Promise<boolean>;
}

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

/**
 * Raised by a repository when an account security record already exists for a user.
 *
 * Provisioning is idempotent and can be attempted concurrently — two retries of the same
 * failed signup race each other — so the unique `user_id` constraint rejecting the second
 * write means the record is present, which is the desired outcome rather than a failure.
 */
export class AccountSecurityRecordExistsError extends Error {
  constructor() {
    super("An account security record already exists for this user");
    this.name = "AccountSecurityRecordExistsError";
  }
}

export type AuthDB = {
  userRepo: UserRepository;
  magicLinkRepo?: MagicLinkRepository;
  accountSecurityRepo?: AccountSecurityRepository;
  actionTokenRepo?: ActionTokenRepository;
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
