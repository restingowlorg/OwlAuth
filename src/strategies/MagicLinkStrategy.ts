import { BcryptAdapter } from "../infra/security/bcrypt.adapter";
import { MagicLinkService } from "../services/magic-link.service";
import { AuthDB, AuthOptions, AuthType, IAuthMethods, IAuthStrategy, Mutable } from "../types";

export class MagicLinkAuthStrategy implements IAuthStrategy {
  register(
    target: Mutable<Partial<IAuthMethods>>,
    db: AuthDB,
    options: AuthOptions<AuthType>
  ): void {
    if (!db.magicLinkRepo) return; // Silent skip if repo doesn't exist

    const cryptoAdapter = options.cryptoAdapter ?? new BcryptAdapter();
    const service = new MagicLinkService(db.userRepo, db.magicLinkRepo, cryptoAdapter);

    target.magicLink = {
      request: (email: string) => service.request(email),
      verify: (token: string) => service.verify(token),
      consume: (token: string) => service.consume(token)
    };
  }
}
