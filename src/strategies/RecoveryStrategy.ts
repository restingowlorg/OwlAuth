import { BcryptAdapter } from "../infra/security/bcrypt.adapter";
import { IAuditLogger } from "../infra/security/types";
import {
  MAX_RECOVERY_TTL_MINUTES,
  MIN_RECOVERY_TTL_MINUTES,
  RecoveryService
} from "../services/recovery.service";
import { AuthDB } from "../repositories/contracts";
import { AuthOptions, AuthType, IAuthMethods } from "../core/types";
import { IAuthStrategy, Mutable } from "./types";

export class RecoveryAuthStrategy implements IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>,
    logger: IAuditLogger
  ): void {
    const cryptoAdapter = options.cryptoAdapter || new BcryptAdapter();

    if (!db.actionTokenRepo) {
      throw new Error(
        "[Auth:RecoveryAuthStrategy] Password recovery is enabled but the adapter did not " +
          "provide an action token repository. The built-in MongoDB adapter requires " +
          "'actionTokenCollectionName' (PostgreSQL defaults to 'action_tokens'); a custom " +
          "adapter must return 'actionTokenRepo' from connect()."
      );
    }

    // Without a delivery callback an issued token would reach nobody, so the flow would
    // appear to work while no user could ever recover. Fail at startup instead.
    const recovery = options.recovery;
    if (!recovery || typeof recovery.deliver !== "function") {
      throw new Error(
        "[Auth:RecoveryAuthStrategy] Password recovery requires 'recovery.deliver' to be a " +
          "function. It receives { userId, email, token, url, expiresAt } and should enqueue " +
          "the recovery message."
      );
    }

    const ttl = recovery.tokenTtlMinutes;
    if (
      ttl !== undefined &&
      (!Number.isInteger(ttl) || ttl < MIN_RECOVERY_TTL_MINUTES || ttl > MAX_RECOVERY_TTL_MINUTES)
    ) {
      throw new Error(
        `[Auth:RecoveryAuthStrategy] 'recovery.tokenTtlMinutes' must be a whole number of ` +
          `minutes between ${MIN_RECOVERY_TTL_MINUTES} and ${MAX_RECOVERY_TTL_MINUTES}. A ` +
          `longer window leaves a password-resetting token live for longer than it needs.`
      );
    }

    // Enforcement follows the option, not the mere presence of a repository. A custom
    // adapter that returns one while the feature is disabled must not switch policy on.
    const accountSecurityRepo = options.accountSecurity ? db.accountSecurityRepo : undefined;

    const service = new RecoveryService(
      db.userRepo,
      db.actionTokenRepo,
      cryptoAdapter,
      logger,
      {
        deliver: recovery.deliver,
        baseUrl: recovery.baseUrl,
        tokenTtlMinutes: recovery.tokenTtlMinutes
      },
      db.magicLinkRepo,
      accountSecurityRepo
    );

    target.recovery = {
      request: (email: string, optionsOverride?: { correlationId?: string }) =>
        service.request(email, optionsOverride),

      confirm: (
        token: string,
        newPassword: string,
        optionsOverride?: {
          blockedPasswords?: string[];
          pwnedPasswordFailClosed?: boolean;
          correlationId?: string;
        }
      ) =>
        service.confirm(token, newPassword, {
          blockedPasswords: optionsOverride?.blockedPasswords ?? options.blockedPasswords,
          pwnedPasswordFailClosed:
            optionsOverride?.pwnedPasswordFailClosed ?? options.pwnedPasswordFailClosed,
          correlationId: optionsOverride?.correlationId
        })
    };
  }
}
