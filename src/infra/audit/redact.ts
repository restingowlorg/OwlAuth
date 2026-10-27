import { SECURITY_CONFIG } from "../../config";
import { AuthAuditMetadataValue } from "./events";

export const REDACTED = "********";

const normaliseKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const DEFAULT_SENSITIVE_FRAGMENTS = SECURITY_CONFIG.SENSITIVE_KEYS.map(normaliseKey);

// Masking keys are fixed per manager (callers pass frozen arrays), so each list is
// normalised once rather than on every key comparison.
const normalisedCustomKeys = new WeakMap<readonly string[], ReadonlySet<string>>();

function customKeySet(customKeys: readonly string[]): ReadonlySet<string> {
  let keys = normalisedCustomKeys.get(customKeys);
  if (!keys) {
    keys = new Set(customKeys.map(normaliseKey));
    normalisedCustomKeys.set(customKeys, keys);
  }
  return keys;
}

/**
 * A key is sensitive when, ignoring case and separators, it contains one of the built-in
 * fragments (so `refresh_token`, `accessToken` and `Set-Cookie` all match) or equals one of
 * the caller's custom keys.
 */
export function isSensitiveKey(key: string, customKeys: readonly string[]): boolean {
  const normalised = normaliseKey(key);
  if (DEFAULT_SENSITIVE_FRAGMENTS.some((fragment) => normalised.includes(fragment))) return true;
  return customKeys.length > 0 && customKeySet(customKeys).has(normalised);
}

// Credentials recognisable by shape, wherever they appear in a string, so one embedded in an
// error message or a header dump is caught too. Arbitrary opaque secrets (API keys, random
// tokens) have no recognisable shape and cannot be detected this way.
//
// The `Bearer`/`Basic` scheme itself marks what follows as a credential, so every non-empty
// value after it is masked, however plain it looks. Prose such as "Missing bearer token"
// is over-redacted as a result; that is the safe direction for a log.
const AUTH_SCHEME_PATTERN = /\b(?:bearer|basic)\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_PATTERN = /\beyJ[\w-]*\.[\w-]+\.[\w-]*/g; // compact JWS/JWT

/** Replace every credential-shaped substring, keeping the rest of the text readable. */
export function scrubCredentials(value: string): string {
  return value.replace(AUTH_SCHEME_PATTERN, REDACTED).replace(JWT_PATTERN, REDACTED);
}

export function isSensitiveValue(value: string): boolean {
  return scrubCredentials(value) !== value;
}

/**
 * Robustly masks sensitive data in objects/arrays.
 * Handles circular references and recursively masks nested objects. Strings, including an
 * Error's message and stack, have credential-shaped substrings scrubbed.
 */
export function maskSensitiveData(
  data: unknown,
  customKeys: readonly string[],
  seen = new WeakSet<object>()
): unknown {
  if (typeof data === "string") return scrubCredentials(data);
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
          // `cause` is not enumerable, so it would otherwise be dropped unmasked.
          ...("cause" in data ? { cause: (data as { cause?: unknown }).cause } : {}),
          ...dataObj
        }
      : { ...dataObj };

  // Mask sensitive data
  for (const key in masked) {
    const value = masked[key];
    if (isSensitiveKey(key, customKeys)) {
      masked[key] = REDACTED;
    } else if (typeof value === "string") {
      masked[key] = scrubCredentials(value);
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

/**
 * Reduce event metadata to flat, redacted primitives.
 *
 * Audit events are a contract with external tooling, so nested structures are not passed
 * through: a nested object could carry a credential under a key the redactor has never
 * seen. Sensitive keys are masked and credential-shaped substrings scrubbed; anything that
 * is not a primitive is replaced.
 */
export function redactEventMetadata(
  metadata: Record<string, unknown>,
  customKeys: readonly string[]
): Record<string, AuthAuditMetadataValue> {
  const result: Record<string, AuthAuditMetadataValue> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key, customKeys)) {
      result[key] = REDACTED;
    } else if (typeof value === "string") {
      result[key] = scrubCredentials(value);
    } else if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      // toISOString() throws on an invalid date, which would drop the whole event.
      result[key] = Number.isNaN(value.getTime()) ? "[Invalid Date]" : value.toISOString();
    } else if (value !== undefined) {
      result[key] = "[Omitted]";
    }
  }

  return result;
}
