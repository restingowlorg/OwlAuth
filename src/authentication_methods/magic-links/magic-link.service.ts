import {
  UserRepository,
  MagicLinkRepository,
} from "../../repositories/contracts";
import {
  hashToken,
  verifyToken,
  generateToken,
} from "../../infra/crypto/crypto";
import { AuthResult } from "../../types";

export class MagicLinkService {
  constructor(
    private users: UserRepository,
    private magicLinks: MagicLinkRepository
  ) {}

  /** Request a magic link (passwordless login) */
  async request(email: string): Promise<AuthResult> {
    try {
      const user = await this.users.findByEmail(email);
      if (!user)
        return {
          success: false,
          data: null,
          message: "User not found",
          httpCode: 404,
        };

      const token = generateToken();
      const tokenHash = await hashToken(token);

      await this.magicLinks.create({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      });

      return {
        success: true,
        data: token,
        message: "Magic link created",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message:
          "Failed to request magic link: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  /** Consume a magic link token */
  async consume(token: string): Promise<AuthResult> {
    try {
      const records = await this.magicLinks.findAll();

      let record: any = null;

      for (const r of records) {
        if (r.usedAt) continue;
        const match = await verifyToken(token, r.tokenHash);
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
          httpCode: 401,
        };
      }

      if (record.expiresAt.getTime() < Date.now()) {
        return {
          success: false,
          data: null,
          message: "Magic link expired",
          httpCode: 401,
        };
      }

      await this.magicLinks.markUsed(record.id);

      return {
        success: true,
        data: { userId: record.userId.toString() },
        message: "Magic link consumed",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message:
          "Failed to consume magic link: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }
}
