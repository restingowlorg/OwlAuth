import { MagicLinkRepository, MagicLinkToken } from '../contracts';
import { MagicLinkModel } from './models';

export const MongoMagicLinkRepo: MagicLinkRepository = {
  async create(token: { userId: string; tokenHash: string; expiresAt: Date; usedAt?: Date }): Promise<MagicLinkToken> {
    console.log('🔑 Creating magic link for user:', token.userId);

    const doc = await MagicLinkModel.create({
      ...token,
      userId: token.userId.toString(), // normalize string
    });

    console.log('📨 Magic link record saved with id:', doc._id.toString());

    return { ...token, id: doc._id.toString() };
  },

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const doc = await MagicLinkModel.findOne({ tokenHash }).lean();
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.userId,
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    };
  },

  async markUsed(id: string): Promise<void> {
    console.log('✅ Marking magic link as used, id:', id);
    await MagicLinkModel.findByIdAndUpdate(id, { usedAt: new Date() });
  },

  async findAll(): Promise<MagicLinkToken[]> {
    const now = new Date();
    const docs = await MagicLinkModel.find({ expiresAt: { $gt: now }, usedAt: { $exists: false } }).lean();

    return docs.map(doc => ({
      id: doc._id.toString(),
      userId: doc.userId,
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    }));
  }
};
