import mongoose from "mongoose";
import { Collection } from "mongodb";
import { MongoMagicLinkRepo } from "../../repositories/mongo/magicLink.repo";
import { MongoUserRepo } from "../../repositories/mongo/user.repo";
import { InitMongoOptions, BaseAuthOptions, AuthDB } from "../../types/index";
import { authLog } from "../../utils/logger";
import { MongoMagicLinkDoc, MongoUserDoc } from "../../types";

/**
 * Connect to MongoDB and initialize repositories
 */
export async function connectMongo(options: InitMongoOptions & BaseAuthOptions): Promise<AuthDB> {
  const { mongoUri, userCollectionName, magicLinkCollectionName, authTypes } = options;

  if (!mongoUri) throw new Error("mongoUri is required");
  if (!userCollectionName) throw new Error("userCollectionName is required");

  // Connect to MongoDB
  const connection = await mongoose.connect(mongoUri);
  const db = connection.connection.db;

  if (!db) {
    authLog("error", "Failed to connect to MongoDB - no database instance found");
    throw new Error("Failed to connect to MongoDB");
  }

  // ---------------------------
  // Validate user collection
  // ---------------------------
  const userCollections = await db.listCollections({ name: userCollectionName }).toArray();
  if (userCollections.length === 0) {
    throw new Error(`User collection '${userCollectionName}' does not exist.`);
  }

  // Use generic to type collection correctly
  const userColl: Collection<MongoUserDoc> = db.collection<MongoUserDoc>(userCollectionName);

  // Validate required fields
  const requiredUserFields: (keyof MongoUserDoc)[] = ["_id", "email", "username", "password"];
  const userSample = await userColl.findOne({});
  if (userSample) {
    for (const field of requiredUserFields) {
      if (!(field in userSample)) {
        throw new Error(
          `User collection '${userCollectionName}' is missing required field '${field}'`
        );
      }
    }
  }

  // Magic link collection
  let magicColl: Collection<MongoMagicLinkDoc> | undefined;
  if (authTypes?.includes("magic-link")) {
    if (!magicLinkCollectionName) {
      throw new Error(`Magic link auth requested but 'magicLinkCollectionName' is not provided`);
    }

    const magicCollections = await db.listCollections({ name: magicLinkCollectionName }).toArray();
    if (magicCollections.length === 0) {
      throw new Error(`Magic link collection '${magicLinkCollectionName}' does not exist.`);
    }

    magicColl = db.collection<MongoMagicLinkDoc>(magicLinkCollectionName);

    const requiredMagicFields: (keyof MongoMagicLinkDoc)[] = [
      "_id",
      "user_id",
      "token",
      "expires_at",
      "used_at",
      "created_at"
    ];
    const magicSample = await magicColl.findOne({});
    if (magicSample) {
      for (const field of requiredMagicFields) {
        if (!(field in magicSample)) {
          throw new Error(
            `Magic link collection '${magicLinkCollectionName}' is missing required field '${field}'`
          );
        }
      }
    }
  }

  // Initialize repositories
  return {
    userRepo: new MongoUserRepo(userColl),
    magicLinkRepo: magicColl ? new MongoMagicLinkRepo(magicColl) : undefined
  };
}
