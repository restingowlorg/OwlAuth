import { getPostgresPool } from "../../infra/postgresql/db";
import { MagicLinkToken, MagicLinkRow } from "../../types";
import { MagicLinkRepository } from "../contracts";

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

    const result = await pool.query<MagicLinkRow>(
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
      createdAt: row.created_at
    };
  }

  async findByTokenHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const pool = getPostgresPool();

    const result = await pool.query<MagicLinkRow>(
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
      createdAt: row.created_at
    };
  }

  async findById(id: string | number): Promise<MagicLinkToken | null> {
    const pool = getPostgresPool();

    const result = await pool.query<MagicLinkRow>(
      `SELECT * FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at
    };
  }

  async markUsed(id: string): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(`UPDATE ${this.getTable()} SET used_at = NOW() WHERE id = $1`, [id]);
  }

  async deleteByUserId(userId: string | number): Promise<void> {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM ${this.getTable()} WHERE user_id = $1`, [userId]);
  }

  async findAll(): Promise<MagicLinkRow[]> {
    const pool = getPostgresPool();

    const result = await pool.query<MagicLinkRow>(
      `
      SELECT * FROM ${this.getTable()}
      WHERE used_at IS NULL AND expires_at > NOW()
      `
    );

    return result.rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      token: row.token,
      expires_at: row.expires_at,
      used_at: row.used_at,
      created_at: row.created_at
    }));
  }
}
