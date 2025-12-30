import { AuthDB, AuthOptions, AuthResult } from "./types";

import { DEFAULTS } from "./config/defaults";
import { AuthService } from "./authentication_methods/credentials/auth.service";
import { SessionService } from "./authentication_methods/credentials/session.service";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";
import { initDatabase } from "./helpers/database.init";

/* -------------------------------------------------------------------------- */
/*                                AUTH MANAGER                                */
/* -------------------------------------------------------------------------- */

export class AuthManager {
  public signup!: (email: string, username: string, password: string) => Promise<AuthResult>;
  public login!: (email: string, password: string) => Promise<AuthResult>;
  public logout!: (sessionId: string) => Promise<AuthResult>;
  public me!: (sessionId: number) => Promise<AuthResult>;
  public requestMagicLink?: (email: string) => Promise<AuthResult>;
  public consumeMagicLink?: (token: string) => Promise<AuthResult>;

  private db!: AuthDB;
  private sessionTtl!: number;

  private constructor() {}

  /* -------------------------------------------------------------------------- */
  /*                                  INIT                                      */
  /* -------------------------------------------------------------------------- */

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // Initialize Database
    manager.db = await initDatabase(options);

    /* ------------------------------ Config -------------------------------- */

    manager.sessionTtl = options.sessionTtlSeconds ?? DEFAULTS.SESSION_TTL;
    const authTypes = options.authTypes ?? ["credentials"];

    /* -------------------------------------------------------------------------- */
    /*                              CREDENTIAL AUTH                               */
    /* -------------------------------------------------------------------------- */

    if (authTypes.includes("credentials")) {
      manager.signup = (email: string, username: string, password: string) => {
        return AuthService.signup(email, username, password, manager.db.userRepo);
      };

      manager.login = (email: string, password: string) =>
        AuthService.login(
          email,
          password,
          manager.db.userRepo,
          manager.db.sessionRepo,
          manager.sessionTtl
        );

      manager.logout = (sessionId: string) =>
        SessionService.destroy(sessionId, manager.db.sessionRepo);

      manager.me = (sessionId: number) =>
        SessionService.validate(sessionId, manager.db.sessionRepo);
    }

    /* -------------------------------------------------------------------------- */
    /*                               MAGIC LINK AUTH                              */
    /* -------------------------------------------------------------------------- */

    if (authTypes.includes("magic-link")) {
      const magicLinkService =
        options.magicLinkService ??
        (manager.db.magicLinkRepo
          ? new MagicLinkService(manager.db.userRepo, manager.db.magicLinkRepo)
          : undefined);

      if (magicLinkService) {
        manager.requestMagicLink = (email: string) => magicLinkService.request(email);

        manager.consumeMagicLink = (token: string) => magicLinkService.consume(token);
      }
    }

    return manager;
  }
}
