import { QueryResult } from "pg";
import { getPostgresPool } from "../../infra/postgresql/db";
import { User, CreateUserInput } from "../../types";
import { UserRepository } from "../contracts";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly table: string) {}

  private getTable() {
    if (this.table.includes(".")) {
      const [schema, table] = this.table.split(".");
      return `"${schema}"."${table}"`;
    }
    return `"${this.table}"`;
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

  //Update password
  async updatePassword(userId: string | number, passwordHash: string): Promise<boolean> {
    const pool = getPostgresPool();
    const result = await pool.query(
      `
      UPDATE ${this.getTable()}
      SET password = $1
      WHERE id = $2
      `,
      [passwordHash, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
