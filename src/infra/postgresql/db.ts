import { Pool } from "pg";
import { AuthDB, InitPostgresOptions } from "../../types";

import {
  ensureMagicLinkTable,
  ensureSessionTable,
  ensureUserTable,
  getUserPrimaryKey,
} from "./helpers";

import { PostgresUserRepository } from "../../repositories/postgresql/user.repo";
import { PostgresSessionRepository } from "../../repositories/postgresql/sessions.repo";
import { PostgresMagicLinkRepository } from "../../repositories/postgresql/magic.link.repo";

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL not initialized. Call initPostgres first.");
  }
  return pool;
}

export async function initPostgres(
  connectionString: string,
  options?: InitPostgresOptions
): Promise<AuthDB> {
  if (!pool) {
    pool = new Pool({ connectionString });

    const tables = {
      users: options?.userTableName ?? "users",
      sessions: "sessions",
      magicLinks: "magic_links",
    };

    await ensureUserTable(
      pool,
      tables.users,
      Boolean(options?.userTableName)
    );

    const userPK = await getUserPrimaryKey(pool, tables.users);

    await ensureSessionTable(
      pool,
      tables.sessions,
      tables.users,
      userPK
    );

    await ensureMagicLinkTable(
      pool,
      tables.magicLinks,
      tables.users,
      userPK
    );

    return {
      userRepo: new PostgresUserRepository(tables.users),
      sessionRepo: new PostgresSessionRepository(tables.sessions),
      magicLinkRepo: new PostgresMagicLinkRepository(tables.magicLinks),
    };
  }

  throw new Error("PostgreSQL already initialized");
}
