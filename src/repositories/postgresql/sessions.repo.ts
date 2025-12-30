import { getPostgresPool } from "../../infra/postgresql/db";
import { SessionRepository } from "../contracts";

export class PostgresSessionRepository implements SessionRepository {
  async create(userId: string, expiresAt: Date) {
    const pool = getPostgresPool();
    const result = await pool.query(
      `INSERT INTO sessions (user_id, created_at, expires_at) 
     VALUES ($1, NOW(), $2) 
     RETURNING *`,
      [userId, expiresAt]
    );
    return result.rows[0];
  }

  async findById(id: Number) {
    const pool = getPostgresPool();
    const result = await pool.query("SELECT * FROM sessions WHERE id = $1", [
      id,
    ]);
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  async delete(id: string) {
    const pool = getPostgresPool();
    await pool.query("DELETE FROM sessions WHERE id = $1", [id]);
  }
}
