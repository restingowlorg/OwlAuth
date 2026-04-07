import { auditLogger } from "../infra/security/security-audit-logger";
import { BcryptAdapter } from "../infra/security/bcrypt.adapter";
import { MagicLinkService } from "../services/magic-link.service";
import { AuthDB } from "../repositories/contracts";
import { AuthOptions, AuthType, IAuthMethods } from "../core/types";
import { IAuthStrategy, Mutable } from "./types";

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
    const service = new MagicLinkService(
      db.userRepo,
      db.magicLinkRepo,
      cryptoAdapter,
      auditLogger,
      options.magicLinkBaseUrl
    );

    target.magicLink = {
      request: (email: string, optionsOverride?: { correlationId?: string }) =>
        service.request(email, optionsOverride),
      verify: (token: string, optionsOverride?: { correlationId?: string }) =>
        service.verify(token, optionsOverride),
      consume: (token: string, optionsOverride?: { correlationId?: string }) =>
        service.consume(token, optionsOverride)
    };
  }
}
