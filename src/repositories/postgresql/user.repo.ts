import { Pool } from "pg";
import { User, CreateUserInput, UserRepository, SafeUser, UserId } from "../contracts";
import { UserRow } from "../../infra/databases/postgresql/types";

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
    const result = await this.pool.query<UserRow>(
      `
      INSERT INTO ${this.getTable()} (email, username, password)
      VALUES ($1, $2, $3)
      RETURNING id, email, username
      `,
      [email, username, passwordHash]
    );
    const r = result.rows[0];
    return { id: String(r.id), email: r.email, username: r.username };
  }

  async findByEmail(email: string): Promise<SafeUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, username FROM ${this.getTable()} WHERE email = $1`,
      [email]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), email: r.email, username: r.username };
  }

  async findById(id: UserId): Promise<SafeUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, username FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), email: r.email, username: r.username };
  }

  async findByUsername(username: string): Promise<SafeUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, username FROM ${this.getTable()} WHERE username = $1`,
      [username]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), email: r.email, username: r.username };
  }

  async findWithPasswordByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM ${this.getTable()} WHERE email = $1`,
      [email]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), email: r.email, username: r.username, password: r.password };
  }

  async findWithPasswordById(id: UserId): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM ${this.getTable()} WHERE id = $1`,
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), email: r.email, username: r.username, password: r.password };
  }

  async updatePassword(userId: UserId, passwordHash: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE ${this.getTable()}
      SET password = $1, updated_at = NOW()
      WHERE id = $2
      `,
      [passwordHash, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
