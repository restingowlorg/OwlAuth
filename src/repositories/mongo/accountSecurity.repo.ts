import { Collection, ObjectId, InsertOneResult } from "mongodb";
import {
  AccountSecurityRecord,
  AccountSecurityRecordExistsError,
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

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(input.userId);
    } catch {
      throw new Error(`[Auth:MongoAccountSecurityRepo] '${input.userId}' is not a valid user id`);
    }

    const doc: Omit<IMongoAccountSecurityDoc, "_id"> = {
      user_id: objectId,
      status: input.status,
      email_verified_at: input.emailVerifiedAt ?? null,
      updated_at: now
    };

    let result: InsertOneResult<IMongoAccountSecurityDoc>;
    try {
      result = await this.collection.insertOne(doc as unknown as IMongoAccountSecurityDoc);
    } catch (error: unknown) {
      // The unique user_id index rejecting this write means a concurrent provisioning
      // attempt already stored the record.
      if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
        throw new AccountSecurityRecordExistsError();
      }
      throw error;
    }

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
