/* eslint-disable no-console */
import { AuthLogLevel } from "../types/index";

export function authLog(level: AuthLogLevel, message: string) {
  const prefix = "MVP-AUTH";

  switch (level) {
    case "info":
      console.info(`${prefix} - ${message}`);
      break;
    case "warn":
      console.warn(`${prefix} - ${message}`);
      break;
    case "error":
      console.error(`${prefix} - ${message}`);
      break;
  }
}
/* eslint-enable no-console */
