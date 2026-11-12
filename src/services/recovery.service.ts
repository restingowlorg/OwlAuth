import {
  AccountSecurityRepository,
  ActionTokenPurpose,
  ActionTokenRepository,
  MagicLinkRepository,
  UserRepository
} from "../repositories/contracts";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";
import { RecoveryDelivery } from "../core/types";
import { AuthResult, ConfirmRecoveryResult, RequestRecoveryResult } from "../types";
import { isAuthenticationPermitted } from "../utils/account-status";
import { PasswordPolicyFailure, checkNewPassword } from "../utils/password-policy";

/** Every token this service issues or accepts is bound to this purpose. */
const PURPOSE: ActionTokenPurpose = "password_recovery";

/** Bytes of randomness in each half of the token. 16 identifies, 32 authenticates. */
const SELECTOR_BYTES = 16;
const VERIFIER_BYTES = 32;

export const DEFAULT_RECOVERY_TTL_MINUTES = 15;
export const MIN_RECOVERY_TTL_MINUTES = 5;
export const MAX_RECOVERY_TTL_MINUTES = 60;

/**
 * Every rejected token gets this one response, whatever was wrong with it. Distinguishing
 * "no such token" from "expired" would tell an attacker which selectors exist.
 */
const INVALID_TOKEN_MESSAGE = "Invalid or expired recovery token";

type PolicyResponse = { reason: string; message: string; httpCode: number };

const RECOVERY_POLICY_FAILURES: Record<PasswordPolicyFailure, PolicyResponse> = {
  too_long: {
    reason: "Password exceeds maximum length",
    message: "Password must be 72 characters or less.",
    httpCode: 400
  },
  blocked: {
    reason: "New password contains blocked keywords",
    message: "New password cannot contain username, email, or blocked words",
    httpCode: 400
  },
  weak: { reason: "New password too weak", message: "New password too weak", httpCode: 400 },
  breached: {
    reason: "New password found in data breach",
    message: "New password found in data breach",
    httpCode: 400
  },
  check_unavailable: {
    reason: "Breached password check failed (Fail-Closed)",
    message: "Security check unavailable. Please try again later.",
    httpCode: 503
  }
};

export type RecoveryServiceConfig = {
  deliver: (delivery: RecoveryDelivery) => void | Promise<void>;
  baseUrl?: string;
  tokenTtlMinutes?: number;
};

/**
 * Password recovery: a way back in for someone who cannot authenticate with their password.
 *
 * Deliberately separate from magic-link login. A magic link *is* an authentication
 * credential; a recovery token authorises exactly one action, replacing the password, and
 * grants no session of its own. OwlAuth issues no bearer, access, refresh or JWT token here.
 */
export class RecoveryService {
  /**
   * Floor under every `request()` response.
   *
   * The work differs by a database write and a delivery call depending on whether the
   * address exists, so without a floor the duration itself would answer the question the
   * identical response body refuses to.
   */
  private static readonly MIN_REQUEST_RESPONSE_TIME_MS = 300;

  private readonly tokenTtlMs: number;

  constructor(
    private readonly users: UserRepository,
    private readonly actionTokens: ActionTokenRepository,
    private readonly crypto: ICryptoAdapter,
    private readonly logger: IAuditLogger,
    private readonly config: RecoveryServiceConfig,
    private readonly magicLinks?: MagicLinkRepository,
    private readonly accountSecurity?: AccountSecurityRepository
  ) {
    this.tokenTtlMs = (config.tokenTtlMinutes ?? DEFAULT_RECOVERY_TTL_MINUTES) * 60 * 1000;
  }

  /**
   * An account that may not authenticate may not recover either, exactly as it may not
   * rotate its own password. Recovery would otherwise be a way around a `disabled` status.
   */
  private async isRecoveryBlocked(userId: string): Promise<boolean> {
    if (!this.accountSecurity) return false;

    const accountState = await this.accountSecurity.findByUserId(userId);
    return !accountState || !isAuthenticationPermitted(accountState.status);
  }

