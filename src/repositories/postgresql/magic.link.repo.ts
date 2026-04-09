import { Pool } from "pg";
import { MagicLinkToken, MagicLinkRepository, UserId } from "../contracts";
import { MagicLinkRow } from "../../infra/databases/postgresql/types";

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
    lookupKey: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt?: Date | null;
  }): Promise<MagicLinkToken> {
    const result = await this.pool.query<MagicLinkRow>(
      `
      INSERT INTO ${this.getTable()} (user_id, lookup_key, token_hash, expires_at, used_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [token.userId, token.lookupKey, token.tokenHash, token.expiresAt, token.usedAt ?? null]
    );

    const row = result.rows[0];

    return {
      id: String(row.id),
      userId: String(row.user_id),
      lookupKey: row.lookup_key,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at
    };
  }

  async findByLookupKey(lookupKey: string): Promise<MagicLinkToken | null> {
    const result = await this.pool.query<MagicLinkRow>(
      `SELECT * FROM ${this.getTable()} WHERE lookup_key = $1`,
      [lookupKey]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      userId: String(row.user_id),
      lookupKey: row.lookup_key,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at
    };
  }

  async consume(lookupKey: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${this.getTable()} SET used_at = NOW() WHERE lookup_key = $1 AND used_at IS NULL`,
      [lookupKey]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteByUserId(userId: UserId): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM ${this.getTable()} WHERE user_id = $1`, [
      userId
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async invalidateByUserId(userId: UserId): Promise<boolean> {
    try {
      await this.pool.query(
        `UPDATE ${this.getTable()} SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
      );
      return true;
    } catch (err) {
      return false;
    }
  }
}
