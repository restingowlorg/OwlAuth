import { auditLogger } from "../infra/security/security-audit-logger";
import { BcryptAdapter } from "../infra/security/bcrypt.adapter";
import { AuthService } from "../services/auth.service";
import { AuthDB, AuthOptions, AuthType, IAuthMethods, IAuthStrategy, Mutable } from "../types";

export class CredentialsAuthStrategy implements IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>
  ): void {
    const cryptoAdapter = options.cryptoAdapter || new BcryptAdapter();
    const service = new AuthService(db.userRepo, cryptoAdapter, auditLogger);

    target.credentials = {
      signup: (
        email: string,
        username: string,
        password: string,
        optionsOverride?: {
          blockedPasswords?: string[];
          pwnedPasswordFailClosed?: boolean;
          correlationId?: string;
        }
      ) =>
        service.signup(email, username, password, {
          blockedPasswords: optionsOverride?.blockedPasswords ?? options.blockedPasswords,
          pwnedPasswordFailClosed:
            optionsOverride?.pwnedPasswordFailClosed ?? options.pwnedPasswordFailClosed,
          correlationId: optionsOverride?.correlationId
        }),

      login: (email: string, password: string, optionsOverride?: { correlationId?: string }) =>
        service.login(email, password, optionsOverride),

      changePassword: (
        userId: string | number,
        currentPass: string,
        newPass: string,
        optionsOverride?: {
          blockedPasswords?: string[];
          pwnedPasswordFailClosed?: boolean;
          correlationId?: string;
        }
      ) =>
        service.changePassword(userId, currentPass, newPass, {
          blockedPasswords: optionsOverride?.blockedPasswords ?? options.blockedPasswords,
          pwnedPasswordFailClosed:
            optionsOverride?.pwnedPasswordFailClosed ?? options.pwnedPasswordFailClosed,
          correlationId: optionsOverride?.correlationId
        })
    };
  }
}
