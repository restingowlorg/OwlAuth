import { Collection, ObjectId } from "mongodb";
import { ActionToken, ActionTokenPurpose, ActionTokenRepository, UserId } from "../contracts";
import { IMongoActionTokenDoc } from "../../infra/databases/mongo/types";

export class MongoActionTokenRepo implements ActionTokenRepository {
  private collection: Collection<IMongoActionTokenDoc>;

  constructor(collection: Collection<IMongoActionTokenDoc>) {
    this.collection = collection;
  }

  private static toToken(doc: IMongoActionTokenDoc): ActionToken {
    return {
      id: doc._id?.toString() || "",
      userId: doc.user_id.toString(),
      // Every lookup filters on `purpose`, so a document only reaches here carrying the
      // purpose it was asked for. No collection validator is required for that guarantee.
      purpose: doc.purpose as ActionTokenPurpose,
      selector: doc.selector,
      tokenHash: doc.token_hash,
      expiresAt: doc.expires_at,
      usedAt: doc.used_at ?? null,
      createdAt: doc.created_at
    };
  }

  async create(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken> {
    const now = new Date();

    let userObjectId: ObjectId;
    try {
      userObjectId = new ObjectId(input.userId);
    } catch {
      throw new Error(`[Auth:MongoActionTokenRepo] '${input.userId}' is not a valid user id`);
    }

    const doc: Omit<IMongoActionTokenDoc, "_id"> = {
      user_id: userObjectId,
      purpose: input.purpose,
      selector: input.selector,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      used_at: null,
      created_at: now,
      updated_at: now
    };

    const result = await this.collection.insertOne(doc as unknown as IMongoActionTokenDoc);

    if (!result.acknowledged) {
      throw new Error("[Auth:MongoActionTokenRepo] Failed to create action token");
    }

    return {
      id: result.insertedId.toString(),
      userId: input.userId,
      purpose: input.purpose,
      selector: input.selector,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: now
    };
  }

  async findBySelector(selector: string, purpose: ActionTokenPurpose): Promise<ActionToken | null> {
    const doc = await this.collection.findOne({ selector, purpose });
    if (!doc) return null;

    return MongoActionTokenRepo.toToken(doc);
  }

  /**
   * One conditional updateOne, so the server decides the winner.
   *
   * MongoDB applies a single-document update atomically, and `used_at: null` is part of the
   * same filter, so of two concurrent callers exactly one gets `modifiedCount > 0`. Unlike
   * PostgreSQL's `NOW()`, the expiry bound here is this process's clock — the filter is
   * defence in depth rather than the only expiry check, and the service checks expiry too.
   */
  async consume(selector: string, purpose: ActionTokenPurpose): Promise<boolean> {
    const now = new Date();
    const result = await this.collection.updateOne(
      { selector, purpose, used_at: null, expires_at: { $gt: now } },
      { $set: { used_at: now, updated_at: now } }
    );

    return result.modifiedCount > 0;
  }

  async invalidateByUserId(userId: UserId, purpose: ActionTokenPurpose): Promise<boolean> {
    try {
      const now = new Date();
      const result = await this.collection.updateMany(
        { user_id: new ObjectId(userId), purpose, used_at: null },
        { $set: { used_at: now, updated_at: now } }
      );
      return result.acknowledged;
    } catch {
      return false;
    }
  }
}
