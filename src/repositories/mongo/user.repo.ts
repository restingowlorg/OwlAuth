import { CreateUserInput, IMongoUserDoc } from "../../types";
import { User } from "../../types/index";
import { UserRepository } from "../contracts";
import { Collection, ObjectId, InsertOneResult } from "mongodb";

/**
 * MongoDB implementation of UserRepository
 */
export class MongoUserRepo implements UserRepository {
  private collection: Collection<IMongoUserDoc>;

  constructor(collection: Collection<IMongoUserDoc>) {
    this.collection = collection;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { email, username, passwordHash } = input;

    const now = new Date();
    const result: InsertOneResult<IMongoUserDoc> = await this.collection.insertOne({
      email,
      username,
      password: passwordHash,
      created_at: now,
      updated_at: now
    });

    return {
      id: result.insertedId.toString(),
      email,
      username,
      password: passwordHash
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.collection.findOne({ email });
    if (!user) return null;

    return {
      id: user._id?.toString() ?? "", // safe fallback just in case
      email: user.email,
      username: user.username,
      password: user.password
    };
  }

  async findById(id: string): Promise<User | null> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return null;
    }

    const user = await this.collection.findOne({ _id: objectId });
    if (!user) return null;

    return {
      id: user._id?.toString() ?? "",
      email: user.email,
      username: user.username,
      password: user.password
    };
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await this.collection.findOne({ username });
    if (!user) return null;

    return {
      id: user._id?.toString() ?? "",
      email: user.email,
      username: user.username,
      password: user.password
    };
  }

  async updatePassword(userId: string | number, passwordHash: string): Promise<boolean> {
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(userId.toString());
    } catch {
      return false;
    }

    const result = await this.collection.updateOne(
      { _id: objectId },
      { $set: { password: passwordHash, updated_at: new Date() } }
    );
    return result.modifiedCount > 0;
  }
}
