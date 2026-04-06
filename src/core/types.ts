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

export type SignupInput = {
  email: string;
  username: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

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
    userId: string | number,
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
};

export type AuthOptions<T extends AuthType = AuthType> = BaseAuthOptions<T> & {
  adapter: IDatabaseAdapter;
};
