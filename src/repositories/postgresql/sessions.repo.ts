import { getPostgresPool } from "../../infra/postgresql/db";
import { Session, SessionRow } from "../../types";
import { SessionRepository } from "../contracts";
import { QueryResult } from "pg";

export class PostgresSessionRepository implements SessionRepository {
  async create(userId: string, expiresAt: Date): Promise<Session> {
    const pool = getPostgresPool();
    const result: QueryResult<SessionRow> = await pool.query(
      `INSERT INTO sessions (user_id, created_at, expires_at) 
       VALUES ($1, NOW(), $2) 
       RETURNING *`,
      [userId, expiresAt]
    );

    const row = result.rows[0];

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }

  async findById(id: string): Promise<Session | null> {
    const pool = getPostgresPool();
    const result: QueryResult<SessionRow> = await pool.query(
      "SELECT * FROM sessions WHERE id = $1",
      [id]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }

  async delete(id: string): Promise<void> {
    const pool = getPostgresPool();
    await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }
}
