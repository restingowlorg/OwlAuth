import { AuthOptions } from "./types";
import { DEFAULTS } from "./config/defaults";
import { initDatabase } from "./helpers/database.init";
import { IAuthManager } from "./interfaces";
import { initAuthServices } from "./helpers/auth.service.init";

export class AuthManager implements IAuthManager {
  public signup!: IAuthManager["signup"];
  public login!: IAuthManager["login"];
  public logout!: IAuthManager["logout"];
  public me!: IAuthManager["me"];
  public requestMagicLink?: IAuthManager["requestMagicLink"];
  public consumeMagicLink?: IAuthManager["consumeMagicLink"];

  private sessionTtl!: number;

  private constructor() {}

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // ---------------- Database ----------------
    const db = await initDatabase(options);
    manager.sessionTtl = options.sessionTtlSeconds ?? DEFAULTS.SESSION_TTL;

    // ---------------- Auth Services ----------------
    const services = await initAuthServices(db, manager.sessionTtl, options);
    Object.assign(manager, services);

    return manager;
  }
}
