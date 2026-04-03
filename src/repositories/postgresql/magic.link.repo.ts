import { Pool } from "pg";
import { MagicLinkToken, MagicLinkRow, UserId } from "../../types";
import { MagicLinkRepository } from "../contracts";

export class PostgresMagicLinkRepository implements MagicLinkRepository {
  constructor(
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly pool: Pool
  ) {}

  private getTable() {
    return `"${this.schemaName}"."${this.tableName}"`;
  }

  async create(token: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<MagicLinkToken> {
    const result = await this.pool.query<MagicLinkRow>(
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
    const result = await this.pool.query<MagicLinkRow>(
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
    const result = await this.pool.query<MagicLinkRow>(
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

  async consume(id: string | number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.getTable()} SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByUserId(userId: string | number): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM ${this.getTable()} WHERE user_id = $1`, [
      userId
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async invalidateByUserId(userId: string | number): Promise<boolean> {
    await this.pool.query(
      `UPDATE ${this.getTable()} SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );

    return true;
  }

  async findAll(): Promise<MagicLinkRow[]> {
    const result = await this.pool.query<MagicLinkRow>(
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
