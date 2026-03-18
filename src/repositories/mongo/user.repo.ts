import { CreateUserInput, MongoUserDoc } from "../../interfaces/index";
import { User } from "../../types/index";
import { UserRepository } from "../contracts";
import { Collection, ObjectId, InsertOneResult } from "mongodb";

/**
 * MongoDB implementation of UserRepository
 */
export class MongoUserRepo implements UserRepository {
  private collection: Collection<MongoUserDoc>;

  constructor(collection: Collection<MongoUserDoc>) {
    this.collection = collection;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { email, username, passwordHash } = input;

    const result: InsertOneResult<MongoUserDoc> = await this.collection.insertOne({
      email,
      username,
      password: passwordHash
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
    const user = await this.collection.findOne({ _id: new ObjectId(id) });
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
    const result = await this.collection.updateOne(
      { _id: new ObjectId(userId.toString()) },
      { $set: { password: passwordHash } }
    );
    return result.modifiedCount > 0;
  }
}
