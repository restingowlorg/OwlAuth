import { AccountStatus } from "../repositories/contracts";

/**
 * Statuses that permit authentication. Everything else is denied, including `disabled`
 * and any value not recognised by this version of the library.
 */
const AUTHENTICATION_PERMITTED_STATUSES: ReadonlySet<string> = new Set<AccountStatus>([
  "active",
  "pending_email_verification"
]);

/**
 * Allow-list check for a stored account status.
 *
 * Repositories read `status` from the datastore and cast it to `AccountStatus`, but no
 * cast can guarantee what a database actually holds. A column without a constraint
 * accepts any string, so a typo (`"disable"`), a case mismatch (`"DISABLED"`), or a
 * status written by a newer version of the library can all appear here.
 *
 * Matching `"disabled"` alone would treat every one of those as permitted, silently
 * re-enabling an account an administrator intended to suspend. Checking against the
 * permitted values instead means an unrecognised status denies authentication.
 */
export function isAuthenticationPermitted(status: string): boolean {
  return AUTHENTICATION_PERMITTED_STATUSES.has(status);
}
