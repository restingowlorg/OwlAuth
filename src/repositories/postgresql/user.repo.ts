import { getPostgresPool } from "../../infra/postgresql/db";
import { User } from "../../types";
import { UserRepository } from "../contracts";
import { QueryResult } from "pg";

export class PostgresUserRepository implements UserRepository {
  async create(email: string, passwordHash: string): Promise<User> {
    const pool = getPostgresPool();
    const result: QueryResult<User> = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
      [email, passwordHash]
    );
    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const pool = getPostgresPool();
    const result: QueryResult<User> = await pool.query("SELECT * FROM users WHERE email = $1", [
      email
    ]);
    return result.rows[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const pool = getPostgresPool();
    const result: QueryResult<User> = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] || null;
  }
}
