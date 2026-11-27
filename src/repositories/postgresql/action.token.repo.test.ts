import { Pool, PoolClient } from "pg";
import { PostgresActionTokenRepository } from "./action.token.repo";

describe("PostgresActionTokenRepository", () => {
  const query = jest.fn<Promise<unknown>, [string, unknown[]]>();
  const clientQuery = jest.fn<Promise<unknown>, [string, (unknown[] | undefined)?]>();
  const clientRelease = jest.fn();
  const mockClient = { query: clientQuery, release: clientRelease } as unknown as PoolClient;
  const connect = jest.fn<Promise<PoolClient>, []>().mockResolvedValue(mockClient);
  const pool = { query, connect } as unknown as Pool;

  const repo = new PostgresActionTokenRepository("auth", "action_tokens", pool, "auth", "users");

  const expiresAt = new Date("2026-01-01T00:15:00Z");
  const createdAt = new Date("2026-01-01T00:00:00Z");

  const input = {
    userId: "42",
    purpose: "password_recovery" as const,
    selector: "sel",
    tokenHash: "hash",
    expiresAt
  };

  const row = {
    id: 7,
    user_id: 42,
    purpose: "password_recovery",
    selector: "sel",
    token_hash: "hash",
    expires_at: expiresAt,
    used_at: null,
    created_at: createdAt
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connect.mockResolvedValue(mockClient);
  });

  describe("create", () => {
    it("returns the stored token with string ids", async () => {
      query.mockResolvedValue({ rows: [row] });

      await expect(repo.create(input)).resolves.toEqual({
        id: "7",
        userId: "42",
        purpose: "password_recovery",
        selector: "sel",
        tokenHash: "hash",
        expiresAt,
        usedAt: null,
        createdAt
      });
    });

    it("writes to the configured schema and table", async () => {
      query.mockResolvedValue({ rows: [row] });

      await repo.create(input);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('"auth"."action_tokens"');
      expect(params).toEqual(["42", "password_recovery", "sel", "hash", expiresAt]);
    });

    it("rejects when the insert returns no row", async () => {
      query.mockResolvedValue({ rows: [] });

      await expect(repo.create(input)).rejects.toThrow("Insert returned no action token");
    });
  });

  describe("findBySelector", () => {
    it("filters on selector and purpose together", async () => {
      query.mockResolvedValue({ rows: [row] });

      await repo.findBySelector("sel", "password_recovery");

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/selector = \$1 AND purpose = \$2/);
      expect(params).toEqual(["sel", "password_recovery"]);
    });

    it("returns null when no row matches", async () => {
      query.mockResolvedValue({ rows: [] });

      await expect(repo.findBySelector("sel", "password_recovery")).resolves.toBeNull();
    });
  });

  describe("consume", () => {
    // The conditions live in the UPDATE itself, so the database decides the race.
    it("conditions the write on purpose, unused and unexpired by the database clock", async () => {
      query.mockResolvedValue({ rowCount: 1 });

      await repo.consume("sel", "password_recovery");

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/purpose = \$2/);
      expect(sql).toMatch(/used_at IS NULL/);
      expect(sql).toMatch(/expires_at > NOW\(\)/);
      expect(params).toEqual(["sel", "password_recovery"]);
    });

    it("reports true only when this call updated the row", async () => {
      query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });

      await expect(repo.consume("sel", "password_recovery")).resolves.toBe(true);
      await expect(repo.consume("sel", "password_recovery")).resolves.toBe(false);
    });

    it("treats a missing rowCount as not consumed", async () => {
      query.mockResolvedValue({ rowCount: null });

      await expect(repo.consume("sel", "password_recovery")).resolves.toBe(false);
    });
  });

  describe("invalidateByUserId", () => {
    it("marks only this user's unused tokens of the given purpose", async () => {
      query.mockResolvedValue({ rowCount: 2 });

      await expect(repo.invalidateByUserId("42", "password_recovery")).resolves.toBe(true);

      const [sql, params] = query.mock.calls[0];
      expect(sql).toMatch(/user_id = \$1 AND purpose = \$2 AND used_at IS NULL/);
      expect(params).toEqual(["42", "password_recovery"]);
    });

    // Zero rows is success: there was simply nothing outstanding.
    it("reports success when there was nothing to invalidate", async () => {
      query.mockResolvedValue({ rowCount: 0 });

      await expect(repo.invalidateByUserId("42", "password_recovery")).resolves.toBe(true);
    });

    it("reports false when the write fails", async () => {
      query.mockRejectedValue(new Error("connection terminated"));

      await expect(repo.invalidateByUserId("42", "password_recovery")).resolves.toBe(false);
    });
  });

  describe("createSuperseding", () => {
    it("wraps invalidate and insert in a transaction", async () => {
      clientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE (invalidate)
        .mockResolvedValueOnce({ rows: [row] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      await repo.createSuperseding(input);

      const sqls = clientQuery.mock.calls.map(([sql]) => sql.replace(/\s+/g, " ").trim());
      expect(sqls[0]).toBe("BEGIN");
      expect(sqls[1]).toMatch(/pg_advisory_xact_lock/);
      expect(sqls[2]).toMatch(/UPDATE .+ SET used_at = NOW/);
      expect(sqls[3]).toMatch(/INSERT INTO/);
      expect(sqls[4]).toBe("COMMIT");
      expect(clientRelease).toHaveBeenCalled();
    });

    it("returns the inserted token", async () => {
      clientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
        .mockResolvedValueOnce({ rows: [row] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repo.createSuperseding(input);

      expect(result).toEqual(expect.objectContaining({ selector: "sel", tokenHash: "hash" }));
    });

    it("rolls back and returns null when the insert fails", async () => {
      clientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
        .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE
        .mockRejectedValueOnce(new Error("unique violation")); // INSERT throws

      const result = await repo.createSuperseding(input);

      expect(result).toBeNull();
      const calls = clientQuery.mock.calls.map(([sql]) => sql.trim());
      expect(calls).toContain("ROLLBACK");
      expect(clientRelease).toHaveBeenCalled();
    });

    it("rolls back and returns null when the connection fails", async () => {
      connect.mockRejectedValueOnce(new Error("pool exhausted"));

      const result = await repo.createSuperseding(input);

      expect(result).toBeNull();
    });
  });
});
