// src/AuthManager.ts
import { AuthDB, AuthOptions, AuthResult, User, Session } from "./types";
import { DEFAULTS } from "./config/defaults";
import { connectMongo } from "./infra/mongo/db";
import { AuthService } from "./authentication_methods/credentials/auth.service";
import { SessionService } from "./authentication_methods/credentials/session.service";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";
import { initPostgres } from "./infra/postgresql/db";
import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../src/infra/security/pwned-passwords";

/** Generic success wrapper */
export function success<T>(data: T, message = "Success", httpCode = 200): AuthResult<T> {
  return { success: true, data, message, httpCode };
}

/** Generic failure wrapper */
export function failure<T = undefined>(message: string, httpCode = 400): AuthResult<T> {
  return { success: false, data: undefined as T, message, httpCode };
}

export class AuthManager {
  public signup!: (email: string, password: string) => Promise<AuthResult<{ user: User }>>;
  public login!: (
    email: string,
    password: string
  ) => Promise<AuthResult<{ user: User; session: Session }>>;
  public logout!: (sessionId: string) => Promise<AuthResult<null>>;
  public me!: (sessionId: string) => Promise<AuthResult<User | null>>;
  public requestMagicLink?: (email: string) => Promise<AuthResult<string>>;
  public consumeMagicLink?: (
    token: string
  ) => Promise<AuthResult<{ userId: string | number; session: Session }>>;

  private db!: AuthDB;
  private sessionTtl!: number;

  private constructor() {}

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    // ---------------- Database ----------------
    switch (options.dbType) {
      case "mongo":
        if (!options.mongoUri) throw new Error("mongoUri is required");
        manager.db = await connectMongo(options.mongoUri);
        break;
      case "postgres":
        if (!options.postgresUrl) throw new Error("postgresUrl is required");
        manager.db = await initPostgres(options.postgresUrl);
        break;
      default:
        throw new Error(`Unsupported dbType: ${String(options.dbType)}`);
    }

    // ---------------- Config ----------------
    manager.sessionTtl = options.sessionTtlSeconds ?? DEFAULTS.SESSION_TTL;
    const authTypes = options.authTypes ?? ["credentials"];

    // ---------------- Credentials ----------------
    if (authTypes.includes("credentials")) {
      manager.signup = async (email: string, password: string) => {
        try {
          const result = zxcvbn(password);
          if (result.score < 3) {
            return failure("Password is too weak. Please choose a stronger password.");
          }

          const breached = await isBreachedPassword(password);
          if (breached) {
            return failure(
              "This password has been found in a data breach. Choose a different one."
            );
          }

          const user: User = await AuthService.signup(email, password, manager.db.userRepo);
          return success({ user }, "User signed up", 201);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return failure("Signup failed: " + message);
        }
      };

      manager.login = async (email: string, password: string) => {
        try {
          const user: User | null = await AuthService.login(email, password, manager.db.userRepo);
          if (!user) return failure("Invalid credentials", 401);

          const session: Session = await SessionService.create(
            user.id as string | number,
            manager.sessionTtl,
            manager.db.sessionRepo
          );

          return success({ user, session }, "User logged in", 200);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return failure("Login failed: " + message);
        }
      };

      manager.logout = async (sessionId: string) => {
        try {
          await SessionService.destroy(sessionId, manager.db.sessionRepo);
          return success<null>(null, "Logged out", 200);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return failure("Logout failed: " + message);
        }
      };

      manager.me = async (sessionId: string) => {
        try {
          const session: Session | null = await SessionService.validate(
            sessionId,
            manager.db.sessionRepo
          );
          if (!session) return failure("Invalid session", 401);

          const user: User | null = await manager.db.userRepo.findById(session.userId);
          return success(user, "User retrieved", 200);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return failure("Fetch user failed: " + message);
        }
      };
    }

    // ---------------- Magic Link ----------------
    if (authTypes.includes("magic-link")) {
      const magicLinkService =
        options.magicLinkService ??
        (manager.db.magicLinkRepo
          ? new MagicLinkService(manager.db.userRepo, manager.db.magicLinkRepo)
          : undefined);

      if (magicLinkService) {
        manager.requestMagicLink = async (email: string) => {
          try {
            const token: string = await magicLinkService.request(email);
            return success(token, "Magic link requested");
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return failure("Failed to request magic link: " + message);
          }
        };

        manager.consumeMagicLink = async (token: string) => {
          try {
            const { userId }: { userId: string | number } = await magicLinkService.consume(token);
            const session: Session = await SessionService.create(
              userId,
              manager.sessionTtl,
              manager.db.sessionRepo
            );
            return success({ userId, session }, "Magic link consumed");
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return failure("Invalid or expired magic link: " + message, 401);
          }
        };
      }
    }

    return manager;
  }
}
