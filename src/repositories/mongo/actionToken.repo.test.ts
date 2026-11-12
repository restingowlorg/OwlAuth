import { Collection, ObjectId } from "mongodb";
import { MongoActionTokenRepo } from "./actionToken.repo";
import { IMongoActionTokenDoc } from "../../infra/databases/mongo/types";

type Filter = Partial<Record<keyof IMongoActionTokenDoc, unknown>>;
type Update = { $set: Partial<IMongoActionTokenDoc> };

describe("MongoActionTokenRepo", () => {
  const insertOne = jest.fn<Promise<unknown>, [IMongoActionTokenDoc]>();
  const findOne = jest.fn<Promise<unknown>, [Filter]>();
  const updateOne = jest.fn<Promise<unknown>, [Filter, Update]>();
  const updateMany = jest.fn<Promise<unknown>, [Filter, Update]>();

  const collection = {
    insertOne,
    findOne,
    updateOne,
    updateMany
  } as unknown as Collection<IMongoActionTokenDoc>;

  const repo = new MongoActionTokenRepo(collection);

  const userId = new ObjectId().toHexString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const input = {
    userId,
    purpose: "password_recovery" as const,
    selector: "sel",
    tokenHash: "hash",
    expiresAt
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("stores the user id as an ObjectId and returns the token", async () => {
      const insertedId = new ObjectId();
      insertOne.mockResolvedValue({ acknowledged: true, insertedId });

      await expect(repo.create(input)).resolves.toEqual(
        expect.objectContaining({
          id: insertedId.toHexString(),
          userId,
          purpose: "password_recovery",
          selector: "sel",
          tokenHash: "hash",
          expiresAt,
          usedAt: null
        })
      );

      const [doc] = insertOne.mock.calls[0];
      expect(doc.user_id).toBeInstanceOf(ObjectId);
      expect(doc.user_id.toHexString()).toBe(userId);
      expect(doc.used_at).toBeNull();
    });

    it("rejects a user id that is not an ObjectId", async () => {
      await expect(repo.create({ ...input, userId: "not-an-object-id" })).rejects.toThrow(
        "is not a valid user id"
      );
      expect(insertOne).not.toHaveBeenCalled();
    });

    it("rejects an unacknowledged insert", async () => {
      insertOne.mockResolvedValue({ acknowledged: false, insertedId: new ObjectId() });

      await expect(repo.create(input)).rejects.toThrow("Failed to create action token");
    });
  });

  describe("findBySelector", () => {
    it("filters on selector and purpose together", async () => {
      findOne.mockResolvedValue(null);

      await expect(repo.findBySelector("sel", "password_recovery")).resolves.toBeNull();
      expect(findOne).toHaveBeenCalledWith({ selector: "sel", purpose: "password_recovery" });
    });

    it("maps a stored document", async () => {
      const _id = new ObjectId();
      const createdAt = new Date();
      findOne.mockResolvedValue({
        _id,
        user_id: new ObjectId(userId),
        purpose: "password_recovery",
        selector: "sel",
        token_hash: "hash",
        expires_at: expiresAt,
        used_at: null,
        created_at: createdAt,
        updated_at: createdAt
      });

      await expect(repo.findBySelector("sel", "password_recovery")).resolves.toEqual({
        id: _id.toHexString(),
        userId,
        purpose: "password_recovery",
        selector: "sel",
        tokenHash: "hash",
        expiresAt,
        usedAt: null,
        createdAt
      });
    });
  });

  describe("consume", () => {
    // The conditions live in the filter of one updateOne, so the server decides the race.
    it("conditions the write on purpose, unused and unexpired", async () => {
      updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repo.consume("sel", "password_recovery");

      const [filter, update] = updateOne.mock.calls[0];
      expect(filter).toEqual({
        selector: "sel",
        purpose: "password_recovery",
        used_at: null,
        expires_at: { $gt: expect.any(Date) as Date }
      });
      expect(update.$set.used_at).toBeInstanceOf(Date);
    });

    it("reports true only when this call modified the document", async () => {
      updateOne.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({
        modifiedCount: 0
      });

      await expect(repo.consume("sel", "password_recovery")).resolves.toBe(true);
      await expect(repo.consume("sel", "password_recovery")).resolves.toBe(false);
    });
  });

  describe("invalidateByUserId", () => {
    it("marks only this user's unused tokens of the given purpose", async () => {
      updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 0 });

      await expect(repo.invalidateByUserId(userId, "password_recovery")).resolves.toBe(true);

      const [filter] = updateMany.mock.calls[0];
      expect(filter).toEqual({
        user_id: new ObjectId(userId),
        purpose: "password_recovery",
        used_at: null
      });
    });

    it("reports false for an unacknowledged write", async () => {
      updateMany.mockResolvedValue({ acknowledged: false });

      await expect(repo.invalidateByUserId(userId, "password_recovery")).resolves.toBe(false);
    });

    it("reports false when the write fails", async () => {
      updateMany.mockRejectedValue(new Error("socket closed"));

      await expect(repo.invalidateByUserId(userId, "password_recovery")).resolves.toBe(false);
    });

    it("reports false for a malformed user id", async () => {
      await expect(repo.invalidateByUserId("not-an-object-id", "password_recovery")).resolves.toBe(
        false
      );
    });
  });
});
