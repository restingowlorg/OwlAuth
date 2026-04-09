import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";
import {
  AuthResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "../types/index";

export class MagicLinkService {
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
    try {
      const user = await this.users.findByEmail(email);

      if (!user) {
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "User not found" },
          correlationId: options?.correlationId
        });
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
        email: user.email,
        correlationId: options?.correlationId
      });

      const data = this.magicLinkBaseUrl ? `${this.magicLinkBaseUrl}?token=${token}` : token;

      return {
        success: true,
        data,
        message: "Magic link created",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error("Magic link request exception", err, { email }, options?.correlationId);

      return {
        success: false,
        data: undefined,
        message: "Failed to request magic link: " + message,
        httpCode: 500
      };
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

      this.logger.audit({ type: "MAGIC_LINK_VERIFIED", correlationId: options?.correlationId });

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

  /** Consume a magic link token */
  async consume(
    token: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<ConsumeMagicLinkResult>> {
    try {
      const verifyResult = await this.verify(token, options);

      if (!verifyResult.success) {
        return {
          success: false,
          data: undefined,
          message: verifyResult.message,
          httpCode: verifyResult.httpCode
        };
      }

      const consumed = await this.magicLinks.consume(verifyResult.data.lookupKey);

      if (!consumed) {
        this.logger.error(
          "Failed to consume magic link",
          new Error("DB update failed"),
          undefined,
          options?.correlationId
        );
        this.logger.audit({
          type: "MAGIC_LINK_FAILURE",
          metadata: { reason: "Token already used" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Magic link already used",
          httpCode: 401
        };
      }

      this.logger.audit({ type: "MAGIC_LINK_CONSUMED", correlationId: options?.correlationId });
      this.logger.audit({
        type: "LOGIN_SUCCESS",
        metadata: { method: "magic-link" },
        correlationId: options?.correlationId
      });

      return {
        success: true,
        data: { userId: verifyResult.data.userId },
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
