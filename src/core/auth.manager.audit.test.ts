/* eslint-disable no-console */
import { createAuthManager } from "./auth.manager";
import { SecurityAuditLogger as ConsoleAuditLogger } from "../infra/security/security-audit-logger";
import type { AuthDB, MagicLinkRepository, UserRepository } from "../repositories/contracts";
import type { AuthOptions, AuthType } from "./types";
import type { IDatabaseAdapter } from "../infra/databases/types";
import type { ICryptoAdapter } from "../infra/security/types";
import type { AuthAuditEvent } from "../infra/audit/events";

const PASSWORD = "Correct-Horse-Battery-9";
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
