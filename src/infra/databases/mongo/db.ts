import { MongoClient, Collection } from "mongodb";
import { MongoMagicLinkRepo } from "../../../repositories/mongo/magicLink.repo";
import { MongoUserRepo } from "../../../repositories/mongo/user.repo";
import { AuthDB } from "../../../repositories/contracts";
import { IMongoMagicLinkDoc, IMongoUserDoc, InitMongoOptions } from "./types";
import { BaseAuthOptions } from "../../../core/types";

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
  const db = client.db();

  // Use generic to type collection correctly
  const userColl: Collection<IMongoUserDoc> = db.collection<IMongoUserDoc>(userCollectionName);

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
}
