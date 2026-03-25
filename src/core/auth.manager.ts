import { initAuthServices } from "./auth.service.init";
import { AuthOptions, IAuthManager, AuthType } from "../types/index";

/**
 * Creates and initializes an instance of the AuthManager.
 * Returns the IAuthManager interface to consumers.
 */
export async function createAuthManager<T extends AuthType = "credentials">(
  options: AuthOptions<T>
): Promise<IAuthManager<T>> {
  // Database
  if (!options.adapter) {
    throw new Error("[Auth:createAuthManager] Database adapter is required in AuthOptions");
  }
  const db = await options.adapter.connect(options as AuthOptions<AuthType>);

  // Auth Services
  const services = initAuthServices(db, options as AuthOptions<AuthType>);

  return Object.freeze({
    ...services,
    disconnectDB: db.close
  }) as IAuthManager<T>;
}
