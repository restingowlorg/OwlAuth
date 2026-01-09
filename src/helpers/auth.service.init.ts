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
  const sessionService = new SessionService(
    db.sessionRepo,
    options.maxSessionsPerUser || DEFAULTS.MAX_SESSIONS_PER_USER
  );

  console.log(
    `ℹ️  Initializing auth services for types: ${authTypes.join(", ")}`
  );
  console.log(`ℹ️  Session TTL set to: ${sessionTtl} seconds`);
  console.log(
    `ℹ️  Idle TTL set to: ${
      options.idleTtlSeconds || DEFAULTS.IDLE_TTL
    } seconds`
  );
  console.log(
    `ℹ️  Max sessions per user: ${
      options.maxSessionsPerUser || DEFAULTS.MAX_SESSIONS_PER_USER
    }`
  );

  // ---------------- Credentials ----------------
  if (authTypes.includes("credentials")) {
    const credentialsService = new CredentialsAuthService(
      db.userRepo,
      sessionService,
      sessionTtl
    );

    result.signup = (email, username, password) =>
      credentialsService.signup(email, username, password);
    result.login = (email, password) =>
      credentialsService.login(email, password);
    result.logout = (sessionId) => sessionService.destroy(sessionId);
    result.me = (
      sessionId: string,
      idleTtlSeconds?: number,
      forceRotate?: boolean
    ) =>
      sessionService.validate(sessionId, options.idleTtlSeconds, forceRotate);

    result.changePassword = (req, currentPassword, newPassword) =>
      credentialsService.changePassword(req, currentPassword, newPassword);
  }

  // ---------------- Magic Link ----------------
  if (authTypes.includes("magic-link")) {
    const magicLinkService =
      options.magicLinkService ??
      new MagicLinkService(db.userRepo, db.magicLinkRepo);

    result.requestMagicLink = (email) => magicLinkService.request(email);
    result.consumeMagicLink = (token) => magicLinkService.consume(token);
  }

  return result;
}
