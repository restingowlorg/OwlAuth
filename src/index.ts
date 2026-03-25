export { createAuthManager } from "./core/auth.manager";
export {
  // Types
  AuthType,
  AuthLogLevel,
  UserId,

  // Interfaces & Managers
  IAuthManager,
  IDatabaseAdapter,
  ICryptoAdapter,
  AuthDB,

  // Options
  AuthOptions,
  BaseAuthOptions,
  InitPostgresOptions,
  InitMongoOptions,

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

export { BcryptAdapter } from "./infra/security/bcrypt.adapter";
export { MongoAdapter } from "./infra/databases/mongo/adapter";
export { PostgresAdapter } from "./infra/databases/postgresql/adapter";
