import { Pool } from "pg";
import { initPostgres } from "./db";
import { PostgresUserRepository } from "../../../repositories/postgresql/user.repo";
import { DuplicateUserError } from "../../../repositories/contracts";

const configuredPostgresUrl = process.env.POSTGRES_TEST_URL;
const postgresUrl = configuredPostgresUrl ?? "postgresql://127.0.0.1:5432/owlauth_test";
const runIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const integrationDescribe = runIntegrationTests ? describe : describe.skip;
const schema = "owlauth_integration";
const userTable = "users";

if (runIntegrationTests && !configuredPostgresUrl) {
  throw new Error("POSTGRES_TEST_URL is required when RUN_DATABASE_INTEGRATION_TESTS is true");
}

integrationDescribe("PostgreSQL adapter integration", () => {
  const pool = new Pool({ connectionString: postgresUrl });

  async function createUserTable(options?: { usernameUnique?: boolean }): Promise<void> {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE ${schema}.${userTable} (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE UNIQUE INDEX users_email_unique_idx ON ${schema}.${userTable} (email)`
    );

    if (options?.usernameUnique ?? true) {
      await pool.query(
        `CREATE UNIQUE INDEX users_username_unique_idx ON ${schema}.${userTable} (username)`
      );
    }
  }

  beforeEach(async () => {
    await createUserTable();
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  });

  it("connects when the required user schema and unique indexes exist", async () => {
    const db = await initPostgres({
      postgresUrl,
      userSchema: schema,
      userTableName: userTable,
      authTypes: ["credentials"]
    });

    await expect(db.userRepo.findByEmail("missing@example.com")).resolves.toBeNull();
    await db.close();
  });

  it("rejects a schema that is missing the username unique index", async () => {
    await createUserTable({ usernameUnique: false });

    await expect(
      initPostgres({
        postgresUrl,
        userSchema: schema,
        userTableName: userTable,
        authTypes: ["credentials"]
      })
    ).rejects.toThrow(
      "must have a non-partial single-column unique index or constraint on 'username'"
    );
  });

  it("maps a concurrent unique-key race to DuplicateUserError", async () => {
    const users = new PostgresUserRepository(schema, userTable, pool);
    const input = {
      email: "duplicate@example.com",
      username: "duplicate_user",
      passwordHash: "hash"
    };

    const results = await Promise.allSettled([users.create(input), users.create(input)]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(DuplicateUserError);
  });
});
