import { CreateUserInput, UserRepository, SessionRepository } from "../../repositories/contracts";

import { hashPassword, verifyPassword } from "../../infra/crypto/crypto";
import { AuthResult } from "../../types";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../../infra/security/pwned-passwords";
import { SessionService } from "./session.service";

export const AuthService = {
  async signup(
    email: string,
    username: string,
    password: string,
    UserRepo: UserRepository
  ): Promise<AuthResult> {
    try {
      if (!email || !username || !password) {
        return {
          success: false,
          data: null,
          message: "Email, username, and password are required.",
          httpCode: 400
        };
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return {
          success: false,
          data: null,
          message: "Invalid username format. Use 3-20 alphanumeric characters or underscore.",
          httpCode: 400
        };
      }

      const pwdStrength = zxcvbn(password);
      if (pwdStrength.score < 3) {
        return {
          success: false,
          data: null,
          message: "Password is too weak. Please choose a stronger password.",
          httpCode: 400
        };
      }

      const breached = await isBreachedPassword(password);
      if (breached) {
        return {
          success: false,
          data: null,
          message: "This password has been found in a data breach. Choose a different one.",
          httpCode: 400
        };
      }

      if (UserRepo.findByUsername) {
        const existingUser = await UserRepo.findByUsername(username);

        if (existingUser) {
          return {
            success: false,
            data: null,
            message: "Username already taken.",
            httpCode: 400
          };
        }
      }

      const existingEmail = await UserRepo.findByEmail(email);

      if (existingEmail) {
        return {
          success: false,
          data: null,
          message: "Email already registered.",
          httpCode: 400
        };
      }

      const passwordHash = await hashPassword(password);

      const input: CreateUserInput = { email, username, passwordHash };

      const user = await UserRepo.create(input);

      return {
        success: true,
        data: { user },
        message: "User signed up",
        httpCode: 201
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: null,
        message: "Signup failed: " + message,
        httpCode: 500
      };
    }
  },

  async login(
    email: string,
    password: string,
    UserRepo: UserRepository,
    SessionRepo: SessionRepository,
    sessionTtl: number
  ): Promise<AuthResult> {
    try {
      if (!email || !password) {
        return {
          success: false,
          data: null,
          message: "Email and password are required.",
          httpCode: 400
        };
      }

      const user = await UserRepo.findByEmail(email);

      if (!user) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      const valid = await verifyPassword(password, user.password);

      if (!valid) {
        return {
          success: false,
          data: null,
          message: "Invalid credentials.",
          httpCode: 401
        };
      }

      const session = await SessionService.create(user.id, sessionTtl, SessionRepo);

      return {
        success: true,
        data: { user, session },
        message: "User logged in",
        httpCode: 200
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";

      return {
        success: false,
        data: null,
        message: "Login failed: " + message,
        httpCode: 500
      };
    }
  }
};
