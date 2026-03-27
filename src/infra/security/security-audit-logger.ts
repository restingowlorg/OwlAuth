/* eslint-disable no-console */
import { SECURITY_CONFIG } from "../../config";
import { IAuditLogger, SecurityEvent } from "../../types/index";

/**
 * Robustly masks sensitive data in objects/arrays.
 * Handles circular references and recursively masks nested objects.
 */
function maskSensitiveData(
  data: unknown,
  customKeys: string[],
  seen = new WeakSet<object>()
): unknown {
  if (!data || typeof data !== "object") return data;

  const dataObj = data as Record<string, unknown>;
  if (seen.has(dataObj)) return "[Circular]";

  // Only add non-primitive objects to the seen set
  seen.add(dataObj);

  if (Array.isArray(data)) {
    const masked = [...(data as unknown[])];
    for (let i = 0; i < masked.length; i++) {
      masked[i] = maskSensitiveData(masked[i], customKeys, seen);
    }
    return masked;
  }

  const masked: Record<string, unknown> =
    data instanceof Error
      ? {
          name: data.name,
          message: data.message,
          stack: data.stack,
          ...dataObj
        }
      : { ...dataObj };

  const allSensitiveKeys = [
    ...(SECURITY_CONFIG.SENSITIVE_KEYS as readonly string[]),
    ...customKeys
  ].map((k) => k.toLowerCase());

  // Mask sensitive data
  for (const key in masked) {
    const value = masked[key];
    if (allSensitiveKeys.includes(key.toLowerCase())) {
      masked[key] = "********";
    } else if (value && typeof value === "object") {
      masked[key] = maskSensitiveData(value, customKeys, seen);
    }
  }

  // Restore Error object structure
  if (data instanceof Error) {
    const err = new Error(masked.message as string);
    err.name = masked.name as string;
    err.stack = masked.stack as string;
    for (const key in masked) {
      if (!["name", "message", "stack"].includes(key)) {
        (err as unknown as Record<string, unknown>)[key] = masked[key];
      }
    }
    return err;
  }

  return masked;
}

export class SecurityAuditLogger implements IAuditLogger {
  private readonly prefix = SECURITY_CONFIG.LOGGER_PREFIX;
  private customMaskingKeys: string[] = [];

  setCustomMaskingKeys(keys: string[]) {
    this.customMaskingKeys = keys;
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

    console.log(
      `${this.prefix} [AUDIT]${correlationId ? ` [${correlationId}]` : ""} - ${type}`,
      maskSensitiveData(
        {
          userId,
          email,
          ...rest,
          timestamp: new Date().toISOString()
        },
        this.customMaskingKeys
      )
    );
  }
}

export const auditLogger = new SecurityAuditLogger();
/* eslint-enable no-console */
