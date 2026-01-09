import { getPostgresPool } from "../../infra/postgresql/db";
import { SessionRepository } from "../contracts";

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly table: string) {}

  private t() {
    return `"${this.table}"`;
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    lastUsedAt: Date;
  }) {
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      INSERT INTO ${this.t()}
        (user_id, token_hash, expires_at, last_used_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, expires_at, last_used_at, revoked_at
      `,
      [input.userId, input.tokenHash, input.expiresAt, input.lastUsedAt]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
  }

  async findByTokenHash(tokenHash: string) {
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      SELECT id, user_id, expires_at, last_used_at, revoked_at
      FROM ${this.t()}
      WHERE token_hash = $1
      `,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
  }

  async updateLastUsed(tokenHash: string, date: Date) {
    const pool = getPostgresPool();

    await pool.query(
      `
      UPDATE ${this.t()}
      SET last_used_at = $1
      WHERE token_hash = $2
        AND revoked_at IS NULL
      `,
      [date, tokenHash]
    );
  }

  async revokeByTokenHash(tokenHash: string) {
    const pool = getPostgresPool();

    await pool.query(
      `
      UPDATE ${this.t()}
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
      `,
      [tokenHash]
    );
  }

  async revokeOldestForUser(userId: string, keepLatest: number) {
    const pool = getPostgresPool();

    console.log(
      `[DEBUG] revokeOldestForUser called for userId=${userId}, keepLatest=${keepLatest}`
    );

    // Get all active sessions
    const result = await pool.query(
      `
    SELECT id, last_used_at
    FROM ${this.t()}
    WHERE user_id = $1
      AND revoked_at IS NULL
    ORDER BY last_used_at ASC
    `,
      [userId]
    );

    const sessions = result.rows;
    console.log(`[DEBUG] Active sessions for user:`, sessions);

    const toRevoke = sessions.slice(0, sessions.length - keepLatest);
    console.log(`[DEBUG] Sessions to revoke:`, toRevoke);

    if (toRevoke.length === 0) return;

    const ids = toRevoke.map((s) => s.id);
    console.log(`[DEBUG] IDs to revoke:`, ids);

    try {
      // Use UNNEST for integer arrays
      const query = `
      UPDATE ${this.t()}
      SET revoked_at = NOW()
      WHERE id = ANY($1::int[])
    `;

      await pool.query(query, [ids]);
      console.log(`[DEBUG] Successfully revoked oldest sessions`);
    } catch (err) {
      console.error(`[ERROR] Failed to revoke oldest sessions:`, err);
      throw err;
    }
  }

  async revokeAllExcept(userId: string, keepSessionId: string) {
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      UPDATE ${this.t()}
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND id <> $2
        AND revoked_at IS NULL
    `,
      [userId, keepSessionId]
    );

    console.log(
      `ℹ️ RevokeAllExcept: Revoked ${result.rowCount} sessions for user ${userId}, keeping session ${keepSessionId}`
    );
  }

  async createAndRotate(
    oldTokenHash: string,
    userId: string,
    expiresAt: Date,
    newToken: string,
    newTokenHash: string
  ) {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Lock old session row
      const oldSessionRes = await client.query(
        `SELECT * FROM ${this.t()} WHERE token_hash = $1 FOR UPDATE`,
        [oldTokenHash]
      );

      if (oldSessionRes.rowCount === 0) {
        throw new Error("Session not found for rotation");
      }

      const oldSession = oldSessionRes.rows[0];

      // Insert new session using the token/tokenHash from parameters
      const newSessionRes = await client.query(
        `INSERT INTO ${this.t()} (user_id, token_hash, expires_at, last_used_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, expires_at, last_used_at, revoked_at`,
        [userId, newTokenHash, expiresAt, new Date()]
      );

      const newSession = newSessionRes.rows[0];

      // Revoke old session
      await client.query(
        `UPDATE ${this.t()} SET revoked_at = NOW() WHERE id = $1`,
        [oldSession.id]
      );

      await client.query("COMMIT");

      return {
        id: newSession.id,
        userId: newSession.user_id,
        expiresAt: newSession.expires_at,
        lastUsedAt: newSession.last_used_at,
        revokedAt: newSession.revoked_at,
        sessionToken: newToken,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
