import { initDatabase } from "./helpers/database.init";
import { IAuthManager } from "./interfaces/index";
import { initAuthServices } from "./helpers/auth.service.init";
import { AuthOptions } from "./types/index";

export class AuthManager implements IAuthManager {
  public signup!: IAuthManager["signup"];
  public login!: IAuthManager["login"];
  public changePassword!: IAuthManager["changePassword"];
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

/**
 * Creates and initializes an instance of the AuthManager.
 * Returns the IAuthManager interface to consumers.
 */
export async function createAuthManager(options: AuthOptions): Promise<IAuthManager> {
  return await AuthManager.init(options);
}
