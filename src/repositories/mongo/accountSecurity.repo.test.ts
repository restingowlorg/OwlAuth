import { Collection, ObjectId } from "mongodb";
import { MongoAccountSecurityRepo } from "./accountSecurity.repo";
import { AccountSecurityRecordExistsError } from "../contracts";
import { IMongoAccountSecurityDoc } from "../../infra/databases/mongo/types";

describe("MongoAccountSecurityRepo", () => {
  const collection = {
    insertOne: jest.fn(),
    findOne: jest.fn()
  } as unknown as Collection<IMongoAccountSecurityDoc>;

  const repo = new MongoAccountSecurityRepo(collection);

  const userId = new ObjectId().toHexString();
  const input = { userId, status: "active" as const, emailVerifiedAt: null };

  function duplicateKey(): Error & { code: number } {
    return Object.assign(new Error("E11000 duplicate key error collection"), { code: 11000 });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("returns the stored record", async () => {
      (collection.insertOne as jest.Mock).mockResolvedValue({ acknowledged: true });

      await expect(repo.create(input)).resolves.toEqual(
        expect.objectContaining({ userId, status: "active", emailVerifiedAt: null })
      );
    });

    it("rejects a user id that is not an ObjectId", async () => {
      await expect(repo.create({ ...input, userId: "not-an-object-id" })).rejects.toThrow(
        "is not a valid user id"
      );
    });

    // The unique user_id index rejecting the write means a concurrent attempt won.
    it("reports an existing record when the conflict is on this user", async () => {
      (collection.insertOne as jest.Mock).mockRejectedValue(duplicateKey());
      (collection.findOne as jest.Mock).mockResolvedValue({
        user_id: new ObjectId(userId),
        status: "active",
        email_verified_at: null,
        updated_at: new Date()
      });

      await expect(repo.create(input)).rejects.toBeInstanceOf(AccountSecurityRecordExistsError);
    });

    // 11000 is raised by any unique index. Treating an unrelated one as "already
    // provisioned" would let signup return 201 for an account that cannot authenticate.
    it("rethrows when the duplicate key is not this user's record", async () => {
      const original = duplicateKey();
      (collection.insertOne as jest.Mock).mockRejectedValue(original);
      (collection.findOne as jest.Mock).mockResolvedValue(null);

      await expect(repo.create(input)).rejects.toBe(original);
    });

    it("rethrows an error that is not a duplicate key", async () => {
      const original = Object.assign(new Error("socket closed"), { code: 89 });
      (collection.insertOne as jest.Mock).mockRejectedValue(original);

      await expect(repo.create(input)).rejects.toBe(original);
    });

    it("rejects an unacknowledged insert", async () => {
      (collection.insertOne as jest.Mock).mockResolvedValue({ acknowledged: false });

      await expect(repo.create(input)).rejects.toThrow("Failed to create account security record");
    });
  });

  describe("findByUserId", () => {
    it("returns null for a malformed user id", async () => {
      await expect(repo.findByUserId("not-an-object-id")).resolves.toBeNull();
    });
  });
});
