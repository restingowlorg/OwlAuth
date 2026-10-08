import { AuthService } from "./auth.service";
import {
  User,
  UserRepository,
  MagicLinkRepository,
  AccountSecurityRepository,
  AccountSecurityRecord,
  AccountStatus,
  AccountSecurityRecordExistsError,
  DuplicateUserError
} from "../repositories/contracts";
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
  let mockMagicRepo: jest.Mocked<MagicLinkRepository>;

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
    mockMagicRepo = {
      create: jest.fn(),
      findByLookupKey: jest.fn(),
      consume: jest.fn(),
      invalidateByUserId: jest.fn(),
      deleteByUserId: jest.fn()
    };

    authService = new AuthService(mockUserRepo, mockCrypto, mockLogger, undefined, mockMagicRepo);
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

    it("should return a safe conflict when a concurrent signup hits a unique constraint", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed_password");
      mockUserRepo.create.mockRejectedValue(new DuplicateUserError());

      const result = await authService.signup(
        signupData.email,
        signupData.username,
        signupData.password
      );

      expect(result).toMatchObject({
        success: false,
        httpCode: 409,
        message: "Unable to create account."
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SIGNUP_FAILURE",
          metadata: {
            username: signupData.username,
            reason: "Duplicate user rejected by datastore"
          }
        })
      );
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

    it("should invalidate magic link tokens after successful password change", async () => {
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
      mockMagicRepo.invalidateByUserId.mockResolvedValue(true);

      const result = await authService.changePassword(
        changePwdData.userId,
        changePwdData.currentPassword,
        changePwdData.newPassword
      );

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMagicRepo.invalidateByUserId).toHaveBeenCalledWith("1");
      expect(result.data?.tokensInvalidated).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SESSION_INVALIDATION", userId: "1" })
      );
    });

    it("should return tokensInvalidated: false when invalidation fails (best-effort)", async () => {
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
      mockMagicRepo.invalidateByUserId.mockRejectedValue(new Error("Repo error"));

      const result = await authService.changePassword(
        changePwdData.userId,
        changePwdData.currentPassword,
        changePwdData.newPassword
      );

      expect(result.success).toBe(true); // Still successful
      expect(result.data?.tokensInvalidated).toBe(false);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to invalidate tokens"),
        expect.anything(),
        undefined
      );
    });

    it("should not attempt invalidation when no MagicLinkRepository is provided", async () => {
      const basicAuthService = new AuthService(mockUserRepo, mockCrypto, mockLogger);
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

      const result = await basicAuthService.changePassword(
        changePwdData.userId,
        changePwdData.currentPassword,
        changePwdData.newPassword
      );

      expect(result.success).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMagicRepo.invalidateByUserId).not.toHaveBeenCalled();
      expect(result.data?.tokensInvalidated).toBe(false);
    });
  });

  describe("account identity state", () => {
    let mockAccountSecurityRepo: jest.Mocked<AccountSecurityRepository>;
    let accountAuthService: AuthService;

    const existingUser: User = {
      id: "user_1",
      email: "test@example.com",
      username: "testuser",
      password: "hashed_password"
    };

    beforeEach(() => {
      mockAccountSecurityRepo = {
        create: jest.fn(),
        findByUserId: jest.fn()
      };

      accountAuthService = new AuthService(
        mockUserRepo,
        mockCrypto,
        mockLogger,
        undefined,
        mockMagicRepo,
        mockAccountSecurityRepo
      );
    });

    function buildRecord(status: AccountStatus): AccountSecurityRecord {
      return {
        userId: existingUser.id,
        status,
        emailVerifiedAt: null,
        updatedAt: new Date()
      };
    }

    function arrangeSuccessfulSignup(): void {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
      (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
      (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
      mockUserRepo.findByEmail.mockResolvedValue(null);
      mockCrypto.hashPassword.mockResolvedValue("hashed_password");
      mockUserRepo.create.mockResolvedValue({
        id: existingUser.id,
        email: existingUser.email,
        username: existingUser.username
      });
    }

    describe("signup", () => {
      it("creates an active record for a new account", async () => {
        arrangeSuccessfulSignup();
        mockAccountSecurityRepo.create.mockResolvedValue(buildRecord("active"));

        const result = await accountAuthService.signup(
          existingUser.email,
          existingUser.username,
          "Password123!"
        );

        expect(result.success).toBe(true);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.create).toHaveBeenCalledWith({
          userId: existingUser.id,
          status: "active",
          emailVerifiedAt: null
        });
      });

      // Signup must not claim success for an account it could not provision.
      it("fails when the account security write fails", async () => {
        arrangeSuccessfulSignup();
        mockAccountSecurityRepo.create.mockRejectedValue(new Error("insert failed"));

        const result = await accountAuthService.signup(
          existingUser.email,
          existingUser.username,
          "Password123!"
        );

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(500);
        expect(result.message).toBe("Unable to create account. Please try again.");
      });

      // A record already present means provisioning is done, so the account is reachable.
      it("succeeds when the record already exists", async () => {
        arrangeSuccessfulSignup();
        mockAccountSecurityRepo.create.mockRejectedValue(new AccountSecurityRecordExistsError());

        const result = await accountAuthService.signup(
          existingUser.email,
          existingUser.username,
          "Password123!"
        );

        expect(result.success).toBe(true);
        expect(result.httpCode).toBe(201);
      });

      it("fails when the repository resolves without a record", async () => {
        arrangeSuccessfulSignup();
        // A resolve with nothing stored is not a successful write.
        (mockAccountSecurityRepo.create as jest.Mock).mockResolvedValue(undefined);

        const result = await accountAuthService.signup(
          existingUser.email,
          existingUser.username,
          "Password123!"
        );

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(500);
      });

      it("reports the failed write at error severity so it reaches alerting", async () => {
        arrangeSuccessfulSignup();
        const cause = new Error("insert failed");
        mockAccountSecurityRepo.create.mockRejectedValue(cause);

        await accountAuthService.signup(existingUser.email, existingUser.username, "Password123!");

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to provision account security record"),
          cause,
          { userId: existingUser.id },
          undefined
        );
      });

      // The user row cannot be rolled back, so the guarantee rests on it being unreachable:
      // no state record means no authentication. This is the concurrent-access case too —
      // a login attempted at any point during the provisioning window sees no record.
      it("leaves the account unable to authenticate after a failed write", async () => {
        arrangeSuccessfulSignup();
        mockAccountSecurityRepo.create.mockRejectedValue(new Error("insert failed"));
        await accountAuthService.signup(existingUser.email, existingUser.username, "Password123!");

        mockUserRepo.findWithPasswordByEmail.mockResolvedValue(existingUser);
        mockCrypto.verifyPassword.mockResolvedValue(true);
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

        const login = await accountAuthService.login(existingUser.email, "Password123!");

        expect(login.success).toBe(false);
        expect(login.httpCode).toBe(401);
        expect(login.message).toBe("Invalid credentials.");
      });

      it("blocks a magic link for an unprovisioned account", async () => {
        // The same guarantee must hold for the passwordless path.
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
        mockUserRepo.findWithPasswordByEmail.mockResolvedValue(existingUser);
        mockCrypto.verifyPassword.mockResolvedValue(true);

        const login = await accountAuthService.login(existingUser.email, "Password123!");

        expect(login.success).toBe(false);
      });

      describe("retry completes provisioning", () => {
        beforeEach(() => {
          (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
          (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
          (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
          (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue(null);
          mockUserRepo.findByEmail.mockResolvedValue({
            id: existingUser.id,
            email: existingUser.email,
            username: existingUser.username
          });
          // Provisioning requires proof of ownership: the supplied password must verify
          // against the stored hash.
          mockUserRepo.findWithPasswordById.mockResolvedValue(existingUser);
          mockCrypto.verifyPassword.mockResolvedValue(true);
        });

        // The username check runs first, so a genuine retry — same email and username —
        // reaches that branch, not the email one.
        it("provisions when the username check is the one that fires", async () => {
          (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue({
            id: existingUser.id,
            email: existingUser.email,
            username: existingUser.username
          });
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
          mockAccountSecurityRepo.create.mockResolvedValue(buildRecord("active"));

          const result = await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          expect(result.httpCode).toBe(409);
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockAccountSecurityRepo.create).toHaveBeenCalledWith({
            userId: existingUser.id,
            status: "active",
            emailVerifiedAt: null
          });
        });

        // Matching one identity field is a collision with somebody else's account, not a
        // retry, and must not cause a write against it.
        it("does not provision when only the username matches", async () => {
          (mockUserRepo.findByUsername as jest.Mock).mockResolvedValue({
            id: existingUser.id,
            email: "someone.else@example.com",
            username: existingUser.username
          });
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

          await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          /* eslint-disable @typescript-eslint/unbound-method */
          expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
          expect(mockAccountSecurityRepo.findByUserId).not.toHaveBeenCalled();
          /* eslint-enable @typescript-eslint/unbound-method */
        });

        it("does not provision when only the email matches", async () => {
          mockUserRepo.findByEmail.mockResolvedValue({
            id: existingUser.id,
            email: existingUser.email,
            username: "someone_else"
          });
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

          await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
        });

        it("provisions an existing account that has no record", async () => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
          mockAccountSecurityRepo.create.mockResolvedValue(buildRecord("active"));

          const result = await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          // Still refused as a duplicate, so nothing is revealed about the account.
          expect(result.success).toBe(false);
          expect(result.httpCode).toBe(409);
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockAccountSecurityRepo.create).toHaveBeenCalledWith({
            userId: existingUser.id,
            status: "active",
            emailVerifiedAt: null
          });
        });

        it("leaves an already provisioned account untouched", async () => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(buildRecord("disabled"));

          const result = await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          expect(result.httpCode).toBe(409);
          // A disabled account must not be silently reactivated by a signup attempt.
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
        });

        // Email and username are identifiers, not secrets. Knowing both must not be enough
        // to make an unprovisioned account reachable.
        describe("proof of ownership", () => {
          beforeEach(() => {
            mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
            mockAccountSecurityRepo.create.mockResolvedValue(buildRecord("active"));
          });

          it("does not provision when the password is wrong", async () => {
            mockCrypto.verifyPassword.mockResolvedValue(false);

            const result = await accountAuthService.signup(
              existingUser.email,
              existingUser.username,
              "NotTheOriginalPassword!"
            );

            expect(result.httpCode).toBe(409);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
          });

          it("provisions when the password is correct", async () => {
            mockCrypto.verifyPassword.mockResolvedValue(true);

            const result = await accountAuthService.signup(
              existingUser.email,
              existingUser.username,
              "Password123!"
            );

            expect(result.httpCode).toBe(409);
            // eslint-disable-next-line @typescript-eslint/unbound-method
            expect(mockAccountSecurityRepo.create).toHaveBeenCalledWith({
              userId: existingUser.id,
              status: "active",
              emailVerifiedAt: null
            });
          });

          it("answers identically whether or not the password was correct", async () => {
            mockCrypto.verifyPassword.mockResolvedValue(false);
            const wrong = await accountAuthService.signup(
              existingUser.email,
              existingUser.username,
              "NotTheOriginalPassword!"
            );

            mockCrypto.verifyPassword.mockResolvedValue(true);
            const right = await accountAuthService.signup(
              existingUser.email,
              existingUser.username,
              "Password123!"
            );

            // Nothing in the response distinguishes the two, so the path reveals no
            // account state.
            expect(wrong).toEqual(right);
            expect(wrong.message).toBe("Unable to create account.");
          });

          it("verifies the password even when only one identity field matches", async () => {
            // Equal work on every duplicate path, so timing does not reveal whether both
            // fields belong to the same account.
            mockUserRepo.findByEmail.mockResolvedValue({
              id: existingUser.id,
              email: existingUser.email,
              username: "someone_else"
            });

            await accountAuthService.signup(
              existingUser.email,
              existingUser.username,
              "Password123!"
            );

            /* eslint-disable @typescript-eslint/unbound-method */
            expect(mockCrypto.verifyPassword).toHaveBeenCalled();
            expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
            /* eslint-enable @typescript-eslint/unbound-method */
          });
        });

        // The ownership check costs a lookup and a bcrypt verify, which consumers without
        // the feature must not pay on every duplicate signup.
        it("does no ownership work when the feature is disabled", async () => {
          const result = await authService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          expect(result.httpCode).toBe(409);
          /* eslint-disable @typescript-eslint/unbound-method */
          expect(mockUserRepo.findWithPasswordById).not.toHaveBeenCalled();
          expect(mockCrypto.verifyPassword).not.toHaveBeenCalled();
          /* eslint-enable @typescript-eslint/unbound-method */
        });

        // Two retries can race: both read no record, both insert, and the unique index
        // rejects the second. The record exists either way, so that is not a failure.
        it("treats a concurrent provisioning race as success", async () => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
          mockAccountSecurityRepo.create.mockRejectedValue(new AccountSecurityRecordExistsError());

          const result = await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          expect(result.httpCode).toBe(409);
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it("audits a completed provisioning", async () => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
          mockAccountSecurityRepo.create.mockResolvedValue(buildRecord("active"));

          await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockLogger.audit).toHaveBeenCalledWith(
            expect.objectContaining({
              type: "SIGNUP",
              userId: existingUser.id,
              metadata: { reason: "Provisioning completed for an earlier failed signup" }
            })
          );
        });

        it("still returns the duplicate response when provisioning fails again", async () => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);
          mockAccountSecurityRepo.create.mockRejectedValue(new Error("still down"));

          const result = await accountAuthService.signup(
            existingUser.email,
            existingUser.username,
            "Password123!"
          );

          expect(result.httpCode).toBe(409);
          // eslint-disable-next-line @typescript-eslint/unbound-method
          expect(mockLogger.error).toHaveBeenCalledWith(
            expect.stringContaining("Failed to complete account provisioning"),
            expect.anything(),
            { userId: existingUser.id },
            undefined
          );
        });
      });

      it("does not touch the repository when the feature is disabled", async () => {
        arrangeSuccessfulSignup();

        const result = await authService.signup(
          existingUser.email,
          existingUser.username,
          "Password123!"
        );

        expect(result.success).toBe(true);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.create).not.toHaveBeenCalled();
      });
    });

    describe("login", () => {
      beforeEach(() => {
        mockUserRepo.findWithPasswordByEmail.mockResolvedValue(existingUser);
        mockCrypto.verifyPassword.mockResolvedValue(true);
      });

      it("denies a disabled account with the generic invalid-credentials response", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(buildRecord("disabled"));

        const result = await accountAuthService.login(existingUser.email, "Password123!");

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(401);
        // Byte-identical to the wrong-password response, so status cannot be probed.
        expect(result.message).toBe("Invalid credentials.");
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLogger.audit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "LOGIN_FAILURE",
            metadata: {
              reason: "Account status does not permit authentication",
              status: "disabled"
            }
          })
        );
      });

      it("checks status only after the password is verified", async () => {
        mockCrypto.verifyPassword.mockResolvedValue(false);

        const result = await accountAuthService.login(existingUser.email, "WrongPassword!");

        expect(result.success).toBe(false);
        expect(result.message).toBe("Invalid credentials.");
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.findByUserId).not.toHaveBeenCalled();
      });

      it("allows an active account", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(buildRecord("active"));

        const result = await accountAuthService.login(existingUser.email, "Password123!");

        expect(result.success).toBe(true);
        expect(result.httpCode).toBe(200);
      });

      it("allows an account awaiting email verification", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(
          buildRecord("pending_email_verification")
        );

        const result = await accountAuthService.login(existingUser.email, "Password123!");

        expect(result.success).toBe(true);
        expect(result.httpCode).toBe(200);
      });

      // Absence of a record is the provisioning marker: it means the account was never
      // fully created, or predates the feature and the backfill missed it. Either way it
      // must not authenticate.
      it("denies a user that has no record", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

        const result = await accountAuthService.login(existingUser.email, "Password123!");

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(401);
        expect(result.message).toBe("Invalid credentials.");
      });

      it("warns an operator when denying for a missing record", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

        await accountAuthService.login(existingUser.email, "Password123!");

        // The HTTP response stays generic, so the log is the only place an operator can
        // learn the backfill was missed.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("no security record"),
          { userId: existingUser.id },
          undefined
        );
      });

      // A status column without a CHECK constraint accepts any string. Matching only
      // "disabled" would treat each of these as permitted and re-enable the account.
      it.each([["disable"], ["DISABLED"], ["Disabled"], [" disabled "], ["banned"], [""]])(
        "denies an unrecognised status %p with the generic response",
        async (status) => {
          mockAccountSecurityRepo.findByUserId.mockResolvedValue({
            userId: existingUser.id,
            status: status as AccountStatus,
            emailVerifiedAt: null,
            updatedAt: new Date()
          });

          const result = await accountAuthService.login(existingUser.email, "Password123!");

          expect(result.success).toBe(false);
          expect(result.httpCode).toBe(401);
          expect(result.message).toBe("Invalid credentials.");
        }
      );

      it("records the offending status in the audit log", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue({
          userId: existingUser.id,
          status: "disable" as AccountStatus,
          emailVerifiedAt: null,
          updatedAt: new Date()
        });

        await accountAuthService.login(existingUser.email, "Password123!");

        // Operators need the stored value to spot a typo.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLogger.audit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "LOGIN_FAILURE",
            metadata: {
              reason: "Account status does not permit authentication",
              status: "disable"
            }
          })
        );
      });

      it("does not touch the repository when the feature is disabled", async () => {
        const result = await authService.login(existingUser.email, "Password123!");

        expect(result.success).toBe(true);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.findByUserId).not.toHaveBeenCalled();
      });
    });

    // An account that may not authenticate may not rotate its own credentials either.
    describe("changePassword", () => {
      beforeEach(() => {
        mockUserRepo.findWithPasswordById.mockResolvedValue(existingUser);
        mockCrypto.verifyPassword.mockResolvedValue(true);
        (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
        (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
        (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
        mockCrypto.hashPassword.mockResolvedValue("new_hash");
        mockUserRepo.updatePassword.mockResolvedValue(true);
      });

      it.each([
        ["a disabled account", "disabled" as AccountStatus],
        ["an unrecognised status", "disable" as AccountStatus]
      ])("refuses %s", async (_label, status) => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(buildRecord(status));

        const result = await accountAuthService.changePassword(
          existingUser.id,
          "Password123!",
          "NewPassword456!"
        );

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(401);
        // Same response as a wrong current password, so status cannot be probed.
        expect(result.message).toBe("Current password incorrect");
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockUserRepo.updatePassword).not.toHaveBeenCalled();
      });

      it("refuses an unprovisioned account", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(null);

        const result = await accountAuthService.changePassword(
          existingUser.id,
          "Password123!",
          "NewPassword456!"
        );

        expect(result.success).toBe(false);
        expect(result.httpCode).toBe(401);
      });

      it("allows an active account", async () => {
        mockAccountSecurityRepo.findByUserId.mockResolvedValue(buildRecord("active"));

        const result = await accountAuthService.changePassword(
          existingUser.id,
          "Password123!",
          "NewPassword456!"
        );

        expect(result.success).toBe(true);
      });

      it("checks status only after the current password is verified", async () => {
        mockCrypto.verifyPassword.mockResolvedValue(false);

        await accountAuthService.changePassword(
          existingUser.id,
          "WrongPassword!",
          "NewPassword456!"
        );

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.findByUserId).not.toHaveBeenCalled();
      });

      it("does not touch the repository when the feature is disabled", async () => {
        const result = await authService.changePassword(
          existingUser.id,
          "Password123!",
          "NewPassword456!"
        );

        expect(result.success).toBe(true);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockAccountSecurityRepo.findByUserId).not.toHaveBeenCalled();
      });
    });
  });
});
