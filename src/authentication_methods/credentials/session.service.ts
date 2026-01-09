import { randomBytes, createHash } from "crypto";
import { SessionRepository } from "../../repositories/contracts";
import { AuthResult } from "../../types";

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly maxSessionsPerUser?: number
  ) {}

  // Generate a secure random token and hash it
  private generateToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString("hex"); // 64 chars
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return { token, tokenHash };
  }

  // Create a session
  async create(userId: string, ttlSeconds: number): Promise<AuthResult> {
    try {
      if (this.maxSessionsPerUser && this.maxSessionsPerUser > 0) {
        await this.sessions.revokeOldestForUser(
          userId,
          this.maxSessionsPerUser - 1
        );
      }

      const { token, tokenHash } = this.generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const session = await this.sessions.create({
        userId,
        tokenHash,
        expiresAt,
        lastUsedAt: now,
      });

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
        message:
          "Failed to create session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  // Validate session and extend idle timeout
  async validate(
    token: string,
    idleTtlSeconds?: number,
    forceRotate = false
  ): Promise<AuthResult> {
    try {
      console.log("✅ Session Validate called with token:", token);

      const tokenHash = createHash("sha256").update(token).digest("hex");
      const now = Date.now();

      const session = await this.sessions.findByTokenHash(tokenHash);
      if (!session) {
        console.log("❌ Session not found for token");
        return {
          success: false,
          data: null,
          message: "Invalid session",
          httpCode: 401,
        };
      }

      if (session.revokedAt) {
        console.log("🚫 Session is revoked:", session);
        return {
          success: false,
          data: null,
          message: "Invalid session",
          httpCode: 401,
        };
      }

      // Absolute expiration
      if (session.expiresAt.getTime() < now) {
        console.log("⏰ Session expired at:", session.expiresAt);
        await this.sessions.revokeByTokenHash(tokenHash);
        return {
          success: false,
          data: null,
          message: "Session expired",
          httpCode: 401,
        };
      }

      console.log("ℹ️ Session Last Used:", session.lastUsedAt);
      console.log("ℹ️ Provided idleTtlSeconds:", idleTtlSeconds);

      // Idle expiration (sliding window)
      if (idleTtlSeconds && session.lastUsedAt) {
        const lastUsed = session.lastUsedAt.getTime();
        const idleExpiry = lastUsed + idleTtlSeconds * 1000;
        const secondsLeft = Math.max(0, Math.round((idleExpiry - now) / 1000));

        console.log(`ℹ️ Seconds left until idle expiry = ${secondsLeft}`);

        if (idleExpiry < now) {
          console.log(
            `❌ Session expired due to inactivity for user ${
              session.userId
            }, idle expiry was at ${new Date(idleExpiry).toISOString()}`
          );
          await this.sessions.revokeByTokenHash(tokenHash);
          return {
            success: false,
            data: null,
            message: "Session expired due to inactivity",
            httpCode: 401,
          };
        }
      }

      console.log("ℹ️ Old last used at:", session.lastUsedAt);

      // Update lastUsedAt in DB and in-memory
      const nowDate = new Date();
      await this.sessions.updateLastUsed(tokenHash, nowDate);
      session.lastUsedAt = nowDate;

      console.log("ℹ️ Updated last used at to:", session.lastUsedAt);

      // ---- Conditional token rotation ----
      if (forceRotate) {
        console.log("🔄 Force rotating token for user:", session.userId);
        const rotated = this.generateToken();

        // Use repository method for atomic rotation (race-safe)
        const newSession = await this.sessions.createAndRotate(
          tokenHash,
          session.userId,
          session.expiresAt,
          rotated.token,
          rotated.tokenHash
        );

        // Revoke all other sessions except the newly rotated one
        await this.sessions.revokeAllExcept(session.userId, newSession.id);
        console.log("🆕 New session created with rotation:", newSession.id);
        return {
          success: true,
          data: newSession,
          message: "Session valid and rotated",
          httpCode: 200,
        };
      }

      // ---- Return current session if no rotation ----
      return {
        success: true,
        data: { ...session, sessionToken: token }, // token unchanged
        message: "Session valid",
        httpCode: 200,
      };
    } catch (err: any) {
      console.error("🔥 Failed to validate session:", err);
      return {
        success: false,
        data: null,
        message:
          "Failed to validate session: " + (err.message || "Unknown error"),
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
        message:
          "Failed to revoke session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  // Revoke all sessions for a user except the specified one
  async revokeAllExcept(userId: string, keepSessionId: string): Promise<void> {
    try {
      await this.sessions.revokeAllExcept(userId, keepSessionId);
    } catch (err: any) {
      console.error(
        `[ERROR] Failed to revoke all sessions except one for user ${userId}:`,
        err
      );
      throw err;
    }
  }
}
