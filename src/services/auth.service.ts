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
    blockedPasswords?: string[]
  ): Promise<AuthResult<LoginResult>> {
    try {
      // Basic validation
      if (!email || !username || !password) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { reason: "Missing required fields" }
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
          metadata: { username, reason: "Invalid username format" }
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid username format.",
          httpCode: 400
        };
      }

      if (containsBlockedPasswords(password, email, username, blockedPasswords)) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Password contains blocked keywords" }
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
          metadata: { username, reason: "Password too weak" }
        });
        return { success: false, data: undefined, message: "Password too weak.", httpCode: 400 };
      }

      // Breached password check
      if (await isBreachedPassword(password)) {
        this.logger.audit({
          type: "SIGNUP_FAILURE",
          email,
          metadata: { username, reason: "Password found in data breach" }
        });
        return {
          success: false,
          data: undefined,
          message: "Password found in data breach.",
          httpCode: 400
        };
      }

      // Username uniqueness
      if (this.users.findByUsername) {
        const existingUser = await this.users.findByUsername(username);
        if (existingUser) {
          this.logger.audit({
            type: "SIGNUP_FAILURE",
            email,
            metadata: { username, reason: "Username already taken" }
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
          metadata: { username, reason: "Email already registered" }
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
        this.logger.error("Signup failed", new Error("User creation returned null"), { email });
        return {
          success: false,
          data: undefined,
          message: "Failed to create user",
          httpCode: 500
        };
      }

      this.logger.audit({ type: "SIGNUP", userId: user.id, email: user.email });

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
      this.logger.error("Signup exception", err, { email });
      return {
        success: false,
        data: undefined,
        message: "Signup failed: " + message,
        httpCode: 500
      };
    }
  }

  async login(email: string, password: string): Promise<AuthResult<SignupResult>> {
    try {
      // -------------------- Input Validation --------------------
      if (!email || !password) {
        this.logger.audit({
          type: "LOGIN_FAILURE",
          email,
          metadata: { reason: "Missing required fields" }
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
        this.logger.audit({ type: "LOGIN_FAILURE", email, metadata: { reason: "User not found" } });
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
          userId: user.id,
          metadata: { reason: "Invalid password" }
        });
        return {
          success: false,
          data: undefined,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      // -------------------- Return Safe Response --------------------
      this.logger.audit({ type: "LOGIN_SUCCESS", email, userId: user.id });

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
      this.logger.error("Login exception", err, { email });
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
    blockedPasswords?: string[]
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
          userId,
          metadata: { success: false, reason: "Current password incorrect" }
        });
        return {
          success: false,
          data: undefined,
          message: "Current password incorrect",
          httpCode: 401
        };
      }

      // Check blocked passwords
      if (containsBlockedPasswords(newPassword, user.email, user.username, blockedPasswords)) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          userId,
          metadata: { success: false, reason: "New password contains blocked keywords" }
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
          userId,
          metadata: { success: false, reason: "New password too weak" }
        });
        return { success: false, data: undefined, message: "New password too weak", httpCode: 400 };
      }

      // Breach check
      if (await isBreachedPassword(newPassword)) {
        this.logger.audit({
          type: "PASSWORD_CHANGE",
          userId,
          metadata: { success: false, reason: "New password found in data breach" }
        });
        return {
          success: false,
          data: undefined,
          message: "New password found in data breach",
          httpCode: 400
        };
      }

      // Hash new password and update
      const newHash = await this.crypto.hashPassword(newPassword);
      const updated = await this.users.updatePassword(userId, newHash);

      if (!updated) {
        this.logger.error("Password update failed", new Error("Database update returned false"), {
          userId
        });
        return {
          success: false,
          data: undefined,
          message: "Failed to update password",
          httpCode: 500
        };
      }

      this.logger.audit({ type: "PASSWORD_CHANGE", userId, metadata: { success: true } });

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
      this.logger.error("Password change exception", err, { userId });
      return {
        success: false,
        data: undefined,
        message: "Password change failed",
        httpCode: 500
      };
    }
  }
}
