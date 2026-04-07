export { createAuthManager } from "./core/auth.manager";
export {
  // Result Types
  AuthResult,
  LoginResult,
  SignupResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "./types/index";

export { MongoAdapter } from "./infra/databases/mongo/adapter";
export { PostgresAdapter } from "./infra/databases/postgresql/adapter";
export { ICryptoAdapter } from "./infra/security/types";
export { BcryptAdapter } from "./infra/security/bcrypt.adapter";
export type { SafeUser, UserId } from "./repositories/contracts";
