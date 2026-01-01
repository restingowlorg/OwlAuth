import { getPostgresPool } from "../../infra/postgresql/db";
import { MagicLinkRepository, MagicLinkToken } from "../contracts";

export class PostgresMagicLinkRepository implements MagicLinkRepository {
  constructor(private readonly table: string) {}

  private getTable() {
    return `"${this.table}"`;
  }

  async create(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date;
  }): Promise<MagicLinkToken> {
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      INSERT INTO ${this.getTable()} (user_id, token, expires_at, used_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [token.userId, token.tokenHash, token.expiresAt, token.usedAt ?? null]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
    };
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const pool = getPostgresPool();

    const result = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE token = $1`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
    };
  }

  async markUsed(id: string): Promise<void> {
    const pool = getPostgresPool();

    await pool.query(
      `UPDATE ${this.getTable()} SET used_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async findAll(): Promise<MagicLinkToken[]> {
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      SELECT * FROM ${this.getTable()}
      WHERE used_at IS NULL AND expires_at > NOW()
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    }));
  }
}
