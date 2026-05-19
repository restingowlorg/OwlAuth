import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";
import {
  AuthResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "../types/index";

export class MagicLinkService {
  private static readonly MIN_REQUEST_RESPONSE_TIME_MS = 300;

  constructor(
    private users: UserRepository,
    private magicLinks: MagicLinkRepository,
    private crypto: ICryptoAdapter,
    private logger: IAuditLogger,
    private magicLinkBaseUrl?: string
  ) {}

  /** Request a magic link (passwordless login) */
  async request(
    email: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<RequestMagicLinkResult>> {
    const startedAt = Date.now();

    try {
      const user = await this.users.findByEmail(email);

      if (!user) {
        // Simulate comparable crypto work for unknown accounts.
        const pseudoToken = this.crypto.generateToken();
        await this.crypto.hashToken(pseudoToken);

        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "User not found" },
          correlationId: options?.correlationId
        });

        await this.enforceMinimumRequestDuration(startedAt);

        // Return the same response as a successful request to prevent email enumeration.
        return {
          success: true,
          data: "",
          message: "If this email is registered, a magic link has been sent.",
          httpCode: 200
        };
      }

      const token = this.crypto.generateToken();
      const tokenHash = await this.crypto.hashToken(token);
      const lookupKey = token.substring(0, 16);

      // invalidate existing tokens for this user
      const invalidated = await this.magicLinks.invalidateByUserId(user.id);
      if (!invalidated) {
        this.logger.error(
          "Failed to invalidate magic links",
          new Error("DB update failed"),
          undefined,
          options?.correlationId
        );
        return {
          success: false,
          data: undefined,
          message: "Failed to invalidate existing magic links",
          httpCode: 500
        };
      }

      // create new token
      const record = await this.magicLinks.create({
        userId: user.id,
        lookupKey,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      if (!record) {
        this.logger.error(
          "Failed to create magic link",
          new Error("DB insert failed"),
          undefined,
          options?.correlationId
        );
        return {
          success: false,
          data: undefined,
          message: "Failed to create magic link",
          httpCode: 500
        };
      }

      this.logger.audit({
        type: "MAGIC_LINK_REQUESTED",
        userId: user.id,
        email: user.email,
        correlationId: options?.correlationId
      });

      const data = this.magicLinkBaseUrl ? `${this.magicLinkBaseUrl}?token=${token}` : token;

      await this.enforceMinimumRequestDuration(startedAt);

      return {
        success: true,
        data,
        message: "If this email is registered, a magic link has been sent.",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error("Magic link request exception", err, { email }, options?.correlationId);

      await this.enforceMinimumRequestDuration(startedAt);

      return {
        success: false,
        data: undefined,
        message: "Failed to request magic link: " + message,
        httpCode: 500
      };
    }
  }

  private async enforceMinimumRequestDuration(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    const remaining = MagicLinkService.MIN_REQUEST_RESPONSE_TIME_MS - elapsed;

    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  /** Verify a magic link token without consuming it */
  async verify(
    token: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<VerifyMagicLinkResult>> {
    try {
      if (!token || token.length < 16) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Malformed token" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or malformed magic link token",
          httpCode: 400
        };
      }

      const lookupKey = token.substring(0, 16);
      const record = await this.magicLinks.findByLookupKey(lookupKey);

      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Invalid or expired token" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      const match = await this.crypto.verifyToken(token, record.tokenHash);
      if (!match) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Token mismatch" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      this.logger.audit({
        type: "MAGIC_LINK_VERIFIED",
        userId: record.userId,
        correlationId: options?.correlationId
      });

      return {
        success: true,
        data: { isValid: true, userId: String(record.userId), lookupKey: String(record.lookupKey) },
        message: "Magic link is valid",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error("Magic link verify exception", err, undefined, options?.correlationId);
      return {
        success: false,
        data: undefined,
        message: "Failed to verify magic link: " + message,
        httpCode: 500
      };
    }
  }

  async consume(
    token: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<ConsumeMagicLinkResult>> {
    try {
      if (!token || token.length < 16) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Malformed token" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or malformed magic link token",
          httpCode: 400
        };
      }

      const lookupKey = token.substring(0, 16);
      const record = await this.magicLinks.findByLookupKey(lookupKey);

      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        const reason = !record
          ? "Token not found"
          : record.usedAt
            ? "Token already used"
            : "Token expired";

        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      const match = await this.crypto.verifyToken(token, record.tokenHash);
      if (!match) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Token mismatch" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      const consumed = await this.magicLinks.consume(lookupKey);

      if (!consumed) {
        // This handles race conditions where the token was consumed between our read and update
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Token already used (race)" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Magic link already used",
          httpCode: 401
        };
      }

      this.logger.audit({
        type: "MAGIC_LINK_CONSUMED",
        userId: record.userId,
        correlationId: options?.correlationId
      });
      this.logger.audit({
        type: "LOGIN_SUCCESS",
        userId: record.userId,
        metadata: { method: "magic-link" },
        correlationId: options?.correlationId
      });

      return {
        success: true,
        data: { userId: String(record.userId) },
        message: "Magic link consumed",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error("Magic link consume exception", err, undefined, options?.correlationId);

      return {
        success: false,
        data: undefined,
        message: "Failed to consume magic link: " + message,
        httpCode: 500
      };
    }
  }
}
