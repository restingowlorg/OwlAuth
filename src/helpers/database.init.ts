// src/utils/db-helper.ts
import { connectMongo } from "../infra/mongo/db";
import { initPostgres } from "../infra/postgresql/db";
import { AuthOptions } from "../types/index";
import { authLog } from "../utils/logger";

export async function initDatabase(options: AuthOptions) {
  switch (options.dbType) {
    case "mongo": {
      const { mongoUri, userCollectionName, magicLinkCollectionName } = options.dbOptions;
      const { authTypes } = options; // <- capture authTypes from main options

      if (!mongoUri) throw new Error("mongoUri is required in dbOptions for MongoDB");
      if (!userCollectionName)
        throw new Error("userCollectionName is required in dbOptions for MongoDB");

      // Pass authTypes to connectMongo so it knows if magic link is needed
      const mongoDb = await connectMongo({
        mongoUri,
        userCollectionName,
        magicLinkCollectionName,
        authTypes
      });

      authLog("info", "Successfully connected to MongoDB");
      return mongoDb;
    }

    case "postgres": {
      const { postgresUrl, userTableName, magicLinkTableName } = options.dbOptions;
      const { authTypes } = options; // <- capture authTypes

      if (!postgresUrl) throw new Error("postgresUrl is required in dbOptions for PostgreSQL");
      if (!userTableName) throw new Error("userTableName is required in dbOptions for PostgreSQL");

      // Pass authTypes so initPostgres can validate magic link table only if needed
      const pgDb = await initPostgres({
        postgresUrl,
        userTableName,
        magicLinkTableName,
        authTypes
      });

      authLog("info", "Successfully connected to PostgreSQL");
      return pgDb;
    }

    default:
      authLog("error", `Unsupported dbType identified. Expected "mongo" or "postgres" `);
      throw new Error(`Unsupported dbType identified. Expected "mongo" or "postgres"`);
  }
}
