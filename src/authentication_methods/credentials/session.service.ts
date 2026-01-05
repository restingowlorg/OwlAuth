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
async validate(token: string, idleTtlSeconds?: number): Promise<AuthResult> {
  try {

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = Date.now();

    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session) {
      console.log("❌ [DEBUG] Session not found for token");
      return { success: false, data: null, message: "Invalid session", httpCode: 401 };
    }

    if (session.revokedAt) {
      console.log("🚫 [DEBUG] Session is revoked:", session);
      return { success: false, data: null, message: "Invalid session", httpCode: 401 };
    }

    // Absolute expiration
    if (session.expiresAt.getTime() < now) {
      console.log("⏰ [DEBUG] Session expired at:", session.expiresAt);
      await this.sessions.revokeByTokenHash(tokenHash);
      return { success: false, data: null, message: "Session expired", httpCode: 401 };
    }

    // Idle expiration
    if (idleTtlSeconds && session.lastUsedAt) {
      const idleExpiry = session.lastUsedAt.getTime() + idleTtlSeconds * 1000;

      if (idleExpiry < now) {
        await this.sessions.revokeByTokenHash(tokenHash);
        return { success: false, data: null, message: "Session expired due to inactivity", httpCode: 401 };
      }
    }

    // ---- Token rotation ----
    console.log("🔄 [DEBUG] Rotating session token for user:", session.userId);
    const { token: newToken, tokenHash: newTokenHash } = this.generateToken();
    console.log("🆕 [DEBUG] New token hash generated:", newTokenHash);

    // Create a new session with same properties
    const newSession = await this.sessions.create({
      userId: session.userId,
      tokenHash: newTokenHash,
      expiresAt: session.expiresAt, // keep absolute expiry same
      lastUsedAt: new Date(),
    });
    console.log("✅ [DEBUG] New session created:", newSession);

    // Revoke old token
    await this.sessions.revokeByTokenHash(tokenHash);
    console.log("🗑️ [DEBUG] Old session revoked:", session.id);

    return {
      success: true,
      data: { ...newSession, sessionToken: newToken },
      message: "Session valid and rotated",
      httpCode: 200,
    };
  } catch (err: any) {
    console.error("🔥 [ERROR] Failed to validate session:", err);
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
        message:
          "Failed to revoke session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }
}
