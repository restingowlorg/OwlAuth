import { AuthOptions } from "./types";
import { initDatabase } from "./helpers/database.init";
import { IAuthManager } from "./interfaces";
import { initAuthServices } from "./helpers/auth.service.init";

export class AuthManager implements IAuthManager {
  public signup!: IAuthManager["signup"];
  public login!: IAuthManager["login"];
  public requestMagicLink?: IAuthManager["requestMagicLink"];
  public consumeMagicLink?: IAuthManager["consumeMagicLink"];

  private constructor() {}

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // ---------------- Database ----------------
    const db = await initDatabase(options);

    // ---------------- Auth Services ----------------
    const services = initAuthServices(db, options);
    Object.assign(manager, services);

    return manager;
  }
}
