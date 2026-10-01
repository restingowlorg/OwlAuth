import { auditLogger } from "../infra/security/security-audit-logger";
import { AuthDB } from "../repositories/contracts";
import { CredentialsAuthStrategy } from "../strategies/CredentialsStrategy";
import { MagicLinkAuthStrategy } from "../strategies/MagicLinkStrategy";
import { IAuthStrategy, Mutable } from "../strategies/types";
import { AuthOptions, AuthType, IAuthMethods } from "./types";
import { zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

const authStrategies: Record<AuthType, IAuthStrategy> = {
  credentials: new CredentialsAuthStrategy(),
  magicLink: new MagicLinkAuthStrategy()
};

let isZxcvbnConfigured = false;

function configureZxcvbn(): void {
  if (isZxcvbnConfigured) {
    return;
  }

  zxcvbnOptions.setOptions({
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary
    },
    graphs: zxcvbnCommonPackage.adjacencyGraphs
  });

  isZxcvbnConfigured = true;
}

export function initAuthServices(
  db: AuthDB,
  options: AuthOptions<AuthType>
): Partial<IAuthMethods> {
  configureZxcvbn();

  const result: Mutable<Partial<IAuthMethods>> = {};

  const authTypes = options.authTypes ?? ["credentials"];

  // `AuthDB.accountSecurityRepo` is optional so that existing adapters keep working, which
  // means an enabled feature with no repository would otherwise start up and silently
  // enforce nothing. Fail loudly instead: a caller that asked for account policy must not
  // be left believing it is active.
  if (options.accountSecurity && !db.accountSecurityRepo) {
    throw new Error(
      "[Auth:initAuthServices] accountSecurity is enabled but the adapter did not provide an " +
        "account security repository. Built-in adapters require 'accountSecurityTableName' " +
        "(PostgreSQL) or 'accountSecurityCollectionName' (MongoDB); a custom adapter must " +
        "return 'accountSecurityRepo' from connect()."
    );
  }

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
