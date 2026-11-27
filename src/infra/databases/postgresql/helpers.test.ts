import { Pool } from "pg";
import { validateColumnDomain, validateNonNullableColumns, validateUniqueColumn } from "./helpers";

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

describe("validateColumnDomain", () => {
  const pool = {
    query: jest.fn()
  } as unknown as Pool;

  const statuses = ["active", "pending_email_verification", "disabled"] as const;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function call(): Promise<void> {
    return validateColumnDomain(pool, "public", "account_security", "status", statuses);
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
      "Table 'public.account_security' must restrict 'status' to exactly"
    );
  });

  it("rejects a constraint that omits one of the permitted values", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ definition: "CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))" }]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  // Containing all three is not enough: a fourth value makes the schema contradict what
  // the migration and documentation promise.
  it("rejects a constraint that permits an unsupported fourth value", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK ((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text, 'suspended'::text])))"
        }
      ]
    });

    await expect(call()).rejects.toThrow("to exactly ('active', 'pending_email_verification',");
  });

  it("rejects a compound constraint that introduces an extra literal", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK (((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text])) AND (note <> 'x'::text)))"
        }
      ]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  // Contains exactly the expected literals, yet leaves `status` unconstrained:
  // status = 'suspended', note = 'disabled' satisfies it.
  it("rejects a disjunction that only appears to constrain the column", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK (((status = 'active'::text) OR (note = ANY (ARRAY['pending_email_verification'::text, 'disabled'::text]))))"
        }
      ]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  it("rejects a predicate on a different column that lists the expected values", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK ((note = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text])))"
        }
      ]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  it("rejects an array containing a non-literal element", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK ((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, lower(note)])))"
        }
      ]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  it("accepts the array-cast form PostgreSQL sometimes renders", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        {
          definition:
            "CHECK ((status = ANY ((ARRAY['active'::character varying, 'pending_email_verification'::character varying, 'disabled'::character varying])::text[])))"
        }
      ]
    });

    await expect(call()).resolves.toBeUndefined();
  });

  it("accepts an exact constraint alongside an unrelated one on another column", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [
        { definition: "CHECK ((char_length(note) < 100))" },
        {
          definition:
            "CHECK ((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text])))"
        }
      ]
    });

    await expect(call()).resolves.toBeUndefined();
  });

  it("handles a literal containing an escaped quote", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ definition: "CHECK ((status = ANY (ARRAY['it''s'::text])))" }]
    });

    await expect(
      validateColumnDomain(pool, "public", "account_security", "status", ["it's"])
    ).resolves.toBeUndefined();
  });

  // PostgreSQL builds `= ANY (ARRAY[...])` only for two or more values. A one-value
  // `IN ('x')` is stored as a plain equality, which is the only form a single-value
  // domain such as the action token `purpose` can ever take.
  describe("single-value domains", () => {
    function callPurpose(): Promise<void> {
      return validateColumnDomain(pool, "public", "action_tokens", "purpose", [
        "password_recovery"
      ]);
    }

    it("accepts the equality PostgreSQL renders for a one-value IN", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ definition: "CHECK ((purpose = 'password_recovery'::text))" }]
      });

      await expect(callPurpose()).resolves.toBeUndefined();
    });

    it("accepts the equality without a cast", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ definition: "CHECK ((purpose = 'password_recovery'))" }]
      });

      await expect(callPurpose()).resolves.toBeUndefined();
    });

    it("rejects an equality on the wrong value", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ definition: "CHECK ((purpose = 'email_change'::text))" }]
      });

      await expect(callPurpose()).rejects.toThrow("must restrict 'purpose' to exactly");
    });

    it("rejects an equality on a different column", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ definition: "CHECK ((note = 'password_recovery'::text))" }]
      });

      await expect(callPurpose()).rejects.toThrow("must restrict 'purpose' to exactly");
    });

    it("rejects an equality combined with another predicate", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            definition:
              "CHECK (((purpose = 'password_recovery'::text) OR (note = 'password_recovery'::text)))"
          }
        ]
      });

      await expect(callPurpose()).rejects.toThrow("must restrict 'purpose' to exactly");
    });

    // A single equality yields one value, so it can never satisfy a multi-value domain.
    it("does not let a single equality satisfy a three-value domain", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [{ definition: "CHECK ((status = 'active'::text))" }]
      });

      await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
    });
  });

  // A native enum states the permitted set directly, so no CHECK constraint is needed.
  describe("native enum columns", () => {
    function mockEnumLabels(labels: string[]): void {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rowCount: labels.length,
        rows: labels.map((enumlabel) => ({ enumlabel }))
      });
    }

    it("accepts an enum whose labels match exactly", async () => {
      mockEnumLabels(["active", "pending_email_verification", "disabled"]);

      await expect(call()).resolves.toBeUndefined();
      // The constraint query is never reached.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it("rejects an enum with an extra label", async () => {
      mockEnumLabels(["active", "pending_email_verification", "disabled", "suspended"]);

      await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
    });

    it("rejects an enum missing a label", async () => {
      mockEnumLabels(["active", "disabled"]);

      await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
    });

    it("falls back to the CHECK constraint when the column is not an enum", async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              definition:
                "CHECK ((status = ANY (ARRAY['active'::text, 'pending_email_verification'::text, 'disabled'::text])))"
            }
          ]
        });

      await expect(call()).resolves.toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores a CHECK constraint on an unrelated column", async () => {
    (pool.query as jest.Mock).mockResolvedValue({
      rows: [{ definition: "CHECK ((char_length(note) < 100))" }]
    });

    await expect(call()).rejects.toThrow("must restrict 'status' to exactly");
  });

  it("names the expected values in the error so the fix is obvious", async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

    await expect(call()).rejects.toThrow("('active', 'pending_email_verification', 'disabled')");
  });
});
