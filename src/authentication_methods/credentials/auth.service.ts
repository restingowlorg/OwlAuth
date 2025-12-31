import { UserRepository, CreateUserInput } from "../../repositories/contracts";
import { hashPassword, verifyPassword } from "../../infra/crypto/crypto";
import { AuthResult } from "../../types";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../../infra/security/pwned-passwords";
import { SessionService } from "./session.service";

export class CredentialsAuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionService,
    private readonly sessionTtlSeconds: number
  ) {}

  // ---------------- Signup ----------------

  async signup(
    email: string,
    username: string,
    password: string
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

  // ---------------- Login ----------------

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      // Input validation
      if (!email || !password) {
        return {
          success: false,
          data: null,
          message: "Email and password are required.",
          httpCode: 400,
        };
      }

      // Find user
      const user = await this.users.findByEmail(email);
      if (!user) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401,
        };
      }

      // Verify password
      const valid = await verifyPassword(password, user.password);
      if (!valid) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401,
        };
      }

      // Create session
      const sessionResult = await this.sessions.create(
        user.id,
        this.sessionTtlSeconds
      );

      if (!sessionResult.success) {
        return sessionResult;
      }

      return {
        success: true,
        data: {
          user,
          session: sessionResult.data.session,
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
}
