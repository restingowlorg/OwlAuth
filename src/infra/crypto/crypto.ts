import * as bcrypt from "bcrypt";
import * as crypto from "crypto";

const SALT_ROUNDS = 10;

// ---------------- Password Helpers ----------------
export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ---------------- Magic Link Helpers ----------------
export function generateToken(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

export async function hashToken(token: string) {
  return bcrypt.hash(token, SALT_ROUNDS);
}

export async function verifyToken(token: string, hash: string) {
  return bcrypt.compare(token, hash);
}
