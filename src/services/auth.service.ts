import { zxcvbn } from "@zxcvbn-ts/core";
import { hashPassword, verifyPassword } from "../infra/crypto/crypto";
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
  constructor(private readonly users: UserRepository) {}

  async signup(
    email: string,
    username: string,
    password: string,
    UserRepo: UserRepository,
    blockedPasswords?: string[]
  ): Promise<AuthResult<LoginResult>> {
    try {
      // Basic validation
      if (!email || !username || !password) {
        return {
          success: false,
          data: undefined,
          message: "Email, username, and password are required.",
          httpCode: 400
        };
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return {
          success: false,
          data: undefined,
          message: "Invalid username format.",
          httpCode: 400
        };
      }

      if (containsBlockedPasswords(password, email, username, blockedPasswords)) {
        return {
          success: false,
          data: undefined,
          message: "Password cannot contain username, email, or blocked words",
          httpCode: 400
        };
      }

      // Password strength
      if (zxcvbn(password).score < 3) {
        return { success: false, data: undefined, message: "Password too weak.", httpCode: 400 };
      }

      // Breached password check
      if (await isBreachedPassword(password)) {
        return {
          success: false,
          data: undefined,
          message: "Password found in breach.",
          httpCode: 400
        };
      }

      // Username uniqueness
      if (UserRepo.findByUsername) {
        const existingUser = await UserRepo.findByUsername(username);
        if (existingUser)
          return {
            success: false,
            data: undefined,
            message: "Username already taken.",
            httpCode: 400
          };
      }

      // Email uniqueness
      const existingEmail = await UserRepo.findByEmail(email);
      if (existingEmail)
        return {
          success: false,
          data: undefined,
          message: "Email already registered.",
          httpCode: 400
        };

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const input: CreateUserInput = { email, username, passwordHash };
      const user = await UserRepo.create(input);

      if (!user) {
        return {
          success: false,
          data: undefined,
          message: "Failed to create user",
          httpCode: 500
        };
      }

      return { success: true, data: { user }, message: "User signed up", httpCode: 201 };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
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
        return {
          success: false,
          data: undefined,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      // -------------------- Verify Password --------------------
      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return {
          success: false,
          data: undefined,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      // -------------------- Return Safe Response --------------------
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
    UserRepo: UserRepository,
    blockedPasswords?: string[]
  ): Promise<AuthResult<ChangePasswordResult>> {
    // Fetch user
    const user = await UserRepo.findById(userId);
    if (!user) return { success: false, data: undefined, message: "User not found", httpCode: 404 };

    // Verify current password
    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid)
      return {
        success: false,
        data: undefined,
        message: "Current password incorrect",
        httpCode: 401
      };

    // Check blocked passwords
    if (containsBlockedPasswords(newPassword, user.email, user.username, blockedPasswords)) {
      return {
        success: false,
        data: undefined,
        message: "New password cannot contain username, email, or blocked words",
        httpCode: 400
      };
    }

    // Password strength
    if (zxcvbn(newPassword).score < 3) {
      return { success: false, data: undefined, message: "New password too weak", httpCode: 400 };
    }

    // Breach check
    if (await isBreachedPassword(newPassword)) {
      return { success: false, data: undefined, message: "New password breached", httpCode: 400 };
    }

    // Hash new password and update
    const newHash = await hashPassword(newPassword);
    const updated = await UserRepo.updatePassword(userId, newHash);

    if (!updated) {
      return {
        success: false,
        data: undefined,
        message: "Failed to update password",
        httpCode: 500
      };
    }

    return {
      success: true,
      message: "Password updated successfully",
      data: undefined,
      httpCode: 200
    };
  }
}
