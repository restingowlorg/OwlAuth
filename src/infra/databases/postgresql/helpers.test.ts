import { Pool } from "pg";
import {
  validateEnumCheckConstraint,
  validateNonNullableColumns,
  validateUniqueColumn
} from "./helpers";

describe("validateUniqueColumn", () => {
  const pool = {
    query: jest.fn()
  } as unknown as Pool;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a non-partial single-column unique index", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rowCount: 1,
      rows: [{ index_name: "users_email_unique_idx" }]
    });

    await expect(validateUniqueColumn(pool, "public", "users", "email")).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("index_meta.indisunique"), [
      "public",
      "users",
      "email"
    ]);
  });

  it("rejects when a field does not have a required unique index", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rowCount: 0, rows: [] });

    await expect(validateUniqueColumn(pool, "public", "users", "username")).rejects.toThrow(
      "must have a non-partial single-column unique index or constraint on 'username'"
    );
  });
});

describe("validateNonNullableColumns", () => {
  const pool = {
    query: jest.fn()
  } as unknown as Pool;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts required non-null identity columns", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        { column_name: "email", is_nullable: "NO" },
        { column_name: "username", is_nullable: "NO" }
      ]
    });

    await expect(
      validateNonNullableColumns(pool, "public", "users", ["email", "username"])
    ).resolves.toBeUndefined();
  });

  it("rejects nullable identity columns", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        { column_name: "email", is_nullable: "NO" },
        { column_name: "username", is_nullable: "YES" }
      ]
    });

    await expect(
      validateNonNullableColumns(pool, "public", "users", ["email", "username"])
    ).rejects.toThrow("Column 'public.users.username' must be NOT NULL");
  });
});

describe("validateEnumCheckConstraint", () => {
  const pool = {
    query: jest.fn()
  } as unknown as Pool;

  const statuses = ["active", "pending_email_verification", "disabled"] as const;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function call(): Promise<void> {
    return validateEnumCheckConstraint(pool, "public", "account_security", "status", statuses);
  }

  it("accepts the definition PostgreSQL renders for an IN constraint", async () => {
    // PostgreSQL normalises `IN (...)` into `= ANY (ARRAY[...])`.
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK ((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text])))"
        }
      ]
    });

    await expect(call()).resolves.toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("contype = 'c'"), [
      "public",
      "account_security"
    ]);
  });

  it("rejects a table with no CHECK constraint at all", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    await expect(call()).rejects.toThrow(
      "Table 'public.account_security' must have a CHECK constraint restricting 'status'"
    );
  });

  it("rejects a constraint that omits one of the permitted values", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ definition: "CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))" }]
    });

    await expect(call()).rejects.toThrow("must have a CHECK constraint restricting 'status'");
  });

  it("ignores a CHECK constraint on an unrelated column", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ definition: "CHECK ((char_length(note) < 100))" }]
    });

    await expect(call()).rejects.toThrow("must have a CHECK constraint restricting 'status'");
  });

  it("names the expected values in the error so the fix is obvious", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    await expect(call()).rejects.toThrow("('active', 'pending_email_verification', 'disabled')");
  });
});
