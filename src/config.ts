export const SECURITY_CONFIG = {
  LOGGER_PREFIX: "OWL-AUTH",
  // Matched as fragments, ignoring case and separators: "token" also covers refresh_token.
  SENSITIVE_KEYS: [
    "password",
    "passwd",
    "token",
    "secret",
    "authorization",
    "cookie",
    "apikey",
    "bearer"
  ],
  /**
   * Have I Been Pwned API URL for range-based hash checking
   * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
   */
  PWNED_API_URL: "https://api.pwnedpasswords.com/range",
  /**
   * Bcrypt salt rounds
   */
  SALT_ROUNDS: 10
} as const;
