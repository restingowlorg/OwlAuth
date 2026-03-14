import { Collection, ObjectId, InsertOneResult } from "mongodb";
import { MagicLinkToken, MagicLinkRow } from "../../types";
import { MagicLinkRepository } from "../contracts";
import { MongoMagicLinkDoc } from "../../interfaces/index";

/**
 * MongoDB implementation of MagicLinkRepository
 */
export class MongoMagicLinkRepo implements MagicLinkRepository {
  private collection: Collection<MongoMagicLinkDoc>;

  constructor(collection: Collection<MongoMagicLinkDoc>) {
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

    // Build the doc without _id (MongoDB will generate it)
    const doc: Omit<MongoMagicLinkDoc, "_id"> = {
      userId: new ObjectId(token.userId.toString()),
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt ?? null,
      createdAt: now,
      updatedAt: now
    };

    const result: InsertOneResult<MongoMagicLinkDoc> = await this.collection.insertOne(
      doc as unknown as MongoMagicLinkDoc // type assertion for TS
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
    const doc = await this.collection.findOne({ tokenHash });
    if (!doc) return null;

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? null,
      createdAt: doc.createdAt
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
      userId: doc.userId.toString(),
      tokenHash: doc.tokenHash,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt ?? null,
      createdAt: doc.createdAt
    };
  }

  /** Mark a token as used */
  async markUsed(id: string | number): Promise<void> {
    await this.collection.updateOne(
      { _id: new ObjectId(id.toString()) },
      { $set: { usedAt: new Date(), updatedAt: new Date() } }
    );
  }

  /** Return all active tokens as MagicLinkRow (for contracts) */
  async findAll(): Promise<MagicLinkRow[]> {
    const now = new Date();
    const docs = await this.collection.find({ expiresAt: { $gt: now }, usedAt: null }).toArray();

    return docs.map((doc) => ({
      id: doc._id.toString(),
      user_id: doc.userId.toString(),
      token: doc.tokenHash,
      expires_at: doc.expiresAt,
      used_at: doc.usedAt ?? null,
      created_at: doc.createdAt
    }));
  }
}
