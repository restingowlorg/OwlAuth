import { auditLogger } from "../infra/security/security-audit-logger";
import { BcryptAdapter } from "../infra/security/bcrypt.adapter";
import { MagicLinkService } from "../services/magic-link.service";
import { AuthDB, AuthOptions, AuthType, IAuthMethods, IAuthStrategy, Mutable } from "../types";

export class MagicLinkAuthStrategy implements IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>
  ): void {
    const cryptoAdapter = options.cryptoAdapter || new BcryptAdapter();
    if (!db.magicLinkRepo) {
      throw new Error("MagicLinkRepository is required for MagicLinkAuthStrategy");
    }
    const service = new MagicLinkService(db.userRepo, db.magicLinkRepo, cryptoAdapter, auditLogger);

    target.magicLink = {
      request: (email: string) => service.request(email),
      verify: (token: string) => service.verify(token),
      consume: (token: string) => service.consume(token)
    };
  }
}
