import { getPostgresPool } from "../../infra/postgresql/db";
import { MagicLinkRepository, MagicLinkToken } from "../contracts";

export class PostgresMagicLinkRepository implements MagicLinkRepository {
  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    const pool = getPostgresPool();
    const result = await pool.query(
      `INSERT INTO magic_links (user_id, token, expires_at, used_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [token.userId, token.tokenHash, token.expiresAt, token.usedAt || null]
    );
    return result.rows[0];
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const pool = getPostgresPool();
    const result = await pool.query(
      "SELECT * FROM magic_links WHERE token = $1",
      [tokenHash]
    );
    return result.rows[0] || null;
  }

  async markUsed(id: string): Promise<void> {
    const pool = getPostgresPool();
    await pool.query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [
      id,
    ]);
  }

  async findAll(): Promise<MagicLinkToken[]> {
    const pool = getPostgresPool();
    const result = await pool.query(
      "SELECT * FROM magic_links WHERE used_at IS NULL AND expires_at > NOW()"
    );
    return result.rows;
  }
}
