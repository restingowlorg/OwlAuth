import { randomUUID } from "crypto";
import { Pool } from "pg";
import { initPostgres } from "./db";
import { PostgresUserRepository } from "../../../repositories/postgresql/user.repo";
import { PostgresAccountSecurityRepository } from "../../../repositories/postgresql/account.security.repo";
import { PostgresActionTokenRepository } from "../../../repositories/postgresql/action.token.repo";
import { RecoveryDelivery } from "../../../core/types";
import { ActionTokenPurpose, DuplicateUserError } from "../../../repositories/contracts";
import { createAuthManager } from "../../../core/auth.manager";
import { PostgresAdapter } from "./adapter";
import { BcryptAdapter } from "../../security/bcrypt.adapter";

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
    withStatusCheck?: boolean;
    statusValues?: readonly string[];
  }): Promise<void> {
    const foreignKey =
      (options?.withForeignKey ?? true)
        ? `REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE`
        : "";

    const statusValues = options?.statusValues ?? [
      "active",
      "pending_email_verification",
      "disabled"
    ];

    const statusCheck =
      (options?.withStatusCheck ?? true)
        ? `CHECK (status IN (${statusValues.map((value) => `'${value}'`).join(",")}))`
        : "";

    await pool.query(`
      CREATE TABLE ${schema}.${accountSecurityTable} (
        id                BIGSERIAL PRIMARY KEY,
        user_id           BIGINT NOT NULL ${foreignKey},
        status            TEXT NOT NULL ${statusCheck},
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

    it("rejects a status column with no CHECK constraint", async () => {
      await createAccountSecurityTable({ withStatusCheck: false });

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly"
      );
    });

    // An otherwise-valid constraint that permits a fourth status still contradicts what the
    // migration and documentation promise, so startup must reject it.
    it("rejects an otherwise-valid four-value CHECK constraint", async () => {
      await createAccountSecurityTable({
        statusValues: ["active", "pending_email_verification", "disabled", "suspended"]
      });

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly"
      );
    });

    // Contains exactly the three expected literals, but leaves `status` unconstrained:
    // status = 'suspended', note = 'disabled' satisfies it.
    it("rejects a compound constraint that only appears to restrict status", async () => {
      await pool.query(`
        CREATE TABLE ${schema}.${accountSecurityTable} (
          id                BIGSERIAL PRIMARY KEY,
          user_id           BIGINT NOT NULL REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE,
          status            TEXT NOT NULL,
          note              TEXT NULL,
          email_verified_at TIMESTAMPTZ NULL,
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT account_security_status_check
            CHECK (status = 'active' OR note IN ('pending_email_verification','disabled'))
        )
      `);
      await pool.query(
        `CREATE UNIQUE INDEX account_security_user_id_unique_idx
           ON ${schema}.${accountSecurityTable} (user_id)`
      );

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly"
      );
    });

    it("accepts a native enum column with exactly the three labels", async () => {
      await pool.query(
        `CREATE TYPE ${schema}.account_status AS ENUM ('active','pending_email_verification','disabled')`
      );
      await pool.query(`
        CREATE TABLE ${schema}.${accountSecurityTable} (
          id                BIGSERIAL PRIMARY KEY,
          user_id           BIGINT NOT NULL REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE,
          status            ${schema}.account_status NOT NULL,
          email_verified_at TIMESTAMPTZ NULL,
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE UNIQUE INDEX account_security_user_id_unique_idx
           ON ${schema}.${accountSecurityTable} (user_id)`
      );

      const db = await initPostgres({ ...connectOptions, accountSecurity: true });

      expect(db.accountSecurityRepo).toBeDefined();
      await db.close();
    });

    it("rejects a native enum carrying an extra label", async () => {
      await pool.query(
        `CREATE TYPE ${schema}.account_status AS ENUM ('active','pending_email_verification','disabled','suspended')`
      );
      await pool.query(`
        CREATE TABLE ${schema}.${accountSecurityTable} (
          id                BIGSERIAL PRIMARY KEY,
          user_id           BIGINT NOT NULL REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE,
          status            ${schema}.account_status NOT NULL,
          email_verified_at TIMESTAMPTZ NULL,
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `CREATE UNIQUE INDEX account_security_user_id_unique_idx
           ON ${schema}.${accountSecurityTable} (user_id)`
      );

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly"
      );
    });

    it("rejects a CHECK constraint missing one of the three values", async () => {
      await createAccountSecurityTable({
        statusValues: ["active", "disabled"]
      });

      await expect(initPostgres({ ...connectOptions, accountSecurity: true })).rejects.toThrow(
        "must restrict 'status' to exactly"
      );
    });

    it("confirms a four-value constraint really would store the unsupported status", async () => {
      // Demonstrates what the startup check is protecting against: the datastore accepts
      // 'suspended', which the service layer then has to deny at runtime.
      await createAccountSecurityTable({
        statusValues: ["active", "pending_email_verification", "disabled", "suspended"]
      });

      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: "superset@example.com",
        username: "superset_user",
        passwordHash: "hash"
      });

      await expect(
        pool.query(
          `INSERT INTO ${schema}.${accountSecurityTable} (user_id, status, updated_at)
           VALUES ($1, 'suspended', NOW())`,
          [user.id]
        )
      ).resolves.toBeDefined();
    });

    it("confirms an unconstrained column really would accept an invalid status", async () => {
      // Demonstrates why the startup check exists: without the constraint the datastore
      // happily stores a typo, which the service layer must then refuse to honour.
      await createAccountSecurityTable({ withStatusCheck: false });

      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: "typo@example.com",
        username: "typo_user",
        passwordHash: "hash"
      });

      await expect(
        pool.query(
          `INSERT INTO ${schema}.${accountSecurityTable} (user_id, status, updated_at)
           VALUES ($1, 'disable', NOW())`,
          [user.id]
        )
      ).resolves.toBeDefined();
    });

    it("rejects an invalid status once the CHECK constraint is present", async () => {
      await createAccountSecurityTable();

      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: "checked@example.com",
        username: "checked_user",
        passwordHash: "hash"
      });

      await expect(
        pool.query(
          `INSERT INTO ${schema}.${accountSecurityTable} (user_id, status, updated_at)
           VALUES ($1, 'disable', NOW())`,
          [user.id]
        )
      ).rejects.toThrow();
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

    // The guarantee the feature rests on, end to end against a real database: a user with
    // no state record cannot authenticate, and gains access the moment one exists.
    it("denies authentication until a state record exists", async () => {
      await createAccountSecurityTable();

      const crypto = new BcryptAdapter();
      const password = "CorrectHorseBatteryStaple!2026";
      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: "unprovisioned@example.com",
        username: "unprovisioned",
        passwordHash: await crypto.hashPassword(password)
      });

      const auth = await createAuthManager({
        adapter: new PostgresAdapter({
          postgresUrl,
          userSchema: schema,
          userTableName: userTable,
          accountSecuritySchema: schema,
          accountSecurityTableName: accountSecurityTable
        }),
        authTypes: ["credentials"],
        accountSecurity: true
      });

      try {
        const denied = await auth.credentials.login("unprovisioned@example.com", password);
        expect(denied.success).toBe(false);
        expect(denied.httpCode).toBe(401);
        expect(denied.message).toBe("Invalid credentials.");

        await pool.query(
          `INSERT INTO ${schema}.${accountSecurityTable} (user_id, status, updated_at)
           VALUES ($1, 'active', NOW())`,
          [user.id]
        );

        const allowed = await auth.credentials.login("unprovisioned@example.com", password);
        expect(allowed.success).toBe(true);
        expect(allowed.httpCode).toBe(200);
      } finally {
        await auth.disconnectDB();
      }
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

  describe("password recovery", () => {
    const actionTokenTable = "action_tokens";
    const purpose: ActionTokenPurpose = "password_recovery";

    async function createActionTokenTable(options?: {
      selectorUnique?: boolean;
      withForeignKey?: boolean;
      withPurposeCheck?: boolean;
      purposeValues?: readonly string[];
    }): Promise<void> {
      const foreignKey =
        (options?.withForeignKey ?? true)
          ? `REFERENCES ${schema}.${userTable}(id) ON DELETE CASCADE`
          : "";

      const purposeValues = options?.purposeValues ?? [purpose];
      const purposeCheck =
        (options?.withPurposeCheck ?? true)
          ? `CHECK (purpose IN (${purposeValues.map((value) => `'${value}'`).join(",")}))`
          : "";

      await pool.query(`
        CREATE TABLE ${schema}.${actionTokenTable} (
          id          BIGSERIAL PRIMARY KEY,
          user_id     BIGINT NOT NULL ${foreignKey},
          purpose     TEXT NOT NULL ${purposeCheck},
          selector    TEXT NOT NULL,
          token_hash  TEXT NOT NULL,
          expires_at  TIMESTAMPTZ NOT NULL,
          used_at     TIMESTAMPTZ NULL,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      if (options?.selectorUnique ?? true) {
        await pool.query(
          `CREATE UNIQUE INDEX action_tokens_selector_unique_idx
             ON ${schema}.${actionTokenTable} (selector)`
        );
      }
    }

    const connectOptions = {
      postgresUrl,
      userSchema: schema,
      userTableName: userTable,
      actionTokenSchema: schema,
      actionTokenTableName: actionTokenTable
    };

    async function createUser(label: string): Promise<string> {
      const users = new PostgresUserRepository(schema, userTable, pool);
      const user = await users.create({
        email: `${label}@example.com`,
        username: label,
        passwordHash: "hash"
      });
      return user.id;
    }

    function tokenRepo(): PostgresActionTokenRepository {
      return new PostgresActionTokenRepository(schema, actionTokenTable, pool);
    }

    it("connects when the action token schema is valid", async () => {
      await createActionTokenTable();

      const db = await initPostgres({
        ...connectOptions,
        authTypes: ["credentials", "recovery"]
      });

      expect(db.actionTokenRepo).toBeDefined();
      await db.close();
    });

    it("does not build the repository when recovery is not enabled", async () => {
      const db = await initPostgres({ ...connectOptions, authTypes: ["credentials"] });

      expect(db.actionTokenRepo).toBeUndefined();
      await db.close();
    });

    it("rejects a missing action token table", async () => {
      await expect(
        initPostgres({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow(`Table '${schema}.${actionTokenTable}' does not exist`);
    });

    it("rejects a table without a unique selector", async () => {
      await createActionTokenTable({ selectorUnique: false });

      await expect(
        initPostgres({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow(
        "must have a non-partial single-column unique index or constraint on 'selector'"
      );
    });

    it("rejects a table without the user_id foreign key", async () => {
      await createActionTokenTable({ withForeignKey: false });

      await expect(
        initPostgres({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow(
        `must have a foreign key 'user_id' referencing '${schema}.${userTable}.id'`
      );
    });

    it("rejects a purpose column with no CHECK constraint", async () => {
      await createActionTokenTable({ withPurposeCheck: false });

      await expect(
        initPostgres({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow("must restrict 'purpose' to exactly");
    });

    it("rejects a purpose constraint that permits an unknown purpose", async () => {
      await createActionTokenTable({ purposeValues: [purpose, "email_change"] });

      await expect(
        initPostgres({ ...connectOptions, authTypes: ["credentials", "recovery"] })
      ).rejects.toThrow("must restrict 'purpose' to exactly");
    });

    // The acceptance criterion the whole design rests on, against a real database: of many
    // simultaneous attempts to spend one token, exactly one is told it succeeded.
    it("lets exactly one of many concurrent consumers spend a token", async () => {
      await createActionTokenTable();
      const userId = await createUser("race_user");
      const tokens = tokenRepo();

      await tokens.create({
        userId,
        purpose,
        selector: "race-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, () => tokens.consume("race-selector", purpose))
      );

      expect(results.filter(Boolean)).toHaveLength(1);
      const stored = await tokens.findBySelector("race-selector", purpose);
      expect(stored?.usedAt).toBeInstanceOf(Date);
    });

    it("refuses to spend an expired token", async () => {
      await createActionTokenTable();
      const userId = await createUser("expired_user");
      const tokens = tokenRepo();

      await tokens.create({
        userId,
        purpose,
        selector: "expired-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() - 1000)
      });

      await expect(tokens.consume("expired-selector", purpose)).resolves.toBe(false);
    });

    it("rejects a second token with the same selector", async () => {
      await createActionTokenTable();
      const userId = await createUser("dup_selector_user");
      const tokens = tokenRepo();
      const input = {
        userId,
        purpose,
        selector: "dup-selector",
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 60_000)
      };

      await tokens.create(input);
      await expect(tokens.create(input)).rejects.toThrow();
    });

    it("invalidates only the user's outstanding tokens", async () => {
      await createActionTokenTable();
      const userId = await createUser("invalidate_user");
      const otherId = await createUser("other_user");
      const tokens = tokenRepo();
      const expiresAt = new Date(Date.now() + 60_000);

      await tokens.create({ userId, purpose, selector: "mine-1", tokenHash: "h", expiresAt });
      await tokens.create({ userId, purpose, selector: "mine-2", tokenHash: "h", expiresAt });
      await tokens.create({
        userId: otherId,
        purpose,
        selector: "theirs",
        tokenHash: "h",
        expiresAt
      });

      await expect(tokens.invalidateByUserId(userId, purpose)).resolves.toBe(true);

      await expect(tokens.consume("mine-1", purpose)).resolves.toBe(false);
      await expect(tokens.consume("mine-2", purpose)).resolves.toBe(false);
      await expect(tokens.consume("theirs", purpose)).resolves.toBe(true);
    });

    // End to end through the public API: request, deliver, confirm, then log in with the
    // new password. The second confirm with the same token must fail.
    it("recovers an account through the public API", async () => {
      await createActionTokenTable();

      const crypto = new BcryptAdapter();
      const users = new PostgresUserRepository(schema, userTable, pool);
      await users.create({
        email: "recover@example.com",
        username: "recover_user",
        passwordHash: await crypto.hashPassword("OriginalPassword!2026-unused")
      });

      const deliveries: RecoveryDelivery[] = [];
      const auth = await createAuthManager({
        adapter: new PostgresAdapter(connectOptions),
        authTypes: ["credentials", "recovery"],
        recovery: { deliver: (delivery) => void deliveries.push(delivery) }
      });

      try {
        const requested = await auth.recovery.request("recover@example.com");
        expect(requested.httpCode).toBe(202);
        expect(deliveries).toHaveLength(1);

        const unknown = await auth.recovery.request("nobody@example.com");
        expect(unknown).toEqual(requested);
        expect(deliveries).toHaveLength(1);

        const newPassword = `Recovered-${randomUUID()}`;
        const [first, second] = await Promise.all([
          auth.recovery.confirm(deliveries[0].token, newPassword),
          auth.recovery.confirm(deliveries[0].token, newPassword)
        ]);

        expect([first.success, second.success].filter(Boolean)).toHaveLength(1);

        const login = await auth.credentials.login("recover@example.com", newPassword);
        expect(login.success).toBe(true);

        const replay = await auth.recovery.confirm(deliveries[0].token, `Again-${randomUUID()}`);
        expect(replay.success).toBe(false);
        expect(replay.httpCode).toBe(400);

        // Only the hash of the secret half is ever written.
        const { rows } = await pool.query<{ token_hash: string }>(
          `SELECT token_hash FROM ${schema}.${actionTokenTable}`
        );
        const verifier = deliveries[0].token.split(".")[1];
        expect(rows.every((row) => !row.token_hash.includes(verifier))).toBe(true);
      } finally {
        await auth.disconnectDB();
      }
    });
  });
});
