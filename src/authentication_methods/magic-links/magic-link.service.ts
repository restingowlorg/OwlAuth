// src/authentication_methods/magic-links/magic-link.service.ts

import { UserRepository, MagicLinkRepository } from "../../repositories/contracts";
import { hashToken, verifyToken, generateToken } from "../../infra/crypto/crypto";
import { MagicLinkToken } from "../../types";

export class MagicLinkService {
  constructor(
    private users: UserRepository,
    private magicLinks: MagicLinkRepository
  ) {}

  /** Request a magic link (passwordless login) */
  async request(email: string): Promise<string> {
    const user = await this.users.findByEmail(email);
    if (!user) throw new Error("User not found");

    const token = generateToken();
    const tokenHash = await hashToken(token);

    await this.magicLinks.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 min
    });

    return token; // dev-only, do not expose in prod
  }

  /** Consume a magic link token */
  async consume(token: string): Promise<{ userId: string }> {
    const records = await this.magicLinks.findAll();

    let record: MagicLinkToken | null = null;

    for (const r of records) {
      if (r.usedAt) continue;
      const match = await verifyToken(token, r.tokenHash);
      if (match) {
        record = r;
        break;
      }
    }

    if (!record) throw new Error("Invalid or expired magic link");

    if (record.expiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired magic link");
    }

    await this.magicLinks.markUsed(record.id);

    return { userId: record.userId.toString() };
  }
}
