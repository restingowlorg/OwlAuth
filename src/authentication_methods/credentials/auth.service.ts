import { CreateUserInput, UserRepository } from "../../repositories/contracts";
import { hashPassword, verifyPassword } from "../../infra/crypto/crypto";

export const AuthService = {
  /**
   * Signup with email, username, and password
   */
  async signup(email: string, username: string, password: string, UserRepo: UserRepository) {
    //Check inputs
    if (!email || !username || !password) {
      throw new Error("Email, username, and password are required.");
    }

    // username validation
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new Error("Invalid username format. Use 3-20 alphanumeric characters or underscore.");
    }

    // Optional: Check if username/email already exists
    if (UserRepo.findByUsername) {
      const existingUser = await UserRepo.findByUsername(username);
      if (existingUser) throw new Error("Username already taken.");
    }

    const existingEmail = await UserRepo.findByEmail(email);
    if (existingEmail) throw new Error("Email already registered.");

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user via repository
    const input: CreateUserInput = { email, username, passwordHash };
    const user = await UserRepo.create(input);

    return user;
  },

  /**
   * Login with email and password
   */
  async login(email: string, password: string, UserRepo: UserRepository) {
    const user = await UserRepo.findByEmail(email);
    if (!user) return null;

    const valid = await verifyPassword(password, user.password);
    return valid ? user : null;
  }
};
