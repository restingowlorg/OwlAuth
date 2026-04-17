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

export type RequestMagicLinkResult = string;

export type VerifyMagicLinkResult = {
  isValid: boolean;
  userId: UserId;
  lookupKey: string;
};

export type ConsumeMagicLinkResult = {
  userId: UserId;
};
