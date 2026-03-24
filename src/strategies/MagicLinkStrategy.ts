import { BcryptAdapter } from "../adapters/BcryptAdapter";
import { MagicLinkService } from "../services/magic-link.service";
import { AuthDB, AuthOptions, IAuthManager, IAuthStrategy, Mutable } from "../types";

export class MagicLinkAuthStrategy implements IAuthStrategy {
  register(target: Mutable<Partial<IAuthManager>>, db: AuthDB, options: AuthOptions): void {
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
