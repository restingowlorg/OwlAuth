import { randomBytes, createHash } from "crypto";
import { SessionRepository } from "../../repositories/contracts";
import { AuthResult } from "../../types";

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  // Generate a secure random token and hash it
  private generateToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("hex"); // 64 chars
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return { token, tokenHash };
  }

  // Create a session
  async create(userId: string, ttlSeconds: number): Promise<AuthResult> {
    try {
      const { token, tokenHash } = this.generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const session = await this.sessions.create({
        userId,
        tokenHash,
        expiresAt,
        lastUsedAt: now,
      });

      // Return raw token to client
      return {
        success: true,
        data: { session, token },
        message: "Session created",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: "Failed to create session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  // Validate session and extend idle timeout
  async validate(token: string, idleTtlSeconds?: number): Promise<AuthResult> {
    try {
      const tokenHash = createHash("sha256").update(token).digest("hex");

      const session = await this.sessions.findByTokenHash(tokenHash);

      if (!session) {
        return {
          success: false,
          data: null,
          message: "Session not found",
          httpCode: 404,
        };
      }

      if (session.revokedAt) {
        return {
          success: false,
          data: null,
          message: "Session revoked",
          httpCode: 401,
        };
      }

      if (session.expiresAt.getTime() < Date.now()) {
        return {
          success: false,
          data: null,
          message: "Session expired",
          httpCode: 401,
        };
      }

      // Extend idle timeout if provided
      if (idleTtlSeconds) {
        const newLastUsed = new Date();
        await this.sessions.updateLastUsed(tokenHash, newLastUsed);
        session.lastUsedAt = newLastUsed;
      }

      return {
        success: true,
        data: session,
        message: "Session valid",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: "Failed to validate session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  // Revoke session (logout)
  async destroy(token: string): Promise<AuthResult> {
    try {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await this.sessions.revokeByTokenHash(tokenHash);

      return {
        success: true,
        data: null,
        message: "Session revoked",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: "Failed to revoke session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }
}