  private async enforceMinimumRequestDuration(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    const remaining = RecoveryService.MIN_REQUEST_RESPONSE_TIME_MS - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  /** The one response every `request()` path returns, padded to the minimum duration. */
  private async acceptedResponse(startedAt: number): Promise<AuthResult<RequestRecoveryResult>> {
    await this.enforceMinimumRequestDuration(startedAt);

    return {
      success: true,
      data: null,
      message: "If an account exists for this email, recovery instructions have been sent.",
      httpCode: 202
    };
  }

  /**
   * Begin recovery. Always reports acceptance, whatever happened internally.
   *
   * Each path emits an audit event saying what really occurred, so an operator watching the
   * sink can tell an unknown address from a storage failure even though the caller cannot.
   */
  async request(
    email: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<RequestRecoveryResult>> {
    const startedAt = Date.now();

    try {
      const user = await this.users.findByEmail(email);

      if (!user) {
        // Comparable crypto work for an unknown address, so the floor is not the only thing
        // levelling the two paths.
        const decoy = this.crypto.generateToken(VERIFIER_BYTES);
        await this.crypto.hashToken(`${PURPOSE}:${decoy}`);

        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          email,
          metadata: { reason: "User not found" },
          correlationId: options?.correlationId
        });

        return await this.acceptedResponse(startedAt);
      }

      if (await this.isRecoveryBlocked(user.id)) {
        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          userId: user.id,
          email,
          metadata: { reason: "Account status does not permit recovery" },
          correlationId: options?.correlationId
        });

        return await this.acceptedResponse(startedAt);
      }

