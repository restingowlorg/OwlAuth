export const SECURITY_CONFIG = {
  LOGGER_PREFIX: "OWL-AUTH",
  SENSITIVE_KEYS: ["password", "token", "secret", "authorization", "cookie", "apikey"],
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
