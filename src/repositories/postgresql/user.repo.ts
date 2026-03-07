import { getPostgresPool, PostgresTables } from "../../infra/postgresql/db";
import { User } from "../../types";
import { CreateUserInput, UserRepository } from "../contracts";
import { QueryResult } from "pg";

export class PostgresUserRepository implements UserRepository {
  private getTable(): string {
    return `"${PostgresTables.users}"`;
  }

  async create(input: CreateUserInput): Promise<User> {
    const { email, username, passwordHash } = input;
    const pool = getPostgresPool();

    const result: QueryResult<User> = await pool.query(
      `
      INSERT INTO ${this.getTable()} (email, username, password)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [email, username, passwordHash]
    );

    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const pool = getPostgresPool();

    const result: QueryResult<User> = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE email = $1`,
      [email]
    );

    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    const pool = getPostgresPool();

    const result: QueryResult<User> = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );

    return result.rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const pool = getPostgresPool();

    const result: QueryResult<User> = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE username = $1`,
      [username]
    );

    return result.rows[0] ?? null;
  }
}
