import { Pool, QueryResult } from "pg";
import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
import { AuthDB, ColumnRow, FKRow, TableExistsRow } from "../../interfaces/index";
import { InitPostgresOptions, BaseAuthOptions } from "../../types/index";

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) throw new Error("PostgreSQL not initialized. Call initPostgres first.");
  return pool;
}

export async function initPostgres(
  options: InitPostgresOptions & BaseAuthOptions
): Promise<AuthDB> {
  const { postgresUrl, userTableName, magicLinkTableName, authTypes } = options;

  if (!postgresUrl) throw new Error("postgresUrl is required");
  if (!userTableName) throw new Error("userTableName is required");

  if (pool) throw new Error("PostgreSQL already initialized");

  pool = new Pool({ connectionString: postgresUrl });

  // Test connection
  await pool.query("SELECT 1");

  // ---------------------------
  // 1️⃣ Validate user table exists
  // ---------------------------
  const userTableCheck: QueryResult<TableExistsRow> = await pool.query(
    `SELECT to_regclass($1) AS table_exists`,
    [userTableName]
  );

  if (!userTableCheck.rows[0].table_exists) {
    throw new Error(`User table '${userTableName}' does not exist`);
  }

  // Validate required user table columns
  const userColumnsRes: QueryResult<ColumnRow> = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [userTableName]
  );

  const requiredUserColumns = ["id", "email", "username", "password"];
  const existingUserColumns = userColumnsRes.rows.map((r) => r.column_name);

  for (const col of requiredUserColumns) {
    if (!existingUserColumns.includes(col)) {
      throw new Error(`User table '${userTableName}' missing required column '${col}'`);
    }
  }

  // ---------------------------
  // 2️⃣ Optional: Magic link table
  // ---------------------------
  let magicRepo: PostgresMagicLinkRepository | undefined;

  if (authTypes?.includes("magic-link")) {
    const magicTable = magicLinkTableName ?? "magic_links";

    const magicTableCheck: QueryResult<TableExistsRow> = await pool.query(
      `SELECT to_regclass($1) AS table_exists`,
      [magicTable]
    );
    if (!magicTableCheck.rows[0].table_exists) {
      throw new Error(`Magic link table '${magicTable}' does not exist`);
    }

    const magicColumnsRes: QueryResult<ColumnRow> = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [magicTable]
    );

    const requiredMagicColumns = ["id", "user_id", "token_hash", "expires_at", "used_at"];
    const existingMagicColumns = magicColumnsRes.rows.map((r) => r.column_name);

    for (const col of requiredMagicColumns) {
      if (!existingMagicColumns.includes(col)) {
        throw new Error(`Magic link table '${magicTable}' missing required column '${col}'`);
      }
    }

    // Validate foreign key from magic_links.user_id → users.id
    const fkCheck: QueryResult<FKRow> = await pool.query(
      `
      SELECT
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND kcu.column_name = 'user_id'
      `,
      [magicTable]
    );

    const validFK = fkCheck.rows.some(
      (r) => r.referenced_table === userTableName && r.referenced_column === "id"
    );

    if (!validFK) {
      throw new Error(
        `Magic link table '${magicTable}' must have a foreign key 'user_id' referencing '${userTableName}.id'`
      );
    }

    magicRepo = new PostgresMagicLinkRepository(magicTable);
  }

  // ---------------------------
  // 3️⃣ Return repositories
  // ---------------------------
  return {
    userRepo: new PostgresUserRepository(userTableName),
    magicLinkRepo: magicRepo
  };
}
