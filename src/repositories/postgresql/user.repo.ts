import { getPostgresPool, PostgresTables } from '../../infra/postgresql/db';
import { UserRepository } from '../contracts';

export class PostgresUserRepository implements UserRepository {
  private getTable() {
    return `"${PostgresTables.users}"`; // safely quote table name
  }

  async create(email: string, passwordHash: string) {
    const pool = getPostgresPool();
    const result = await pool.query(
      `INSERT INTO ${this.getTable()} (email, password) VALUES ($1, $2) RETURNING *`,
      [email, passwordHash]
    );
    return result.rows[0];
  }

  async findByEmail(email: string) {
    const pool = getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  }

  async findById(id: string) {
    const pool = getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }
}
