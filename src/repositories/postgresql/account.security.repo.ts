import { Pool } from "pg";
import {
  AccountSecurityRecord,
  AccountSecurityRepository,
  AccountStatus,
  UserId
} from "../contracts";
import { AccountSecurityRow } from "../../infra/databases/postgresql/types";

export class PostgresAccountSecurityRepository implements AccountSecurityRepository {
  constructor(
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly pool: Pool
  ) {}

  private getTable() {
    return `"${this.schemaName}"."${this.tableName}"`;
  }

  async create(input: {
    userId: UserId;
    status: AccountStatus;
    emailVerifiedAt?: Date | null;
  }): Promise<AccountSecurityRecord> {
    const result = await this.pool.query<AccountSecurityRow>(
      `
      INSERT INTO ${this.getTable()} (user_id, status, email_verified_at, updated_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING user_id, status, email_verified_at, updated_at
      `,
      [input.userId, input.status, input.emailVerifiedAt ?? null]
    );

    const row = result.rows[0];

    return {
      userId: String(row.user_id),
      status: row.status as AccountStatus,
      emailVerifiedAt: row.email_verified_at,
      updatedAt: row.updated_at
    };
  }

  async findByUserId(userId: UserId): Promise<AccountSecurityRecord | null> {
    const result = await this.pool.query<AccountSecurityRow>(
      `
      SELECT user_id, status, email_verified_at, updated_at
      FROM ${this.getTable()}
      WHERE user_id = $1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      userId: String(row.user_id),
      status: row.status as AccountStatus,
      emailVerifiedAt: row.email_verified_at,
      updatedAt: row.updated_at
    };
  }
}
