import { UserRepository, MagicLinkRepository } from "../repositories/contracts";
import { hashToken, verifyToken, generateToken } from "../infra/crypto/crypto";
import { AuthResult, RequestMagicLinkResult, ConsumeMagicLinkResult } from "../types/index";

export class MagicLinkService {
  constructor(
    private users: UserRepository,
    private magicLinks: MagicLinkRepository
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

      const token = generateToken();
      const tokenHash = await hashToken(token);

      // delete existing tokens for this user
      await this.magicLinks.deleteByUserId(user.id);

      // create new token
      const record = await this.magicLinks.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

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

  /** Consume a magic link token */
  async consume(token: string): Promise<AuthResult<ConsumeMagicLinkResult>> {
    try {
      // split token into id and value
      const parts = token.split(".");

      // check if token is valid
      if (parts.length !== 2) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or malformed magic link token",
          httpCode: 400
        };
      }

      // get token from database
      const [tokenId, tokenValue] = parts;
      const record = await this.magicLinks.findById(tokenId);

      // check if token is used or not exists
      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      // verify token
      const match = await verifyToken(tokenValue, record.tokenHash);

      if (!match) {
        return {
          success: false,
          data: undefined,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      await this.magicLinks.markUsed(record.id);

      return {
        success: true,
        data: { userId: String(record.userId) },
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
