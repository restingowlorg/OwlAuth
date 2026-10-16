import { randomUUID } from "crypto";
import { IAuditLogger, SecurityEvent } from "../security/types";
import { SecurityAuditLogger } from "../security/security-audit-logger";
import { AUTH_AUDIT_EVENTS, AUTH_AUDIT_EVENT_VERSION, AuthAuditEvent } from "./events";
import {
  REDACTED,
  isSensitiveKey,
  isSensitiveValue,
  maskSensitiveData,
  redactEventMetadata
} from "./redact";

export type AuditSinkFunction = (event: AuthAuditEvent) => void | Promise<void>;

// Members are declared as function properties, not methods: they are invoked through the
// sink object, so `this` binding is the caller's concern, not a method contract.
export interface AuditSinkObject {
  emit: (event: AuthAuditEvent) => void | Promise<void>;
}

/**
 * A custom logger compatible with OwlAuth's own. Events go to `audit()`; any of `info`,
 * `warn` and `error` it provides also receive OwlAuth's diagnostic messages, otherwise
 * those stay on the console.
 */
export interface AuditLoggerSink {
  audit: (event: AuthAuditEvent) => void | Promise<void>;
  info?: (message: string, context?: unknown, correlationId?: string) => void;
  warn?: (message: string, context?: unknown, correlationId?: string) => void;
  error?: (message: string, error: unknown, context?: unknown, correlationId?: string) => void;
}

/**
 * Receives authentication events. The sink observes only: it is never awaited, and what it
 * does or throws has no effect on the result of the auth call that produced the event.
 */
export type AuditSink = AuditSinkFunction | AuditSinkObject | AuditLoggerSink;

/**
 * Called when a sink throws or its promise rejects. Without one the failure is written to
 * the diagnostic logger's `error()`. Errors thrown from here are discarded.
 */
export type AuditSinkErrorHandler = (error: unknown, event: AuthAuditEvent) => void;

export type AuthAuditorOptions = {
  auditSink?: AuditSink;
  onAuditSinkError?: AuditSinkErrorHandler;
  customMaskingKeys?: readonly string[];
};

type Diagnostics = Pick<IAuditLogger, "info" | "warn" | "error">;

const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
  typeof value === "function";

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && isFunction((value as { then?: unknown }).then);

/** Run a best-effort call, discarding a synchronous throw or an asynchronous rejection. */
function swallow(call: () => unknown): void {
  try {
    const result = call();
    if (isPromiseLike(result)) result.then(undefined, () => undefined);
  } catch {
    // Diagnostics are best-effort and must never reach the auth caller.
  }
}

function resolveSink(sink: AuditSink): AuditSinkFunction {
  if (isFunction(sink)) return sink;
  if (sink && isFunction((sink as AuditSinkObject).emit)) {
    return (event) => (sink as AuditSinkObject).emit(event);
  }
  if (sink && isFunction((sink as AuditLoggerSink).audit)) {
    return (event) => (sink as AuditLoggerSink).audit(event);
  }
  throw new TypeError(
    "[Auth:audit] auditSink must be a function, an object with emit(event), or a logger " +
      "with audit(event)."
  );
}

/**
 * The audit logger handed to services. One is created per auth manager, holding that
 * manager's sink and masking keys; nothing is shared between managers.
 */
export class AuthAuditor implements IAuditLogger {
  private readonly sink: AuditSinkFunction;
  private readonly diagnostics: Diagnostics;
  private readonly maskingKeys: readonly string[];
  private readonly onAuditSinkError?: AuditSinkErrorHandler;

  constructor(options: AuthAuditorOptions = {}) {
    this.maskingKeys = Object.freeze([...(options.customMaskingKeys ?? [])]);
    this.onAuditSinkError = options.onAuditSinkError;

    const consoleLogger = new SecurityAuditLogger(this.maskingKeys);

    if (!options.auditSink) {
      // Backward-compatible default: events and diagnostics both go to the console.
      this.sink = (event) => consoleLogger.audit(event);
      this.diagnostics = consoleLogger;
      return;
    }

    this.sink = resolveSink(options.auditSink);
    this.diagnostics = this.resolveDiagnostics(options.auditSink, consoleLogger);
  }

