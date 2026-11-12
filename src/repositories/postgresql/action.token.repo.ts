import { Pool } from "pg";
import { ActionToken, ActionTokenPurpose, ActionTokenRepository, UserId } from "../contracts";
import { ActionTokenRow } from "../../infra/databases/postgresql/types";

export class PostgresActionTokenRepository implements ActionTokenRepository {
  constructor(
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly pool: Pool
  ) {}

  private getTable() {
    return `"${this.schemaName}"."${this.tableName}"`;
  }

  private static toToken(row: ActionTokenRow): ActionToken {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      // The CHECK constraint validated at startup restricts the column to known purposes.
      purpose: row.purpose as ActionTokenPurpose,
      selector: row.selector,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at
    };
  }

  async create(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken> {
    const result = await this.pool.query<ActionTokenRow>(
      `
      INSERT INTO ${this.getTable()} (user_id, purpose, selector, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.userId, input.purpose, input.selector, input.tokenHash, input.expiresAt]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("[Auth:PostgresActionTokenRepository] Insert returned no action token");
    }

    return PostgresActionTokenRepository.toToken(row);
  }

  async findBySelector(selector: string, purpose: ActionTokenPurpose): Promise<ActionToken | null> {
    const result = await this.pool.query<ActionTokenRow>(
      `SELECT * FROM ${this.getTable()} WHERE selector = $1 AND purpose = $2`,
      [selector, purpose]
    );

    const row = result.rows[0];
    return row ? PostgresActionTokenRepository.toToken(row) : null;
  }

  /**
   * One conditional UPDATE, so the database decides the winner.
   *
   * `used_at IS NULL` is evaluated and the row written in the same statement, which takes a
   * row lock: of two concurrent callers exactly one updates a row and sees `rowCount > 0`.
   * Expiry is judged by the database's own clock, so a skewed application server cannot
   * spend a token that has already lapsed.
   */
  async consume(selector: string, purpose: ActionTokenPurpose): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE ${this.getTable()}
      SET used_at = NOW()
      WHERE selector = $1
        AND purpose = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      `,
      [selector, purpose]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async invalidateByUserId(userId: UserId, purpose: ActionTokenPurpose): Promise<boolean> {
    try {
      await this.pool.query(
        `
        UPDATE ${this.getTable()}
        SET used_at = NOW()
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
        `,
        [userId, purpose]
      );
      return true;
    } catch {
      return false;
    }
  }
}
