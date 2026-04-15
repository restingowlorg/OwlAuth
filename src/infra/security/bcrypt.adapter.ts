import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { SECURITY_CONFIG } from "../../config";
import { ICryptoAdapter } from "./types";

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

  hashToken(token: string): Promise<string> {
    return Promise.resolve(crypto.createHash("sha256").update(token).digest("hex"));
  }

  verifyToken(token: string, hash: string): Promise<boolean> {
    const computed = crypto.createHash("sha256").update(token).digest("hex");
    const computedBuffer = Buffer.from(computed);
    const hashBuffer = Buffer.from(hash);

    if (computedBuffer.length !== hashBuffer.length) {
      return Promise.resolve(false);
    }
    return Promise.resolve(crypto.timingSafeEqual(computedBuffer, hashBuffer));
  }
}
