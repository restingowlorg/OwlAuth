import { Collection, ObjectId, InsertOneResult } from "mongodb";
import { MagicLinkToken, MagicLinkRow, IMongoMagicLinkDoc } from "../../types";
import { MagicLinkRepository } from "../contracts";

export class MongoMagicLinkRepo implements MagicLinkRepository {
  private collection: Collection<IMongoMagicLinkDoc>;

  constructor(collection: Collection<IMongoMagicLinkDoc>) {
    this.collection = collection;
  }

  /** Create a new magic link token */
  async create(token: {
    userId: string | number;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<MagicLinkToken> {
    const now = new Date();

    // Build the doc
    const doc: Omit<IMongoMagicLinkDoc, "_id"> = {
      user_id: new ObjectId(token.userId.toString()),
      token: token.tokenHash,
      expires_at: token.expiresAt,
      used_at: token.usedAt ?? null,
      created_at: now,
      updated_at: now
    };

    const result: InsertOneResult<IMongoMagicLinkDoc> = await this.collection.insertOne(
      doc as unknown as IMongoMagicLinkDoc
    );

    return {
      id: result.insertedId.toString(),
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt ?? null,
      createdAt: now
    };
  }

  /** Find token by its hash */
  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const doc = await this.collection.findOne({ token: tokenHash });
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.user_id.toString(),
      tokenHash: doc.token,
      expiresAt: doc.expires_at,
      usedAt: doc.used_at ?? null,
      createdAt: doc.created_at
    };
  }

  /** Find token by its ID */
  async findById(id: string | number): Promise<MagicLinkToken | null> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id.toString());
    } catch {
      return null;
    }

    const doc = await this.collection.findOne({ _id: objectId });
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.user_id.toString(),
      tokenHash: doc.token,
      expiresAt: doc.expires_at,
      usedAt: doc.used_at ?? null,
      createdAt: doc.created_at
    };
  }

  /** Mark a token as used */
  async consume(id: string | number): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id.toString()), used_at: null },
      { $set: { used_at: new Date(), updated_at: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /** Delete existing tokens for a user */
  async deleteByUserId(userId: string | number): Promise<boolean> {
    const result = await this.collection.deleteMany({ user_id: new ObjectId(userId.toString()) });
    return result.deletedCount > 0;
  }

  /** Invalidate existing tokens for a user */
  async invalidateByUserId(userId: string | number): Promise<boolean> {
    const filter = { user_id: new ObjectId(userId.toString()), used_at: null };
    const result = await this.collection.updateMany(filter, {
      $set: { used_at: new Date(), updated_at: new Date() }
    });

    return result.acknowledged;
  }

  /** Return all active tokens as MagicLinkRow (for contracts) */
  async findAll(): Promise<MagicLinkRow[]> {
    const now = new Date();
    const docs = await this.collection.find({ expires_at: { $gt: now }, used_at: null }).toArray();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      user_id: doc.user_id.toString(),
      token: doc.token,
      expires_at: doc.expires_at,
      used_at: doc.used_at ?? null,
      created_at: doc.created_at
    }));
  }
}
