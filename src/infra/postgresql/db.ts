// src/infra/postgresql/db.ts
import { Pool, QueryResult } from "pg";
import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresSessionRepository } from "../../repositories/postgresql/sessions.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
import { AuthDB, InitPostgresOptions, TableColumn } from "../../types";
import { PostgresUserSchema } from "./schema";

let pool: Pool | null = null;

/* ----------------------------- */
/* Type Definitions for Queries  */
/* ----------------------------- */

/* ----------------------------- */
/* Central table mapping         */
/* ----------------------------- */
export const PostgresTables = {
  users: "users",
  sessions: "sessions",
  magicLinks: "magic_links"
};

/* ----------------------------- */
/* Quote identifiers safely      */
/* ----------------------------- */
function q(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

/* ----------------------------- */
/* Check if table exists         */
/* ----------------------------- */
async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    )
    `,
    [table]
  );
  return rows[0]?.exists ?? false;
}

/* ----------------------------- */
/* Ensure required columns exist */
/* ----------------------------- */
async function ensureColumns(pool: Pool) {
  const tables = [
    { name: PostgresTables.users, columns: ["id", "email", "password"] },
    { name: PostgresTables.sessions, columns: ["id", "user_id", "created_at"] },
    {
      name: PostgresTables.magicLinks,
      columns: ["id", "user_id", "token", "created_at", "used_at"]
    }
  ];

  for (const table of tables) {
    const { rows }: QueryResult<{ column_name: string }> = await pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name='${table.name}';
    `);
    const existingColumns = rows.map((r) => r.column_name);

    for (const col of table.columns) {
      if (!existingColumns.includes(col)) {
        switch (col) {
          case "id":
            await pool.query(
              `ALTER TABLE ${q(table.name)} ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
            );
            break;
          case "email":
            await pool.query(`ALTER TABLE ${q(table.name)} ADD COLUMN email TEXT UNIQUE NOT NULL`);
            break;
          case "password":
            await pool.query(`ALTER TABLE ${q(table.name)} ADD COLUMN password TEXT`);
            break;
          case "user_id":
            await pool.query(
              `ALTER TABLE ${q(table.name)} ADD COLUMN user_id UUID REFERENCES ${q(PostgresTables.users)}(id) ON DELETE CASCADE`
            );
            break;
          case "created_at":
            await pool.query(
              `ALTER TABLE ${q(table.name)} ADD COLUMN created_at TIMESTAMP DEFAULT NOW()`
            );
            break;
          case "token":
            await pool.query(`ALTER TABLE ${q(table.name)} ADD COLUMN token TEXT UNIQUE NOT NULL`);
            break;
          case "used_at":
            await pool.query(`ALTER TABLE ${q(table.name)} ADD COLUMN used_at TIMESTAMP`);
            break;
        }
      }
    }
  }
}

/* ----------------------------- */
/* Validate user table           */
/* ----------------------------- */
async function validateUserTable(pool: Pool, table: string) {
  const { rows }: QueryResult<TableColumn> = await pool.query(
    `
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [table]
  );

  const existingColumns = rows.map((r) => r.column_name);
  const notNullableColumns = rows.filter((r) => r.is_nullable === "NO").map((r) => r.column_name);

  for (const column of PostgresUserSchema.requiredColumns) {
    if (!existingColumns.includes(column)) {
      throw new Error(`User table "${table}" missing required column "${column}"`);
    }
  }

  const extraNotNullCols = notNullableColumns.filter(
    (col) => !PostgresUserSchema.requiredColumns.includes(col as "id" | "email" | "password")
  );
  if (extraNotNullCols.length > 0) {
    throw new Error(
      `User table "${table}" has extra NOT NULL columns: ${extraNotNullCols.join(", ")}`
    );
  }
}

/* ----------------------------- */
/* Get user primary key info      */
/* ----------------------------- */
async function getUserPrimaryKey(pool: Pool, table: string) {
  const { rows }: QueryResult<TableColumn> = await pool.query(
    `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [table]
  );

  for (const col of PostgresUserSchema.requiredColumns) {
    const match = rows.find((r) => r.column_name === col);
    if (match) return { name: match.column_name, type: match.data_type ?? "text" };
  }

  throw new Error(`Cannot determine primary key of user table "${table}"`);
}

/* ----------------------------- */
/* Initialize PostgreSQL          */
/* ----------------------------- */
export async function initPostgres(
  connectionString: string,
  options?: InitPostgresOptions
): Promise<AuthDB> {
  if (!pool) {
    pool = new Pool({ connectionString });

    const userTable = options?.userTableName ?? "users";
    PostgresTables.users = userTable;

    const exists = await tableExists(pool, userTable);

    if (options?.userTableName) {
      if (!exists) throw new Error(`User table "${userTable}" does not exist`);
      await validateUserTable(pool, userTable);
    } else {
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

    const userPK = await getUserPrimaryKey(pool, userTable);

    // Sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q(PostgresTables.sessions)} (
        id SERIAL PRIMARY KEY,
        user_id ${userPK.type} NOT NULL REFERENCES ${q(userTable)}(${q(userPK.name)}) ON DELETE CASCADE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Magic links table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${q(PostgresTables.magicLinks)} (
        id SERIAL PRIMARY KEY,
        user_id ${userPK.type} NOT NULL REFERENCES ${q(userTable)}(${q(userPK.name)}) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      );
    `);

    await ensureColumns(pool);
  }

  return {
    userRepo: new PostgresUserRepository(),
    sessionRepo: new PostgresSessionRepository(),
    magicLinkRepo: new PostgresMagicLinkRepository()
  };
}

/* ----------------------------- */
/* Get PostgreSQL pool           */
/* ----------------------------- */
export function getPostgresPool(): Pool {
  if (!pool) throw new Error("PostgreSQL not initialized. Call initPostgres first.");
  return pool;
}
