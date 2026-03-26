/* eslint-disable no-console */
import { SECURITY_CONFIG } from "../../config";
import { IAuditLogger, SecurityEvent } from "../../types/index";

/**
 * Robustly masks sensitive data in objects/arrays.
 * Handles circular references and recursively masks nested objects.
 */
function maskSensitiveData(data: unknown, seen = new WeakSet<object>()): unknown {
  if (!data || typeof data !== "object") return data;

  const dataObj = data as Record<string, unknown>;
  if (seen.has(dataObj)) return "[Circular]";

  // Only add non-primitive objects to the seen set
  seen.add(dataObj);

  if (Array.isArray(data)) {
    const masked = [...(data as unknown[])];
    for (let i = 0; i < masked.length; i++) {
      masked[i] = maskSensitiveData(masked[i], seen);
    }
    return masked;
  }

  const masked: Record<string, unknown> = { ...dataObj };

  for (const key in masked) {
    const value = masked[key];
    if ((SECURITY_CONFIG.SENSITIVE_KEYS as readonly string[]).includes(key.toLowerCase())) {
      masked[key] = "********";
    } else if (value && typeof value === "object") {
      masked[key] = maskSensitiveData(value, seen);
    }
  }
  return masked;
}

export class SecurityAuditLogger implements IAuditLogger {
  private readonly prefix = SECURITY_CONFIG.LOGGER_PREFIX;

  info(message: string, context?: unknown) {
    console.info(`${this.prefix} [INFO] - ${message}`, context ? maskSensitiveData(context) : "");
  }

  warn(message: string, context?: unknown) {
    console.warn(`${this.prefix} [WARN] - ${message}`, context ? maskSensitiveData(context) : "");
  }

  error(message: string, error: unknown, context?: unknown) {
    console.error(
      `${this.prefix} [ERROR] - ${message}`,
      error,
      context ? maskSensitiveData(context) : ""
    );
  }

  audit(event: SecurityEvent) {
    const { type, userId, email, metadata } = event;
    const maskedMetadata = metadata ? (maskSensitiveData(metadata) as Record<string, unknown>) : {};

    console.log(`${this.prefix} [AUDIT] - ${type}`, {
      userId,
      email,
      ...maskedMetadata,
      timestamp: new Date().toISOString()
    });
  }
}

export const auditLogger = new SecurityAuditLogger();
/* eslint-enable no-console */
