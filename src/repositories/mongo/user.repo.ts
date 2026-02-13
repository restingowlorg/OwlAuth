import { UserRepository, CreateUserInput } from "../contracts";
import { Collection, Document, ObjectId } from "mongodb";

/**
 * MongoDB implementation of UserRepository
 * Operates directly on a consumer-provided collection
 */
export class MongoUserRepo implements UserRepository {
  private collection: Collection<Document>;

  constructor(collection: Collection<Document>) {
    this.collection = collection;
  }

  async create(input: CreateUserInput) {
    const { email, username, passwordHash } = input;

    const now = new Date();

    const result = await this.collection.insertOne({
      email,
      username,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: result.insertedId.toString(),
      email,
      username,
    };
  }

  async findByEmail(email: string) {
    const user = await this.collection.findOne({ email });
    if (!user) return null;

    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
    };
  }

  async findById(id: string) {
    const user = await this.collection.findOne({ _id: new ObjectId(id) });
    if (!user) return null;

    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
    };
  }

  async findByUsername(username: string) {
    const user = await this.collection.findOne({ username });
    if (!user) return null;

    return {
      id: user._id.toString(),
      email: user.email,
      username: user.username,
    };
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.collection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { password: passwordHash, updatedAt: new Date() } }
    );
  }
}
