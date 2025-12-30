// src/auth-manager.ts
import { AuthOptions, AuthResult } from "./types";
import { DEFAULTS } from "./config/defaults";
import { connectMongo } from "./infra/mongo/db";
import { AuthService } from "./authentication_methods/credentials/auth.service";
import { SessionService } from "./authentication_methods/credentials/session.service";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";
import { initPostgres } from "./infra/postgresql/db";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "./infra/security/pwned-passwords";

export function success<T>(
  data: T,
  message = "Success",
  httpCode = 200
): AuthResult<T> {
  return { success: true, data, httpCode, message };
}

export function failure<T = null>(
  message: string,
  httpCode = 400
): AuthResult<T> {
  return { success: false, data: null as any, httpCode, message };
}

export class AuthManager {
  public signup!: (
    email: string,
    password: string,
    username: string
  ) => Promise<AuthResult<{ user: any }>>;
  public login!: (
    email: string,
    password: string
  ) => Promise<AuthResult<{ user: any; session: any }>>;
  public logout!: (sessionId: string) => Promise<AuthResult<null>>;
  public me!: (sessionId: string) => Promise<AuthResult<any | null>>;
  public requestMagicLink?: (email: string) => Promise<AuthResult<string>>;
  public consumeMagicLink?: (
    token: string
  ) => Promise<AuthResult<{ userId: string; session: any }>>;

  private db!: any;
  private sessionTtl!: number;
  private constructor() {}

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // ---------------- Database ----------------
    switch (options.dbType) {
      case "mongo":
        if (!options.mongoUri) throw new Error("mongoUri is required");
        manager.db = await connectMongo(options.mongoUri);
        console.log("ℹ️ Connected to MongoDB:", options.mongoUri);
        break;
      case "postgres":
        if (!options.postgresUrl) throw new Error("postgresUrl is required");
        manager.db = await initPostgres(
          options.postgresUrl,
          options.postgresUserTable
        );
        console.log("ℹ️ Connected to PostgreSQL:", options.postgresUrl);
        break;
      default:
        throw new Error(`Unsupported dbType: ${options.dbType}`);
    }

    // ---------------- Config ----------------
    manager.sessionTtl = options.sessionTtlSeconds ?? DEFAULTS.SESSION_TTL;
    const authTypes = options.authTypes ?? ["credentials"];

    // ---------------- Credentials ----------------
    if (authTypes.includes("credentials")) {
      manager.signup = async (
        email: string,
        username: string,
        password: string
      ) => {
        try {
          //Validate inputs
          if (!email || !username || !password) {
            return failure("Email, username, and password are required.", 400);
          }

          // ---------------- Password Strength ----------------
          const result = zxcvbn(password);
          console.log("ℹ️ Password strength result:", result);
          if (result.score < 3) {
            return failure(
              "Password is too weak. Please choose a stronger password.",
              400
            );
          }

          // ---------------- Breach Check ----------------
          const breached = await isBreachedPassword(password);
          console.log("ℹ️ Password breach check:", breached);
          if (breached) {
            return failure(
              "This password has been found in a data breach. Choose a different one.",
              400
            );
          }

          // ---------------- Signup ----------------
          const user = await AuthService.signup(
            email,
            username, // ← pass username
            password,
            manager.db.userRepo
          );

          return success({ user }, "User signed up", 201);
        } catch (err: any) {
          return failure(
            "Signup failed: " + (err.message || "Unknown error"),
            500
          );
        }
      };

      manager.login = async (email: string, password: string) => {
        try {
          const user = await AuthService.login(
            email,
            password,
            manager.db.userRepo
          );
          if (!user) return failure("Invalid credentials", 401);

          const session = await SessionService.create(
            user.id,
            manager.sessionTtl,
            manager.db.sessionRepo
          );
          console.log("ℹ️  Session created:", session);
          return success({ user, session }, "User logged in", 200);
        } catch (err: any) {
          return failure("Login failed: " + (err.message || "Unknown error"));
        }
      };

      manager.logout = async (sessionId: string) => {
        try {
          await SessionService.destroy(sessionId, manager.db.sessionRepo);
          return success<null>(null, "Logged out", 200);
        } catch (err: any) {
          return failure("Logout failed: " + (err.message || "Unknown error"));
        }
      };

      manager.me = async (sessionId: string) => {
        try {
          console.log("ℹ️  Validating session...");
          console.log("➡️  Session ID:", sessionId);
          const session = await SessionService.validate(
            sessionId,
            manager.db.sessionRepo
          );
          console.log("ℹ️  Session validated:", session);
          if (!session) return failure("Invalid session", 401);

          const user = await manager.db.userRepo.findById(session.userId);
          return success(user, "User retrieved", 200);
        } catch (err: any) {
          return failure(
            "Fetch user failed: " + (err.message || "Unknown error")
          );
        }
      };
    }

    // ---------------- Magic Link ----------------
    if (authTypes.includes("magic-link")) {
      const magicLinkService =
        options.magicLinkService ??
        new MagicLinkService(manager.db.userRepo, manager.db.magicLinkRepo);

      manager.requestMagicLink = async (email: string) => {
        try {
          const token = await magicLinkService.request(email);
          return success(token, "Magic link requested");
        } catch (err: any) {
          return failure(
            "Failed to request magic link: " + (err.message || "Unknown error")
          );
        }
      };

      manager.consumeMagicLink = async (token: string) => {
        try {
          const { userId } = await magicLinkService.consume(token);
          const session = await SessionService.create(
            userId,
            manager.sessionTtl,
            manager.db.sessionRepo
          );
          return success({ userId, session }, "Magic link consumed");
        } catch (err: any) {
          return failure(
            "Invalid or expired magic link: " +
              (err.message || "Unknown error"),
            401
          );
        }
      };
    }

    return manager;
  }
}
