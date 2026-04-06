import { IDatabaseAdapter } from "../infra/databases/types";
import { ICryptoAdapter } from "../infra/security/types";
import {
  AuthResult,
  SignupResult,
  LoginResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "../types";

export type AuthType = "credentials" | "magicLink";

export interface ICredentialsMethods {
  readonly signup: (
    email: string,
    username: string,
    password: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ) => Promise<AuthResult<SignupResult>>;
  readonly login: (
    email: string,
    password: string,
    options?: { correlationId?: string }
  ) => Promise<AuthResult<LoginResult>>;
  readonly changePassword: (
    userId: string,
    currentPassword: string,
    newPassword: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ) => Promise<AuthResult<ChangePasswordResult>>;
}

export interface IMagicLinkMethods {
  readonly request: (
    email: string,
    options?: { correlationId?: string }
  ) => Promise<AuthResult<RequestMagicLinkResult>>;
  readonly verify: (
    token: string,
    options?: { correlationId?: string }
  ) => Promise<AuthResult<VerifyMagicLinkResult>>;
  readonly consume: (
    token: string,
    options?: { correlationId?: string }
  ) => Promise<AuthResult<ConsumeMagicLinkResult>>;
}

export interface IAuthMethods {
  credentials: ICredentialsMethods;
  magicLink: IMagicLinkMethods;
}

/**
 * Maps only the auth method groups that were requested at initialisation.
 *
 * `T` is constrained to the union of `AuthType` values supplied to `createAuthManager()`.
 * For example, `IAuthManager<"credentials">` exposes only `manager.credentials`;
 * `IAuthManager<"credentials" | "magicLink">` exposes both.
 *
 * When no type argument is provided the default `T = AuthType` means both
 * `credentials` and `magicLink` are present — useful when writing generic
 * utility code that accepts any fully-configured manager.
 */
export type IAuthManager<T extends AuthType = AuthType> = {
  [K in T]: IAuthMethods[K];
} & {
  readonly disconnectDB: () => Promise<void>;
};

export type BaseAuthOptions<T extends AuthType = AuthType> = {
  authTypes?: T[];
  blockedPasswords?: string[];
  magicLinkBaseUrl?: string;
  cryptoAdapter?: ICryptoAdapter;
  customMaskingKeys?: string[];
  pwnedPasswordFailClosed?: boolean;
  usernameValidator?: (username: string) => boolean;
};

export type AuthOptions<T extends AuthType = AuthType> = BaseAuthOptions<T> & {
  adapter: IDatabaseAdapter;
};
