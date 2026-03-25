import { Pool } from "pg";
import { PostgresUserRepository } from "../../../repositories/postgresql/user.repo";
import { PostgresMagicLinkRepository } from "../../../repositories/postgresql/magic.link.repo";
import { PostgresMagicLinkSchema, PostgresUserSchema } from "./schema";
import { InitPostgresOptions, BaseAuthOptions, AuthDB } from "../../../types/index";
import { validateSchema, validateTable, validateColumns, validateForeignKey } from "./helpers";

/**
 * Initialize PostgreSQL connection and repositories
 */
export async function initPostgres(
  options: InitPostgresOptions & BaseAuthOptions
): Promise<AuthDB> {
  const {
    postgresUrl,
    userTableName,
    userSchema = "public",
    magicLinkTableName,
    magicLinkSchema = "public",
    authTypes
  } = options;

  if (!postgresUrl) throw new Error("[Auth:initPostgres] postgresUrl is required");
  if (!userTableName) throw new Error("[Auth:initPostgres] userTableName is required");

  const pool = new Pool({ connectionString: postgresUrl });
  const isConnected = await pool.query("SELECT 1"); // Test connection
  if (!isConnected) throw new Error("[Auth:initPostgres] Failed to connect to PostgreSQL");

  const qualifiedUserTable = `${userSchema}.${userTableName}`;

  // Core User table validations
  await Promise.all([
    validateSchema(pool, userSchema),
    validateTable(pool, qualifiedUserTable),
    validateColumns(pool, userSchema, userTableName, PostgresUserSchema.requiredColumns)
  ]);

  // Magic link table validations (if enabled)
  let magicRepo: PostgresMagicLinkRepository | undefined;

  if (authTypes?.includes("magicLink")) {
    const magicTable = magicLinkTableName ?? "magic_links";
    const qualifiedMagicTable = `${magicLinkSchema}.${magicTable}`;

    await Promise.all([
      validateSchema(pool, magicLinkSchema),
      validateTable(pool, qualifiedMagicTable),
      validateColumns(pool, magicLinkSchema, magicTable, PostgresMagicLinkSchema.requiredColumns),
      validateForeignKey(
        pool,
        magicLinkSchema,
        magicTable,
        userSchema,
        userTableName,
        "user_id",
        "id"
      )
    ]);

    magicRepo = new PostgresMagicLinkRepository(qualifiedMagicTable, pool);
  }

  // Return repositories
  return {
    userRepo: new PostgresUserRepository(qualifiedUserTable, pool),
    magicLinkRepo: magicRepo,
    close: async () => {
      await pool.end();
    }
  };
}
