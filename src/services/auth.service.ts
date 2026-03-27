import { zxcvbn } from "@zxcvbn-ts/core";
import { ICryptoAdapter, IAuditLogger } from "../types";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { UserRepository } from "../repositories/contracts";
import { containsBlockedPasswords } from "../utils/check-blocked-passwords";
import {
  AuthResult,
  LoginResult,
  SignupResult,
  ChangePasswordResult,
  CreateUserInput
} from "../types/index";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly crypto: ICryptoAdapter,
    private readonly logger: IAuditLogger
  ) {}

  async signup(
    email: string,
    username: string,
    password: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ): Promise<AuthResult<LoginResult>> {
    try {
      // Basic validation
      if (!email || !username || !password) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { reason: "Missing required fields" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Email, username, and password are required.",
          httpCode: 400
        };
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Invalid username format" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid username format.",
          httpCode: 400
        };
      }

      if (containsBlockedPasswords(password, email, username, options?.blockedPasswords)) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Password contains blocked keywords" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Password cannot contain username, email, or blocked words",
          httpCode: 400
        };
      }

      // Password strength
      if (zxcvbn(password).score < 3) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Password too weak" },
          correlationId: options?.correlationId
        });
        return { success: false, data: undefined, message: "Password too weak.", httpCode: 400 };
      }

      // Breached password check
      const breachCheck = await isBreachedPassword(password);
      if (breachCheck.detected) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Password found in data breach" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Password found in data breach.",
          httpCode: 400
        };
      }

      if (breachCheck.error && options?.pwnedPasswordFailClosed) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Breached password check failed (Fail-Closed)" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Security check unavailable. Please try again later.",
          httpCode: 503
        };
      }

      // Username uniqueness
      if (this.users.findByUsername) {
        const existingUser = await this.users.findByUsername(username);
        if (existingUser) {
          this.logger.audit({
            type: "SIGNUP_FAILURE",
            email,
            metadata: { username, reason: "Username already taken" },
            correlationId: options?.correlationId
          });
          return {
            success: false,
            data: undefined,
            message: "Username already taken.",
            httpCode: 400
          };
        }
      }

      // Email uniqueness
      const existingEmail = await this.users.findByEmail(email);
      if (existingEmail) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Email already registered" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Email already registered.",
          httpCode: 400
        };
      }

      // Hash password and create user
      const passwordHash = await this.crypto.hashPassword(password);
      const input: CreateUserInput = { email, username, passwordHash };
      const user = await this.users.create(input);

      if (!user) {
        this.logger.error(
          "Signup failed",
          new Error("User creation returned null"),
          { email },
          options?.correlationId
        );
        return {
          success: false,
          data: undefined,
          message: "Failed to create user",
          httpCode: 500
        };
      }

      this.logger.audit({
        type: "SIGNUP",
        email: user.email,
        correlationId: options?.correlationId
      });

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username
          }
        },
        message: "User signed up",
        httpCode: 201
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error("Signup exception", err, { email }, options?.correlationId);
      return {
        success: false,
        data: undefined,
        message: "Signup failed: " + message,
        httpCode: 500
      };
    }
  }

  async login(
    email: string,
    password: string,
    options?: { correlationId?: string }
  ): Promise<AuthResult<SignupResult>> {
    try {
      // -------------------- Input Validation --------------------
      if (!email || !password) {
        this.logger.audit({
          type: "LOGIN_FAILURE",
          email,
          metadata: { reason: "Missing required fields" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Email and password are required.",
          httpCode: 400
        };
      }

      // -------------------- Find User --------------------
      const user = await this.users.findByEmail(email);
      if (!user) {
        this.logger.audit({
          type: "LOGIN_FAILURE",
          email,
          metadata: { reason: "User not found" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      // -------------------- Verify Password --------------------
      const valid = await this.crypto.verifyPassword(password, user.password);
      if (!valid) {
        this.logger.audit({
          type: "LOGIN_FAILURE",
          email,
          metadata: { reason: "Invalid password" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      // -------------------- Return Safe Response --------------------
      this.logger.audit({ type: "LOGIN_SUCCESS", email, correlationId: options?.correlationId });

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username
          }
        },
        message: "User logged in",
        httpCode: 200
      };
    } catch (err) {
      this.logger.error("Login exception", err, { email }, options?.correlationId);
      return {
        success: false,
        data: undefined,
        message: "Login failed : Unknown error",
        httpCode: 500
      };
    }
  }

  async changePassword(
    userId: string | number,
    currentPassword: string,
    newPassword: string,
    options?: {
      blockedPasswords?: string[];
      pwnedPasswordFailClosed?: boolean;
      correlationId?: string;
    }
  ): Promise<AuthResult<ChangePasswordResult>> {
    try {
      // Fetch user
      const user = await this.users.findById(userId);
      if (!user) {
        return { success: false, data: undefined, message: "User not found", httpCode: 404 };
      }

      // Verify current password
      const valid = await this.crypto.verifyPassword(currentPassword, user.password);
      if (!valid) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          metadata: { success: false, reason: "Current password incorrect" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Current password incorrect",
          httpCode: 401
        };
      }

      // Check blocked passwords
      if (
        containsBlockedPasswords(newPassword, user.email, user.username, options?.blockedPasswords)
      ) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          metadata: { success: false, reason: "New password contains blocked keywords" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "New password cannot contain username, email, or blocked words",
          httpCode: 400
        };
      }

      // Password strength
      if (zxcvbn(newPassword).score < 3) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          metadata: { success: false, reason: "New password too weak" },
          correlationId: options?.correlationId
        });
        return { success: false, data: undefined, message: "New password too weak", httpCode: 400 };
      }

      // Breach check
      const breachCheck = await isBreachedPassword(newPassword);
      if (breachCheck.detected) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          metadata: { success: false, reason: "New password found in data breach" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "New password found in data breach",
          httpCode: 400
        };
      }

      if (breachCheck.error && options?.pwnedPasswordFailClosed) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          metadata: { success: false, reason: "Breached password check failed (Fail-Closed)" },
          correlationId: options?.correlationId
        });
        return {
          success: false,
          data: undefined,
          message: "Security check unavailable. Please try again later.",
          httpCode: 503
        };
      }

      // Hash new password and update
      const newHash = await this.crypto.hashPassword(newPassword);
      const updated = await this.users.updatePassword(userId, newHash);

      if (!updated) {
        this.logger.error(
          "Password update failed",
          new Error("Database update returned false"),
          undefined,
          options?.correlationId
        );
        return {
          success: false,
          data: undefined,
          message: "Failed to update password",
          httpCode: 500
        };
      }

      this.logger.audit({
        type: "PASSWORD_CHANGE",
        metadata: { success: true },
        correlationId: options?.correlationId
      });

      return {
        success: true,
        message: "Password updated successfully",
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username
          }
        },
        httpCode: 200
      };
    } catch (err) {
      this.logger.error("Password change exception", err, undefined, options?.correlationId);
      return {
        success: false,
        data: undefined,
        message: "Password change failed",
        httpCode: 500
      };
    }
  }
}
