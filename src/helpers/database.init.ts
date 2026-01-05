// src/utils/db-helper.ts
import { connectMongo } from "../infra/mongo/db";
import { initPostgres } from "../infra/postgresql/db";
import { AuthOptions } from "../types";

export async function initDatabase(options: AuthOptions) {
  switch (options.dbType) {
    case "mongo":
      if (!options.mongoUri) throw new Error("mongoUri is required");
      const mongoDb = await connectMongo(options.mongoUri);
      console.log("ℹ️ Successfully Connected to MongoDB");
      return mongoDb;

    case "postgres":
      if (!options.postgresUrl) throw new Error("postgresUrl is required");
      const pgDb = await initPostgres(
        options.postgresUrl,
        options.postgresUserTable
      );
      console.log("✅ Successfully connected to PostgreSQL");
      return pgDb;

    default:
      throw new Error(`Unsupported dbType: ${options.dbType}`);
  }
}
