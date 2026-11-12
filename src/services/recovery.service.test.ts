// Jest assertions reference mocked repository methods without calling them, which is what
// this rule objects to. Nothing here relies on `this`.
/* eslint-disable @typescript-eslint/unbound-method */
import { zxcvbn } from "@zxcvbn-ts/core";
import { RecoveryService, RecoveryServiceConfig } from "./recovery.service";
import {
  AccountSecurityRecord,
  AccountSecurityRepository,
  AccountStatus,
  ActionToken,
  ActionTokenRepository,
  MagicLinkRepository,
  SafeUser,
  UserRepository
} from "../repositories/contracts";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { RecoveryDelivery } from "../core/types";
import { containsBlockedPasswords } from "../utils/check-blocked-passwords";

jest.mock("@zxcvbn-ts/core");
jest.mock("../infra/security/pwned-passwords");
jest.mock("../utils/check-blocked-passwords");

const SELECTOR = "0123456789abcdef";
const VERIFIER = "fedcba9876543210fedcba9876543210";
const TOKEN = `${SELECTOR}.${VERIFIER}`;
const NEW_PASSWORD = "Velvet-Lantern-Orbit-42";
const EMAIL = "user@example.com";

const USER: SafeUser = { id: "7", email: EMAIL, username: "alice" };

type CreateActionTokenInput = Parameters<ActionTokenRepository["create"]>[0];

/** What every `request()` call must return, whoever asked and whatever went wrong. */
const ACCEPTED = {
  success: true,
  data: null,
  message: "If an account exists for this email, recovery instructions have been sent.",
  httpCode: 202
};

const INVALID_TOKEN = {
  success: false,
  data: undefined,
  message: "Invalid or expired recovery token",
  httpCode: 400
};

