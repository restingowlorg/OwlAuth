import { getPostgresPool } from "../../infra/postgresql/db";
import { SessionRow } from "../../types";
import { SessionRepository } from "../contracts";

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly table: string) {}

  private getTable() {
    return `"${this.table}"`;
  }

  async create(userId: string, expiresAt: Date) {
    const pool = getPostgresPool();

    const result = await pool.query<SessionRow>(
      `
      INSERT INTO ${this.getTable()} (user_id, created_at, expires_at)
      VALUES ($1, NOW(), $2)
      RETURNING *
      `,
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

  async findById(id: number) {
    const pool = getPostgresPool();

    const result = await pool.query<SessionRow>(`SELECT * FROM ${this.getTable()} WHERE id = $1`, [
      id
    ]);

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
    await pool.query(`DELETE FROM ${this.getTable()} WHERE id = $1`, [id]);
  }
}
