import { AuthService } from "../services/auth.service";
import { MagicLinkService } from "../services/magic-link.service";
import { IAuthManager } from "../interfaces";
import { AuthDB, AuthOptions } from "../types/index";
import { authLog } from "../utils/logger";

/* -------------------------------------------------------------------------- */
export function initAuthServices(db: AuthDB, options: AuthOptions): Partial<IAuthManager> {
  const result: Partial<IAuthManager> = {};
  const authTypes = options.authTypes ?? ["credentials"];

  authLog("info", `Initializing auth services for types: ${authTypes.join(", ")}`);

  // ---------------- CREDENTIALS AUTH ----------------
  if (authTypes.includes("credentials")) {
    const credentialsService = new AuthService(db.userRepo);

    result.signup = (email, username, password) =>
      credentialsService.signup(email, username, password, db.userRepo, options.blockedPasswords);

    result.login = (email, password) => credentialsService.login(email, password);

    result.changePassword = (userId, currentPassword, newPassword) =>
      credentialsService.changePassword(
        userId,
        currentPassword,
        newPassword,
        db.userRepo,
        options.blockedPasswords
      );
  }

  // ---------------- MAGIC LINK AUTH ----------------
  if (authTypes.includes("magic-link") && db.magicLinkRepo) {
    const magicLinkService =
      options.magicLinkService ?? new MagicLinkService(db.userRepo, db.magicLinkRepo);

    result.requestMagicLink = (email: string) => magicLinkService.request(email);

    result.consumeMagicLink = (token: string) => magicLinkService.consume(token);
  }

  return result;
}
