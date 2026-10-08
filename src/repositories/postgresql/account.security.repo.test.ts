import { Pool } from "pg";
import { PostgresAccountSecurityRepository } from "./account.security.repo";
import { AccountSecurityRecordExistsError } from "../contracts";

describe("PostgresAccountSecurityRepository", () => {
  const pool = {
    query: jest.fn()
  } as unknown as Pool;

  const repo = new PostgresAccountSecurityRepository("public", "account_security", pool);

  const input = { userId: "42", status: "active" as const, emailVerifiedAt: null };

  function uniqueViolation(): Error & { code: string } {
    return Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505"
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("returns the stored record", async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            user_id: 42,
            status: "active",
            email_verified_at: null,
            updated_at: new Date("2026-01-01T00:00:00Z")
          }
        ]
      });

      await expect(repo.create(input)).resolves.toEqual({
        userId: "42",
        status: "active",
        emailVerifiedAt: null,
        updatedAt: new Date("2026-01-01T00:00:00Z")
      });
    });

    // The unique user_id constraint rejecting the write means a concurrent attempt won.
    it("reports an existing record when the conflict is on this user", async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({
        rows: [{ user_id: 42, status: "active", email_verified_at: null, updated_at: new Date() }]
      });

      await expect(repo.create(input)).rejects.toBeInstanceOf(AccountSecurityRecordExistsError);
    });

    // 23505 is raised by any unique constraint. Treating an unrelated one as "already
    // provisioned" would let signup return 201 for an account that cannot authenticate.
    it("rethrows when the duplicate key is not this user's record", async () => {
      const original = uniqueViolation();
      (pool.query as jest.Mock).mockRejectedValueOnce(original).mockResolvedValueOnce({ rows: [] });

      await expect(repo.create(input)).rejects.toBe(original);
    });

    it("rethrows the original error when the read-back itself fails", async () => {
      const original = uniqueViolation();
      (pool.query as jest.Mock)
        .mockRejectedValueOnce(original)
        .mockRejectedValueOnce(new Error("connection terminated"));

      // The read-back failure must not replace the error that explains the write.
      await expect(repo.create(input)).rejects.toBe(original);
    });

    it("rethrows an error that is not a unique violation", async () => {
      const original = Object.assign(new Error("connection terminated"), { code: "57P01" });
      (pool.query as jest.Mock).mockRejectedValue(original);

      await expect(repo.create(input)).rejects.toBe(original);
    });

    it("rejects when the insert returns no row", async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(repo.create(input)).rejects.toThrow(
        "Insert returned no account security record"
      );
    });
  });

  describe("findByUserId", () => {
    it("returns null when no record exists", async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await expect(repo.findByUserId("42")).resolves.toBeNull();
    });
  });
});
