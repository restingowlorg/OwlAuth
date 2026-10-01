import { Pool } from "pg";
import { PostgresUserRepository } from "../../../repositories/postgresql/user.repo";
import { PostgresMagicLinkRepository } from "../../../repositories/postgresql/magic.link.repo";
import { PostgresAccountSecurityRepository } from "../../../repositories/postgresql/account.security.repo";
import {
  PostgresAccountSecuritySchema,
  PostgresMagicLinkSchema,
  PostgresUserSchema
} from "./schema";
import { ACCOUNT_STATUSES, AuthDB } from "../../../repositories/contracts";
import {
  validateSchema,
  validateTable,
  validateColumns,
  validateNonNullableColumns,
  validateForeignKey,
  validateUniqueColumn,
  validateEnumCheckConstraint
} from "./helpers";
import { InitPostgresOptions } from "./types";
import { BaseAuthOptions } from "../../../core/types";

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
    accountSecurityTableName,
    accountSecuritySchema = "public",
    authTypes,
    accountSecurity
  } = options;

  if (!postgresUrl) throw new Error("[Auth:initPostgres] postgresUrl is required");
  if (!userTableName) throw new Error("[Auth:initPostgres] userTableName is required");

  const pool = new Pool({ connectionString: postgresUrl });
  try {
    const isConnected = await pool.query("SELECT 1"); // Test connection
    if (!isConnected) throw new Error("[Auth:initPostgres] Failed to connect to PostgreSQL");

    const qualifiedUserTable = `${userSchema}.${userTableName}`;

    // Core User table validations
    await Promise.all([
      validateSchema(pool, userSchema),
      validateTable(pool, qualifiedUserTable),
      validateColumns(pool, userSchema, userTableName, PostgresUserSchema.requiredColumns),
      validateNonNullableColumns(pool, userSchema, userTableName, ["email", "username"]),
      validateUniqueColumn(pool, userSchema, userTableName, "email"),
      validateUniqueColumn(pool, userSchema, userTableName, "username")
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

      magicRepo = new PostgresMagicLinkRepository(magicLinkSchema, magicTable, pool);
    }

    // Account security table validations (if enabled)
    let accountSecurityRepo: PostgresAccountSecurityRepository | undefined;

    if (accountSecurity) {
      const accountSecurityTable = accountSecurityTableName ?? "account_security";
      const qualifiedAccountSecurityTable = `${accountSecuritySchema}.${accountSecurityTable}`;

      await Promise.all([
        validateSchema(pool, accountSecuritySchema),
        validateTable(pool, qualifiedAccountSecurityTable),
        validateColumns(
          pool,
          accountSecuritySchema,
          accountSecurityTable,
          PostgresAccountSecuritySchema.requiredColumns
        ),
        validateNonNullableColumns(pool, accountSecuritySchema, accountSecurityTable, [
          "user_id",
          "status",
          "updated_at"
        ]),
        // One state record per user.
        validateUniqueColumn(pool, accountSecuritySchema, accountSecurityTable, "user_id"),
        // Without this constraint the column accepts any string, so a typo could be
        // stored where a meaningful status was intended.
        validateEnumCheckConstraint(
          pool,
          accountSecuritySchema,
          accountSecurityTable,
          "status",
          ACCOUNT_STATUSES
        ),
        validateForeignKey(
          pool,
          accountSecuritySchema,
          accountSecurityTable,
          userSchema,
          userTableName,
          "user_id",
          "id"
        )
      ]);

      accountSecurityRepo = new PostgresAccountSecurityRepository(
        accountSecuritySchema,
        accountSecurityTable,
        pool
      );
    }

    // Return repositories
    return {
      userRepo: new PostgresUserRepository(userSchema, userTableName, pool),
      magicLinkRepo: magicRepo,
      accountSecurityRepo,
      close: async () => {
        await pool.end();
      }
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
