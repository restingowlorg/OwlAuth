// src/infra/postgresql/db.ts
import { Pool, QueryResult } from "pg";
import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresSessionRepository } from "../../repositories/postgresql/sessions.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";
import { AuthDB } from "../../types";

let pool: Pool | null = null;

/**
 * Ensure all required columns exist in the tables
 */
async function ensureColumns(pool: Pool) {
  // --- Users table ---
  const userColsResult: QueryResult<{ column_name: string }> = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name='users';
  `);
  const existingUserCols = userColsResult.rows.map((r) => r.column_name);

  if (!existingUserCols.includes("id"))
    await pool.query(`ALTER TABLE users ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid()`);
  if (!existingUserCols.includes("email"))
    await pool.query(`ALTER TABLE users ADD COLUMN email TEXT UNIQUE NOT NULL`);
  if (!existingUserCols.includes("password"))
    await pool.query(`ALTER TABLE users ADD COLUMN password TEXT`);

  // --- Sessions table ---
  const sessionColsResult: QueryResult<{ column_name: string }> = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name='sessions';
  `);
  const existingSessionCols = sessionColsResult.rows.map((r) => r.column_name);

  if (!existingSessionCols.includes("id"))
    await pool.query(
      `ALTER TABLE sessions ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
    );
  if (!existingSessionCols.includes("user_id"))
    await pool.query(
      `ALTER TABLE sessions ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );
  if (!existingSessionCols.includes("created_at"))
    await pool.query(`ALTER TABLE sessions ADD COLUMN created_at TIMESTAMP DEFAULT NOW()`);

  // --- Magic links table ---
  const magicColsResult: QueryResult<{ column_name: string }> = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name='magic_links';
  `);
  const existingMagicCols = magicColsResult.rows.map((r) => r.column_name);

  if (!existingMagicCols.includes("id"))
    await pool.query(
      `ALTER TABLE magic_links ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
    );
  if (!existingMagicCols.includes("user_id"))
    await pool.query(
      `ALTER TABLE magic_links ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE`
    );
  if (!existingMagicCols.includes("token"))
    await pool.query(`ALTER TABLE magic_links ADD COLUMN token TEXT UNIQUE NOT NULL`);
  if (!existingMagicCols.includes("created_at"))
    await pool.query(`ALTER TABLE magic_links ADD COLUMN created_at TIMESTAMP DEFAULT NOW()`);
  if (!existingMagicCols.includes("used_at"))
    await pool.query(`ALTER TABLE magic_links ADD COLUMN used_at TIMESTAMP`);
}

/**
 * Initialize PostgreSQL connection pool and return AuthDB
 */
export async function initPostgres(connectionString: string): Promise<AuthDB> {
  if (!pool) {
    pool = new Pool({ connectionString });
    // eslint-disable-next-line no-console
    console.log("ℹ️ PostgreSQL pool created");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS magic_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      );
    `);

    await ensureColumns(pool);
    // eslint-disable-next-line no-console
    console.log("✅ PostgreSQL initialized with automatic migrations");
  }

  return {
    userRepo: new PostgresUserRepository(),
    sessionRepo: new PostgresSessionRepository(),
    magicLinkRepo: new PostgresMagicLinkRepository()
  };
}

/**
 * Get the existing PostgreSQL pool
 */
export function getPostgresPool(): Pool {
  if (!pool) throw new Error("PostgreSQL not initialized. Call initPostgres first.");
  return pool;
}
