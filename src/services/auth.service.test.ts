import { AuthService } from "./auth.service";
import { UserRepository } from "../repositories/contracts";
import { ICryptoAdapter, IAuditLogger, User } from "../types";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { containsBlockedPasswords } from "../utils/check-blocked-passwords";

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

    it("should fail if username format is invalid", async () => {
      const result = await authService.signup("test@example.com", "us", "Password123!");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SIGNUP_FAILURE" })
      );
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
      expect(result.httpCode).toBe(400);
      expect(result.message).toBe("Username already taken.");
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
      expect(result.httpCode).toBe(400);
      expect(result.message).toBe("Email already registered.");
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
  });

  describe("login", () => {
    const loginData = {
      email: "test@example.com",
      password: "Password123!"
    };

    it("should successfully log in a user", async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
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
      mockUserRepo.findByEmail.mockResolvedValue(null);
      const result = await authService.login(loginData.email, loginData.password);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should fail if password does not match", async () => {
      mockUserRepo.findByEmail.mockResolvedValue({
        id: "1",
        email: loginData.email,
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const result = await authService.login(loginData.email, loginData.password);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should propagate correlationId to auditLogger and error logs during login", async () => {
      const email = "test@example.com";
      const correlationId = "login-trace-id";
      mockUserRepo.findByEmail.mockResolvedValue(null); // Force a failure for logging check

      await authService.login(email, "pass", { correlationId });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_FAILURE", correlationId })
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
      mockUserRepo.findById.mockResolvedValue({
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
      mockUserRepo.findById.mockResolvedValue(null);
      const result = await authService.changePassword("99", "pass", "newpass");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(404);
    });

    it("should fail if current password is incorrect", async () => {
      mockUserRepo.findById.mockResolvedValue({
        id: "1",
        password: "hashed_password"
      } as unknown as User);
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const result = await authService.changePassword("1", "wrong", "newpass");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should fail if new password is too weak", async () => {
      mockUserRepo.findById.mockResolvedValue({
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

    it("should return 503 SERVICE_UNAVAILABLE during password change if fail-closed is enabled and check fails", async () => {
      mockUserRepo.findById.mockResolvedValue({
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

    it("should propagate correlationId to all logs during password change", async () => {
      const correlationId = "change-pwd-trace";
      mockUserRepo.findById.mockRejectedValue(new Error("DB Error")); // Force exception for error log check

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
