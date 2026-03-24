import { Pool } from "pg";
import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
import { PostgresMagicLinkSchema, PostgresUserSchema } from "./schema";
import { InitPostgresOptions, BaseAuthOptions, AuthDB } from "../../types/index";

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

  if (!postgresUrl) throw new Error("postgresUrl is required");
  if (!userTableName) throw new Error("userTableName is required");
  const pool = new Pool({ connectionString: postgresUrl });
  await pool.query("SELECT 1"); // Test connection

  // Validate schema exists
  const schemaCheck = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
    [userSchema]
  );

  if (!schemaCheck.rowCount) throw new Error(`Schema '${userSchema}' does not exist`);

  // Validate user table exists
  const qualifiedUserTable = `${userSchema}.${userTableName}`;
  const userTableCheck = await pool.query<{ table_exists: string | null }>(
    `SELECT to_regclass($1) AS table_exists`,
    [qualifiedUserTable]
  );

  if (!userTableCheck.rows[0].table_exists)
    throw new Error(`User table '${qualifiedUserTable}' does not exist`);

  // Validate user columns
  const userColumnsRes = await pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = $2
    `,
    [userTableName, userSchema]
  );

  const requiredUserColumns = PostgresUserSchema.requiredColumns;
  const existingUserColumns = userColumnsRes.rows.map((r) => r.column_name);

  for (const col of requiredUserColumns) {
    if (!existingUserColumns.includes(col))
      throw new Error(`User table '${qualifiedUserTable}' missing required column '${col}'`);
  }

  // Magic link table
  let magicRepo: PostgresMagicLinkRepository | undefined;

  if (authTypes?.includes("magic-link")) {
    const magicTable = magicLinkTableName ?? "magic_links";
    const qualifiedMagicTable = `${magicLinkSchema}.${magicTable}`;

    // Validate magic schema exists
    const magicSchemaCheck = await pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [magicLinkSchema]
    );
    if (!magicSchemaCheck.rowCount) throw new Error(`Schema '${magicLinkSchema}' does not exist`);

    // Validate magic table exists
    const magicTableCheck = await pool.query<{ table_exists: string | null }>(
      `SELECT to_regclass($1) AS table_exists`,
      [qualifiedMagicTable]
    );
    if (!magicTableCheck.rows[0].table_exists)
      throw new Error(`Magic link table '${qualifiedMagicTable}' does not exist`);

    // Validate columns
    const magicColumnsRes = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = $2
      `,
      [magicTable, magicLinkSchema]
    );

    const requiredMagicColumns = PostgresMagicLinkSchema.requiredColumns;
    const existingMagicColumns = magicColumnsRes.rows.map((r) => r.column_name);

    for (const col of requiredMagicColumns) {
      if (!existingMagicColumns.includes(col))
        throw new Error(
          `Magic link table '${qualifiedMagicTable}' missing required column '${col}'`
        );
    }

    // Validate FK user_id → users.id
    const fkCheck = await pool.query<{
      referenced_table: string;
      referenced_schema: string;
      referenced_column: string;
    }>(
      `
        SELECT
          ccu.table_name AS referenced_table,
          ccu.column_name AS referenced_column,
          ccu.table_schema AS referenced_schema
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
          AND tc.table_schema = $2
          AND kcu.column_name = 'user_id'
      `,
      [magicTable, magicLinkSchema]
    );

    const validFK = fkCheck.rows.some(
      (r) =>
        r.referenced_table === userTableName &&
        r.referenced_schema === userSchema &&
        r.referenced_column === "id"
    );

    if (!validFK)
      throw new Error(
        `Magic link table '${qualifiedMagicTable}' must have a foreign key 'user_id' referencing '${qualifiedUserTable}.id'`
      );

    magicRepo = new PostgresMagicLinkRepository(qualifiedMagicTable, pool);
  }

  // Return repositories
  return {
    userRepo: new PostgresUserRepository(qualifiedUserTable, pool),
    magicLinkRepo: magicRepo
  };
}
