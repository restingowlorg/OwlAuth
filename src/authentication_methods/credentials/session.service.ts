import { SessionRepository } from "../../repositories/contracts";

export const SessionService = {
  create(userId: any, ttlSeconds: number , SessionRepo: SessionRepository) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    console.log('Creating session for userId:', userId, 'with expiration at:', expiresAt);
    return SessionRepo.create(userId, expiresAt);
  },
  async validate(sessionId: string , SessionRepo: SessionRepository) {
    console.log('ℹ️ Validating session in Session Service with ID:', sessionId);
    const session = await SessionRepo.findById(sessionId);
    console.log('ℹ️ Found session in Session Service:', session);
    if (!session) return null;

    if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
      console.log('ℹ️ Session expired or invalid:', session);
      return null;
    }
    return session;
  },
  
  destroy(sessionId: string, SessionRepo: SessionRepository) {
    return SessionRepo.delete(sessionId);
  },
};
