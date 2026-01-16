import { AuthOptions } from "../types";
import { CredentialsAuthService } from "../authentication_methods/credentials/auth.service";
import { MagicLinkService } from "../authentication_methods/magic-links/magic-link.service";
import { IAuthManager } from "../interfaces";
import { authLog } from "../utils/logger";

/**
 * Initialize auth services based on the provided authTypes
 */
export async function initAuthServices(
  db: any,
  options: AuthOptions
): Promise<Partial<IAuthManager>> {
  const result: Partial<IAuthManager> = {};
  const authTypes = options.authTypes ?? ["credentials"];

  authLog(
    "info",
    `Initializing auth services for types: ${authTypes.join(", ")}`
  );

  // ---------------- Credentials ----------------
  if (authTypes.includes("credentials")) {
    const credentialsService = new CredentialsAuthService(db.userRepo);

    result.signup = (email, username, password) =>
      credentialsService.signup(
        email,
        username,
        password,
        options.blockedPasswords
      );
    result.login = (email, password) =>
      credentialsService.login(email, password);

    result.changePassword = (req, currentPassword, newPassword) =>
      credentialsService.changePassword(
        req,
        currentPassword,
        newPassword,
        options.blockedPasswords
      );
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