      // Supersede anything outstanding first. If that write does not land, issuing another
      // token would leave more live tokens than intended, so stop instead.
      const invalidated = await this.actionTokens.invalidateByUserId(user.id, PURPOSE);
      if (!invalidated) {
        this.logger.error(
          "Failed to invalidate existing recovery tokens",
          new Error("DB update failed"),
          { userId: user.id },
          options?.correlationId
        );
        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          userId: user.id,
          email,
          metadata: { reason: "Existing recovery token invalidation failed" },
          correlationId: options?.correlationId
        });

        return await this.acceptedResponse(startedAt);
      }

      const selector = this.crypto.generateToken(SELECTOR_BYTES);
      const verifier = this.crypto.generateToken(VERIFIER_BYTES);
      const tokenHash = await this.crypto.hashToken(`${PURPOSE}:${verifier}`);
      const expiresAt = new Date(Date.now() + this.tokenTtlMs);

      const record = await this.actionTokens.create({
        userId: user.id,
        purpose: PURPOSE,
        selector,
        tokenHash,
        expiresAt
      });

      if (!record) {
        this.logger.error(
          "Failed to create recovery token",
          new Error("DB insert failed"),
          { userId: user.id },
          options?.correlationId
        );
        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          userId: user.id,
          email,
          metadata: { reason: "Recovery token storage failed" },
          correlationId: options?.correlationId
        });

        return await this.acceptedResponse(startedAt);
      }

      this.logger.audit({
        type: "PASSWORD_RECOVERY_REQUESTED",
        userId: user.id,
        email: user.email,
        correlationId: options?.correlationId
      });

      await this.deliverToken(
        {
          userId: user.id,
          email: user.email,
          token: `${selector}.${verifier}`,
          ...(this.config.baseUrl
            ? { url: `${this.config.baseUrl}?token=${selector}.${verifier}` }
            : {}),
          expiresAt,
          ...(options?.correlationId ? { correlationId: options.correlationId } : {})
        },
        user.id,
        email
      );

      return await this.acceptedResponse(startedAt);
    } catch (err: unknown) {
      this.logger.error("Recovery request exception", err, { email }, options?.correlationId);
      // A fixed reason: the error message may carry internals and is kept to diagnostics.
      this.logger.audit({
        type: "PASSWORD_RECOVERY_FAILURE",
        email,
        metadata: { reason: "Internal error" },
        correlationId: options?.correlationId
      });

      return await this.acceptedResponse(startedAt);
    }
  }

  /**
   * Hand the token to the application, containing anything the callback does wrong.
   *
   * The token is already stored, so a delivery failure is reported and left at that: the
   * caller still gets the standard response, and the user simply never receives a message.
   */
  private async deliverToken(
    delivery: RecoveryDelivery,
    userId: string,
    email: string
  ): Promise<void> {
    try {
      await this.config.deliver(delivery);
    } catch (err: unknown) {
      this.logger.error("Recovery delivery failed", err, { userId }, delivery.correlationId);
      this.logger.audit({
        type: "PASSWORD_RECOVERY_FAILURE",
        userId,
        email,
        metadata: { reason: "Recovery delivery failed" },
        correlationId: delivery.correlationId
      });
    }
  }

  /**
   * A token is `selector.verifier`. Splitting on the first separator only means a verifier
   * that somehow contains one cannot change which row is looked up.
   */
  private parseToken(token: string): { selector: string; verifier: string } | null {
    if (!token) return null;

    const separator = token.indexOf(".");
    if (separator <= 0 || separator === token.length - 1) return null;

    return {
      selector: token.slice(0, separator),
      verifier: token.slice(separator + 1)
    };
  }

  private rejectToken(
    reason: string,
    options?: { correlationId?: string },
    userId?: string
  ): AuthResult<ConfirmRecoveryResult> {
    this.logger.audit({
      type: "PASSWORD_RECOVERY_FAILURE",
      ...(userId ? { userId } : {}),
      metadata: { reason },
      correlationId: options?.correlationId
    });

    return {
      success: false,
      data: undefined,
      message: INVALID_TOKEN_MESSAGE,
      httpCode: 400
    };
  }

  /**
   * Finish recovery: verify the token, apply the password policy, then replace the password.
   *
   * The order is deliberate. The policy runs *before* the token is spent, so a password
   * rejected as weak leaves the token usable and the user can try again with a better one.
   * The hash is computed before the token is spent too, keeping the slow work outside the
   * window in which two concurrent requests race.
   */
  async confirm(
    token: string,
    newPassword: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ): Promise<AuthResult<ConfirmRecoveryResult>> {
    try {
      const parsed = this.parseToken(token);
      if (!parsed) {
        return this.rejectToken("Malformed token", options);
      }

      const record = await this.actionTokens.findBySelector(parsed.selector, PURPOSE);

      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        const reason = !record
          ? "Token not found"
          : record.usedAt
            ? "Token already used"
            : "Token expired";

        return this.rejectToken(reason, options, record?.userId);
      }

      // Finding the row proves nothing: only the hash of the secret half was stored.
      const match = await this.crypto.verifyToken(
        `${PURPOSE}:${parsed.verifier}`,
        record.tokenHash
      );
      if (!match) {
        return this.rejectToken("Token mismatch", options, record.userId);
      }

      if (await this.isRecoveryBlocked(record.userId)) {
        // Denied before consuming, so the token is left untouched, and answered with the
        // same response as a bad token so nothing about the account's status is revealed.
        return this.rejectToken("Account status does not permit recovery", options, record.userId);
      }

      const user = await this.users.findById(record.userId);
      if (!user) {
        return this.rejectToken("User not found", options, record.userId);
      }

      const policy = await checkNewPassword(
        newPassword,
        {
          email: user.email,
          username: user.username,
          blockedPasswords: options?.blockedPasswords,
          pwnedPasswordFailClosed: options?.pwnedPasswordFailClosed
        },
        this.logger
      );

      if (!policy.ok) {
        // The token is deliberately left unspent so the user can retry with a better
        // password rather than having to request a new message.
        const failure = RECOVERY_POLICY_FAILURES[policy.code];
        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          userId: user.id,
          metadata: { reason: failure.reason },
          correlationId: options?.correlationId
        });

        return {
          success: false,
          data: undefined,
          message: failure.message,
          httpCode: failure.httpCode
        };
      }

      if (policy.breachCheckError) {
        this.logger.warn(
          "PwnedPassword check failed (system is fail-open). Proceeding with recovery.",
          { userId: user.id, error: policy.breachCheckError.message },
          options?.correlationId
        );
      }

      const newHash = await this.crypto.hashPassword(newPassword);

      // The one gate that decides the race: whoever wins this write resets the password.
      const consumed = await this.actionTokens.consume(parsed.selector, PURPOSE);
      if (!consumed) {
        return this.rejectToken("Token already used (race)", options, user.id);
      }

      const updated = await this.users.updatePassword(user.id, newHash);
      if (!updated) {
        // The token is already spent. That fails safe: the password stands and the user has
        // to request a new recovery message rather than retrying with a burnt token.
        this.logger.error(
          "Password update failed during recovery",
          new Error("Database update returned false"),
          { userId: user.id },
          options?.correlationId
        );
        this.logger.audit({
          type: "PASSWORD_RECOVERY_FAILURE",
          userId: user.id,
          metadata: { reason: "Password update failed" },
          correlationId: options?.correlationId
        });

        return {
          success: false,
          data: undefined,
          message: "Failed to update password",
          httpCode: 500
        };
      }

      await this.invalidateRemainingTokens(user.id, options?.correlationId);
      const magicLinksInvalidated = await this.invalidateMagicLinks(
        user.id,
        options?.correlationId
      );

      if (magicLinksInvalidated) {
        this.logger.audit({
          type: "SESSION_INVALIDATION",
          userId: user.id,
          metadata: { reason: "Password recovered" },
          correlationId: options?.correlationId
        });
      }

      this.logger.audit({
        type: "PASSWORD_RECOVERY_COMPLETED",
        userId: user.id,
        metadata: { magicLinksInvalidated },
        correlationId: options?.correlationId
      });

      return {
        success: true,
        data: { userId: user.id, magicLinksInvalidated },
        message: "Password updated successfully",
        httpCode: 200
      };
    } catch (err: unknown) {
      // Unlike signup, the error text is not echoed to the caller: this endpoint is reached
      // with an attacker-supplied token, so internals stay in diagnostics.
      this.logger.error("Recovery confirm exception", err, undefined, options?.correlationId);
      this.logger.audit({
        type: "PASSWORD_RECOVERY_FAILURE",
        metadata: { reason: "Internal error" },
        correlationId: options?.correlationId
      });

      return {
        success: false,
        data: undefined,
        message: "Failed to complete password recovery",
        httpCode: 500
      };
    }
  }

  /**
   * Retire the user's other recovery tokens once one has been redeemed. Best-effort: the
   * password is already changed, and every remaining token still expires on its own.
   */
  private async invalidateRemainingTokens(userId: string, correlationId?: string): Promise<void> {
    try {
      const invalidated = await this.actionTokens.invalidateByUserId(userId, PURPOSE);
      if (!invalidated) {
        this.logger.warn(
          "Failed to invalidate remaining recovery tokens after recovery.",
          { userId },
          correlationId
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        "Failed to invalidate remaining recovery tokens after recovery.",
        { userId, error: err instanceof Error ? err.message : "Unknown error" },
        correlationId
      );
    }
  }

  /**
   * Retire outstanding magic links, since a recovered password must not leave an older
   * passwordless route in. Best-effort, as it is after a password change.
   */
  private async invalidateMagicLinks(userId: string, correlationId?: string): Promise<boolean> {
    if (!this.magicLinks) return false;

    try {
      const invalidated = await this.magicLinks.invalidateByUserId(userId);
      if (!invalidated) {
        this.logger.warn(
          "Magic link invalidation returned false after recovery. Links may still be valid.",
          { userId },
          correlationId
        );
      }
      return invalidated;
    } catch (err: unknown) {
      this.logger.warn(
        "Failed to invalidate magic links after recovery. Proceeding without invalidation.",
        { userId, error: err instanceof Error ? err.message : "Unknown error" },
        correlationId
      );
      return false;
    }
  }
}
