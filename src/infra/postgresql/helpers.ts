// src/infra/postgres/helpers.ts
import { Pool } from "pg";
import { PostgresUserSchema } from "./schema";
import { authLog } from "../../utils/logger";

// Quote identifier
export function q(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// Check if table exists
export async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const { rows } = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    )
    `,
    [table],
  );

  return rows[0]?.exists === true;
}

// Validate user table
export async function validateUserTable(pool: Pool, table: string) {
  const { rows } = await pool.query(
    `
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    `,
    [table],
  );

  const existingColumns = rows.map((r) => r.column_name);
  const notNullColumns = rows
    .filter((r) => r.is_nullable === "NO")
    .map((r) => r.column_name);

  for (const col of PostgresUserSchema.requiredColumns) {
    if (!existingColumns.includes(col)) {
      authLog("error", `User table "${table}" missing column "${col}"`);
      throw new Error(`User table "${table}" missing required column "${col}"`);
    }
  }

  const illegalNotNulls = notNullColumns.filter(
    (c) => !PostgresUserSchema.requiredColumns.includes(c),
  );

  if (illegalNotNulls.length > 0) {
    authLog(
      "error",
      `User table "${table}" has extra NOT NULL columns: ${illegalNotNulls.join(", ")}`,
    );
    throw new Error(
      `User table "${table}" has extra NOT NULL columns: ${illegalNotNulls.join(
        ", ",
      )}`,
    );
  }
}

// Detect primary key for user table
export async function getUserPrimaryKey(pool: Pool, table: string) {
  const { rows } = await pool.query(
    `
    SELECT
      kcu.column_name,
      c.data_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.columns c
      ON c.table_name = tc.table_name
     AND c.column_name = kcu.column_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = $1
    `,
    [table],
  );

  if (!rows.length) {
    throw new Error(`User table "${table}" has no PRIMARY KEY`);
  }

  return {
    name: rows[0].column_name,
    type: rows[0].data_type,
  };
}

// Ensure user table exists
export async function ensureUserTable(
  pool: Pool,
  userTable: string,
  isExternal: boolean,
) {
  authLog(
    "info",
    `Starting ensureUserTable for "${userTable}", isExternal=${isExternal}`,
  );

  // Check if table exists
  const exists = await tableExists(pool, userTable);

  if (exists) {
    authLog(
      "info",
      `User table "${userTable}" already exists. Ensuring required columns...`,
    );

    // Add missing columns one by one
    const { rows } = await pool.query(
      `
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
      [userTable],
    );

    const existingColumns = rows.map((r) => r.column_name);

    if (!existingColumns.includes("username")) {
      authLog("info", `Adding missing column "username"`);
      await pool.query(
        `ALTER TABLE ${q(userTable)} ADD COLUMN username TEXT UNIQUE NOT NULL`,
      );
    }

    if (!existingColumns.includes("password")) {
      authLog("info", `Adding missing column "password"`);
      await pool.query(`ALTER TABLE ${q(userTable)} ADD COLUMN password TEXT`);
    }

    authLog("info", `All required columns exist for "${userTable}"`);
    return;
  }

  // Table does not exist → create it
  authLog("info", `Auto-creating user table "${userTable}"`);
  await pool.query(`
    CREATE TABLE ${q(userTable)} (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT
    );
  `);

  authLog("info", `User table "${userTable}" created successfully`);
}

// Ensure magic link table exists
export async function ensureMagicLinkTable(
  pool: Pool,
  table: string,
  userTable: string,
  userPK: { name: string; type: string },
) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q(table)} (
      id SERIAL PRIMARY KEY,
      user_id ${userPK.type} NOT NULL
        REFERENCES ${q(userTable)}(${q(userPK.name)})
        ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      used_at TIMESTAMP
    );
  `);
}
