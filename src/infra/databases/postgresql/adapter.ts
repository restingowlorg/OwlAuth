import { initPostgres } from "./db";
import {
  AuthDB,
  BaseAuthOptions,
  IDatabaseAdapter,
  InitPostgresOptions
} from "../../../types/index";

export class PostgresAdapter implements IDatabaseAdapter {
  constructor(private readonly config: InitPostgresOptions) {}

  async connect(options: BaseAuthOptions): Promise<AuthDB> {
    const { postgresUrl, userTableName, userSchema, magicLinkTableName, magicLinkSchema } =
      this.config;
    const { authTypes } = options;

    if (!postgresUrl)
      throw new Error("[Auth:PostgresAdapter] postgresUrl is required for PostgresAdapter");
    if (!userTableName)
      throw new Error("[Auth:PostgresAdapter] userTableName is required for PostgresAdapter");

    return await initPostgres({
      postgresUrl,
      userTableName,
      userSchema,
      magicLinkTableName,
      magicLinkSchema,
      authTypes
    });
  }
}
