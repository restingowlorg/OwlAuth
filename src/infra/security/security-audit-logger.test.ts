/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { SecurityAuditLogger } from "./security-audit-logger";
import { SecurityEvent } from "./types";

describe("SecurityAuditLogger", () => {
  let logger: SecurityAuditLogger;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new SecurityAuditLogger();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("info()", () => {
    it("should call console.info with the message", () => {
      logger.info("test message");
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy.mock.calls[0][0]).toContain("test message");
    });

    it("should include correlationId in output when provided", () => {
      logger.info("msg", undefined, "corr-123");
      expect(infoSpy.mock.calls[0][0]).toContain("[corr-123]");
    });

    it("should mask sensitive fields in context", () => {
      logger.info("msg", { user: "alice", password: "secret123" });
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.password).toBe("********");
      expect(context.user).toBe("alice");
    });

    it("should omit context argument when not provided", () => {
      logger.info("msg");
      expect(infoSpy.mock.calls[0][1]).toBe("");
    });
  });

  describe("warn()", () => {
    it("should call console.warn with the message", () => {
      logger.warn("warning message");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("warning message");
    });

    it("should mask sensitive fields in context", () => {
      logger.warn("msg", { token: "abc123", action: "reset" });
      const context = warnSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.token).toBe("********");
      expect(context.action).toBe("reset");
    });

    it("should include correlationId when provided", () => {
      logger.warn("msg", undefined, "warn-id");
      expect(warnSpy.mock.calls[0][0]).toContain("[warn-id]");
    });
  });

  describe("error()", () => {
    it("should call console.error with the message", () => {
      logger.error("error message", new Error("boom"));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain("error message");
    });

    it("should mask sensitive fields in the error object", () => {
      const err = new Error("auth failed") as Error & { token?: string };
      err.token = "supersecret";
      logger.error("fail", err);
      const maskedErr = errorSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(maskedErr.token).toBe("********");
    });

    it("should mask sensitive fields in context", () => {
      logger.error("fail", new Error("boom"), { secret: "shhh" });
      const context = errorSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(context.secret).toBe("********");
    });

    it("should include correlationId when provided", () => {
      logger.error("fail", new Error("boom"), undefined, "err-id");
      expect(errorSpy.mock.calls[0][0]).toContain("[err-id]");
    });
  });

  describe("audit()", () => {
    it("should call console.log for audit events", () => {
      const event: SecurityEvent = { type: "LOGIN_SUCCESS", userId: "1", email: "a@b.com" };
      logger.audit(event);
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain("LOGIN_SUCCESS");
    });

    it("should include correlationId in audit output", () => {
      const event: SecurityEvent = { type: "SIGNUP", correlationId: "audit-corr" };
      logger.audit(event);
      expect(logSpy.mock.calls[0][0]).toContain("[audit-corr]");
    });

    it("should mask sensitive fields in audit metadata", () => {
      const event: SecurityEvent = {
        type: "PASSWORD_CHANGE",
        userId: "2",
        metadata: { reason: "changed", password: "oldpass" }
      };
      logger.audit(event);
      const payload = logSpy.mock.calls[0][1] as Record<string, unknown>;
      const meta = payload.metadata as Record<string, unknown>;
      expect(meta.password).toBe("********");
      expect(meta.reason).toBe("changed");
    });

    it("should add a timestamp to audit payload", () => {
      logger.audit({ type: "SIGNUP" });
      const payload = logSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(typeof payload.timestamp).toBe("string");
    });
  });

  describe("maskSensitiveData (via logger methods)", () => {
    it("should mask all default sensitive keys (password, token, secret, authorization, cookie, apikey)", () => {
      logger.info("check", {
        password: "p",
        token: "t",
        secret: "s",
        authorization: "a",
        cookie: "c",
        apikey: "k"
      });
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.password).toBe("********");
      expect(context.token).toBe("********");
      expect(context.secret).toBe("********");
      expect(context.authorization).toBe("********");
      expect(context.cookie).toBe("********");
      expect(context.apikey).toBe("********");
    });

    it("should mask custom keys when set via setCustomMaskingKeys()", () => {
      logger.setCustomMaskingKeys(["ssn", "dob"]);
      logger.info("check", { ssn: "123-45-6789", dob: "1990-01-01", name: "Alice" });
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.ssn).toBe("********");
      expect(context.dob).toBe("********");
      expect(context.name).toBe("Alice");
    });

    it("should mask sensitive keys case-insensitively", () => {
      logger.info("check", { PASSWORD: "abc", Token: "xyz" });
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.PASSWORD).toBe("********");
      expect(context.Token).toBe("********");
    });

    it("should recursively mask nested objects", () => {
      logger.info("check", { nested: { password: "deep_secret", ok: "visible" } });
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      const nested = context.nested as Record<string, unknown>;
      expect(nested.password).toBe("********");
      expect(nested.ok).toBe("visible");
    });

    it("should mask sensitive keys inside arrays", () => {
      logger.info("check", [{ token: "abc" }, { name: "bob" }]);
      const arr = infoSpy.mock.calls[0][1] as Record<string, unknown>[];
      expect(arr[0].token).toBe("********");
      expect(arr[1].name).toBe("bob");
    });

    it("should return primitives unchanged", () => {
      logger.info("plain string context", "just a string" as unknown as undefined);
      expect(infoSpy.mock.calls[0][1]).toBe("just a string");
    });

    it("should handle circular references without throwing", () => {
      const obj: Record<string, unknown> = { name: "circ" };
      obj.self = obj;
      expect(() => logger.info("circ", obj)).not.toThrow();
      const context = infoSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(context.self).toBe("[Circular]");
    });

    it("should handle Error objects and preserve name/message while masking extra fields", () => {
      const err = new Error("original message") as Error & { password?: string };
      err.password = "leaked";
      logger.error("test", err);
      const maskedErr = errorSpy.mock.calls[0][1];
      expect(maskedErr instanceof Error).toBe(true);
      expect((maskedErr as Error).message).toBe("original message");
      expect((maskedErr as Record<string, unknown>).password).toBe("********");
    });
  });
});
