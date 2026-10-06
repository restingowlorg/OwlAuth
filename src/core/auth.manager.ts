import { initAuthServices } from "./auth.service.init";
import { AuthOptions, AuthType, IAuthManager } from "./types";

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
  //
  // The adapter is connected by this point and this function owns it, so anything thrown
  // while wiring up services must release it first. Without this a caller that catches and
  // retries initialisation leaks one pool or socket per attempt.
  let services;
  try {
    services = initAuthServices(db, options as AuthOptions<AuthType>);
  } catch (error) {
    // A failure to close must not mask the configuration error that caused it.
    await db.close().catch(() => undefined);
    throw error;
  }

  return Object.freeze({
    ...services,
    disconnectDB: db.close
  }) as IAuthManager<T>;
}
