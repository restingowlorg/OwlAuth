import {
  AuthDB,
  AuthOptions,
  AuthType,
  IAuthManager,
  IAuthStrategy,
  Mutable
} from "../types/index";
import { authLog } from "../utils/logger";
import { CredentialsAuthStrategy } from "../strategies/CredentialsStrategy";
import { MagicLinkAuthStrategy } from "../strategies/MagicLinkStrategy";

const authStrategies: Record<AuthType, IAuthStrategy> = {
  credentials: new CredentialsAuthStrategy(),
  "magic-link": new MagicLinkAuthStrategy()
};

export function initAuthServices(db: AuthDB, options: AuthOptions): Partial<IAuthManager> {
  const result: Mutable<Partial<IAuthManager>> = {};

  const authTypes = options.authTypes ?? ["credentials"];

  authLog("info", `Initializing auth services for types: ${authTypes.join(", ")}`);

  for (const type of authTypes) {
    const strategy = authStrategies[type];
    if (strategy) {
      strategy.register(result, db, options);
    }
  }

  return result;
}
