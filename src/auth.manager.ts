import { initAuthServices } from "./helpers/auth.service.init";
import { AuthOptions, IAuthManager } from "./types/index";

/**
 * Creates and initializes an instance of the AuthManager.
 * Returns the IAuthManager interface to consumers.
 */
export async function createAuthManager(options: AuthOptions): Promise<IAuthManager> {
  // Database
  if (!options.adapter) {
    throw new Error("Database adapter is required in AuthOptions");
  }
  const db = await options.adapter.connect(options);

  // Auth Services
  const services = initAuthServices(db, options);

  return Object.freeze(services) as IAuthManager;
}
