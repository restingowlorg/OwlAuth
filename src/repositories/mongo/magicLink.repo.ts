import { MagicLinkRepository, MagicLinkToken } from "../contracts";
import { MagicLinkModel } from "./models";
import { Types } from "mongoose";

export const MongoMagicLinkRepo: MagicLinkRepository = {
  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    console.log("🔑 Creating magic link for user:", token.userId);

    // Convert string userId to ObjectId
    const userIdObj = new Types.ObjectId(token.userId);

    const doc = await MagicLinkModel.create({
      ...token,
      userId: userIdObj,
    });

    console.log("📨 Magic link record saved with id:", doc._id.toString());

    return { ...token, id: doc._id.toString(), userId: doc.userId.toString() };
  },

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const doc = await MagicLinkModel.findOne({ tokenHash }).lean();
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(), // convert ObjectId to string
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    };
  },

  async markUsed(id: string): Promise<void> {
    console.log("✅ Marking magic link as used, id:", id);
    await MagicLinkModel.findByIdAndUpdate(id, { usedAt: new Date() });
  },

  async findAll(): Promise<MagicLinkToken[]> {
    const now = new Date();
    const docs = await MagicLinkModel.find({
      expiresAt: { $gt: now },
      usedAt: { $exists: false },
    }).lean();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      userId: doc.userId.toString(), // convert ObjectId to string
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    }));
  },
};
