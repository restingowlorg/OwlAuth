/* eslint-disable no-console */
import { SECURITY_CONFIG } from "../../config";
import { AuthAuditEvent } from "../audit/events";
import { REDACTED, isSensitiveValue, maskSensitiveData, scrubCredentials } from "../audit/redact";
import { IAuditLogger, SecurityEvent } from "./types";

// The correlation ID is caller-supplied, so one that looks like a credential is not printed.
const tag = (correlationId?: string): string =>
  correlationId ? ` [${isSensitiveValue(correlationId) ? REDACTED : correlationId}]` : "";

/**
 * Console logger, and the default audit sink when none is supplied.
 *
 * Each auth manager creates its own instance, so masking keys configured for one manager
 * never apply to another. The keys are fixed at construction.
 */
export class SecurityAuditLogger implements IAuditLogger {
  private readonly prefix = SECURITY_CONFIG.LOGGER_PREFIX;
  private readonly customMaskingKeys: readonly string[];

  constructor(customMaskingKeys: readonly string[] = []) {
    this.customMaskingKeys = Object.freeze([...customMaskingKeys]);
  }

  info(message: string, context?: unknown, correlationId?: string) {
    console.info(
      `${this.prefix} [INFO]${tag(correlationId)} - ${scrubCredentials(message)}`,
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  warn(message: string, context?: unknown, correlationId?: string) {
    console.warn(
      `${this.prefix} [WARN]${tag(correlationId)} - ${scrubCredentials(message)}`,
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  error(message: string, error: unknown, context?: unknown, correlationId?: string) {
    console.error(
      `${this.prefix} [ERROR]${tag(correlationId)} - ${scrubCredentials(message)}`,
      maskSensitiveData(error, this.customMaskingKeys),
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  /** Prints an event, masking it first. Accepts a raw event or one OwlAuth delivered. */
  audit(event: SecurityEvent | AuthAuditEvent) {
    this.print(event, (payload) => maskSensitiveData(payload, this.customMaskingKeys));
  }

  /**
   * Prints an event the auth manager has already redacted, without a second masking pass.
   * @internal
   */
  printEvent(event: AuthAuditEvent) {
    this.print(event, (payload) => payload);
  }

  private print(event: SecurityEvent | AuthAuditEvent, finish: (payload: unknown) => unknown) {
    const { type, userId, email, correlationId, ...rest } = event;

    const payload: Record<string, unknown> = {
      ...rest,
      timestamp: "timestamp" in event ? event.timestamp : new Date().toISOString()
    };

    if (userId !== undefined) payload.userId = userId;
    if (email !== undefined) payload.email = email;

    console.log(`${this.prefix} [AUDIT]${tag(correlationId)} - ${type}`, finish(payload));
  }
}
/* eslint-enable no-console */
