import { SessionRepository } from "../../repositories/contracts";
import { AuthResult, Session } from "../../types";

export const SessionService = {
  async create(
    userId: string,
    ttlSeconds: number,
    sessionRepo: SessionRepository
  ): Promise<AuthResult<{ session: Session }>> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const session = await sessionRepo.create(userId, expiresAt);

      return {
        success: true,
        data: { session },
        message: "Session created",
        httpCode: 200
      };
    } catch {
      return {
        success: false,
        data: undefined,
        message: "Failed to create session",
        httpCode: 500
      };
    }
  },

  async validate(
    sessionId: string,
    sessionRepo: SessionRepository
  ): Promise<AuthResult<Session | null>> {
    try {
      const session = await sessionRepo.findById(sessionId);

      if (!session) {
        return { success: false, data: null, message: "Session not found", httpCode: 404 };
      }

      if (session.expiresAt.getTime() < Date.now()) {
        return { success: false, data: null, message: "Session expired", httpCode: 401 };
      }

      return {
        success: true,
        data: session,
        message: "Session valid",
        httpCode: 200
      };
    } catch {
      return {
        success: false,
        data: null,
        message: "Session validation failed",
        httpCode: 500
      };
    }
  },

  async destroy(sessionId: string, sessionRepo: SessionRepository): Promise<AuthResult> {
    try {
      await sessionRepo.delete(sessionId);

      return {
        success: true,
        data: null,
        message: "Session destroyed",
        httpCode: 200
      };
    } catch {
      return {
        success: false,
        data: null,
        message: "Failed to destroy session",
        httpCode: 500
      };
    }
  }
};
