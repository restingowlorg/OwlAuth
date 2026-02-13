import { MagicLinkRepository, MagicLinkToken } from "../contracts";
import { Collection, ObjectId, Document } from "mongodb";

/**
 * MongoDB implementation of MagicLinkRepository
 * Operates directly on a consumer-provided collection
 */
export class MongoMagicLinkRepo implements MagicLinkRepository {
  private collection: Collection<Document>;

  constructor(collection: Collection<Document>) {
    this.collection = collection;
  }

  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    const now = new Date();

    const result = await this.collection.insertOne({
      userId: new ObjectId(token.userId),
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: result.insertedId.toString(),
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    };
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const doc = await this.collection.findOne({ tokenHash });
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    };
  }

  async markUsed(id: string): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { usedAt: new Date(), updatedAt: new Date() } },
    );
  }

  async findAll(): Promise<MagicLinkToken[]> {
    const now = new Date();
    const docs = await this.collection
      .find({
        expiresAt: { $gt: now },
        usedAt: null,
      })
      .toArray();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? undefined,
    }));
  }
}
