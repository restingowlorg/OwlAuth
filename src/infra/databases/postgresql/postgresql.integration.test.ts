import { Pool } from "pg";
import { initPostgres } from "./db";
import { PostgresUserRepository } from "../../../repositories/postgresql/user.repo";
import { PostgresAccountSecurityRepository } from "../../../repositories/postgresql/account.security.repo";
import { DuplicateUserError } from "../../../repositories/contracts";

const configuredPostgresUrl = process.env.POSTGRES_TEST_URL;
const postgresUrl = configuredPostgresUrl ?? "postgresql://127.0.0.1:5432/owlauth_test";
const runIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const integrationDescribe = runIntegrationTests ? describe : describe.skip;
const schema = "owlauth_integration";
const userTable = "users";
const accountSecurityTable = "account_security";

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

  async function createAccountSecurityTable(options?: {
    userIdUnique?: boolean;
    withForeignKey?: boolean;
  }): Promise<void> {
    const foreignKey =
      (options?.withForeignKey ?? true)
        ? `REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE`
        : "";

    await pool.query(`
      CREATE TABLE ${schema}.${accountSecurityTable} (
        id                BIGSERIAL PRIMARY KEY,
        user_id           BIGINT NOT NULL ${foreignKey},
        status            TEXT NOT NULL
                            CHECK (status IN ('active','pending_email_verification','disabled')),
        email_verified_at TIMESTAMPTZ NULL,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (options?.userIdUnique ?? true) {
      await pool.query(
        `CREATE UNIQUE INDEX account_security_user_id_unique_idx
           ON ${schema}.${accountSecurityTable} (user_id)`
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

  describe("account identity state", () => {
    const connectOptions = {
      postgresUrl,
      userSchema: schema,
      userTableName: userTable,
      accountSecuritySchema: schema,
      accountSecurityTableName: accountSecurityTable,
      authTypes: ["credentials" as const]
    };

    it("connects when the account security schema is valid", async () => {
      await createAccountSecurityTable();

      const db = await initPostgres({ ...connectOptions, accountSecurity: true });

      expect(db.accountSecurityRepo).toBeDefined();
      await db.close();
    });

    it("does not build the repository when the feature is disabled", async () => {
      const db = await initPostgres({ ...connectOptions, accountSecurity: false });

      expect(db.accountSecurityRepo).toBeUndefined();
      await db.close();
    });

    it("rejects a missing account security table", async () => {
      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        `Table '${schema}.${accountSecurityTable}' does not exist`
      );
    });

    it("rejects a schema that is missing the user_id unique index", async () => {
      await createAccountSecurityTable({ userIdUnique: false });

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must have a non-partial single-column unique index or constraint on 'user_id'"
      );
    });

    it("rejects a schema that is missing the user_id foreign key", async () => {
      await createAccountSecurityTable({ withForeignKey: false });

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        `must have a foreign key 'user_id' referencing '${schema}.${userTable}.id'`
      );
    });

    it("round-trips an account security record", async () => {
      await createAccountSecurityTable();

      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: "state@example.com",
        username: "state_user",
        passwordHash: "hash"
      });

      const accountSecurity = new PostgresAccountSecurityRepository(
        schema,
        accountSecurityTable,
        pool
      );

      const created = await accountSecurity.create({
        userId: user.id,
        status: "active",
        emailVerifiedAt: null
      });
      expect(created.status).toBe("active");
      expect(created.userId).toBe(user.id);

      const found = await accountSecurity.findByUserId(user.id);
      expect(found?.status).toBe("active");
      expect(found?.emailVerifiedAt).toBeNull();
      expect(found?.updatedAt).toBeInstanceOf(Date);
    });

    it("returns null for a user that has no record", async () => {
      await createAccountSecurityTable();

      const accountSecurity = new PostgresAccountSecurityRepository(
        schema,
        accountSecurityTable,
        pool
      );

      await expect(accountSecurity.findByUserId("999999")).resolves.toBeNull();
    });
  });
});
