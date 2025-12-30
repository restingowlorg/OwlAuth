// src/infra/postgres/db.ts
import { Pool } from "pg";
import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresSessionRepository } from "../../repositories/postgresql/sessions.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
import { AuthDB, InitPostgresOptions } from "../../types";
import { PostgresUserSchema } from "./schema";

let pool: Pool | null = null;

/**
 * Central table mapping
 */
export const PostgresTables = {
  users: "users",
  sessions: "sessions",
  magicLinks: "magic_links",
};

/**
 * Quote identifiers safely
 */
function q(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Check if table exists
 */
async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const { rows } = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    )
    `,
    [table]
  );

  return rows[0]?.exists === true;
}

/**
 * Validate user table existence + required columns
 */
async function validateUserTable(pool: Pool, table: string) {
  // Fetch columns and nullability
  const { rows } = await pool.query(
    `
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    `,
    [table]
  );

  const existingColumns = rows.map((r) => r.column_name);
  const notNullableColumns = rows
    .filter((r) => r.is_nullable === "NO")
    .map((r) => r.column_name);

  // 1️⃣ Check required columns exist
  for (const column of PostgresUserSchema.requiredColumns) {
    if (!existingColumns.includes(column)) {
      console.error(
        `❌ User table "${table}" missing required column "${column}"`
      );
      throw new Error(
        `User table "${table}" missing required column "${column}"`
      );
    }
  }

  // 2️⃣ Detect extra NOT NULL columns
  const extraNotNullCols = notNullableColumns.filter(
    (col) => !PostgresUserSchema.requiredColumns.includes(col)
  );

  if (extraNotNullCols.length > 0) {
    console.error(
      `❌ User table "${table}" has extra NOT NULL columns: ${extraNotNullCols.join(
        ", "
      )}`
    );
    throw new Error(
      `User table "${table}" has extra NOT NULL columns: ${extraNotNullCols.join(
        ", "
      )}`
    );
  }

  console.log(`✅ User table "${table}" validated`);
}

/**
 * Get user table primary key column and type
 */
async function getUserPrimaryKey(pool: Pool, table: string) {
  const { rows } = await pool.query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    `,
    [table]
  );

  // Default to first required column that exists
  for (const col of PostgresUserSchema.requiredColumns) {
    const match = rows.find((r) => r.column_name === col);
    if (match) return { name: match.column_name, type: match.data_type };
  }

  throw new Error(`Cannot determine primary key of user table "${table}"`);
}

/**
 * Initialize PostgreSQL
 */
export async function initPostgres(
  connectionString: string,
  options?: InitPostgresOptions
): Promise<AuthDB> {
  if (!pool) {
    pool = new Pool({ connectionString });
    console.log("ℹ️ PostgreSQL pool created");

    const userTable = options?.userTableName ?? "users";
    PostgresTables.users = userTable;

    const exists = await tableExists(pool, userTable);

    // ---------------- USER TABLE ----------------
    if (options?.userTableName) {
      console.log(`🧩 Using external user table: "${userTable}"`);

      if (!exists) {
        throw new Error(`User table "${userTable}" does not exist`);
      }

      await validateUserTable(pool, userTable);
    } else {
      console.log("🧱 Using library-managed users table");

      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password TEXT
        );
      `);

      await validateUserTable(pool, "users");
    }

    // Get user table PK info
    const userPK = await getUserPrimaryKey(pool, userTable);
    console.log(`🔑 User table primary key: "${userPK.name}" (${userPK.type})`);

    // ---------------- SESSIONS ----------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q(PostgresTables.sessions)} (
        id SERIAL PRIMARY KEY,
        user_id ${userPK.type} NOT NULL REFERENCES ${q(userTable)}(${q(
      userPK.name
    )}) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // ---------------- MAGIC LINKS ----------------
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q(PostgresTables.magicLinks)} (
        id SERIAL PRIMARY KEY,
        user_id ${userPK.type} NOT NULL REFERENCES ${q(userTable)}(${q(
      userPK.name
    )}) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      );
    `);

    console.log("✅ PostgreSQL auth schema ready");
  }

  return {
    userRepo: new PostgresUserRepository(),
    sessionRepo: new PostgresSessionRepository(),
    magicLinkRepo: new PostgresMagicLinkRepository(),
  };
}

/**
 * Get PostgreSQL pool
 */
export function getPostgresPool(): Pool {
  if (!pool)
    throw new Error("PostgreSQL not initialized. Call initPostgres first.");
  return pool;
}
