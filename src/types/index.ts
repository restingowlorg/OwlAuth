import { SafeUser, UserId } from "../repositories/contracts";

export type AuthResult<T = unknown> =
  | { success: true; data: T; httpCode: number; message: string }
  | { success: false; data?: undefined; httpCode: number; message: string };

export type LoginResult = {
  user: SafeUser;
};

export type SignupResult = {
  user: SafeUser;
};

export type ChangePasswordResult = {
  user: SafeUser;
  tokensInvalidated: boolean;
};

/**
 * Recovery requests carry no data back: the response is identical whether or not the address
 * belongs to an account, so there is nothing account-specific to return. The token reaches
 * the application through the `recovery.deliver` callback instead.
 */
export type RequestRecoveryResult = null;

export type ConfirmRecoveryResult = {
  userId: UserId;
  /** Whether OwlAuth's outstanding magic links for the user were invalidated. */
  magicLinksInvalidated: boolean;
};

export type RequestMagicLinkResult = string;

export type VerifyMagicLinkResult = {
  isValid: boolean;
  userId: UserId;
  lookupKey: string;
};

export type ConsumeMagicLinkResult = {
  userId: UserId;
};
