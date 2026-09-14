import { Collection, MongoClient } from "mongodb";
import { connectMongo } from "./db";
import { IMongoUserDoc } from "./types";
import { MongoUserRepo } from "../../../repositories/mongo/user.repo";
import { DuplicateUserError } from "../../../repositories/contracts";

const configuredMongoUri = process.env.MONGODB_TEST_URI;
const mongoUri = configuredMongoUri ?? "mongodb://127.0.0.1:27017/owlauth_test";
const runIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const integrationDescribe = runIntegrationTests ? describe : describe.skip;
const userCollectionName = "users";

if (runIntegrationTests && !configuredMongoUri) {
  throw new Error("MONGODB_TEST_URI is required when RUN_DATABASE_INTEGRATION_TESTS is true");
}

integrationDescribe("MongoDB adapter integration", () => {
  const client = new MongoClient(mongoUri);
  const database = client.db();

  async function createUserCollection(options?: {
    usernameUnique?: boolean;
    emailPartial?: boolean;
  }): Promise<Collection<IMongoUserDoc>> {
    await database.dropDatabase();
    const collection = await database.createCollection<IMongoUserDoc>(userCollectionName);
    await collection.createIndex(
      { email: 1 },
      options?.emailPartial
        ? { unique: true, partialFilterExpression: { email: { $exists: true } } }
        : { unique: true }
    );

    if (options?.usernameUnique ?? true) {
      await collection.createIndex({ username: 1 }, { unique: true });
    }

    return collection;
  }

  beforeAll(async () => {
    await client.connect();
  });

  beforeEach(async () => {
    await createUserCollection();
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  it("connects when required unique indexes exist", async () => {
    const db = await connectMongo({
      mongoUri,
      userCollectionName,
      authTypes: ["credentials"]
    });

    await expect(db.userRepo.findByEmail("missing@example.com")).resolves.toBeNull();
    await db.close();
  });

  it("rejects a collection that is missing the username unique index", async () => {
    await createUserCollection({ usernameUnique: false });

    await expect(
      connectMongo({
        mongoUri,
        userCollectionName,
        authTypes: ["credentials"]
      })
    ).rejects.toThrow(
      "must have a non-partial, non-sparse, single-field unique index on 'username'"
    );
  });

  it("rejects a partial identity index", async () => {
    await createUserCollection({ emailPartial: true });

    await expect(
      connectMongo({
        mongoUri,
        userCollectionName,
        authTypes: ["credentials"]
      })
    ).rejects.toThrow("must have a non-partial, non-sparse, single-field unique index on 'email'");
  });

  it("maps a concurrent unique-key race to DuplicateUserError", async () => {
    const collection = database.collection<IMongoUserDoc>(userCollectionName);
    const users = new MongoUserRepo(collection);
    const input = {
      email: "duplicate@example.com",
      username: "duplicate_user",
      passwordHash: "hash"
    };

    const results = await Promise.allSettled([users.create(input), users.create(input)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(DuplicateUserError);
  });
});
