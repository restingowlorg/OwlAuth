/* eslint-disable no-console */
import { createAuthManager } from "./auth.manager";
import { SecurityAuditLogger as ConsoleAuditLogger } from "../infra/security/security-audit-logger";
import type { AuthDB, MagicLinkRepository, UserRepository } from "../repositories/contracts";
import type { AuthOptions, AuthType } from "./types";
import type { IDatabaseAdapter } from "../infra/databases/types";
import type { ICryptoAdapter } from "../infra/security/types";
import type { AuthAuditEvent } from "../infra/audit/events";
import { isBreachedPassword } from "../infra/security/pwned-passwords";

// The breach check calls a remote API; nothing here is about it.
jest.mock("../infra/security/pwned-passwords");

const PASSWORD = "Correct-Horse-Battery-9";
const NEW_PASSWORD = "Velvet-Lantern-Orbit-42";
const MAGIC_TOKEN = "lookupkey0123456-rest-of-the-secret-token";

describe("createAuthManager audit sink", () => {
  let order: string[];
  let userRepo: jest.Mocked<UserRepository>;
  let magicLinkRepo: jest.Mocked<MagicLinkRepository>;
  let crypto: jest.Mocked<ICryptoAdapter>;

  function buildAdapter(): IDatabaseAdapter {
    const db: AuthDB = {
      userRepo,
      magicLinkRepo,
      close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
    };
    return {
      connect: jest.fn<Promise<AuthDB>, [AuthOptions<AuthType>]>().mockResolvedValue(db)
    } as unknown as IDatabaseAdapter;
  }

  async function build(extra: Partial<AuthOptions<"credentials" | "magicLink">> = {}) {
    return createAuthManager<"credentials" | "magicLink">({
      adapter: buildAdapter(),
      authTypes: ["credentials", "magicLink"],
      cryptoAdapter: crypto,
      ...extra
    });
  }

  function recordingSink() {
    const events: AuthAuditEvent[] = [];
    const sink = (event: AuthAuditEvent) => {
      order.push(`event:${event.type}`);
      events.push(event);
    };
    return { events, sink };
  }

  beforeEach(() => {
    order = [];
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    userRepo = {
      findWithPasswordByEmail: jest.fn().mockImplementation(() => {
        order.push("db:findWithPasswordByEmail");
        return Promise.resolve({
          id: "7",
          email: "a@b.com",
          username: "alice",
          password: "stored-hash"
        });
      }),
      findWithPasswordById: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue({ id: "7", email: "a@b.com", username: "alice" }),
      findByUsername: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn()
    };

    magicLinkRepo = {
      create: jest.fn().mockImplementation(() => {
        order.push("db:magicLinks.create");
        return Promise.resolve({ id: "m1" });
      }),
      findByLookupKey: jest.fn(),
      consume: jest.fn(),
      invalidateByUserId: jest.fn().mockResolvedValue(true),
      deleteByUserId: jest.fn()
    };

    crypto = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn().mockImplementation((password: string) => {
        order.push("crypto:verifyPassword");
        return Promise.resolve(password === PASSWORD);
      }),
      generateToken: jest.fn().mockReturnValue(MAGIC_TOKEN),
      hashToken: jest.fn().mockResolvedValue("token-hash"),
      verifyToken: jest.fn()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("delivers a typed login event to the manager's sink after the database lookup", async () => {
    const { events, sink } = recordingSink();
    const auth = await build({ auditSink: sink });

    await auth.credentials.login("a@b.com", PASSWORD, { correlationId: "req-1" });

    expect(events).toEqual([
      expect.objectContaining({
        version: 1,
        type: "LOGIN_SUCCESS",
        outcome: "success",
        userId: "7",
        correlationId: "req-1",
        metadata: { method: "password" }
      })
    ]);
    expect(order).toEqual([
      "db:findWithPasswordByEmail",
      "crypto:verifyPassword",
      "event:LOGIN_SUCCESS"
    ]);
  });

  it("never puts the password in an event", async () => {
    const { events, sink } = recordingSink();
    const auth = await build({ auditSink: sink });

    await auth.credentials.login("a@b.com", PASSWORD);
    await auth.credentials.login("a@b.com", "wrong-" + PASSWORD);

    expect(events.map((e) => e.type)).toEqual(["LOGIN_SUCCESS", "LOGIN_FAILURE"]);
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });

  it("emits the magic-link request only after the link is stored, without the token", async () => {
    const { events, sink } = recordingSink();
    const auth = await build({ auditSink: sink });

    const result = await auth.magicLink.request("a@b.com");

    expect(result.data).toBe(MAGIC_TOKEN);
    expect(events.map((e) => e.type)).toEqual(["MAGIC_LINK_REQUESTED"]);
    expect(order.indexOf("db:magicLinks.create")).toBeLessThan(
      order.indexOf("event:MAGIC_LINK_REQUESTED")
    );
    expect(JSON.stringify(events)).not.toContain(MAGIC_TOKEN);
    expect(JSON.stringify(events)).not.toContain("token-hash");
  });

  it("gives each manager its own sink and masking keys", async () => {
    const a = recordingSink();
    const b = recordingSink();
    const authA = await build({ auditSink: a.sink, customMaskingKeys: ["username"] });
    const authB = await build({ auditSink: b.sink });

    // An invalid username fails before any database access, carrying it in metadata.
    await authA.credentials.signup("a@b.com", "x!", PASSWORD);
    await authB.credentials.signup("a@b.com", "x!", PASSWORD);

    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
    expect(a.events[0].metadata).toEqual({ username: "********" });
    expect(b.events[0].metadata).toEqual({ username: "x!" });
  });

  it("keeps console logging as the default when no sink is supplied", async () => {
    const auth = await build();

    await auth.credentials.login("a@b.com", PASSWORD, { correlationId: "req-2" });

    expect(console.log).toHaveBeenCalledWith(
      "OWL-AUTH [AUDIT] [req-2] - LOGIN_SUCCESS",
      expect.objectContaining({ version: 1, userId: "7" })
    );
  });

  describe("sink failure leaves results unchanged", () => {
    async function loginResults(extra: Partial<AuthOptions<"credentials" | "magicLink">>) {
      const auth = await build(extra);
      return [
        await auth.credentials.login("a@b.com", PASSWORD),
        await auth.credentials.login("a@b.com", "wrong"),
        await auth.credentials.login("", "")
      ];
    }

    it.each([
      [
        "throws",
        () => {
          throw new Error("sink down");
        }
      ],
      ["rejects", () => Promise.reject(new Error("sink down"))],
      ["never settles", () => new Promise<void>(() => {})]
    ])("when the sink %s", async (_label, auditSink) => {
      const onAuditSinkError = jest.fn();
      const baseline = await loginResults({ auditSink: () => undefined });

      const results = await loginResults({ auditSink, onAuditSinkError });
      await new Promise((resolve) => setImmediate(resolve));

      expect(results).toEqual(baseline);
    });

    // Services log from inside their own catch blocks, so a throwing logger there would
    // otherwise reject the call instead of returning the 500 result.
    it("when a custom logger's diagnostics throw on the error path", async () => {
      userRepo.findWithPasswordByEmail.mockRejectedValue(new Error("db down"));
      const throwing = () => {
        throw new Error("logger down");
      };
      const baseline = await (
        await build({ auditSink: () => undefined })
      ).credentials.login("a@b.com", PASSWORD);

      const auth = await build({
        auditSink: { audit: throwing, info: throwing, warn: throwing, error: throwing }
      });

      await expect(auth.credentials.login("a@b.com", PASSWORD)).resolves.toEqual(baseline);
      expect(baseline.httpCode).toBe(500);
    });

    it("accepts the console adapter as a sink", async () => {
      const auth = await build({ auditSink: new ConsoleAuditLogger(["username"]) });

      await auth.credentials.login("a@b.com", PASSWORD, { correlationId: "req-3" });

      expect(console.log).toHaveBeenCalledWith(
        "OWL-AUTH [AUDIT] [req-3] - LOGIN_SUCCESS",
        expect.objectContaining({ version: 1 })
      );
    });

    it("reports each failure to onAuditSinkError", async () => {
      const onAuditSinkError = jest.fn();
      const auth = await build({
        auditSink: () => Promise.reject(new Error("sink down")),
        onAuditSinkError
      });

      await auth.credentials.login("a@b.com", PASSWORD);
      await new Promise((resolve) => setImmediate(resolve));

      expect(onAuditSinkError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "sink down" }),
        expect.objectContaining({ type: "LOGIN_SUCCESS" })
      );
    });

    // Mirrors the composition example in docs/AUDIT_EVENTS.md.
    it("reports a rejected send from a composed sink that returns its promise", async () => {
      const onAuditSinkError = jest.fn();
      const failure = new Error("siem down");
      const siem = { send: jest.fn().mockRejectedValue(failure) };
      const consoleAudit = new ConsoleAuditLogger();
      const auth = await build({
        auditSink: (event: AuthAuditEvent) => {
          consoleAudit.audit(event);
          return siem.send(event) as Promise<void>;
        },
        onAuditSinkError
      });

      const result = await auth.credentials.login("a@b.com", PASSWORD);
      await new Promise((resolve) => setImmediate(resolve));

      expect(result.success).toBe(true);
      expect(onAuditSinkError).toHaveBeenCalledWith(
        failure,
        expect.objectContaining({ type: "LOGIN_SUCCESS" })
      );
    });

    it("survives an async onAuditSinkError that rejects", async () => {
      const unhandled = jest.fn();
      process.on("unhandledRejection", unhandled);
      try {
        const baseline = await (
          await build({ auditSink: () => undefined })
        ).credentials.login("a@b.com", PASSWORD);
        const auth = await build({
          auditSink: () => Promise.reject(new Error("sink down")),
          onAuditSinkError: () => Promise.reject(new Error("handler down"))
        });

        await expect(auth.credentials.login("a@b.com", PASSWORD)).resolves.toEqual(baseline);
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off("unhandledRejection", unhandled);
      }

      expect(unhandled).not.toHaveBeenCalled();
    });
  });

  describe("operational failures reach the sink", () => {
    // An error message that would leak a credential if it were copied into the event.
    const dbError = () => new Error("connection reset; Authorization: Bearer leaked-db-secret");

    beforeEach(() => {
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (userRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      // An address sharing no text with the passwords, so the blocked-word rule passes.
      userRepo.findWithPasswordById.mockResolvedValue({
        id: "7",
        email: "zq@example.com",
        username: "alice",
        password: "stored-hash"
      });
      userRepo.create.mockResolvedValue({ id: "7", email: "a@b.com", username: "alice" });
      userRepo.updatePassword.mockResolvedValue(true);
      crypto.hashPassword.mockResolvedValue("new-hash");
    });

    type Auth = Awaited<ReturnType<typeof build>>;

    it.each<
      [
        string,
        () => void,
        (auth: Auth) => Promise<{ success: boolean; httpCode: number }>,
        string,
        string
      ]
    >([
      [
        "login when the user lookup throws",
        () => userRepo.findWithPasswordByEmail.mockRejectedValue(dbError()),
        (auth) => auth.credentials.login("a@b.com", PASSWORD, { correlationId: "req-f" }),
        "LOGIN_FAILURE",
        "Internal error"
      ],
      [
        "signup when password hashing rejects",
        () => {
          userRepo.findByEmail.mockResolvedValue(null);
          crypto.hashPassword.mockRejectedValue(dbError());
        },
        (auth) =>
          auth.credentials.signup("zq@example.com", "alice", PASSWORD, { correlationId: "req-f" }),
        "SIGNUP_FAILURE",
        "Internal error"
      ],
      [
        "signup when user creation returns null",
        () => {
          userRepo.findByEmail.mockResolvedValue(null);
          // Contracts say a user is returned, but custom adapters can return null.
          (userRepo.create as jest.Mock).mockResolvedValue(null);
        },
        (auth) =>
          auth.credentials.signup("zq@example.com", "alice", PASSWORD, { correlationId: "req-f" }),
        "SIGNUP_FAILURE",
        "User creation failed"
      ],
      [
        "password change when the user lookup throws",
        () => userRepo.findWithPasswordById.mockRejectedValue(dbError()),
        (auth) =>
          auth.credentials.changePassword("7", PASSWORD, NEW_PASSWORD, { correlationId: "req-f" }),
        "PASSWORD_CHANGE",
        "Internal error"
      ],
      [
        "password change when the update is not applied",
        () => userRepo.updatePassword.mockResolvedValue(false),
        (auth) =>
          auth.credentials.changePassword("7", PASSWORD, NEW_PASSWORD, { correlationId: "req-f" }),
        "PASSWORD_CHANGE",
        "Password update failed"
      ],
      [
        "magic-link request when invalidation fails",
        () => magicLinkRepo.invalidateByUserId.mockResolvedValue(false),
        (auth) => auth.magicLink.request("a@b.com", { correlationId: "req-f" }),
        "MAGIC_LINK_FAILURE",
        "Existing magic link invalidation failed"
      ],
      [
        "magic-link request when the link is not stored",
        () => (magicLinkRepo.create as jest.Mock).mockResolvedValue(null),
        (auth) => auth.magicLink.request("a@b.com", { correlationId: "req-f" }),
        "MAGIC_LINK_FAILURE",
        "Magic link storage failed"
      ],
      [
        "magic-link request when the user lookup throws",
        () => userRepo.findByEmail.mockRejectedValue(dbError()),
        (auth) => auth.magicLink.request("a@b.com", { correlationId: "req-f" }),
        "MAGIC_LINK_FAILURE",
        "Internal error"
      ],
      [
        "magic-link verify when the lookup throws",
        () => magicLinkRepo.findByLookupKey.mockRejectedValue(dbError()),
        (auth) => auth.magicLink.verify(MAGIC_TOKEN, { correlationId: "req-f" }),
        "MAGIC_LINK_FAILURE",
        "Internal error"
      ],
      [
        "magic-link consume when the lookup throws",
        () => magicLinkRepo.findByLookupKey.mockRejectedValue(dbError()),
        (auth) => auth.magicLink.consume(MAGIC_TOKEN, { correlationId: "req-f" }),
        "MAGIC_LINK_FAILURE",
        "Internal error"
      ]
    ])("%s", async (_label, arrange, act, type, reason) => {
      arrange();
      const events: AuthAuditEvent[] = [];
      const auth = await build({ auditSink: (event) => void events.push(event) });

      const result = await act(auth);

      expect(result).toMatchObject({ success: false, httpCode: 500 });
      expect(events).toEqual([
        expect.objectContaining({ type, outcome: "failure", reason, correlationId: "req-f" })
      ]);
      expect(JSON.stringify(events)).not.toContain("leaked-db-secret");
    });
  });

  it("rejects an unusable sink at startup and closes the adapter", async () => {
    const adapter = buildAdapter();
    const db = await adapter.connect({} as AuthOptions<AuthType>);

    await expect(
      createAuthManager({ adapter, auditSink: {} as never, authTypes: ["credentials"] })
    ).rejects.toThrow(TypeError);
    expect(db.close).toHaveBeenCalledTimes(1);
  });
});
