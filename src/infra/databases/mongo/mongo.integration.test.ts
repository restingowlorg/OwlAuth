import { randomUUID } from "crypto";
import { Collection, MongoClient, ObjectId } from "mongodb";
import { connectMongo } from "./db";
import { MongoAdapter } from "./adapter";
import { IMongoAccountSecurityDoc, IMongoActionTokenDoc, IMongoUserDoc } from "./types";
import { MongoUserRepo } from "../../../repositories/mongo/user.repo";
import { MongoAccountSecurityRepo } from "../../../repositories/mongo/accountSecurity.repo";
import { MongoActionTokenRepo } from "../../../repositories/mongo/actionToken.repo";
import { ActionTokenPurpose, DuplicateUserError } from "../../../repositories/contracts";
import { createAuthManager } from "../../../core/auth.manager";
import { RecoveryDelivery } from "../../../core/types";
import { BcryptAdapter } from "../../security/bcrypt.adapter";

const configuredMongoUri = process.env.MONGODB_TEST_URI;
const mongoUri = configuredMongoUri ?? "mongodb://127.0.0.1:27017/owlauth_test";
const runIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const integrationDescribe = runIntegrationTests ? describe : describe.skip;
const userCollectionName = "users";
const accountSecurityCollectionName = "account_security";

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

  describe("account identity state", () => {
    const accountSecurityValidator = {
      $jsonSchema: {
        bsonType: "object",
        required: ["user_id", "status", "email_verified_at", "updated_at"],
        properties: {
          user_id: { bsonType: "objectId" },
          status: { enum: ["active", "pending_email_verification", "disabled"] },
          email_verified_at: { bsonType: ["date", "null"] },
          updated_at: { bsonType: "date" }
        }
      }
    };

    async function createAccountSecurityCollection(options?: {
      userIdUnique?: boolean;
      validator?: Record<string, unknown> | null;
      validationAction?: "error" | "warn";
      validationLevel?: "strict" | "moderate" | "off";
    }): Promise<Collection<IMongoAccountSecurityDoc>> {
      const validator =
        options?.validator === undefined ? accountSecurityValidator : options.validator;

      const collection = await database.createCollection<IMongoAccountSecurityDoc>(
        accountSecurityCollectionName,
        validator === null
          ? undefined
          : {
              validator,
              ...(options?.validationAction ? { validationAction: options.validationAction } : {}),
              ...(options?.validationLevel ? { validationLevel: options.validationLevel } : {})
            }
      );

      if (options?.userIdUnique ?? true) {
        await collection.createIndex({ user_id: 1 }, { unique: true });
      }

      return collection;
    }

    const connectOptions = {
      mongoUri,
      userCollectionName,
      accountSecurityCollectionName,
      authTypes: ["credentials" as const]
    };

    it("connects when the account security collection is valid", async () => {
      await createAccountSecurityCollection();

      const db = await connectMongo({ ...connectOptions, accountSecurity: true });

      expect(db.accountSecurityRepo).toBeDefined();
      await db.close();
    });

    it("does not build the repository when the feature is disabled", async () => {
      const db = await connectMongo({ ...connectOptions, accountSecurity: false });

      expect(db.accountSecurityRepo).toBeUndefined();
      await db.close();
    });

    it("rejects a collection that is missing the user_id unique index", async () => {
      await createAccountSecurityCollection({ userIdUnique: false });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must have a non-partial, non-sparse, single-field unique index on 'user_id'"
      );
    });

    it("rejects a collection with no validator at all", async () => {
      await createAccountSecurityCollection({ validator: null });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must have a $jsonSchema validator"
      );
    });

    it("rejects a collection that does not exist", async () => {
      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "does not exist"
      );
    });

    it("rejects a validator that omits a required field", async () => {
      await createAccountSecurityCollection({
        validator: {
          $jsonSchema: {
            ...accountSecurityValidator.$jsonSchema,
            required: ["user_id", "status"]
          }
        }
      });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        /must list 'email_verified_at', 'updated_at' as required/
      );
    });

    it("rejects a validator with no status enum", async () => {
      await createAccountSecurityCollection({
        validator: {
          $jsonSchema: {
            ...accountSecurityValidator.$jsonSchema,
            properties: {
              ...accountSecurityValidator.$jsonSchema.properties,
              status: { bsonType: "string" }
            }
          }
        }
      });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly the known statuses"
      );
    });

    // An enum permitting an extra value reintroduces exactly the problem the validator
    // exists to prevent, so a superset is rejected rather than tolerated.
    it("rejects a status enum that permits an extra value", async () => {
      await createAccountSecurityCollection({
        validator: {
          $jsonSchema: {
            ...accountSecurityValidator.$jsonSchema,
            properties: {
              ...accountSecurityValidator.$jsonSchema.properties,
              status: {
                enum: ["active", "pending_email_verification", "disabled", "suspended"]
              }
            }
          }
        }
      });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly the known statuses"
      );
    });

    // A declared validator is not an enforced one: validationAction "warn" logs the
    // violation and stores the document anyway.
    it("rejects a validator that only warns instead of rejecting", async () => {
      await createAccountSecurityCollection({ validationAction: "warn" });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "validationAction 'warn'"
      );
    });

    it("rejects a validator that is switched off", async () => {
      await createAccountSecurityCollection({ validationLevel: "off" });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "validationLevel 'off'"
      );
    });

    it("accepts explicit strict/error settings", async () => {
      await createAccountSecurityCollection({
        validationAction: "error",
        validationLevel: "strict"
      });

      const db = await connectMongo({ ...connectOptions, accountSecurity: true });

      expect(db.accountSecurityRepo).toBeDefined();
      await db.close();
    });

    it("confirms a warn-only validator really would store a mistyped status", async () => {
      // Demonstrates what the enforcement check protects against.
      const collection = await createAccountSecurityCollection({ validationAction: "warn" });

      await expect(
        collection.insertOne({
          user_id: new ObjectId(),
          status: "disable",
          email_verified_at: null,
          updated_at: new Date()
        } as unknown as IMongoAccountSecurityDoc)
      ).resolves.toBeDefined();
    });

    it("rejects a validator declaring user_id as a string", async () => {
      await createAccountSecurityCollection({
        validator: {
          $jsonSchema: {
            ...accountSecurityValidator.$jsonSchema,
            properties: {
              ...accountSecurityValidator.$jsonSchema.properties,
              user_id: { bsonType: "string" }
            }
          }
        }
      });

      await expect(connectMongo({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must declare 'user_id' as bsonType 'objectId'"
      );
    });

    it("lets the validator reject a mistyped status at write time", async () => {
      const collection = await createAccountSecurityCollection();

      await expect(
        collection.insertOne({
          user_id: new ObjectId(),
          status: "disable",
          email_verified_at: null,
          updated_at: new Date()
        } as unknown as IMongoAccountSecurityDoc)
      ).rejects.toThrow();
    });

    it("rejects an enabled feature with no collection name", async () => {
      await createAccountSecurityCollection();

      await expect(
        connectMongo({
          mongoUri,
          userCollectionName,
          authTypes: ["credentials"],
          accountSecurity: true
        })
      ).rejects.toThrow("'accountSecurityCollectionName' is not provided");
    });

    it("round-trips an account security record", async () => {
      const collection = await createAccountSecurityCollection();

      const users = new MongoUserRepo(database.collection<IMongoUserDoc>(userCollectionName));
      const user = await users.create({
        email: "state@example.com",
        username: "state_user",
        passwordHash: "hash"
      });

      const accountSecurity = new MongoAccountSecurityRepo(collection);

      const created = await accountSecurity.create({
        userId: user.id,
        status: "active",
        emailVerifiedAt: null
      });
      expect(created.status).toBe("active");
      expect(created.userId).toBe(user.id);

      const found = await accountSecurity.findByUserId(user.id);
      expect(found?.status).toBe("active");
      expect(found?.userId).toBe(user.id);
      expect(found?.emailVerifiedAt).toBeNull();
      expect(found?.updatedAt).toBeInstanceOf(Date);
    });

    it("returns null for a malformed user id", async () => {
      const collection = await createAccountSecurityCollection();
      const accountSecurity = new MongoAccountSecurityRepo(collection);

      await expect(accountSecurity.findByUserId("not-an-object-id")).resolves.toBeNull();
    });
  });

  describe("password recovery", () => {
    const actionTokenCollectionName = "action_tokens";
    const purpose: ActionTokenPurpose = "password_recovery";

    async function createActionTokenCollection(options?: {
      selectorUnique?: boolean;
    }): Promise<Collection<IMongoActionTokenDoc>> {
      const collection =
        await database.createCollection<IMongoActionTokenDoc>(actionTokenCollectionName);

      if (options?.selectorUnique ?? true) {
        await collection.createIndex({ selector: 1 }, { unique: true });
      }

      return collection;
    }

    const connectOptions = {
      mongoUri,
      userCollectionName,
      actionTokenCollectionName
    };

    async function createUser(label: string): Promise<string> {
      const users = new MongoUserRepo(database.collection<IMongoUserDoc>(userCollectionName));
      const user = await users.create({
        email: `${label}@example.com`,
        username: label,
        passwordHash: "hash"
      });
      return user.id;
    }

    it("connects when the action token collection is valid", async () => {
      await createActionTokenCollection();

      const db = await connectMongo({
        ...connectOptions,
        authTypes: ["credentials", "recovery"]
      });

      expect(db.actionTokenRepo).toBeDefined();
      await db.close();
    });

    it("does not build the repository when recovery is not enabled", async () => {
      const db = await connectMongo({ ...connectOptions, authTypes: ["credentials"] });

      expect(db.actionTokenRepo).toBeUndefined();
      await db.close();
    });

    it("rejects recovery with no collection name", async () => {
      await expect(
        connectMongo({ mongoUri, userCollectionName, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow("'actionTokenCollectionName' is not provided");
    });

    it("rejects a collection without a unique selector index", async () => {
      await createActionTokenCollection({ selectorUnique: false });

      await expect(
        connectMongo({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow(
        "must have a non-partial, non-sparse, single-field unique index on 'selector'"
      );
    });

    // The acceptance criterion the whole design rests on, against a real server: of many
    // simultaneous attempts to spend one token, exactly one is told it succeeded.
    it("lets exactly one of many concurrent consumers spend a token", async () => {
      const tokens = new MongoActionTokenRepo(await createActionTokenCollection());
      const userId = await createUser("race_user");

      await tokens.create({
        userId,
        purpose,
        selector: "race-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, () => tokens.consume("race-selector", purpose))
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      const stored = await tokens.findBySelector("race-selector", purpose);
      expect(stored?.usedAt).toBeInstanceOf(Date);
    });

    it("refuses to spend an expired token", async () => {
      const tokens = new MongoActionTokenRepo(await createActionTokenCollection());
      const userId = await createUser("expired_user");

      await tokens.create({
        userId,
        purpose,
        selector: "expired-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() - 1000)
      });

      await expect(tokens.consume("expired-selector", purpose)).resolves.toBe(false);
    });

    it("rejects a second token with the same selector", async () => {
      const tokens = new MongoActionTokenRepo(await createActionTokenCollection());
      const userId = await createUser("dup_selector_user");
      const input = {
        userId,
        purpose,
        selector: "dup-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 60_000)
      };

      await tokens.create(input);
      await expect(tokens.create(input)).rejects.toThrow();
    });

    it("invalidates only the user's outstanding tokens", async () => {
      const tokens = new MongoActionTokenRepo(await createActionTokenCollection());
      const userId = await createUser("invalidate_user");
      const otherId = await createUser("other_user");
      const expiresAt = new Date(Date.now() + 60_000);

      await tokens.create({ userId, purpose, selector: "mine-1", tokenHash: "h", expiresAt });
      await tokens.create({ userId, purpose, selector: "mine-2", tokenHash: "h", expiresAt });
      await tokens.create({
        userId: otherId,
        purpose,
        selector: "theirs",
        tokenHash: "h",
        expiresAt
      });

      await expect(tokens.invalidateByUserId(userId, purpose)).resolves.toBe(true);

      await expect(tokens.consume("mine-1", purpose)).resolves.toBe(false);
      await expect(tokens.consume("mine-2", purpose)).resolves.toBe(false);
      await expect(tokens.consume("theirs", purpose)).resolves.toBe(true);
    });

    // End to end through the public API: request, deliver, confirm, then log in with the
    // new password. The second confirm with the same token must fail.
    it("recovers an account through the public API", async () => {
      const collection = await createActionTokenCollection();

      const crypto = new BcryptAdapter();
      const users = new MongoUserRepo(database.collection<IMongoUserDoc>(userCollectionName));
      await users.create({
        email: "recover@example.com",
        username: "recover_user",
        passwordHash: await crypto.hashPassword("OriginalPassword!2026-unused")
      });

      const deliveries: RecoveryDelivery[] = [];
      const auth = await createAuthManager({
        adapter: new MongoAdapter(connectOptions),
        authTypes: ["credentials", "recovery"],
        recovery: { deliver: (delivery) => void deliveries.push(delivery) }
      });

      try {
        const requested = await auth.recovery.request("recover@example.com");
        expect(requested.httpCode).toBe(202);
        expect(deliveries).toHaveLength(1);

        const unknown = await auth.recovery.request("nobody@example.com");
        expect(unknown).toEqual(requested);
        expect(deliveries).toHaveLength(1);

        const newPassword = `Recovered-${randomUUID()}`;
        const [first, second] = await Promise.all([
          auth.recovery.confirm(deliveries[0].token, newPassword),
          auth.recovery.confirm(deliveries[0].token, newPassword)
        ]);

        expect([first.success, second.success].filter(Boolean)).toHaveLength(1);

        const login = await auth.credentials.login("recover@example.com", newPassword);
        expect(login.success).toBe(true);

        const replay = await auth.recovery.confirm(deliveries[0].token, `Again-${randomUUID()}`);
        expect(replay.success).toBe(false);
        expect(replay.httpCode).toBe(400);

        // Only the hash of the secret half is ever written.
        const verifier = deliveries[0].token.split(".")[1];
        const stored = await collection.find({}).toArray();
        expect(stored.every((doc) => !doc.token_hash.includes(verifier))).toBe(true);
      } finally {
        await auth.disconnectDB();
      }
    });
  });
});