  private resolveDiagnostics(sink: AuditSink, fallback: SecurityAuditLogger): Diagnostics {
    if (isFunction(sink)) return fallback;

    const custom = sink as AuditLoggerSink;
    const mask = (value: unknown) => maskSensitiveData(value, this.maskingKeys);

    return {
      info: custom.info
        ? (message, context, correlationId) => custom.info!(message, mask(context), correlationId)
        : (...args) => fallback.info(...args),
      warn: custom.warn
        ? (message, context, correlationId) => custom.warn!(message, mask(context), correlationId)
        : (...args) => fallback.warn(...args),
      error: custom.error
        ? (message, error, context, correlationId) =>
            custom.error!(message, mask(error), mask(context), correlationId)
        : (...args) => fallback.error(...args)
    };
  }

  // Services call these from inside their own error handling, so a custom logger that throws
  // or rejects would otherwise turn a deterministic result into a rejected promise.
  info(message: string, context?: unknown, correlationId?: string): void {
    swallow(() => this.diagnostics.info(message, context, correlationId));
  }

  warn(message: string, context?: unknown, correlationId?: string): void {
    swallow(() => this.diagnostics.warn(message, context, correlationId));
  }

  error(message: string, error: unknown, context?: unknown, correlationId?: string): void {
    swallow(() => this.diagnostics.error(message, error, context, correlationId));
  }

  audit(input: SecurityEvent): void {
    let event: AuthAuditEvent;
    try {
      event = this.toEvent(input);
    } catch (error) {
      // Building the event is part of auditing, not of the auth decision, so a failure here
      // is reported and dropped like a sink failure.
      this.error(
        "Failed to build audit event",
        error,
        { type: String(input.type) },
        input.correlationId
      );
      return;
    }

    this.deliver(event);
  }

  private toEvent(input: SecurityEvent): AuthAuditEvent {
    const definition = AUTH_AUDIT_EVENTS[input.type];
    if (!definition) throw new TypeError(`Unknown audit event type: ${String(input.type)}`);
    const { reason, ...rest } = input.metadata ?? {};
    const metadata = redactEventMetadata(rest, this.maskingKeys);

    return Object.freeze({
      version: AUTH_AUDIT_EVENT_VERSION,
      id: randomUUID(),
      type: input.type,
      category: definition.category,
      outcome: input.outcome ?? definition.outcome,
      timestamp: new Date().toISOString(),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      // Masking keys apply to these identifiers as they always did on the console, so an
      // application that masks emails keeps doing so when it moves to its own sink.
      ...(input.userId !== undefined
        ? { userId: this.maskIdentifier("userId", String(input.userId)) }
        : {}),
      ...(input.email ? { email: this.maskIdentifier("email", input.email) } : {}),
      ...(typeof reason === "string"
        ? { reason: isSensitiveValue(reason) ? REDACTED : reason }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata: Object.freeze(metadata) } : {})
    });
  }

  private maskIdentifier(key: "userId" | "email", value: string): string {
    return isSensitiveKey(key, this.maskingKeys) ? REDACTED : value;
  }

  private deliver(event: AuthAuditEvent): void {
    try {
      const result = this.sink(event);
      if (isPromiseLike(result)) {
        result.then(undefined, (error: unknown) => this.reportSinkFailure(error, event));
      }
    } catch (error) {
      this.reportSinkFailure(error, event);
    }
  }

  private reportSinkFailure(error: unknown, event: AuthAuditEvent): void {
    try {
      if (this.onAuditSinkError) {
        this.onAuditSinkError(error, event);
      } else {
        this.diagnostics.error(
          "Audit sink failed to accept event",
          error,
          { eventId: event.id, type: event.type },
          event.correlationId
        );
      }
    } catch {
      // Reporting is best-effort. Nothing raised here may reach the auth caller.
    }
  }
}
