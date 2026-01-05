import { AuthOptions } from "../types";
import { CredentialsAuthService } from "../authentication_methods/credentials/auth.service";
import { SessionService } from "../authentication_methods/credentials/session.service";
import { MagicLinkService } from "../authentication_methods/magic-links/magic-link.service";
import { IAuthManager } from "../interfaces";
import { DEFAULTS } from "../config/defaults";

/**
 * Initialize auth services based on the provided authTypes
 */
export async function initAuthServices(
  db: any,
  sessionTtl: number,
  options: AuthOptions
): Promise<Partial<IAuthManager>> {
  const result: Partial<IAuthManager> = {};
  const authTypes = options.authTypes ?? ["credentials"];
  const sessionService = new SessionService(db.sessionRepo, DEFAULTS.MAX_SESSIONS_PER_USER);

  // ---------------- Credentials ----------------
  if (authTypes.includes("credentials")) {
    const credentialsService = new CredentialsAuthService(
      db.userRepo,
      sessionService,
      sessionTtl
    );

    result.signup = (email, username, password) => credentialsService.signup(email, username, password);
    result.login = (email, password) => credentialsService.login(email, password);
    result.logout = (sessionId) => sessionService.destroy(sessionId);
    result.me = (sessionId) => sessionService.validate(sessionId, DEFAULTS.IDLE_TTL);
  }

  // ---------------- Magic Link ----------------
  if (authTypes.includes("magic-link")) {
    const magicLinkService =
      options.magicLinkService ?? new MagicLinkService(db.userRepo, db.magicLinkRepo);

    result.requestMagicLink = (email) => magicLinkService.request(email);
    result.consumeMagicLink = (token) => magicLinkService.consume(token);
  }

  return result;
}
