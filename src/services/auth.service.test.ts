import { AuthService } from "./auth.service";
import { User, UserRepository } from "../repositories/contracts";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { containsBlockedPasswords } from "../utils/check-blocked-passwords";
import { IAuditLogger } from "../infra/security/types";
import { ICryptoAdapter } from "../infra/security/types";

// Mock dependencies
jest.mock("@zxcvbn-ts/core");
jest.mock("../infra/security/pwned-passwords");
jest.mock("../utils/check-blocked-passwords");

describe("AuthService", () => {
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockCrypto: jest.Mocked<ICryptoAdapter>;
  let mockLogger: jest.Mocked<IAuditLogger>;

  beforeEach(() => {
    mockUserRepo = {
      findWithPasswordByEmail: jest.fn(),
      findWithPasswordById: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn()
    };

    mockCrypto = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      generateToken: jest.fn(),
      hashToken: jest.fn(),
      verifyToken: jest.fn()
    };

    mockLogger = {
      audit: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    authService = new AuthService(mockUserRepo, mockCrypto, mockLogger);
  });

  describe("signup", () => {
    const signupData = {
      email: "test@example.com",
      username: "testuser",
      password: "Password123!"
    };

    it("should successfully sign up a user", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed_password");
      mockUserRepo.create.mockResolvedValue({
        id: "1",
        email: signupData.email,
        username: signupData.username
      });

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );

      expect(result.success).toBe(true);
      expect(result.httpCode).toBe(201);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({ type: "SIGNUP" }));
    });

    it("should fail if required fields are missing", async () => {
      const result = await authService.signup("", "", "");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SIGNUP_FAILURE" })
      );
    });

    it("should fail if password exceeds maximum length", async () => {
      const longPassword = "a".repeat(73);
      const result = await authService.signup(signupData.email, signupData.username, longPassword);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      expect(result.message).toContain("72 characters or less");
    });

    it("should fail if username format is invalid", async () => {
      const result = await authService.signup("test@example.com", "us", "Password123!");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SIGNUP_FAILURE" })
      );
    });

    it("should accept a username that passes a custom usernameValidator", async () => {
      const customService = new AuthService(
        mockUserRepo,
        mockCrypto,
        mockLogger,
        (u) => u.length >= 2 // looser rule: allow 2+ chars
      );
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed_password");
      mockUserRepo.create.mockResolvedValue({ id: "1", email: "test@example.com", username: "ab" });

      const result = await customService.signup("test@example.com", "ab", "Password123!");
      expect(result.success).toBe(true);
    });

    it("should reject a username that fails a custom usernameValidator", async () => {
      const customService = new AuthService(
        mockUserRepo,
        mockCrypto,
        mockLogger,
        (u) => !u.includes("admin") // disallow 'admin' in username
      );

      const result = await customService.signup("test@example.com", "superadmin", "Password123!");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if password contains blocked terms", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(true);
      const result = await authService.signup(
        signupData.email,
        signupData.username,
        "blockedpassword"
      );
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if password is too weak", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 1 });
      const result = await authService.signup(signupData.email, signupData.username, "weak");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if password is found in a data breach", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: true });
      const result = await authService.signup(
        signupData.email,
        signupData.username,
        "breachedpassword"
      );
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if username is already taken", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue({ id: "1" } as unknown as User);

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(409);
      expect(result.message).toBe("Unable to create account.");
    });

    it("should fail if email is already registered", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue({ id: "1" } as unknown as User);

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(409);
      expect(result.message).toBe("Unable to create account.");
    });

    it("should return 503 SERVICE_UNAVAILABLE if pwned check fails and pwnedPasswordFailClosed is true", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({
        detected: false,
        error: new Error("HIBP API Down")
      });

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password,
        { pwnedPasswordFailClosed: true }
      );

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(503);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            reason: expect.stringContaining("Fail-Closed") as unknown as string
          }) as unknown as Record<string, unknown>
        })
      );
    });

    it("should propagate correlationId to auditLogger during signup", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed");
      mockUserRepo.create.mockResolvedValue({
        id: "1",
        email: signupData.email,
        username: signupData.username
      });

      const correlationId = "test-corr-id";
      await authService.signup(signupData.email, signupData.username, signupData.password, {
        correlationId
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(expect.objectContaining({ correlationId }));
    });

    it("should log a warning and proceed when HIBP is unreachable and pwnedPasswordFailClosed is not set", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({
        detected: false,
        error: new Error("API Down")
      });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed");
      mockUserRepo.create.mockResolvedValue({
        id: "1",
        email: signupData.email,
        username: signupData.username
      });

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );

      expect(result.success).toBe(true);
      expect(result.httpCode).toBe(201);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("fail-open"),
        expect.anything(),
        undefined
      );
    });

    it("should return 500 when user creation returns null", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed");
      mockUserRepo.create.mockResolvedValue(null as unknown as User);

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(500);
    });

    it("should return 500 on an unexpected exception during signup", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockRejectedValue(new Error("DB connection lost"));

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(500);
      expect(result.message).toContain("DB connection lost");
    });
  });

  describe("login", () => {
    const loginData = {
      email: "test@example.com",
      password: "Password123!"
    };

    it("should successfully log in a user", async () => {
      mockUserRepo.findWithPasswordByEmail.mockResolvedValue({
        id: "1",
        email: loginData.email,
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);

      const result = await authService.login(loginData.email, loginData.password);

      expect(result.success).toBe(true);
      expect(result.httpCode).toBe(200);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_SUCCESS" })
      );
    });

    it("should fail if credentials are missing", async () => {
      const result = await authService.login("", "");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if user not found", async () => {
      mockUserRepo.findWithPasswordByEmail.mockResolvedValue(null);
      const result = await authService.login(loginData.email, loginData.password);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_FAILURE", metadata: { reason: "User not found" } })
      );
    });

    it("should fail if password does not match", async () => {
      mockUserRepo.findWithPasswordByEmail.mockResolvedValue({
        id: "1",
        email: loginData.email,
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const result = await authService.login(loginData.email, loginData.password);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_FAILURE", metadata: { reason: "Invalid password" } })
      );
    });

    it("should propagate correlationId to auditLogger and error logs during login", async () => {
      const email = "test@example.com";
      const correlationId = "login-trace-id";

      // 1. Audit log on failure
      mockUserRepo.findWithPasswordByEmail.mockResolvedValue(null);
      await authService.login(email, "pass", { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_FAILURE", correlationId })
      );

      // 2. Error log on exception
      const error = new Error("DB Error");
      mockUserRepo.findWithPasswordByEmail.mockRejectedValue(error);
      await authService.login(email, "pass", { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Login exception",
        error,
        { email },
        correlationId
      );
    });
  });

  describe("changePassword", () => {
    const changePwdData = {
      userId: "1",
      currentPassword: "OldPassword123!",
      newPassword: "NewPassword123!"
    };

    it("should successfully change password", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "old_hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      mockCrypto.hashPassword.mockResolvedValue("new_hashed_password");
      mockUserRepo.updatePassword.mockResolvedValue(true);

      const result = await authService.changePassword(
        changePwdData.userId,
        changePwdData.currentPassword,
        changePwdData.newPassword
      );

      expect(result.success).toBe(true);
      expect(result.httpCode).toBe(200);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "PASSWORD_CHANGE" })
      );
    });

    it("should fail if user not found", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue(null);
      const result = await authService.changePassword("99", "pass", "newpass");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(404);
    });

    it("should fail if current password is incorrect", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const result = await authService.changePassword("1", "wrong", "newpass");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should fail if new password is the same as current password", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);

      const result = await authService.changePassword("1", "SamePassword123!", "SamePassword123!");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      expect(result.message).toContain("different from current password");
    });

    it("should fail if new password exceeds maximum length", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);

      const longPassword = "a".repeat(73);
      const result = await authService.changePassword("1", "old", longPassword);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      expect(result.message).toContain("72 characters or less");
    });

    it("should fail if new password is too weak", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 1 });

      const result = await authService.changePassword("1", "old", "weak");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if new password contains blocked terms", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(true);

      const result = await authService.changePassword("1", "old", "testuser123");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should return 503 SERVICE_UNAVAILABLE during password change if fail-closed is enabled and check fails", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "old"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({
        detected: false,
        error: new Error("Network Error")
      });

      const result = await authService.changePassword("1", "old", "new", {
        pwnedPasswordFailClosed: true
      });

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(503);
    });

    it("should fail with 400 if new password is found in a data breach", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "old"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: true });

      const result = await authService.changePassword("1", "old", "breached_new");

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      expect(result.message).toContain("breach");
    });

    it("should log a warning and proceed when HIBP is down and pwnedPasswordFailClosed is not set", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "old"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({
        detected: false,
        error: new Error("Timeout")
      });
      mockCrypto.hashPassword.mockResolvedValue("new_hash");
      mockUserRepo.updatePassword.mockResolvedValue(true);

      const result = await authService.changePassword("1", "old", "new_pass");

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("fail-open"),
        expect.anything(),
        undefined
      );
    });

    it("should return 500 when updatePassword returns false", async () => {
      mockUserRepo.findWithPasswordById.mockResolvedValue({
        id: "1",
        email: "test@example.com",
        username: "testuser",
        password: "old"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(true);
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      mockCrypto.hashPassword.mockResolvedValue("new_hash");
      mockUserRepo.updatePassword.mockResolvedValue(false);

      const result = await authService.changePassword("1", "old", "new_pass");

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(500);
    });

    it("should propagate correlationId to all logs during password change", async () => {
      const correlationId = "change-pwd-trace";
      mockUserRepo.findWithPasswordById.mockRejectedValue(new Error("DB Error")); // Force exception for error log check

      await authService.changePassword("1", "old", "new", { correlationId });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
        undefined,
        correlationId
      );
    });
  });
});
