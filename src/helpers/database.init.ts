// src/utils/db-helper.ts
import { connectMongo } from "../infra/mongo/db";
import { initPostgres } from "../infra/postgresql/db";
import { AuthOptions } from "../types";
import { authLog } from "../utils/logger";

export async function initDatabase(options: AuthOptions) {
  switch (options.dbType) {
    case "mongo": {
      if (!options.mongoUri) throw new Error("mongoUri is required");
      const mongoDb = await connectMongo(options.mongoUri);
      authLog("info", "Successfully connected to MongoDB");
      return mongoDb;
    }

    case "postgres": {
      if (!options.postgresUrl) throw new Error("postgresUrl is required");
      const pgDb = await initPostgres(options.postgresUrl, options.postgresUserTable);
      authLog("info", "Successfully connected to PostgreSQL");
      return pgDb;
    }

    default: {
      throw new Error(`Unsupported dbType: ${String(options.dbType)}`);
    }
  }
}
