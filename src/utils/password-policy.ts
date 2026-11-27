import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { IAuditLogger } from "../infra/security/types";
import { containsBlockedPasswords } from "./check-blocked-passwords";

/**
 * bcrypt truncates at 72 bytes, so anything longer is silently ignored rather than hashed.
 * Rejecting it is clearer than accepting a password whose tail does not count.
 */
export const MAX_PASSWORD_LENGTH = 72;

/** The weakest zxcvbn score accepted. */
export const MIN_PASSWORD_SCORE = 3;

/**
 * Why a password was refused. Callers map these to their own message and audit reason, which
 * differ between flows ("Password too weak" when signing up, "New password too weak" when
 * changing one), so the policy stays in one place while the wording stays per-flow.
 */
export type PasswordPolicyFailure =
  | "too_long"
  | "blocked"
  | "weak"
  | "breached"
  | "check_unavailable";

export type PasswordPolicyResult =
  | {
      ok: true;
      /**
       * Set when the breach lookup itself failed and the caller is running fail-open. The
       * password was accepted without a breach verdict, so the caller warns about it.
       */
      breachCheckError?: Error;
    }
  | { ok: false; code: PasswordPolicyFailure };

export type PasswordPolicyContext = {
  /** Checked against the password, so an address cannot be reused as one. */
  email: string;
  username: string;
  blockedPasswords?: string[];
  /** When set, a breach lookup that fails refuses the password instead of allowing it. */
  pwnedPasswordFailClosed?: boolean;
};

/**
 * Apply the shared password policy to a password a user is trying to set.
 *
 * Every flow that accepts a new password — signup, password change, password recovery —
 * runs exactly these checks, in this order, so none of them can drift into being weaker
 * than the others. The order matters: the cheap local checks run first and the remote breach
 * lookup last, so a password rejected on length or strength costs no network call.
 *
 * `logger` is passed through to the breach lookup, which warns on its own transport
 * failures. The caller still decides what to do with `breachCheckError`.
 */
export async function checkNewPassword(
  password: string,
  context: PasswordPolicyContext,
  logger?: Pick<IAuditLogger, "warn">
): Promise<PasswordPolicyResult> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, code: "too_long" };
  }

  if (
    containsBlockedPasswords(password, context.email, context.username, context.blockedPasswords)
  ) {
    return { ok: false, code: "blocked" };
  }

  if (zxcvbn(password).score < MIN_PASSWORD_SCORE) {
    return { ok: false, code: "weak" };
  }

  const breachCheck = await isBreachedPassword(password, logger);

  if (breachCheck.detected) {
    return { ok: false, code: "breached" };
  }

  if (breachCheck.error && context.pwnedPasswordFailClosed) {
    return { ok: false, code: "check_unavailable" };
  }

  return breachCheck.error ? { ok: true, breachCheckError: breachCheck.error } : { ok: true };
}
