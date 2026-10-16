/* eslint-disable no-console */
import { SECURITY_CONFIG } from "../../config";
import { maskSensitiveData } from "../audit/redact";
import { IAuditLogger, SecurityEvent } from "./types";

/**
 * Console logger, and the default audit sink when none is supplied.
 *
 * Each auth manager creates its own instance, so masking keys configured for one manager
 * never apply to another.
 */
export class SecurityAuditLogger implements IAuditLogger {
  private readonly prefix = SECURITY_CONFIG.LOGGER_PREFIX;
  private customMaskingKeys: string[];

  constructor(customMaskingKeys: readonly string[] = []) {
    this.customMaskingKeys = [...customMaskingKeys];
  }

  setCustomMaskingKeys(keys: string[]) {
    this.customMaskingKeys = [...keys];
  }

  info(message: string, context?: unknown, correlationId?: string) {
    console.info(
      `${this.prefix} [INFO]${correlationId ? ` [${correlationId}]` : ""} - ${message}`,
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  warn(message: string, context?: unknown, correlationId?: string) {
    console.warn(
      `${this.prefix} [WARN]${correlationId ? ` [${correlationId}]` : ""} - ${message}`,
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  error(message: string, error: unknown, context?: unknown, correlationId?: string) {
    console.error(
      `${this.prefix} [ERROR]${correlationId ? ` [${correlationId}]` : ""} - ${message}`,
      maskSensitiveData(error, this.customMaskingKeys),
      context ? maskSensitiveData(context, this.customMaskingKeys) : ""
    );
  }

  audit(event: SecurityEvent) {
    const { type, userId, email, correlationId, ...rest } = event;

    const payload: Record<string, unknown> = {
      ...rest,
      timestamp: event.timestamp ?? new Date().toISOString()
    };

    if (userId !== undefined) payload.userId = userId;
    if (email !== undefined) payload.email = email;

    console.log(
      `${this.prefix} [AUDIT]${correlationId ? ` [${correlationId}]` : ""} - ${type}`,
      maskSensitiveData(payload, this.customMaskingKeys)
    );
  }
}
/* eslint-enable no-console */
