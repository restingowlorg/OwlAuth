import { AuthDB, AuthOptions, AuthResult, User, Session, SignupInput, LoginInput } from "./types";

import { DEFAULTS } from "./config/defaults";

import { connectMongo } from "./infra/mongo/db";
import { initPostgres } from "./infra/postgresql/db";

import { AuthService } from "./authentication_methods/credentials/auth.service";
import { SessionService } from "./authentication_methods/credentials/session.service";
import { MagicLinkService } from "./authentication_methods/magic-links/magic-link.service";

import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "./infra/security/pwned-passwords";

/* -------------------------------------------------------------------------- */
/*                                  WRAPPERS                                  */
/* -------------------------------------------------------------------------- */

export function success<T>(data: T, message = "Success", httpCode = 200): AuthResult<T> {
  return {
    success: true,
    data,
    message,
    httpCode
  };
}

export function failure<T = undefined>(message: string, httpCode = 400): AuthResult<T> {
  return {
    success: false,
    data: undefined as T,
    message,
    httpCode
  };
}

/* -------------------------------------------------------------------------- */
/*                                AUTH MANAGER                                */
/* -------------------------------------------------------------------------- */

export class AuthManager {
  /* ------------------------- Credentials methods ------------------------- */

  public signup!: (input: SignupInput) => Promise<AuthResult<{ user: User }>>;

  public login!: (input: LoginInput) => Promise<AuthResult<{ user: User; session: Session }>>;

  public logout!: (sessionId: string) => Promise<AuthResult<null>>;

  public me!: (sessionId: string) => Promise<AuthResult<User | null>>;

  /* -------------------------- Magic Link methods ------------------------- */

  public requestMagicLink?: (email: string) => Promise<AuthResult<string>>;

  public consumeMagicLink?: (
    token: string
  ) => Promise<AuthResult<{ userId: string | number; session: Session }>>;

  /* ----------------------------- Internal State -------------------------- */

  private db!: AuthDB;
  private sessionTtl!: number;

  private constructor() {}

  /* -------------------------------------------------------------------------- */
  /*                                  INIT                                      */
  /* -------------------------------------------------------------------------- */

  public static async init(options: AuthOptions): Promise<AuthManager> {
    const manager = new AuthManager();

    /* ----------------------------- Database Setup ---------------------------- */

    switch (options.dbType) {
      case "mongo":
        if (!options.mongoUri) {
          throw new Error("mongoUri is required");
        }

        manager.db = await connectMongo(options.mongoUri);
        break;

      case "postgres":
        if (!options.postgresUrl) {
          throw new Error("postgresUrl is required");
        }

        manager.db = await initPostgres(options.postgresUrl, options.postgresUserTable);

        break;

      default:
        throw new Error(`Unsupported dbType: ${String(options.dbType)}`);
    }

    /* ------------------------------ Config -------------------------------- */

    manager.sessionTtl = options.sessionTtlSeconds ?? DEFAULTS.SESSION_TTL;

    const authTypes = options.authTypes ?? ["credentials"];

    /* -------------------------------------------------------------------------- */
    /*                              CREDENTIAL AUTH                               */
    /* -------------------------------------------------------------------------- */

    if (authTypes.includes("credentials")) {
      manager.signup = async ({ email, username, password }) => {
        try {
          /* -------- Input validation -------- */

          if (!email || !username || !password) {
            return failure("Email, username and password are required", 400);
          }

          /* -------- Password strength -------- */

          const strength = zxcvbn(password);

          if (strength.score < 3) {
            return failure("Password is too weak. Please choose a stronger password.");
          }

          /* -------- Breach detection -------- */

          const breached = await isBreachedPassword(password);

          if (breached) {
            return failure("This password has appeared in a data breach. Choose another.");
          }

          /* -------- Create user -------- */

          const user = await AuthService.signup(email, username, password, manager.db.userRepo);

          return success({ user }, "User signed up successfully", 201);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          return failure("Signup failed: " + message, 500);
        }
      };

      /* ----------------------------- LOGIN ----------------------------- */

      manager.login = async ({ email, password }) => {
        try {
          const user: User | null = await AuthService.login(email, password, manager.db.userRepo);

          if (!user) {
            return failure("Invalid credentials", 401);
          }

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

      /* ----------------------------- LOGOUT ----------------------------- */

      manager.logout = async (sessionId: string) => {
        try {
          await SessionService.destroy(sessionId, manager.db.sessionRepo);

          return success<null>(null, "Logged out", 200);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          return failure("Logout failed: " + message);
        }
      };

      /* ------------------------------- ME ------------------------------- */

      manager.me = async (sessionId: string) => {
        try {
          const session: Session | null = await SessionService.validate(
            sessionId,
            manager.db.sessionRepo
          );

          if (!session) {
            return failure("Invalid session", 401);
          }

          const user: User | null = await manager.db.userRepo.findById(session.userId);

          return success(user, "User retrieved", 200);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);

          return failure("Failed to fetch user: " + message);
        }
      };
    }

    /* -------------------------------------------------------------------------- */
    /*                               MAGIC LINK AUTH                              */
    /* -------------------------------------------------------------------------- */

    if (authTypes.includes("magic-link")) {
      const magicLinkService =
        options.magicLinkService ??
        (manager.db.magicLinkRepo
          ? new MagicLinkService(manager.db.userRepo, manager.db.magicLinkRepo)
          : undefined);

      if (magicLinkService) {
        manager.requestMagicLink = async (email: string) => {
          try {
            const token = await magicLinkService.request(email);

            return success(token, "Magic link requested");
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);

            return failure("Failed to request magic link: " + message);
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
