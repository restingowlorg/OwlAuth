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

  async revokeOldestForUser(userId: string, keepLatest: number) {
    const sessions = await SessionModel.find({ userId, revokedAt: null })
      .sort({ createdAt: 1 }) // Oldest first
      .skip(keepLatest);
    await Promise.all(
      sessions.map((session) =>
        SessionModel.updateOne(
          { _id: session.id },
          { $set: { revokedAt: new Date() } }
        )
      )
    );
  },

  async revokeAllExcept(userId: string, keepSessionId: string) {
    await SessionModel.updateMany(
      {
        userId,
        revokedAt: null,
        _id: { $ne: keepSessionId },
      },
      {
        $set: { revokedAt: new Date() },
      }
    );
  },

  async createAndRotate(
    oldTokenHash: string,
    userId: string,
    expiresAt: Date,
    newToken: string,
    newTokenHash: string
  ) {
    const session = await SessionModel.findOne({
      tokenHash: oldTokenHash,
      revokedAt: null,
    });

    if (!session) {
      throw new Error("Session not found for rotation");
    }

    // Create the new session
    const newSession = await SessionModel.create({
      userId,
      tokenHash: newTokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    });

    // Revoke the old session
    await SessionModel.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    return {
      id: newSession.id,
      userId: newSession.userId.toString(),
      expiresAt: newSession.expiresAt,
      lastUsedAt: newSession.lastUsedAt,
      revokedAt: newSession.revokedAt ?? null,
      sessionToken: newToken,
    };
  },
};
