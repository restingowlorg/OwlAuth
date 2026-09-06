import { Pool } from "pg";
import { validateNonNullableColumns, validateUniqueColumn } from "./helpers";

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
