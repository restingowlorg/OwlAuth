import { getPostgresPool } from "../../infra/postgresql/db";
import { MagicLinkToken, MagicLinkTokenRow } from "../../types";
import { MagicLinkRepository } from "../contracts";
import { QueryResult } from "pg";

export class PostgresMagicLinkRepository implements MagicLinkRepository {
  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    const pool = getPostgresPool();
    const result: QueryResult<MagicLinkTokenRow> = await pool.query(
      `INSERT INTO magic_links (user_id, token, expires_at, used_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [token.userId, token.tokenHash, token.expiresAt, token.usedAt || null]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at || undefined
    };
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const pool = getPostgresPool();
    const result: QueryResult<MagicLinkTokenRow> = await pool.query(
      "SELECT * FROM magic_links WHERE token = $1",
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at || undefined
    };
  }

  async markUsed(id: string): Promise<void> {
    const pool = getPostgresPool();
    await pool.query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [id]);
  }

  async findAll(): Promise<MagicLinkToken[]> {
    const pool = getPostgresPool();
    const result: QueryResult<MagicLinkTokenRow> = await pool.query(
      "SELECT * FROM magic_links WHERE used_at IS NULL AND expires_at > NOW()"
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at || undefined
    }));
  }
}
