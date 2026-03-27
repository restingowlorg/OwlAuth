import { sha1 } from "js-sha1";
import { auditLogger } from "./security-audit-logger";
import { SECURITY_CONFIG } from "../../config";

export type PwnedCheckResult = {
  detected: boolean;
  error?: Error;
};

export async function isBreachedPassword(password: string): Promise<PwnedCheckResult> {
  const hash = sha1(password).toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    // 3-second timeout fallback to prevent hanging requests
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${SECURITY_CONFIG.PWNED_API_URL}/${prefix}`, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = new Error(`PwnedPasswords API returned status ${response.status}`);
      auditLogger.warn(`${error.message}. Fallback to caller handling.`);
      return { detected: false, error };
    }

    const text = await response.text();
    const lines = text.split("\n");
    const detected = lines.some((line) => line.split(":")[0] === suffix);
    return { detected };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    auditLogger.warn(`Failed to check breached password. Error: ${err.message}`);
    return { detected: false, error: err };
  }
}
