import { Pool } from "pg";
import {
  ActionToken,
  ActionTokenPurpose,
  ActionTokenRepository,
  RecoveryCommitOutcome,
  UserId
} from "../contracts";
import { ActionTokenRow } from "../../infra/databases/postgresql/types";

export class PostgresActionTokenRepository implements ActionTokenRepository {
  constructor(
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly pool: Pool,
    private readonly userSchemaName: string,
    private readonly userTableName: string,
    private readonly mlSchemaName?: string,
    private readonly mlTableName?: string
  ) {}

  private getTable() {
    return `"${this.schemaName}"."${this.tableName}"`;
  }

  private getUserTable() {
    return `"${this.userSchemaName}"."${this.userTableName}"`;
  }

  private getMlTable(): string | null {
    return this.mlSchemaName && this.mlTableName
      ? `"${this.mlSchemaName}"."${this.mlTableName}"`
      : null;
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

  /**
   * Wraps the invalidate-then-insert pair in a single transaction so two concurrent
   * `request()` calls cannot both leave a live token. If the transaction cannot be
   * committed the method returns null; the service stops without issuing the token.
   */
  async createSuperseding(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken | null> {
    let client;
    try {
      client = await this.pool.connect();
    } catch {
      return null;
    }
    try {
      await client.query("BEGIN");
      // Serialize concurrent createSuperseding calls for the same user+purpose so the
      // second caller's UPDATE runs after the first caller commits its INSERT.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        String(input.userId),
        input.purpose
      ]);
      await client.query(
        `UPDATE ${this.getTable()}
         SET used_at = NOW()
         WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
        [input.userId, input.purpose]
      );
      const result = await client.query<ActionTokenRow>(
        `INSERT INTO ${this.getTable()} (user_id, purpose, selector, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.userId, input.purpose, input.selector, input.tokenHash, input.expiresAt]
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      if (!row) throw new Error("Insert returned no row");
      return PostgresActionTokenRepository.toToken(row);
    } catch {
      try {
        await client.query("ROLLBACK");
      } catch {
        // connection may have been dropped; nothing to roll back
      }
      return null;
    } finally {
      client.release();
    }
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

  /**
   * Runs inside one transaction that also takes the same advisory lock as `createSuperseding`.
   * This serializes every confirmation with every new issuance for the same user+purpose: a
   * new token cannot be issued (and therefore cannot be consumed and win a later password
   * write) while this transaction holds the lock.
   *
   * On any failure the transaction rolls back completely — the token is not spent and the
   * password is not changed — so the user can retry with the same token.
   */
  async commitRecovery(input: {
    selector: string;
    purpose: ActionTokenPurpose;
    userId: UserId;
    passwordHash: string;
  }): Promise<RecoveryCommitOutcome> {
    let client;
    try {
      client = await this.pool.connect();
    } catch {
      return { ok: false, reason: "password_update_failed" };
    }

    // Track progress so the catch block can return the right reason.
    // "setup" covers BEGIN and advisory-lock — no token write has occurred yet, so a throw
    // there is a transient infrastructure failure, not a spent-token signal.
    let stage: "setup" | "consume" | "password" | "magic_links" = "setup";
    try {
      await client.query("BEGIN");
      // Same advisory lock as createSuperseding — the two operations are now mutually
      // exclusive for the same user+purpose, so a new token cannot be issued while a
      // confirmation is in flight and vice versa.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        String(input.userId),
        input.purpose
      ]);

      stage = "consume";
      const consumeResult = await client.query(
        `UPDATE ${this.getTable()}
         SET used_at = NOW()
         WHERE selector = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()`,
        [input.selector, input.purpose]
      );
      if ((consumeResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "already_used" };
      }

      stage = "password";
      const updateResult = await client.query(
        `UPDATE ${this.getUserTable()}
         SET password = $1, updated_at = NOW()
         WHERE id = $2`,
        [input.passwordHash, input.userId]
      );
      if ((updateResult.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "password_update_failed" };
      }

      stage = "magic_links";
      let magicLinksInvalidated = false;
      const mlTable = this.getMlTable();
      if (mlTable) {
        // A thrown error here triggers the catch which rolls back the whole transaction:
        // the password write and the consume are both undone.
        await client.query(
          `UPDATE ${mlTable} SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
          [input.userId]
        );
        magicLinksInvalidated = true;
      }

      await client.query("COMMIT");
      return { ok: true, magicLinksInvalidated };
    } catch {
      try {
        await client.query("ROLLBACK");
      } catch {
        // connection may have been dropped; nothing to roll back
      }
      if (stage !== "magic_links") return { ok: false, reason: "password_update_failed" };
      return { ok: false, reason: "revocation_failed" };
    } finally {
      client.release();
    }
  }
}
