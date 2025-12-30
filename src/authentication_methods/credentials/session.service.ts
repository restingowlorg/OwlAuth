import { SessionRepository } from "../../repositories/contracts";
import { AuthResult } from "../../types";

export const SessionService = {
  async create(
    userId: string,
    ttlSeconds: number,
    SessionRepo: SessionRepository
  ): Promise<AuthResult> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const session = await SessionRepo.create(userId, expiresAt);
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
  },

  async validate(
    sessionId: Number,
    SessionRepo: SessionRepository
  ): Promise<AuthResult<any | null>> {
    try {
      console.log("[Session Service ℹ️ ] Validating session ID:", sessionId);
      const session = await SessionRepo.findById(sessionId);
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
  },

  async destroy(
    sessionId: string,
    SessionRepo: SessionRepository
  ): Promise<AuthResult> {
    try {
      await SessionRepo.delete(sessionId);
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
  },
};
