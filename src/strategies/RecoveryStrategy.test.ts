import { AuthOptions, AuthType, IAuthMethods } from "../core/types";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";
import {
  AccountSecurityRepository,
  ActionTokenRepository,
  AuthDB,
  MagicLinkRepository,
  UserRepository
} from "../repositories/contracts";
import { RecoveryService, RecoveryServiceConfig } from "../services/recovery.service";
import { RecoveryAuthStrategy } from "./RecoveryStrategy";
import { Mutable } from "./types";

// Only the class is replaced. The TTL bounds exported alongside it are the real ones, so the
// validation under test is checked against the values it actually ships with.
jest.mock("../services/recovery.service", () => {
  const actual: typeof import("../services/recovery.service") = jest.requireActual(
    "../services/recovery.service"
  );
  return { ...actual, RecoveryService: jest.fn() };
});

const RecoveryServiceMock = RecoveryService as jest.MockedClass<typeof RecoveryService>;

describe("RecoveryAuthStrategy", () => {
  let strategy: RecoveryAuthStrategy;
  let mockDb: AuthDB;
  let mockOptions: AuthOptions<AuthType>;
  let deliver: jest.Mock;
  const mockLogger = {} as IAuditLogger;

  /** The config object the strategy hands the service. */
  function serviceConfig(): RecoveryServiceConfig {
    return RecoveryServiceMock.mock.calls[0][4];
  }

  /** Replace the service with a stub exposing just the method under test. */
  function stubService(confirm: jest.Mock): void {
    RecoveryServiceMock.mockImplementation(() => ({ confirm }) as unknown as RecoveryService);
  }

  beforeEach(() => {
    strategy = new RecoveryAuthStrategy();
    deliver = jest.fn();
    mockDb = {
      userRepo: {} as UserRepository,
      actionTokenRepo: {} as ActionTokenRepository,
      close: jest.fn() as unknown as () => Promise<void>
    };
    mockOptions = {
      adapter: {} as unknown as ICryptoAdapter,
      recovery: { deliver }
    } as unknown as AuthOptions<AuthType>;
  });

  it("registers request and confirm under target.recovery", () => {
    const target: Mutable<Partial<IAuthMethods>> = {};
    strategy.register(target, mockDb, mockOptions, mockLogger);

    expect(target.recovery).toBeDefined();
    expect(typeof target.recovery?.request).toBe("function");
    expect(typeof target.recovery?.confirm).toBe("function");
  });

  describe("startup validation", () => {
    it("fails when the adapter provides no action token repository", () => {
      const dbWithoutRepo: AuthDB = {
        userRepo: {} as UserRepository,
        close: jest.fn() as unknown as () => Promise<void>
      };

      expect(() => strategy.register({}, dbWithoutRepo, mockOptions, mockLogger)).toThrow(
        /did not provide an action token repository/
      );
    });

    // A token nobody can deliver is a flow nobody can complete, so this must not start up
    // looking healthy.
    it.each([
      ["the recovery options are absent", undefined],
      ["deliver is missing", {}],
      ["deliver is not a function", { deliver: "mailer" }],
      ["deliver is null", { deliver: null }]
    ])("fails when %s", (_label, recovery) => {
      expect(() =>
        strategy.register(
          {},
          mockDb,
          { ...mockOptions, recovery } as unknown as AuthOptions<AuthType>,
          mockLogger
        )
      ).toThrow(/requires 'recovery.deliver' to be a function/);
    });

    it.each([0, 1, 4, 61, 1440, 15.5, Number.NaN])(
      "rejects a token lifetime of %p minutes",
      (tokenTtlMinutes) => {
        expect(() =>
          strategy.register(
            {},
            mockDb,
            {
              ...mockOptions,
              recovery: { deliver, tokenTtlMinutes }
            } as unknown as AuthOptions<AuthType>,
            mockLogger
          )
        ).toThrow(/tokenTtlMinutes/);
      }
    );

    it.each([5, 15, 60])("accepts a token lifetime of %i minutes", (tokenTtlMinutes) => {
      expect(() =>
        strategy.register(
          {},
          mockDb,
          {
            ...mockOptions,
            recovery: { deliver, tokenTtlMinutes }
          } as unknown as AuthOptions<AuthType>,
          mockLogger
        )
      ).not.toThrow();
    });

    it("accepts an omitted token lifetime and leaves the default to the service", () => {
      strategy.register({}, mockDb, mockOptions, mockLogger);

      expect(serviceConfig().tokenTtlMinutes).toBeUndefined();
    });
  });

  describe("option merging", () => {
    it("falls back to the manager's password options", async () => {
      const confirm = jest.fn().mockResolvedValue(undefined);
      stubService(confirm);

      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(
        target,
        mockDb,
        {
          ...mockOptions,
          blockedPasswords: ["owlauth"],
          pwnedPasswordFailClosed: true
        } as unknown as AuthOptions<AuthType>,
        mockLogger
      );

      await target.recovery?.confirm("token", "password");

      expect(confirm).toHaveBeenCalledWith("token", "password", {
        blockedPasswords: ["owlauth"],
        pwnedPasswordFailClosed: true,
        correlationId: undefined
      });
    });

    it("lets a per-call option override the manager's", async () => {
      const confirm = jest.fn().mockResolvedValue(undefined);
      stubService(confirm);

      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(
        target,
        mockDb,
        {
          ...mockOptions,
          blockedPasswords: ["owlauth"],
          pwnedPasswordFailClosed: true
        } as unknown as AuthOptions<AuthType>,
        mockLogger
      );

      await target.recovery?.confirm("token", "password", {
        blockedPasswords: ["custom"],
        pwnedPasswordFailClosed: false,
        correlationId: "req-1"
      });

      expect(confirm).toHaveBeenCalledWith("token", "password", {
        blockedPasswords: ["custom"],
        pwnedPasswordFailClosed: false,
        correlationId: "req-1"
      });
    });

    it("passes baseUrl through to the service", () => {
      strategy.register(
        {},
        mockDb,
        {
          ...mockOptions,
          recovery: { deliver, baseUrl: "https://app.example/reset" }
        } as unknown as AuthOptions<AuthType>,
        mockLogger
      );

      expect(serviceConfig().baseUrl).toBe("https://app.example/reset");
    });
  });

  describe("repository wiring", () => {
    const accountSecurityRepo = {} as AccountSecurityRepository;
    const magicLinkRepo = {} as MagicLinkRepository;

    function expectRepos(
      expectedMagicLinks: MagicLinkRepository | undefined,
      expectedAccountSecurity: AccountSecurityRepository | undefined
    ): void {
      expect(RecoveryService).toHaveBeenCalledWith(
        mockDb.userRepo,
        mockDb.actionTokenRepo,
        expect.anything(),
        mockLogger,
        expect.anything(),
        expectedMagicLinks,
        expectedAccountSecurity
      );
    }

    it("passes the magic-link store when the adapter provides one", () => {
      strategy.register({}, { ...mockDb, magicLinkRepo }, mockOptions, mockLogger);

      expectRepos(magicLinkRepo, undefined);
    });

    it("passes the account security store when the option is enabled", () => {
      strategy.register(
        {},
        { ...mockDb, accountSecurityRepo },
        { ...mockOptions, accountSecurity: true },
        mockLogger
      );

      expectRepos(undefined, accountSecurityRepo);
    });

    // A custom adapter may return a repository regardless of configuration. Enforcement
    // must still follow the option, otherwise policy switches on without being asked for.
    it("ignores a supplied account security store when the option is disabled", () => {
      strategy.register(
        {},
        { ...mockDb, accountSecurityRepo },
        { ...mockOptions, accountSecurity: false },
        mockLogger
      );

      expectRepos(undefined, undefined);
    });
  });
});
