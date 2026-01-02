// src/infra/postgres/helpers.ts
import { Pool } from "pg";
import { PostgresUserSchema } from "./schema";

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
    [table]
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
    [table]
  );

  const existingColumns = rows.map((r) => r.column_name);
  const notNullColumns = rows
    .filter((r) => r.is_nullable === "NO")
    .map((r) => r.column_name);

  for (const col of PostgresUserSchema.requiredColumns) {
    if (!existingColumns.includes(col)) {
      throw new Error(`User table "${table}" missing required column "${col}"`);
    }
  }

  const illegalNotNulls = notNullColumns.filter(
    (c) => !PostgresUserSchema.requiredColumns.includes(c)
  );

  if (illegalNotNulls.length > 0) {
    throw new Error(
      `User table "${table}" has extra NOT NULL columns: ${illegalNotNulls.join(
        ", "
      )}`
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
    [table]
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
  isExternal: boolean
) {
  if (isExternal) {
    if (!(await tableExists(pool, userTable))) {
      throw new Error(`User table "${userTable}" does not exist`);
    }
    await validateUserTable(pool, userTable);
    return;
  }

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS ${q(userTable)} (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT
    );
  `);

  await validateUserTable(pool, userTable);
}

// Ensure session table exists
export async function ensureSessionTable(
  pool: Pool,
  table: string,
  userTable: string,
  userPK: { name: string; type: string }
) {
  const tableExistsQuery = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
  `;
  const { rows } = await pool.query(tableExistsQuery, [table]);
  const exists = rows[0]?.exists;

  if (!exists) {
    // Table does not exist → create fresh
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE ${q(table)} (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id ${userPK.type} NOT NULL
          REFERENCES ${q(userTable)}(${q(userPK.name)})
          ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        last_used_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX idx_${table}_token_hash ON ${q(table)} (token_hash);
      CREATE INDEX idx_${table}_user_id ON ${q(table)} (user_id);
    `);
    console.log(`Session table "${table}" created.`);
    return;
  }

  // Table exists → check columns
  const { rows: cols } = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [table]
  );

  const existingCols = cols.map((c) => c.column_name);

  // Columns to ensure
  const migrations: string[] = [];

  if (!existingCols.includes("token_hash")) {
    // Step 1: add nullable column
    await pool.query(`ALTER TABLE ${q(table)} ADD COLUMN token_hash TEXT;`);

    // Step 2: backfill existing sessions with random UUID
    await pool.query(`
    UPDATE ${q(table)}
    SET token_hash = gen_random_uuid()::text
    WHERE token_hash IS NULL;
  `);

    // Step 3: set NOT NULL constraint
    await pool.query(
      `ALTER TABLE ${q(table)} ALTER COLUMN token_hash SET NOT NULL;`
    );

    // Step 4: add unique index
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_token_hash ON ${q(
        table
      )} (token_hash);`
    );
  }
  if (!existingCols.includes("last_used_at")) {
    migrations.push(
      `ALTER TABLE ${q(
        table
      )} ADD COLUMN last_used_at TIMESTAMP NOT NULL DEFAULT NOW();`
    );
  }
  if (!existingCols.includes("revoked_at")) {
    migrations.push(
      `ALTER TABLE ${q(table)} ADD COLUMN revoked_at TIMESTAMP NULL;`
    );
  }

  if (migrations.length > 0) {
    for (const sql of migrations) {
      await pool.query(sql);
    }
    console.log(
      `ℹ️  Session table "${table}" migrated: added columns ${migrations
        .map((s) => s.match(/ADD COLUMN (\w+)/)?.[1])
        .join(", ")}`
    );
  }
}

// Ensure magic link table exists
export async function ensureMagicLinkTable(
  pool: Pool,
  table: string,
  userTable: string,
  userPK: { name: string; type: string }
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
