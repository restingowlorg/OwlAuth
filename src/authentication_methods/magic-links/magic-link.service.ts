import { UserRepository, MagicLinkRepository } from "../../repositories/contracts";
import { hashToken, verifyToken, generateToken } from "../../infra/crypto/crypto";
import { AuthResult } from "../../types";
import { MagicLinkRow } from "../../types";

export class MagicLinkService {
  constructor(
    private users: UserRepository,
    private magicLinks: MagicLinkRepository
  ) {}

  /** Request a magic link (passwordless login) */
  async request(email: string): Promise<AuthResult> {
    try {
      const user = await this.users.findByEmail(email);

      if (!user) {
        return {
          success: false,
          data: null,
          message: "User not found",
          httpCode: 404
        };
      }

      const token = generateToken();
      const tokenHash = await hashToken(token);

      await this.magicLinks.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      return {
        success: true,
        data: token,
        message: "Magic link created",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: null,
        message: "Failed to request magic link: " + message,
        httpCode: 500
      };
    }
  }

  /** Consume a magic link token */
  async consume(token: string): Promise<AuthResult> {
    try {
      const records = await this.magicLinks.findAll();

      let record: MagicLinkRow | null = null;

      for (const r of records) {
        if (r.used_at) continue;

        const match = await verifyToken(token, r.token);

        if (match) {
          record = r;
          break;
        }
      }

      if (!record) {
        return {
          success: false,
          data: null,
          message: "Invalid or expired magic link",
          httpCode: 401
        };
      }

      if (record.expires_at.getTime() < Date.now()) {
        return {
          success: false,
          data: null,
          message: "Magic link expired",
          httpCode: 401
        };
      }

      await this.magicLinks.markUsed(record.id);

      return {
        success: true,
        data: { userId: String(record.user_id) },
        message: "Magic link consumed",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: null,
        message: "Failed to consume magic link: " + message,
        httpCode: 500
      };
    }
  }
}
