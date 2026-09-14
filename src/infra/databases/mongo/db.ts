import { MongoClient, Collection, Document } from "mongodb";
import { MongoMagicLinkRepo } from "../../../repositories/mongo/magicLink.repo";
import { MongoUserRepo } from "../../../repositories/mongo/user.repo";
import { AuthDB } from "../../../repositories/contracts";
import { IMongoMagicLinkDoc, IMongoUserDoc, InitMongoOptions } from "./types";
import { BaseAuthOptions } from "../../../core/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMongoIndexMetadata(value: unknown): value is {
  key: Record<string, unknown>;
  unique?: unknown;
  sparse?: unknown;
  partialFilterExpression?: unknown;
} {
  return isRecord(value) && isRecord(value.key);
}

async function validateUniqueIndex<T extends Document>(
  collection: Collection<T>,
  collectionName: string,
  field: "email" | "username"
): Promise<void> {
  let indexes: unknown;

  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `[Auth:connectMongo] Failed to inspect indexes for collection '${collectionName}': ${message}`
    );
  }

  if (!Array.isArray(indexes)) {
    throw new Error(
      `[Auth:connectMongo] Invalid index metadata returned for collection '${collectionName}'`
    );
  }

  const indexEntries: unknown[] = indexes;
  const hasUniqueIndex = indexEntries.some((index) => {
    if (!isMongoIndexMetadata(index)) {
      return false;
    }

    const keys = Object.keys(index.key);
    return (
      index.unique === true &&
      index.sparse !== true &&
      index.partialFilterExpression === undefined &&
      keys.length === 1 &&
      keys[0] === field &&
      index.key[field] === 1
    );
  });

  if (!hasUniqueIndex) {
    throw new Error(
      `[Auth:connectMongo] Collection '${collectionName}' must have a non-partial, non-sparse, single-field unique index on '${field}'`
    );
  }
}

/**
 * Connect to MongoDB and initialize repositories
 */
export async function connectMongo(options: InitMongoOptions & BaseAuthOptions): Promise<AuthDB> {
  const { mongoUri, userCollectionName, magicLinkCollectionName, authTypes } = options;

  if (!mongoUri) throw new Error("[Auth:connectMongo] mongoUri is required");
  if (!userCollectionName) throw new Error("[Auth:connectMongo] userCollectionName is required");

  // Connect to MongoDB
  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const db = client.db();

    const userColl: Collection<IMongoUserDoc> = db.collection<IMongoUserDoc>(userCollectionName);
    await Promise.all([
      validateUniqueIndex(userColl, userCollectionName, "email"),
      validateUniqueIndex(userColl, userCollectionName, "username")
    ]);

    // Magic link collection
    let magicColl: Collection<IMongoMagicLinkDoc> | undefined;
    if (authTypes?.includes("magicLink")) {
      if (!magicLinkCollectionName) {
        throw new Error(
          `[Auth:connectMongo] Magic link auth requested but 'magicLinkCollectionName' is not provided`
        );
      }

      magicColl = db.collection<IMongoMagicLinkDoc>(magicLinkCollectionName);
    }

    // Initialize repositories
    return {
      userRepo: new MongoUserRepo(userColl),
      magicLinkRepo: magicColl ? new MongoMagicLinkRepo(magicColl) : undefined,
      close: async () => {
        await client.close();
      }
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
