import { Collection, ObjectId } from "mongodb";
import {
  ActionToken,
  ActionTokenPurpose,
  ActionTokenRepository,
  RecoveryCommitOutcome,
  UserId
} from "../contracts";
import {
  IMongoActionTokenDoc,
  IMongoMagicLinkDoc,
  IMongoUserDoc
} from "../../infra/databases/mongo/types";

export class MongoActionTokenRepo implements ActionTokenRepository {
  private collection: Collection<IMongoActionTokenDoc>;
  /**
   * Shared serialization queue for all per-(userId, purpose) operations.
   *
   * Both `createSuperseding` and `commitRecovery` chain onto this queue for the same key,
   * so a new token cannot be issued while a confirmation is in flight and vice versa
   * (in-process serialization only — the cross-process residual window noted in the
   * contracts still applies on standalone MongoDB deployments).
   */
  private pendingOps = new Map<string, Promise<unknown>>();

  constructor(
    collection: Collection<IMongoActionTokenDoc>,
    private readonly userCollection: Collection<IMongoUserDoc>,
    private readonly mlCollection?: Collection<IMongoMagicLinkDoc>
  ) {
    this.collection = collection;
  }

  /** Chain `op` after any in-flight operation for the same `key`, then register it. */
  private chainOp<T>(key: string, op: () => Promise<T>): Promise<T> {
    const previous = this.pendingOps.get(key) ?? Promise.resolve(null);
    const result: Promise<T> = previous.catch(() => null).then(op);
    // Store a swallowed version so a failed op does not poison subsequent chains, and keep a
    // reference to that same object for the cleanup comparison below.
    const stored = result.catch(() => undefined);
    this.pendingOps.set(key, stored);
    void stored.finally(() => {
      if (this.pendingOps.get(key) === stored) {
        this.pendingOps.delete(key);
      }
    });
    return result;
  }

  private static toToken(doc: IMongoActionTokenDoc): ActionToken {
    return {
      id: doc._id?.toString() || "",
      userId: doc.user_id.toString(),
      // Every lookup filters on `purpose`, so a document only reaches here carrying the
      // purpose it was asked for. No collection validator is required for that guarantee.
      purpose: doc.purpose as ActionTokenPurpose,
      selector: doc.selector,
      tokenHash: doc.token_hash,
      expiresAt: doc.expires_at,
      usedAt: doc.used_at ?? null,
      createdAt: doc.created_at
    };
  }

  async create(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken> {
    const now = new Date();

    let userObjectId: ObjectId;
    try {
      userObjectId = new ObjectId(input.userId);
    } catch {
      throw new Error(`[Auth:MongoActionTokenRepo] '${input.userId}' is not a valid user id`);
    }

    const doc: Omit<IMongoActionTokenDoc, "_id"> = {
      user_id: userObjectId,
      purpose: input.purpose,
      selector: input.selector,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      used_at: null,
      created_at: now,
      updated_at: now
    };

    const result = await this.collection.insertOne(doc as unknown as IMongoActionTokenDoc);

    if (!result.acknowledged) {
      throw new Error("[Auth:MongoActionTokenRepo] Failed to create action token");
    }

    return {
      id: result.insertedId.toString(),
      userId: input.userId,
      purpose: input.purpose,
      selector: input.selector,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: now
    };
  }

  async findBySelector(selector: string, purpose: ActionTokenPurpose): Promise<ActionToken | null> {
    const doc = await this.collection.findOne({ selector, purpose });
    if (!doc) return null;

    return MongoActionTokenRepo.toToken(doc);
  }

  /**
   * One conditional updateOne, so the server decides the winner.
   *
   * MongoDB applies a single-document update atomically, and `used_at: null` is part of the
   * same filter, so of two concurrent callers exactly one gets `modifiedCount > 0`. Unlike
   * PostgreSQL's `NOW()`, the expiry bound here is this process's clock — the filter is
   * defence in depth rather than the only expiry check, and the service checks expiry too.
   */
  async consume(selector: string, purpose: ActionTokenPurpose): Promise<boolean> {
    const now = new Date();
    const result = await this.collection.updateOne(
      { selector, purpose, used_at: null, expires_at: { $gt: now } },
      { $set: { used_at: now, updated_at: now } }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Serialized invalidate-then-insert. Concurrent calls for the same user+purpose are
   * queued so each one runs after the previous fully commits — the second writer's
   * updateMany therefore sees and supersedes the first writer's inserted token.
   * This is in-process serialization; use PostgreSQL for a cross-process guarantee.
   */
  async createSuperseding(input: {
    userId: UserId;
    purpose: ActionTokenPurpose;
    selector: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<ActionToken | null> {
    return this.chainOp(`${input.userId}:${input.purpose}`, async () => {
      try {
        const now = new Date();
        await this.collection.updateMany(
          { user_id: new ObjectId(input.userId), purpose: input.purpose, used_at: null },
          { $set: { used_at: now, updated_at: now } }
        );
        return await this.create(input);
      } catch {
        return null;
      }
    });
  }

  async invalidateByUserId(userId: UserId, purpose: ActionTokenPurpose): Promise<boolean> {
    try {
      const now = new Date();
      const result = await this.collection.updateMany(
        { user_id: new ObjectId(userId), purpose, used_at: null },
        { $set: { used_at: now, updated_at: now } }
      );
      return result.acknowledged;
    } catch {
      return false;
    }
  }

  /**
   * Sequential consume → password update → magic-link revocation, serialized with
   * `createSuperseding` via the shared `pendingOps` queue for the same user+purpose.
   *
   * Unlike the PostgreSQL implementation there is no distributed transaction: if the
   * password write succeeds but magic-link revocation fails (or the process crashes between
   * the two), the outcome is `revocation_failed` and the password change is NOT rolled back.
   * The user's password is therefore already changed in this case. Use PostgreSQL if a fully
   * durable, cross-process atomic transition is required.
   */
  async commitRecovery(input: {
    selector: string;
    purpose: ActionTokenPurpose;
    userId: UserId;
    passwordHash: string;
  }): Promise<RecoveryCommitOutcome> {
    return this.chainOp(`${input.userId}:${input.purpose}`, async () => {
      const now = new Date();

      // Consume the token.
      const consumeResult = await this.collection.updateOne(
        {
          selector: input.selector,
          purpose: input.purpose,
          used_at: null,
          expires_at: { $gt: now }
        },
        { $set: { used_at: now, updated_at: now } }
      );
      if (consumeResult.modifiedCount === 0) {
        return { ok: false, reason: "already_used" } as RecoveryCommitOutcome;
      }

      // Update the user's password.
      let userObjectId: ObjectId;
      try {
        userObjectId = new ObjectId(input.userId);
      } catch {
        return { ok: false, reason: "password_update_failed" } as RecoveryCommitOutcome;
      }
      const updateResult = await this.userCollection.updateOne(
        { _id: userObjectId },
        { $set: { password: input.passwordHash, updated_at: now } }
      );
      if (updateResult.modifiedCount === 0) {
        return { ok: false, reason: "password_update_failed" } as RecoveryCommitOutcome;
      }

      // Revoke magic links if a magic-link collection is configured.
      if (this.mlCollection) {
        try {
          await this.mlCollection.updateMany(
            { user_id: userObjectId, used_at: null },
            { $set: { used_at: now, updated_at: now } }
          );
        } catch {
          // Password is already written; report the failure so the caller can surface it.
          return { ok: false, reason: "revocation_failed" } as RecoveryCommitOutcome;
        }
        return { ok: true, magicLinksInvalidated: true };
      }

      return { ok: true, magicLinksInvalidated: false };
    });
  }
}
