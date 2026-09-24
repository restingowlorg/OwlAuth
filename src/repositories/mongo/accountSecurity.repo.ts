import { Collection, ObjectId, InsertOneResult } from "mongodb";
import {
  AccountSecurityRecord,
  AccountSecurityRepository,
  AccountStatus,
  UserId
} from "../contracts";
import { IMongoAccountSecurityDoc } from "../../infra/databases/mongo/types";

/**
 * MongoDB implementation of AccountSecurityRepository
 */
export class MongoAccountSecurityRepo implements AccountSecurityRepository {
  private collection: Collection<IMongoAccountSecurityDoc>;

  constructor(collection: Collection<IMongoAccountSecurityDoc>) {
    this.collection = collection;
  }

  /** Create the account state record for a user */
  async create(input: {
    userId: UserId;
    status: AccountStatus;
    emailVerifiedAt?: Date | null;
  }): Promise<AccountSecurityRecord> {
    const now = new Date();

    const doc: Omit<IMongoAccountSecurityDoc, "_id"> = {
      user_id: new ObjectId(input.userId),
      status: input.status,
      email_verified_at: input.emailVerifiedAt ?? null,
      updated_at: now
    };

    const result: InsertOneResult<IMongoAccountSecurityDoc> = await this.collection.insertOne(
      doc as unknown as IMongoAccountSecurityDoc
    );

    if (!result.acknowledged) {
      throw new Error("[Auth:MongoAccountSecurityRepo] Failed to create account security record");
    }

    return {
      userId: input.userId,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      updatedAt: now
    };
  }

  /** Read the account state record for a user */
  async findByUserId(userId: UserId): Promise<AccountSecurityRecord | null> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(userId);
    } catch {
      return null;
    }

    const doc = await this.collection.findOne({ user_id: objectId });
    if (!doc) return null;

    return {
      userId: doc.user_id.toString(),
      status: doc.status as AccountStatus,
      emailVerifiedAt: doc.email_verified_at ?? null,
      updatedAt: doc.updated_at
    };
  }
}
