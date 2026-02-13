import { UserRepository, CreateUserInput } from "../../repositories/contracts";
import { hashPassword, verifyPassword } from "../../infra/crypto/crypto";
import { AuthResult } from "../../interfaces/index";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../../infra/security/pwned-passwords";
import { containsBlockedPasswords } from "../../utils/check-blocked-passwords";

export class CredentialsAuthService {
  constructor(
    private readonly users: UserRepository,
  ) {}

  async signup(
    email: string,
    username: string,
    password: string,
    blockedPasswords?: string[]
  ): Promise<AuthResult> {
    try {
      // ---------------- Input Validation ----------------
      if (!email || !username || !password) {
        return {
          success: false,
          data: null,
          message: "Email, username, and password are required.",
          httpCode: 400,
        };
      }

      // Username format
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return {
          success: false,
          data: null,
          message:
            "Invalid username format. Use 3-20 alphanumeric characters or underscore.",
          httpCode: 400,
        };
      }

      if (
        containsBlockedPasswords(password, email, username, blockedPasswords)
      ) {
        return {
          success: false,
          data: null,
          message: "Password cannot contain username, email, or blocked words",
          httpCode: 400,
        };
      }

      // Password strength
      const pwdStrength = zxcvbn(password);
      if (pwdStrength.score < 3) {
        return {
          success: false,
          data: null,
          message: "Password is too weak. Please choose a stronger password.",
          httpCode: 400,
        };
      }

      // Breach check
      const breached = await isBreachedPassword(password);
      if (breached) {
        return {
          success: false,
          data: null,
          message:
            "This password has been found in a data breach. Choose a different one.",
          httpCode: 400,
        };
      }

      // Username uniqueness (optional)
      if (this.users.findByUsername) {
        const existingUsername = await this.users.findByUsername(username);
        if (existingUsername) {
          return {
            success: false,
            data: null,
            message: "Username already taken.",
            httpCode: 400,
          };
        }
      }

      // Email uniqueness
      const existingEmail = await this.users.findByEmail(email);
      if (existingEmail) {
        return {
          success: false,
          data: null,
          message: "Email already registered.",
          httpCode: 400,
        };
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const input: CreateUserInput = { email, username, passwordHash };
      const user = await this.users.create(input);

      return {
        success: true,
        data: { user },
        message: "User signed up",
        httpCode: 201,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: "Signup failed: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      // -------------------- Input Validation --------------------
      if (!email || !password) {
        return {
          success: false,
          data: null,
          message: "Email and password are required.",
          httpCode: 400,
        };
      }

      // -------------------- Find User --------------------
      const user = await this.users.findByEmail(email);
      if (!user) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401,
        };
      }

      // -------------------- Verify Password --------------------
      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401,
        };
      }

      // -------------------- Return Safe Response --------------------
      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
        },
        message: "User logged in",
        httpCode: 200,
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        message: "Login failed: " + (err.message || "Unknown error"),
        httpCode: 500,
      };
    }
  }

  async changePassword(
    userId: any,
    currentPassword: string,
    newPassword: string,
    blockedPasswords?: string[]
  ): Promise<AuthResult> {
    console.log("🛠️ [DEBUG] changePassword called");

    //Fetch user
    const user = await this.users.findById(userId);
    if (!user) {
      return {
        success: false,
        data: null,
        message: "User not found",
        httpCode: 404,
      };
    }

    //Verify current password
    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid) {
      return {
        success: false,
        data: null,
        message: "Current password is incorrect",
        httpCode: 401,
      };
    }

    if (
      containsBlockedPasswords(
        newPassword,
        user.email,
        user.username,
        blockedPasswords
      )
    ) {
      return {
        success: false,
        data: null,
        message:
          "New password cannot contain username, email, or blocked words",
        httpCode: 400,
      };
    }

    //Check new password strength & breach
    if (zxcvbn(newPassword).score < 3) {
      return {
        success: false,
        data: null,
        message: "New password too weak",
        httpCode: 400,
      };
    }
    if (await isBreachedPassword(newPassword)) {
      return {
        success: false,
        data: null,
        message: "New password found in breach",
        httpCode: 400,
      };
    }

    //Hash new password & update
    const newHash = await hashPassword(newPassword);
    await this.users.updatePassword(userId, newHash);

    console.log("✅ [DEBUG] Password updated successfully for user:", userId);

    return {
      success: true,
      message: "Password updated successfully",
      data: null,
      httpCode: 200,
    };
  }
}
