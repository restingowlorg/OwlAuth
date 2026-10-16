/* eslint-disable no-console */
import { AuthAuditor, AuditLoggerSink } from "./auditor";
import { AUTH_AUDIT_EVENTS, AuthAuditEvent } from "./events";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function capture(options: ConstructorParameters<typeof AuthAuditor>[0] = {}) {
  const events: AuthAuditEvent[] = [];
  const auditor = new AuthAuditor({ auditSink: (event) => void events.push(event), ...options });
  return { auditor, events };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("AuthAuditor", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("event envelope", () => {
    it("produces a versioned, typed, timestamped, correlated event", () => {
      const { auditor, events } = capture();

      auditor.audit({
        type: "LOGIN_FAILURE",
        userId: 42,
        email: "a@b.com",
        metadata: { reason: "Invalid password", method: "password" },
        correlationId: "req-1"
      });

      expect(events).toHaveLength(1);
      const [event] = events;
      expect(event).toEqual({
        version: 1,
        id: expect.stringMatching(UUID) as unknown,
        type: "LOGIN_FAILURE",
        category: "login",
        outcome: "failure",
        timestamp: expect.any(String) as unknown,
        correlationId: "req-1",
        userId: "42",
        email: "a@b.com",
        reason: "Invalid password",
        metadata: { method: "password" }
      });
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
      expect(Object.isFrozen(event)).toBe(true);
    });

    it("gives every event a distinct id", () => {
      const { auditor, events } = capture();

      auditor.audit({ type: "SIGNUP" });
      auditor.audit({ type: "SIGNUP" });

      expect(events[0].id).not.toBe(events[1].id);
    });

    it("omits fields that were not supplied", () => {
      const { auditor, events } = capture();

      auditor.audit({ type: "MAGIC_LINK_FAILURE", email: "" });

      expect(Object.keys(events[0]).sort()).toEqual(
        ["category", "id", "outcome", "timestamp", "type", "version"].sort()
      );
    });

    it("lets a service override the default outcome", () => {
      const { auditor, events } = capture();

      auditor.audit({ type: "PASSWORD_CHANGE", outcome: "failure" });
      auditor.audit({ type: "PASSWORD_CHANGE" });

      expect(events.map((e) => e.outcome)).toEqual(["failure", "success"]);
    });

    it("defines a category and outcome for every event type, including reserved flows", () => {
      for (const type of [
        "PASSWORD_RECOVERY_COMPLETED",
        "EMAIL_VERIFIED",
        "OIDC_IDENTITY_LINKED",
        "AUTHENTICATOR_ENROLLED"
      ] as const) {
        expect(AUTH_AUDIT_EVENTS[type]).toBeDefined();
      }
    });
  });

  describe("redaction", () => {
    const secrets = {
      password: "pw-secret-1",
      newPassword: "pw-secret-2",
      token: "tok-secret-3",
      magicLinkToken: "tok-secret-4",
      refresh_token: "tok-secret-5",
      accessToken: "tok-secret-6",
      authorization: "auth-secret-7",
      Cookie: "cookie-secret-8",
      "set-cookie": "cookie-secret-9",
      apiKey: "key-secret-10"
    };

    it("never delivers credential fields", () => {
      const { auditor, events } = capture();

      auditor.audit({ type: "LOGIN_FAILURE", metadata: { ...secrets, reason: "x" } });

      const serialised = JSON.stringify(events[0]);
      for (const value of Object.values(secrets)) {
        expect(serialised).not.toContain(value);
      }
      for (const key of Object.keys(secrets)) {
        expect(events[0].metadata?.[key]).toBe("********");
      }
    });

    it("masks credential-shaped values under innocuous keys", () => {
      const { auditor, events } = capture();
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

      auditor.audit({
        type: "LOGIN_FAILURE",
        metadata: { header: "Bearer abc.def", basic: "Basic dXNlcjpwYXNz", value: jwt }
      });

      expect(events[0].metadata).toEqual({
        header: "********",
        basic: "********",
        value: "********"
      });
    });

    it("masks a credential-shaped reason", () => {
      const { auditor, events } = capture();

      auditor.audit({ type: "LOGIN_FAILURE", metadata: { reason: "Bearer leaked" } });

      expect(events[0].reason).toBe("********");
    });

    it("flattens metadata to primitives so nothing nested escapes redaction", () => {
      const { auditor, events } = capture();
      const at = new Date("2026-01-01T00:00:00.000Z");

      auditor.audit({
        type: "SIGNUP",
        metadata: {
          nested: { headers: { "x-session": "s" } },
          list: ["a"],
          at,
          count: 1,
          flag: false,
          none: null,
          skipped: undefined
        }
      });

      expect(events[0].metadata).toEqual({
        nested: "[Omitted]",
        list: "[Omitted]",
        at: "2026-01-01T00:00:00.000Z",
        count: 1,
        flag: false,
        none: null
      });
    });

    it("applies custom masking keys", () => {
      const { auditor, events } = capture({ customMaskingKeys: ["username"] });

      auditor.audit({ type: "SIGNUP_FAILURE", metadata: { username: "alice", reason: "x" } });

      expect(events[0].metadata).toEqual({ username: "********" });
    });

    it("applies custom masking keys to the top-level email and userId", () => {
      const { auditor, events } = capture({ customMaskingKeys: ["email", "userId"] });

      auditor.audit({ type: "LOGIN_SUCCESS", userId: 7, email: "a@b.com" });

      expect(events[0]).toMatchObject({ userId: "********", email: "********" });
    });

    it("does not share masking keys between auditors", () => {
      const a = capture({ customMaskingKeys: ["username"] });
      const b = capture();

      a.auditor.audit({ type: "SIGNUP_FAILURE", metadata: { username: "alice" } });
      b.auditor.audit({ type: "SIGNUP_FAILURE", metadata: { username: "alice" } });

      expect(a.events[0].metadata).toEqual({ username: "********" });
      expect(b.events[0].metadata).toEqual({ username: "alice" });
    });
  });

  describe("sink forms", () => {
    it("accepts an object with emit()", () => {
      const emit = jest.fn();
      new AuthAuditor({ auditSink: { emit } }).audit({ type: "SIGNUP" });

      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "SIGNUP" }));
    });

    it("accepts a compatible custom logger and routes diagnostics to it, masked", () => {
      const logger: jest.Mocked<Required<AuditLoggerSink>> = {
        audit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };
      const auditor = new AuthAuditor({ auditSink: logger, customMaskingKeys: ["ssn"] });

      auditor.audit({ type: "LOGIN_SUCCESS", userId: "1" });
      auditor.warn("careful", { ssn: "123", password: "pw", userId: "1" }, "c-1");

      expect(logger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_SUCCESS", version: 1 })
      );
      expect(logger.warn).toHaveBeenCalledWith(
        "careful",
        { ssn: "********", password: "********", userId: "1" },
        "c-1"
      );
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("keeps diagnostics on the console when the custom logger lacks them", () => {
      const auditor = new AuthAuditor({ auditSink: { audit: jest.fn() } });

      auditor.warn("careful");

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("careful"), "");
    });

    it("rejects a sink it cannot call", () => {
      expect(() => new AuthAuditor({ auditSink: {} as AuditLoggerSink })).toThrow(TypeError);
    });

    it("defaults to the console adapter", () => {
      new AuthAuditor().audit({ type: "LOGIN_SUCCESS", correlationId: "c-9" });

      expect(console.log).toHaveBeenCalledWith(
        "OWL-AUTH [AUDIT] [c-9] - LOGIN_SUCCESS",
        expect.objectContaining({ version: 1, outcome: "success", category: "login" })
      );
    });
  });

  describe("sink failure", () => {
    it("does not propagate a synchronous throw", () => {
      const auditor = new AuthAuditor({
        auditSink: () => {
          throw new Error("sink down");
        }
      });

      expect(() => auditor.audit({ type: "SIGNUP" })).not.toThrow();
    });

    it("reports a synchronous throw to onAuditSinkError with the event", () => {
      const onAuditSinkError = jest.fn();
      const failure = new Error("sink down");
      const auditor = new AuthAuditor({
        auditSink: () => {
          throw failure;
        },
        onAuditSinkError
      });

      auditor.audit({ type: "SIGNUP", correlationId: "c-1" });

      expect(onAuditSinkError).toHaveBeenCalledWith(
        failure,
        expect.objectContaining({ type: "SIGNUP", correlationId: "c-1" })
      );
    });

    it("reports an asynchronous rejection without awaiting the sink", async () => {
      const onAuditSinkError = jest.fn();
      const failure = new Error("network");
      const auditor = new AuthAuditor({
        auditSink: () => Promise.reject(failure),
        onAuditSinkError
      });

      const returned: unknown = auditor.audit({ type: "SIGNUP" });

      expect(returned).toBeUndefined();
      expect(onAuditSinkError).not.toHaveBeenCalled();
      await flush();
      expect(onAuditSinkError).toHaveBeenCalledWith(failure, expect.anything());
    });

    it("does not wait for a slow sink", () => {
      const auditor = new AuthAuditor({ auditSink: () => new Promise(() => {}) });

      expect(auditor.audit({ type: "SIGNUP" })).toBeUndefined();
    });

    it("logs the failure through diagnostics when no handler is given", async () => {
      const logger = { audit: jest.fn().mockRejectedValue(new Error("down")), error: jest.fn() };
      new AuthAuditor({ auditSink: logger }).audit({ type: "SIGNUP", correlationId: "c-2" });

      await flush();

      expect(logger.error).toHaveBeenCalledWith(
        "Audit sink failed to accept event",
        expect.any(Error),
        { eventId: expect.stringMatching(UUID) as unknown, type: "SIGNUP" },
        "c-2"
      );
    });

    it("does not propagate diagnostics from a custom logger that throws or rejects", async () => {
      const auditor = new AuthAuditor({
        auditSink: {
          audit: jest.fn(),
          info: () => {
            throw new Error("info down");
          },
          warn: () => Promise.reject(new Error("warn down")) as unknown as void,
          error: () => {
            throw new Error("error down");
          }
        }
      });

      expect(() => auditor.info("i")).not.toThrow();
      expect(() => auditor.warn("w")).not.toThrow();
      expect(() => auditor.error("e", new Error("x"))).not.toThrow();
      await expect(flush()).resolves.toBeUndefined();
    });

    it("drops and reports an event it cannot build instead of throwing", () => {
      const error = jest.fn();
      const sink = jest.fn();
      const auditor = new AuthAuditor({ auditSink: { audit: sink, error } });

      expect(() =>
        auditor.audit({ type: "NOT_A_TYPE" as never, correlationId: "c-3" })
      ).not.toThrow();

      expect(sink).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        "Failed to build audit event",
        expect.objectContaining({
          name: "TypeError",
          message: "Unknown audit event type: NOT_A_TYPE"
        }),
        { type: "NOT_A_TYPE" },
        "c-3"
      );
    });

    it("swallows a handler that throws", async () => {
      const auditor = new AuthAuditor({
        auditSink: () => Promise.reject(new Error("down")),
        onAuditSinkError: () => {
          throw new Error("handler down");
        }
      });

      expect(() => auditor.audit({ type: "SIGNUP" })).not.toThrow();
      await expect(flush()).resolves.toBeUndefined();
    });
  });
});
