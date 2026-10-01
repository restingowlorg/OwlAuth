import { MongoClient, Collection, Db, Document } from "mongodb";
import { MongoMagicLinkRepo } from "../../../repositories/mongo/magicLink.repo";
import { MongoUserRepo } from "../../../repositories/mongo/user.repo";
import { MongoAccountSecurityRepo } from "../../../repositories/mongo/accountSecurity.repo";
import { ACCOUNT_STATUSES, AuthDB } from "../../../repositories/contracts";
import { MongoAccountSecuritySchema } from "./schema";
import {
  IMongoAccountSecurityDoc,
  IMongoMagicLinkDoc,
  IMongoUserDoc,
  InitMongoOptions
} from "./types";
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

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const nested = value[key];
  return isRecord(nested) ? nested : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: unknown[] = value;
  const strings = items.filter((item): item is string => typeof item === "string");
  return strings.length === items.length ? strings : undefined;
}

/** `bsonType` accepts either a single type or a list of them. */
function bsonTypesOf(property: Record<string, unknown> | undefined): string[] {
  if (!property) return [];
  const bsonType = property["bsonType"];
  if (typeof bsonType === "string") return [bsonType];
  return stringArray(bsonType) ?? [];
}

/**
 * Verify the account security collection carries a `$jsonSchema` validator covering the
 * required fields and restricting `status` to the known values.
 *
 * MongoDB has no columns to inspect, so without a collection validator the store accepts a
 * document with a missing field, a `user_id` of the wrong BSON type, or a mistyped status.
 * The service layer refuses to honour a status it does not recognise, but a validator stops
 * the bad value being written at all — the same role the `CHECK` constraint plays in
 * PostgreSQL.
 */
async function validateAccountSecuritySchema(
  database: Db,
  collectionName: string,
  requiredFields: readonly string[],
  allowedStatuses: readonly string[]
): Promise<void> {
  const fail = (detail: string): never => {
    throw new Error(
      `[Auth:connectMongo] Collection '${collectionName}' ${detail}. Create it with a $jsonSchema validator that requires ${requiredFields
        .map((field) => `'${field}'`)
        .join(", ")} and restricts 'status' to ${allowedStatuses
        .map((status) => `'${status}'`)
        .join(", ")}`
    );
  };

  let collections: unknown[];
  try {
    collections = await database.listCollections({ name: collectionName }).toArray();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `[Auth:connectMongo] Failed to inspect collection '${collectionName}': ${message}`
    );
  }

  const info = collections[0];
  if (info === undefined) {
    fail("does not exist");
    return;
  }

  // listCollections reports the validator under `options.validator.$jsonSchema`.
  const jsonSchema = nestedRecord(
    nestedRecord(nestedRecord(info, "options"), "validator"),
    "$jsonSchema"
  );
  if (!jsonSchema) {
    fail("must have a $jsonSchema validator");
    return;
  }

  const required = stringArray(jsonSchema["required"]) ?? [];
  const missing = requiredFields.filter((field) => !required.includes(field));
  if (missing.length > 0) {
    fail(`validator must list ${missing.map((field) => `'${field}'`).join(", ")} as required`);
  }

  const properties = nestedRecord(jsonSchema, "properties");
  const statusEnum = stringArray(nestedRecord(properties, "status")?.["enum"]);

  // An enum permitting anything beyond the known statuses reintroduces the problem the
  // validator exists to prevent, so the sets must match exactly.
  const statusEnumMatches =
    statusEnum !== undefined &&
    statusEnum.length === allowedStatuses.length &&
    allowedStatuses.every((status) => statusEnum.includes(status));

  if (!statusEnumMatches) {
    fail("validator must restrict 'status' to exactly the known statuses");
  }

  if (!bsonTypesOf(nestedRecord(properties, "user_id")).includes("objectId")) {
    // The repository queries by ObjectId; a string would silently never match.
    fail("validator must declare 'user_id' as bsonType 'objectId'");
  }

  for (const dateField of ["email_verified_at", "updated_at"]) {
    if (requiredFields.includes(dateField)) {
      if (!bsonTypesOf(nestedRecord(properties, dateField)).includes("date")) {
        fail(`validator must declare '${dateField}' as bsonType 'date'`);
      }
    }
  }
}

async function validateUniqueIndex<T extends Document>(
  collection: Collection<T>,
  collectionName: string,
  field: string
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
  const {
    mongoUri,
    userCollectionName,
    magicLinkCollectionName,
    accountSecurityCollectionName,
    authTypes,
    accountSecurity
  } = options;

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

    // Account security collection
    let accountSecurityColl: Collection<IMongoAccountSecurityDoc> | undefined;
    if (accountSecurity) {
      if (!accountSecurityCollectionName) {
        throw new Error(
          `[Auth:connectMongo] Account security requested but 'accountSecurityCollectionName' is not provided`
        );
      }

      accountSecurityColl = db.collection<IMongoAccountSecurityDoc>(accountSecurityCollectionName);

      // Checked before the index so a missing collection reports itself clearly.
      await validateAccountSecuritySchema(
        db,
        accountSecurityCollectionName,
        MongoAccountSecuritySchema.requiredFields,
        ACCOUNT_STATUSES
      );

      // One state record per user.
      await validateUniqueIndex(accountSecurityColl, accountSecurityCollectionName, "user_id");
    }

    // Initialize repositories
    return {
      userRepo: new MongoUserRepo(userColl),
      magicLinkRepo: magicColl ? new MongoMagicLinkRepo(magicColl) : undefined,
      accountSecurityRepo: accountSecurityColl
        ? new MongoAccountSecurityRepo(accountSecurityColl)
        : undefined,
      close: async () => {
        await client.close();
      }
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
