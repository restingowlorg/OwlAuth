/* eslint-disable no-console */
import { AuthLogLevel } from "../types";

export function authLog(level: AuthLogLevel, message: string) {
  const prefix = "MVP-AUTH";

  switch (level) {
    case "info":
      console.info(`${prefix} ℹ️  ${message}`);
      break;
    case "warn":
      console.warn(`${prefix} ⚠️  ${message}`);
      break;
    case "error":
      console.error(`${prefix} ❌  ${message}`);
      break;
  }
}
/* eslint-enable no-console */
