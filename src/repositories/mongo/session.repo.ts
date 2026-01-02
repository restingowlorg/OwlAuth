import { SessionRepository } from "../contracts";
import { SessionModel } from "./models";

export const MongoSessionRepo: SessionRepository = {
  async create(input) {
    const session = await SessionModel.create({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastUsedAt: input.lastUsedAt,
    });

    return {
      id: session.id,
      userId: session.userId.toString(),
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      revokedAt: session.revokedAt ?? null,
    };
  },

  async findByTokenHash(tokenHash: string) {
    const session = await SessionModel.findOne({ tokenHash });
    if (!session) return null;

    return {
      id: session.id,
      userId: session.userId.toString(),
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt,
      revokedAt: session.revokedAt ?? null,
    };
  },

  async updateLastUsed(tokenHash: string, date: Date) {
    await SessionModel.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { lastUsedAt: date } }
    );
  },

  async revokeByTokenHash(tokenHash: string) {
    await SessionModel.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  },
};
