import { SessionRepository } from "../../repositories/contracts";

export const SessionService = {
  create(userId: any, ttlSeconds: number , SessionRepo: SessionRepository) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    return SessionRepo.create(userId, expiresAt);
  },
  async validate(sessionId: string , SessionRepo: SessionRepository) {
    const session = await SessionRepo.findById(sessionId);
    if (!session) return null;

    if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return session;
  },
  
  destroy(sessionId: string, SessionRepo: SessionRepository) {
    return SessionRepo.delete(sessionId);
  },
};
