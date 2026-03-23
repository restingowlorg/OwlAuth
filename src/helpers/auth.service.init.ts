import { AuthService } from "../services/auth.service";
import { MagicLinkService } from "../services/magic-link.service";
import { IAuthManager } from "../types";
import { AuthDB, AuthOptions } from "../types/index";
import { authLog } from "../utils/logger";

export function initAuthServices(db: AuthDB, options: AuthOptions): Partial<IAuthManager> {
  const result: {
    signup?: IAuthManager["signup"];
    login?: IAuthManager["login"];
    changePassword?: IAuthManager["changePassword"];
    requestMagicLink?: IAuthManager["requestMagicLink"];
    verifyMagicLink?: IAuthManager["verifyMagicLink"];
    consumeMagicLink?: IAuthManager["consumeMagicLink"];
  } = {};
  const authTypes = options.authTypes ?? ["credentials"];

  authLog("info", `Initializing auth services for types: ${authTypes.join(", ")}`);

  // ---------------- CREDENTIALS AUTH ----------------
  if (authTypes.includes("credentials")) {
    const credentialsService = new AuthService(db.userRepo);

    result.signup = (email: string, username: string, password: string) =>
      credentialsService.signup(email, username, password, db.userRepo, options.blockedPasswords);

    result.login = (email: string, password: string) => credentialsService.login(email, password);

    result.changePassword = (
      userId: string | number,
      currentPassword: string,
      newPassword: string
    ) =>
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
    result.verifyMagicLink = (token: string) => magicLinkService.verify(token);
    result.consumeMagicLink = (token: string) => magicLinkService.consume(token);
  }

  return result;
}
