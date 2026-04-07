import { auditLogger } from "../infra/security/security-audit-logger";
import { AuthDB } from "../repositories/contracts";
import { CredentialsAuthStrategy } from "../strategies/CredentialsStrategy";
import { MagicLinkAuthStrategy } from "../strategies/MagicLinkStrategy";
import { IAuthStrategy, Mutable } from "../strategies/types";
import { AuthOptions, AuthType, IAuthMethods } from "./types";

const authStrategies: Record<AuthType, IAuthStrategy> = {
  credentials: new CredentialsAuthStrategy(),
  magicLink: new MagicLinkAuthStrategy()
};

export function initAuthServices(
  db: AuthDB,
  options: AuthOptions<AuthType>
): Partial<IAuthMethods> {
  const result: Mutable<Partial<IAuthMethods>> = {};

  const authTypes = options.authTypes ?? ["credentials"];

  if (options.customMaskingKeys) {
    auditLogger.setCustomMaskingKeys(options.customMaskingKeys);
  }

  auditLogger.info(`Initializing auth services for types: ${authTypes.join(", ")}`);

  for (const type of authTypes) {
    const strategy = authStrategies[type];
    if (strategy) {
      strategy.register(result, db, options);
    }
  }

  return result;
}
