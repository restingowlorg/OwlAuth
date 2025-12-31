import { SessionRepository } from "../../repositories/contracts";
import { AuthResult } from "../../types";

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async create(userId: string, ttlSeconds: number): Promise<AuthResult> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const session = await this.sessions.create(userId, expiresAt);

      return {
        success: true,
        data: { session },
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

  async validate(sessionId:number): Promise<AuthResult> {
    try {
      const session = await this.sessions.findById(sessionId);

      if (!session) {
        return {
          success: false,
          data: null,
          message: "Session not found",
          httpCode: 404,
        };
      }

      if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
        return {
          success: false,
          data: null,
          message: "Session expired",
          httpCode: 401,
        };
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
        message:
          "Failed to validate session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  async destroy(sessionId: string): Promise<AuthResult> {
    try {
      await this.sessions.delete(sessionId);

      return {
        success: true,
        data: null,
        message: "Session destroyed",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message:
          "Failed to destroy session: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }
}
