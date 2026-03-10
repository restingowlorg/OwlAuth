// src/authentication_methods/credentials/auth.service.ts
import { CreateUserInput, UserRepository } from "../../repositories/contracts";
import { hashPassword, verifyPassword } from "../../infra/crypto/crypto";
import { AuthResult } from "../../types";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../../infra/security/pwned-passwords";

/* -------------------------------------------------------------------------- */
/*                         TYPED AUTHENTICATED REQUEST                        */
/* -------------------------------------------------------------------------- */
export interface AuthenticatedRequest {
  user?: { id: string };
  session?: { sessionToken?: string };
}

/* -------------------------------------------------------------------------- */
/*                               AUTH SERVICE                                  */
/* -------------------------------------------------------------------------- */
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
        return { success: false, data: null, message: "Invalid username format.", httpCode: 400 };
      }

      if (zxcvbn(password).score < 3) {
        return { success: false, data: null, message: "Password too weak.", httpCode: 400 };
      }

      if (await isBreachedPassword(password)) {
        return { success: false, data: null, message: "Password found in breach.", httpCode: 400 };
      }

      if (UserRepo.findByUsername) {
        const existingUser = await UserRepo.findByUsername(username);
        if (existingUser)
          return { success: false, data: null, message: "Username already taken.", httpCode: 400 };
      }

      const existingEmail = await UserRepo.findByEmail(email);
      if (existingEmail)
        return { success: false, data: null, message: "Email already registered.", httpCode: 400 };

      const passwordHash = await hashPassword(password);
      const input: CreateUserInput = { email, username, passwordHash };
      const user = await UserRepo.create(input);

      return { success: true, data: { user }, message: "User signed up", httpCode: 201 };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, data: null, message: "Signup failed: " + message, httpCode: 500 };
    }
  },

  async changePassword(
    req: AuthenticatedRequest,
    currentPassword: string,
    newPassword: string,
    UserRepo: UserRepository
  ): Promise<AuthResult> {
    const sessionToken = req.session?.sessionToken;
    const userId = req.user?.id;

    if (!sessionToken || !userId) {
      return { success: false, data: null, message: "No valid session", httpCode: 401 };
    }

    const user = await UserRepo.findById(userId);
    if (!user) return { success: false, data: null, message: "User not found", httpCode: 404 };

    const valid = await verifyPassword(currentPassword, user.password);
    if (!valid)
      return { success: false, data: null, message: "Current password incorrect", httpCode: 401 };

    if (zxcvbn(newPassword).score < 3) {
      return { success: false, data: null, message: "New password too weak", httpCode: 400 };
    }

    if (await isBreachedPassword(newPassword)) {
      return { success: false, data: null, message: "New password breached", httpCode: 400 };
    }

    const newHash = await hashPassword(newPassword);
    await UserRepo.updatePassword(userId, newHash);

    return { success: true, data: { sessionToken }, message: "Password updated", httpCode: 200 };
  }
};
