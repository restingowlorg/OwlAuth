import { getPostgresPool } from "../../infra/postgresql/db";
import { UserRepository, CreateUserInput } from "../contracts";

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly table: string) {}

  private getTable() {
    return `"${this.table}"`;
  }

  async create(input: CreateUserInput) {
    const { email, username, passwordHash } = input;
    const pool = getPostgresPool();

    const result = await pool.query(
      `
      INSERT INTO ${this.getTable()} (email, username, password)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [email, username, passwordHash]
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

  async findByUsername(username: string) {
    const pool = getPostgresPool();
    const result = await pool.query(
      `SELECT * FROM ${this.getTable()} WHERE username = $1`,
      [username]
    );
    return result.rows[0] || null;
  }
}
