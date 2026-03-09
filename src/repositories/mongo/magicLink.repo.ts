import { Types } from "mongoose";
import { MagicLinkRow, MagicLinkToken } from "../../types";
import { MagicLinkRepository } from "../contracts";
import { MagicLinkModel } from "./models";

export const MongoMagicLinkRepo: MagicLinkRepository = {
  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    const userIdObj = new Types.ObjectId(token.userId);

    const doc = await MagicLinkModel.create({
      ...token,
      userId: userIdObj
    });

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? null, // ensure null if undefined
      createdAt: doc.createdAt // include createdAt
    };
  },

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const doc = await MagicLinkModel.findOne({ tokenHash }).lean();
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? null, // ensure null
      createdAt: doc.createdAt // include createdAt
    };
  },

  async markUsed(id: string): Promise<void> {
    await MagicLinkModel.findByIdAndUpdate(id, { usedAt: new Date() });
  },

  async findAll(): Promise<MagicLinkRow[]> {
    const now = new Date();
    const docs = await MagicLinkModel.find({
      expiresAt: { $gt: now },
      usedAt: { $exists: false }
    }).lean();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      user_id: doc.userId.toString(),
      token: doc.tokenHash,
      expires_at: doc.expiresAt,
      used_at: doc.usedAt ?? null, // ensure null
      created_at: doc.createdAt // include createdAt
    }));
  }
};
