import { QueryResult, Pool } from "pg";
import { User, CreateUserInput, UserRepository, SafeUser, UserId } from "../contracts";

export class PostgresUserRepository implements UserRepository {
  constructor(
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly pool: Pool
  ) {}

  private getTable() {
    return `"${this.schemaName}"."${this.tableName}"`;
  }

  async create(input: CreateUserInput): Promise<SafeUser> {
    const { email, username, passwordHash } = input;
    const result: QueryResult<SafeUser> = await this.pool.query(
      `
      INSERT INTO ${this.getTable()} (email, username, password)
      VALUES ($1, $2, $3)
      RETURNING id, email, username
      `,
      [email, username, passwordHash]
    );

    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const result: QueryResult<User> = await this.pool.query(
      `SELECT * FROM ${this.getTable()} WHERE email = $1`,
      [email]
    );

    return result.rows[0] ?? null;
  }

  async findById(id: UserId): Promise<User | null> {
    const result: QueryResult<User> = await this.pool.query(
      `SELECT * FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );

    return result.rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const result: QueryResult<User> = await this.pool.query(
      `SELECT * FROM ${this.getTable()} WHERE username = $1`,
      [username]
    );

    return result.rows[0] ?? null;
  }

  async updatePassword(userId: UserId, passwordHash: string): Promise<boolean> {
    const result = await this.pool.query(
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
