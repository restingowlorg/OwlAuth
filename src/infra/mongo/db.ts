import mongoose from "mongoose";
import { Collection } from "mongodb";
import { MongoUserRepo } from "../../repositories/mongo/user.repo";
import { MongoMagicLinkRepo } from "../../repositories/mongo/magicLink.repo";
import { InitMongoOptions, BaseAuthOptions } from "../../types/index";
import { authLog } from "../../utils/logger";
import { AuthDB } from "../../interfaces/index";

/**
 * Connect to MongoDB and validate required collections and fields
 * Magic link collection is optional and inferred from authTypes
 */
export async function connectMongo(
  options: InitMongoOptions & BaseAuthOptions
): Promise<AuthDB> {
  const { mongoUri, userCollectionName, magicLinkCollectionName, authTypes } = options;

  if (!mongoUri) throw new Error("mongoUri is required");
  if (!userCollectionName) throw new Error("userCollectionName is required");

  // Connect to MongoDB
  const connection = await mongoose.connect(mongoUri);
  const db = connection.connection.db;

  if(!db) {
    authLog("error", "Failed to connect to MongoDB - no database instance found");
    throw new Error("Failed to connect to MongoDB");
  }

  // ---------------------------
  // 1️⃣ Verify user collection exists
  // ---------------------------
  const userCollections = await db.listCollections({ name: userCollectionName }).toArray();
  if (userCollections.length === 0) {
    throw new Error(
      `MVP Auth Init Failed: User collection '${userCollectionName}' does not exist.`
    );
  }
  const userColl: Collection = db.collection(userCollectionName);

  // ---------------------------
  // 2️⃣ Validate required user fields
  // ---------------------------
  const requiredUserFields = ["_id", "email", "username", "password"];
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

  // ---------------------------
  // 3️⃣ Optional: Magic link collection
  // ---------------------------
  let magicColl: Collection | undefined;

  if (authTypes?.includes("magic-link")) {
    if (!magicLinkCollectionName) {
      throw new Error(
        `Magic link authentication requested but 'magicLinkCollectionName' is not provided`
      );
    }

    const magicCollections = await db.listCollections({ name: magicLinkCollectionName }).toArray();
    if (magicCollections.length === 0) {
      throw new Error(
        `MVP Auth Init Failed: Magic link collection '${magicLinkCollectionName}' does not exist.`
      );
    }

    magicColl = db.collection(magicLinkCollectionName);

    // Validate required magic link fields
    const requiredMagicFields = ["_id", "userId", "tokenHash", "expiresAt", "usedAt"];
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

  // ---------------------------
  // 4️⃣ Initialize Repositories
  // ---------------------------
  return {
    userRepo: new MongoUserRepo(userColl),
    magicLinkRepo: magicColl ? new MongoMagicLinkRepo(magicColl) : undefined,
  };
}
