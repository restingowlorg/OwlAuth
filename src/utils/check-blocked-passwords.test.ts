import { containsBlockedPasswords } from "./check-blocked-passwords";

describe("containsBlockedPasswords", () => {
  const email = "testuser@example.com";
  const username = "testuser";
  const blockedList = ["password", "123456", "admin"];

  it("should return true if password contains the username", () => {
    expect(containsBlockedPasswords("mytestuser123", email, username)).toBe(true);
  });

  it("should return true if password contains the email local part", () => {
    expect(containsBlockedPasswords("testuser_secure", email, username)).toBe(true);
  });

  it("should return true if password contains a term from the blocked list", () => {
    expect(containsBlockedPasswords("i_love_password", email, username, blockedList)).toBe(true);
  });

  it("should return false if password is secure and independent", () => {
    expect(containsBlockedPasswords("Secure-Pwd-2024!", email, username, blockedList)).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(containsBlockedPasswords("TESTUSER", email, username)).toBe(true);
    expect(containsBlockedPasswords("ADMIN_LOGIN", email, username, blockedList)).toBe(true);
  });

  it("should handle empty blocked list", () => {
    expect(containsBlockedPasswords("admin", email, username, [])).toBe(false);
  });
});
