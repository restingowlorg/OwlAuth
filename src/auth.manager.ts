import { initDatabase } from "./helpers/database.init";
import { initAuthServices } from "./helpers/auth.service.init";
import { AuthOptions, IAuthManager } from "./types/index";

export class AuthManager implements IAuthManager {
  public readonly signup!: IAuthManager["signup"];
  public readonly login!: IAuthManager["login"];
  public readonly changePassword!: IAuthManager["changePassword"];
  public readonly requestMagicLink?: IAuthManager["requestMagicLink"];
  public readonly verifyMagicLink?: IAuthManager["verifyMagicLink"];
  public readonly consumeMagicLink?: IAuthManager["consumeMagicLink"];

  private constructor() {}

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // ---------------- Database ----------------
    const db = await initDatabase(options);

    // ---------------- Auth Services ----------------
    const services = initAuthServices(db, options);
    Object.assign(manager, services);

    return Object.freeze(manager);
  }
}

/**
 * Creates and initializes an instance of the AuthManager.
 * Returns the IAuthManager interface to consumers.
 */
export async function createAuthManager(options: AuthOptions): Promise<IAuthManager> {
  return await AuthManager.init(options);
}
