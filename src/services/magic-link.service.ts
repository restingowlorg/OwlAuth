import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { ICryptoAdapter } from "../types";
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
    private crypto: ICryptoAdapter
  ) {}

  /** Request a magic link (passwordless login) */
  async request(email: string): Promise<AuthResult<RequestMagicLinkResult>> {
    try {
      const user = await this.users.findByEmail(email);

      if (!user) {
        return {
          success: false,
          data: undefined,
          message: "User not found",
          httpCode: 404
        };
      }

      const token = this.crypto.generateToken();
      const tokenHash = await this.crypto.hashToken(token);

      // invalidate existing tokens for this user
      const invalidated = await this.magicLinks.invalidateByUserId(user.id);
      if (!invalidated) {
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
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      if (!record) {
        return {
          success: false,
          data: undefined,
          message: "Failed to create magic link",
          httpCode: 500
        };
      }

      return {
        success: true,
        data: `${record.id}.${token}`,
        message: "Magic link created",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: undefined,
        message: "Failed to request magic link: " + message,
        httpCode: 500
      };
    }
  }

  /** Verify a magic link token without consuming it */
  async verify(token: string): Promise<AuthResult<VerifyMagicLinkResult>> {
    try {
      const parts = token.split(".");
      if (parts.length !== 2) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or malformed magic link token",
          httpCode: 400
        };
      }

      const [tokenId, tokenValue] = parts;
      const record = await this.magicLinks.findById(tokenId);

      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      const match = await this.crypto.verifyToken(tokenValue, record.tokenHash);
      if (!match) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      return {
        success: true,
        data: { isValid: true, userId: String(record.userId), tokenId: String(record.id) },
        message: "Magic link is valid",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        data: undefined,
        message: "Failed to verify magic link: " + message,
        httpCode: 500
      };
    }
  }

  /** Consume a magic link token */
  async consume(token: string): Promise<AuthResult<ConsumeMagicLinkResult>> {
    try {
      const verifyResult = await this.verify(token);

      if (!verifyResult.success) {
        return {
          success: false,
          data: undefined,
          message: verifyResult.message,
          httpCode: verifyResult.httpCode
        };
      }

      const consumed = await this.magicLinks.consume(verifyResult.data.tokenId);

      if (!consumed) {
        return {
          success: false,
          message: "Magic link already used",
          httpCode: 401
        };
      }

      return {
        success: true,
        data: { userId: verifyResult.data.userId },
        message: "Magic link consumed",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: undefined,
        message: "Failed to consume magic link: " + message,
        httpCode: 500
      };
    }
  }
}
