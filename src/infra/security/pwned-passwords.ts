import { sha1 } from "js-sha1";
import { authLog } from "../../utils/logger";
import { SECURITY_CONFIG } from "./config";

export async function isBreachedPassword(password: string): Promise<boolean> {
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
      authLog("warn", `PwnedPasswords API returned status ${response.status}. Fallback to false.`);
      return false;
    }

    const text = await response.text();
    const lines = text.split("\n");
    return lines.some((line) => line.split(":")[0] === suffix);
  } catch (error) {
    authLog(
      "warn",
      `Failed to check breached password. Fallback to false. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}
