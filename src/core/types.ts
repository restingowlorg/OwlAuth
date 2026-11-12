import { IDatabaseAdapter } from "../infra/databases/types";
import { ICryptoAdapter } from "../infra/security/types";
import { AuditSink, AuditSinkErrorHandler } from "../infra/audit/auditor";
import { UserId } from "../repositories/contracts";
import {
  AuthResult,
  SignupResult,
  LoginResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult,
  RequestRecoveryResult,
  ConfirmRecoveryResult
} from "../types";

export type AuthType = "credentials" | "magicLink" | "recovery";

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

/**
 * What OwlAuth hands the application so it can deliver a recovery message.
 *
 * OwlAuth does not send email. This is the only place the recovery token is exposed, and it
 * is handed over for exactly one purpose: putting it in a message to the address OwlAuth
 * verified it belongs to. Do not log it, store it, or return it in an HTTP response.
 */
export type RecoveryDelivery = {
  userId: UserId;
  email: string;
  /** The single-use recovery token, in `selector.verifier` form. */
  token: string;
  /** `baseUrl` with the token attached, present only when `baseUrl` is configured. */
  url?: string;
  expiresAt: Date;
  correlationId?: string;
};

export type RecoveryOptions = {
  /**
   * Called once per issued token, and only for an address that belongs to an account
   * eligible to recover. Enqueue the message rather than sending it inline: OwlAuth awaits
   * this call, so a slow send shows up as a timing difference between a known and an
   * unknown address. A throw or rejection is contained and never changes the response.
   */
  deliver: (delivery: RecoveryDelivery) => void | Promise<void>;
  /** When set, `delivery.url` is this with `?token=…` appended. */
  baseUrl?: string;
  /** How long an issued token stays valid. Defaults to 15; must be between 5 and 60. */
  tokenTtlMinutes?: number;
};

export interface IRecoveryMethods {
  /**
   * Begin recovery for an email address.
   *
   * The result is identical for every address, so it reveals nothing about which accounts
   * exist. Rate limiting is the application's responsibility.
   */
  readonly request: (
    email: string,
    options?: { correlationId?: string }
  ) => Promise<AuthResult<RequestRecoveryResult>>;
  readonly confirm: (
    token: string,
    newPassword: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ) => Promise<AuthResult<ConfirmRecoveryResult>>;
}

export interface IAuthMethods {
  credentials: ICredentialsMethods;
  magicLink: IMagicLinkMethods;
  recovery: IRecoveryMethods;
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
  accountSecurity?: boolean;
  /** Required when `authTypes` includes `"recovery"`, and ignored otherwise. */
  recovery?: RecoveryOptions;
  /** Receives this manager's authentication events. Defaults to the console. */
  auditSink?: AuditSink;
  /** Called when `auditSink` throws or rejects. Defaults to logging the failure. */
  onAuditSinkError?: AuditSinkErrorHandler;
};

export type AuthOptions<T extends AuthType = AuthType> = BaseAuthOptions<T> & {
  adapter: IDatabaseAdapter;
};
