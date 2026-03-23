export { AuthManager, createAuthManager } from "./auth.manager";
export {
  // Types
  AuthType,
  DatabaseType,
  AuthLogLevel,
  UserId,

  // Interfaces & Managers
  IAuthManager,
  AuthDB,

  // Options
  AuthOptions,
  BaseAuthOptions,
  InitPostgresOptions,
  InitMongoOptions,
  CookieOptions,

  // Input Types
  SignupInput,
  LoginInput,
  CreateMagicLinkInput,
  CreateUserInput,

  // Result Types
  AuthResult,
  LoginResult,
  SignupResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "./types/index";