describe("RecoveryService", () => {
  let users: jest.Mocked<UserRepository>;
  let actionTokens: jest.Mocked<ActionTokenRepository>;
  let magicLinks: jest.Mocked<MagicLinkRepository>;
  let accountSecurity: jest.Mocked<AccountSecurityRepository>;
  let crypto: jest.Mocked<ICryptoAdapter>;
  let logger: jest.Mocked<IAuditLogger>;
  let deliver: jest.Mock<Promise<void>, [RecoveryDelivery]>;

  function storedToken(overrides: Partial<ActionToken> = {}): ActionToken {
    return {
      id: "t1",
      userId: USER.id,
      purpose: "password_recovery",
      selector: SELECTOR,
      tokenHash: "stored-hash",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
      ...overrides
    };
  }

  function build(
    config: Partial<RecoveryServiceConfig> = {},
    extras: { withMagicLinks?: boolean; withAccountSecurity?: boolean } = {}
  ): RecoveryService {
    return new RecoveryService(
      users,
      actionTokens,
      crypto,
      logger,
      { deliver, ...config },
      extras.withMagicLinks === false ? undefined : magicLinks,
      extras.withAccountSecurity ? accountSecurity : undefined
    );
  }

  /** Every audit event the service emitted, as one searchable string. */
  function auditedEvents(): string {
    return JSON.stringify(logger.audit.mock.calls);
  }

  function auditedTypes(): string[] {
    return logger.audit.mock.calls.map((call) => call[0].type);
  }

  beforeEach(() => {
    (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
    (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
    (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });

    users = {
      findById: jest.fn().mockResolvedValue(USER),
      findByEmail: jest.fn().mockResolvedValue(USER),
      findByUsername: jest.fn(),
      findWithPasswordByEmail: jest.fn(),
      findWithPasswordById: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn().mockResolvedValue(true)
    };

    actionTokens = {
      create: jest
        .fn<Promise<ActionToken>, [CreateActionTokenInput]>()
        .mockImplementation((input) => Promise.resolve(storedToken(input))),
      findBySelector: jest.fn().mockResolvedValue(storedToken()),
      consume: jest.fn().mockResolvedValue(true),
      invalidateByUserId: jest.fn().mockResolvedValue(true)
    };

    magicLinks = {
      create: jest.fn(),
      findByLookupKey: jest.fn(),
      consume: jest.fn(),
      invalidateByUserId: jest.fn().mockResolvedValue(true),
      deleteByUserId: jest.fn()
    };

    accountSecurity = {
      create: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue({
        userId: USER.id,
        status: "active" as AccountStatus,
        emailVerifiedAt: null,
        updatedAt: new Date()
      } as AccountSecurityRecord)
    };

    crypto = {
      hashPassword: jest.fn().mockResolvedValue("new-password-hash"),
      verifyPassword: jest.fn(),
      // The service asks for 16 bytes for the selector and 32 for the verifier.
      generateToken: jest
        .fn()
        .mockImplementation((length?: number) => (length === 16 ? SELECTOR : VERIFIER)),
      hashToken: jest.fn().mockResolvedValue("stored-hash"),
      verifyToken: jest.fn().mockResolvedValue(true)
    };

    logger = { audit: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    deliver = jest.fn<Promise<void>, [RecoveryDelivery]>().mockResolvedValue(undefined);
  });

  describe("request", () => {
    it("issues a token and hands it to the delivery callback", async () => {
      const result = await build().request(EMAIL, { correlationId: "req-1" });

      expect(result).toEqual(ACCEPTED);
      expect(actionTokens.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          purpose: "password_recovery",
          selector: SELECTOR,
          tokenHash: "stored-hash"
        })
      );
      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER.id,
          email: EMAIL,
          token: TOKEN,
          correlationId: "req-1"
        })
      );
      expect(auditedTypes()).toEqual(["PASSWORD_RECOVERY_REQUESTED"]);
    });

    it("stores only the hash of the verifier, never the token itself", async () => {
      await build().request(EMAIL);

      // The purpose is bound into the hashed material, so a row whose purpose column was
      // altered cannot verify.
      expect(crypto.hashToken).toHaveBeenCalledWith(`password_recovery:${VERIFIER}`);

      const created = actionTokens.create.mock.calls[0][0];
      expect(created.tokenHash).toBe("stored-hash");
      expect(JSON.stringify(created)).not.toContain(VERIFIER);
    });

    it("supersedes outstanding recovery tokens before issuing a new one", async () => {
      await build().request(EMAIL);

      expect(actionTokens.invalidateByUserId).toHaveBeenCalledWith(USER.id, "password_recovery");
      const invalidateOrder = actionTokens.invalidateByUserId.mock.invocationCallOrder[0];
      const createOrder = actionTokens.create.mock.invocationCallOrder[0];
      expect(invalidateOrder).toBeLessThan(createOrder);
    });

    it("builds a url from baseUrl when one is configured", async () => {
      await build({ baseUrl: "https://app.example/reset" }).request(EMAIL);

      expect(deliver).toHaveBeenCalledWith(
        expect.objectContaining({ url: `https://app.example/reset?token=${TOKEN}` })
      );
    });

    it("omits the url when no baseUrl is configured", async () => {
      await build().request(EMAIL);

      expect(deliver.mock.calls[0][0]).not.toHaveProperty("url");
    });

    it("honours a custom token lifetime", async () => {
      const before = Date.now();
      await build({ tokenTtlMinutes: 5 }).request(EMAIL);

      const { expiresAt } = actionTokens.create.mock.calls[0][0];
      const ttlMs = expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThan(4 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000 + 50);
    });

    it("defaults the token lifetime to 15 minutes", async () => {
      const before = Date.now();
      await build().request(EMAIL);

      const { expiresAt } = actionTokens.create.mock.calls[0][0];
      expect(expiresAt.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 50);
      expect(expiresAt.getTime() - before).toBeGreaterThan(14 * 60 * 1000);
    });

    describe("gives nothing away about which accounts exist", () => {
      it("returns the standard response for an unknown address, issuing nothing", async () => {
        users.findByEmail.mockResolvedValue(null);

        const result = await build().request(EMAIL);

        expect(result).toEqual(ACCEPTED);
        expect(actionTokens.create).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
        expect(auditedTypes()).toEqual(["PASSWORD_RECOVERY_FAILURE"]);
      });

      it("does comparable crypto work for an unknown address", async () => {
        users.findByEmail.mockResolvedValue(null);

        await build().request(EMAIL);

        expect(crypto.generateToken).toHaveBeenCalled();
        expect(crypto.hashToken).toHaveBeenCalled();
      });

      it.each([
        ["a lookup that throws", () => users.findByEmail.mockRejectedValue(new Error("db down"))],
        [
          "an invalidation that fails",
          () => actionTokens.invalidateByUserId.mockResolvedValue(false)
        ],
        [
          "a storage write that returns nothing",
          () => actionTokens.create.mockResolvedValue(null as unknown as ActionToken)
        ],
        [
          "a storage write that throws",
          () => actionTokens.create.mockRejectedValue(new Error("insert failed"))
        ],
        [
          "a delivery callback that throws",
          () =>
            deliver.mockImplementation(() => {
              throw new Error("mailer down");
            })
        ],
        [
          "a delivery callback that rejects",
          () => deliver.mockRejectedValue(new Error("mailer down"))
        ]
      ])("returns the standard response despite %s", async (_label, arrange) => {
        arrange();

        await expect(build().request(EMAIL)).resolves.toEqual(ACCEPTED);
      });

      it("does not issue a token when the invalidation write fails", async () => {
        actionTokens.invalidateByUserId.mockResolvedValue(false);

        await build().request(EMAIL);

        expect(actionTokens.create).not.toHaveBeenCalled();
        expect(deliver).not.toHaveBeenCalled();
      });

      it.each([300, 300])("pads a known-address response to the floor", async () => {
        const startedAt = Date.now();
        await build().request(EMAIL);

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(295);
      });

      it("pads an unknown-address response to the same floor", async () => {
        users.findByEmail.mockResolvedValue(null);

        const startedAt = Date.now();
        await build().request(EMAIL);

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(295);
      });
    });

    describe("with account security enabled", () => {
      it.each(["disabled", "DISABLED", "suspended"])(
        "issues nothing for an account whose status is %j",
        async (status) => {
          accountSecurity.findByUserId.mockResolvedValue({
            userId: USER.id,
            status: status as AccountStatus,
            emailVerifiedAt: null,
            updatedAt: new Date()
          });

          const result = await build({}, { withAccountSecurity: true }).request(EMAIL);

          expect(result).toEqual(ACCEPTED);
          expect(actionTokens.create).not.toHaveBeenCalled();
          expect(deliver).not.toHaveBeenCalled();
        }
      );

      it("issues nothing for an account with no security record", async () => {
        accountSecurity.findByUserId.mockResolvedValue(null);

        await build({}, { withAccountSecurity: true }).request(EMAIL);

        expect(actionTokens.create).not.toHaveBeenCalled();
      });

      it("issues a token for an active account", async () => {
        await build({}, { withAccountSecurity: true }).request(EMAIL);

        expect(deliver).toHaveBeenCalled();
      });
    });

    it("reports a delivery failure on the audit trail without changing the response", async () => {
      deliver.mockRejectedValue(new Error("mailer down"));

      await build().request(EMAIL);

      expect(auditedTypes()).toEqual(["PASSWORD_RECOVERY_REQUESTED", "PASSWORD_RECOVERY_FAILURE"]);
      expect(logger.error).toHaveBeenCalledWith(
        "Recovery delivery failed",
        expect.any(Error),
        expect.anything(),
        undefined
      );
    });

    it("keeps the token out of every audit event", async () => {
      await build({ baseUrl: "https://app.example/reset" }).request(EMAIL);

      expect(auditedEvents()).not.toContain(VERIFIER);
      expect(auditedEvents()).not.toContain(SELECTOR);
    });
  });

  describe("confirm", () => {
    it("replaces the password, spends the token and reports completion", async () => {
      const result = await build().confirm(TOKEN, NEW_PASSWORD, { correlationId: "req-2" });

      expect(result).toEqual({
        success: true,
        data: { userId: USER.id, magicLinksInvalidated: true },
        message: "Password updated successfully",
        httpCode: 200
      });
      expect(crypto.verifyToken).toHaveBeenCalledWith(
        `password_recovery:${VERIFIER}`,
        "stored-hash"
      );
      expect(users.updatePassword).toHaveBeenCalledWith(USER.id, "new-password-hash");
      expect(auditedTypes()).toEqual(["SESSION_INVALIDATION", "PASSWORD_RECOVERY_COMPLETED"]);
    });

    it("hashes the new password before spending the token", async () => {
      await build().confirm(TOKEN, NEW_PASSWORD);

      expect(crypto.hashPassword.mock.invocationCallOrder[0]).toBeLessThan(
        actionTokens.consume.mock.invocationCallOrder[0]
      );
    });

    it("looks the token up by selector and purpose together", async () => {
      await build().confirm(TOKEN, NEW_PASSWORD);

      expect(actionTokens.findBySelector).toHaveBeenCalledWith(SELECTOR, "password_recovery");
      expect(actionTokens.consume).toHaveBeenCalledWith(SELECTOR, "password_recovery");
    });

    it("retires the user's remaining recovery tokens and magic links", async () => {
      await build().confirm(TOKEN, NEW_PASSWORD);

      expect(actionTokens.invalidateByUserId).toHaveBeenCalledWith(USER.id, "password_recovery");
      expect(magicLinks.invalidateByUserId).toHaveBeenCalledWith(USER.id);
    });

    it("reports magicLinksInvalidated false when there is no magic-link store", async () => {
      const result = await build({}, { withMagicLinks: false }).confirm(TOKEN, NEW_PASSWORD);

      expect(result).toMatchObject({ data: { magicLinksInvalidated: false } });
      expect(auditedTypes()).toEqual(["PASSWORD_RECOVERY_COMPLETED"]);
    });

    it("still succeeds when magic-link invalidation fails", async () => {
      magicLinks.invalidateByUserId.mockRejectedValue(new Error("db down"));

      const result = await build().confirm(TOKEN, NEW_PASSWORD);

      expect(result.success).toBe(true);
      expect(result).toMatchObject({ data: { magicLinksInvalidated: false } });
      expect(logger.warn).toHaveBeenCalled();
    });

    describe("rejects every unusable token with one indistinguishable response", () => {
      it.each([
        ["an empty token", ""],
        ["a token with no separator", "nodotseparator"],
        ["a token with nothing before the separator", ".verifier"],
        ["a token with nothing after the separator", "selector."]
      ])("%s", async (_label, badToken) => {
        const result = await build().confirm(badToken, NEW_PASSWORD);

        expect(result).toEqual(INVALID_TOKEN);
        expect(actionTokens.findBySelector).not.toHaveBeenCalled();
        expect(users.updatePassword).not.toHaveBeenCalled();
      });

      it.each([
        ["an unknown selector", () => actionTokens.findBySelector.mockResolvedValue(null)],
        [
          "an already-used token",
          () => actionTokens.findBySelector.mockResolvedValue(storedToken({ usedAt: new Date() }))
        ],
        [
          "an expired token",
          () =>
            actionTokens.findBySelector.mockResolvedValue(
              storedToken({ expiresAt: new Date(Date.now() - 1000) })
            )
        ],
        ["a verifier that does not match", () => crypto.verifyToken.mockResolvedValue(false)]
      ])("%s", async (_label, arrange) => {
        arrange();

        const result = await build().confirm(TOKEN, NEW_PASSWORD);

        expect(result).toEqual(INVALID_TOKEN);
        expect(actionTokens.consume).not.toHaveBeenCalled();
        expect(users.updatePassword).not.toHaveBeenCalled();
      });

      it("a token whose purpose row was found but whose user is gone", async () => {
        users.findById.mockResolvedValue(null);

        const result = await build().confirm(TOKEN, NEW_PASSWORD);

        expect(result).toEqual(INVALID_TOKEN);
        expect(actionTokens.consume).not.toHaveBeenCalled();
      });

      it("an account whose status no longer permits recovery", async () => {
        accountSecurity.findByUserId.mockResolvedValue({
          userId: USER.id,
          status: "disabled",
          emailVerifiedAt: null,
          updatedAt: new Date()
        });

        const result = await build({}, { withAccountSecurity: true }).confirm(TOKEN, NEW_PASSWORD);

        expect(result).toEqual(INVALID_TOKEN);
        expect(actionTokens.consume).not.toHaveBeenCalled();
        expect(users.updatePassword).not.toHaveBeenCalled();
      });
    });

    describe("applies the shared password policy before spending the token", () => {
      it.each([
        [
          "too long",
          () => undefined,
          "a".repeat(73),
          { message: "Password must be 72 characters or less.", httpCode: 400 }
        ],
        [
          "blocked",
          () => (containsBlockedPasswords as jest.Mock).mockReturnValue(true),
          NEW_PASSWORD,
          {
            message: "New password cannot contain username, email, or blocked words",
            httpCode: 400
          }
        ],
        [
          "too weak",
          () => (zxcvbn as jest.Mock).mockReturnValue({ score: 1 }),
          NEW_PASSWORD,
          { message: "New password too weak", httpCode: 400 }
        ],
        [
          "breached",
          () => (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: true }),
          NEW_PASSWORD,
          { message: "New password found in data breach", httpCode: 400 }
        ]
      ])(
        "refuses a password that is %s, leaving the token unspent",
        async (_label, arrange, password, expected) => {
          arrange();

          const result = await build().confirm(TOKEN, password);

          expect(result).toMatchObject({ success: false, ...expected });
          // The token survives, so the user can retry with a better password rather than
          // having to request a whole new recovery message.
          expect(actionTokens.consume).not.toHaveBeenCalled();
          expect(users.updatePassword).not.toHaveBeenCalled();
        }
      );

      it("returns 503 when the breach lookup fails and fail-closed is set", async () => {
        (isBreachedPassword as jest.Mock).mockResolvedValue({
          detected: false,
          error: new Error("HIBP down")
        });

        const result = await build().confirm(TOKEN, NEW_PASSWORD, {
          pwnedPasswordFailClosed: true
        });

        expect(result).toMatchObject({
          success: false,
          message: "Security check unavailable. Please try again later.",
          httpCode: 503
        });
        expect(actionTokens.consume).not.toHaveBeenCalled();
      });

      it("proceeds with a warning when the breach lookup fails and fail-closed is not set", async () => {
        (isBreachedPassword as jest.Mock).mockResolvedValue({
          detected: false,
          error: new Error("HIBP down")
        });

        const result = await build().confirm(TOKEN, NEW_PASSWORD);

        expect(result.success).toBe(true);
        expect(logger.warn).toHaveBeenCalledWith(
          "PwnedPassword check failed (system is fail-open). Proceeding with recovery.",
          expect.objectContaining({ userId: USER.id }),
          undefined
        );
      });

      it("checks the new password against the account's own identity fields", async () => {
        await build().confirm(TOKEN, NEW_PASSWORD, { blockedPasswords: ["owlauth"] });

        expect(containsBlockedPasswords).toHaveBeenCalledWith(
          NEW_PASSWORD,
          USER.email,
          USER.username,
          ["owlauth"]
        );
      });
    });

    describe("concurrent confirmation", () => {
      it("lets exactly one of two simultaneous requests reset the password", async () => {
        // The store decides the winner: the second conditional write matches no unused row.
        actionTokens.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const service = build();

        const results = await Promise.all([
          service.confirm(TOKEN, NEW_PASSWORD),
          service.confirm(TOKEN, NEW_PASSWORD)
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        expect(users.updatePassword).toHaveBeenCalledTimes(1);
      });

      it("rejects the loser with the standard invalid-token response", async () => {
        actionTokens.consume.mockResolvedValue(false);

        const result = await build().confirm(TOKEN, NEW_PASSWORD);

        expect(result).toEqual(INVALID_TOKEN);
        expect(users.updatePassword).not.toHaveBeenCalled();
      });
    });

    it("reports a failed password write as a server error", async () => {
      users.updatePassword.mockResolvedValue(false);

      const result = await build().confirm(TOKEN, NEW_PASSWORD);

      expect(result).toMatchObject({
        success: false,
        message: "Failed to update password",
        httpCode: 500
      });
      expect(auditedTypes()).toEqual(["PASSWORD_RECOVERY_FAILURE"]);
    });

    it("does not leak internal error text to the caller", async () => {
      actionTokens.findBySelector.mockRejectedValue(
        new Error("relation action_tokens does not exist")
      );

      const result = await build().confirm(TOKEN, NEW_PASSWORD);

      expect(result).toMatchObject({
        success: false,
        message: "Failed to complete password recovery",
        httpCode: 500
      });
      expect(result.message).not.toContain("action_tokens");
    });

    it("keeps the token and the new password out of every audit event", async () => {
      await build().confirm(TOKEN, NEW_PASSWORD);

      expect(auditedEvents()).not.toContain(VERIFIER);
      expect(auditedEvents()).not.toContain(SELECTOR);
      expect(auditedEvents()).not.toContain(NEW_PASSWORD);
    });
  });
});
