import { getPostgresPool } from '../../infra/postgresql/db';
import { SessionRepository } from '../contracts';

export class PostgresSessionRepository implements SessionRepository {
  async create(userId: string, expiresAt: Date) {
    const pool = getPostgresPool();
    const result = await pool.query(
      'INSERT INTO sessions (user_id, created_at) VALUES ($1, NOW()) RETURNING *',
      [userId]
    );
    return result.rows[0];
  }

  async findById(id: string) {
    const pool = getPostgresPool();
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async delete(id: string) {
    const pool = getPostgresPool();
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  }
}
