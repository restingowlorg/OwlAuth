import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { ICryptoAdapter } from "../../types";
import { SECURITY_CONFIG } from "../../config";

export class BcryptAdapter implements ICryptoAdapter {
  private readonly SALT_ROUNDS = SECURITY_CONFIG.SALT_ROUNDS;

  // ---------------- Password Helpers ----------------
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // ---------------- Magic Link Helpers ----------------
  generateToken(length = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.SALT_ROUNDS);
  }

  async verifyToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }
}
