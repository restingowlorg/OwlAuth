import { AuthType, IAuthMethods } from "../core/types";
import { ICryptoAdapter } from "../infra/security/types";
import {
  UserRepository,
  MagicLinkRepository,
  AccountSecurityRepository,
  AuthDB
} from "../repositories/contracts";
import { MagicLinkService } from "../services/magic-link.service";
import { MagicLinkAuthStrategy } from "./MagicLinkStrategy";
import { Mutable } from "./types";
import { AuthOptions } from "../core/types";

jest.mock("../services/magic-link.service");

describe("MagicLinkAuthStrategy", () => {
  let strategy: MagicLinkAuthStrategy;
  let mockDb: AuthDB;
  let mockOptions: AuthOptions<AuthType>;

  beforeEach(() => {
    strategy = new MagicLinkAuthStrategy();
    mockDb = {
      userRepo: {} as UserRepository,
      magicLinkRepo: {} as MagicLinkRepository,
      close: jest.fn() as unknown as () => Promise<void>
    };
    mockOptions = {
      adapter: {} as unknown as ICryptoAdapter
    } as unknown as AuthOptions<AuthType>;
  });

  it("should register request, verify, and consume methods under target.magicLink", () => {
    const target: Mutable<Partial<IAuthMethods>> = {};
    strategy.register(target, mockDb, mockOptions);

    expect(target.magicLink).toBeDefined();
    if (target.magicLink) {
      expect(target.magicLink.request).toBeDefined();
      expect(target.magicLink.verify).toBeDefined();
      expect(target.magicLink.consume).toBeDefined();
      expect(typeof target.magicLink.request).toBe("function");
    }
  });

  it("should throw if magicLinkRepo is missing", () => {
    const target: Mutable<Partial<IAuthMethods>> = {};
    const dbWithoutRepo: AuthDB = {
      userRepo: {} as UserRepository,
      close: jest.fn() as unknown as () => Promise<void>
    };

    expect(() => strategy.register(target, dbWithoutRepo, mockOptions)).toThrow(
      "MagicLinkRepository is required for MagicLinkAuthStrategy"
    );
  });

  describe("account security repository wiring", () => {
    const accountSecurityRepo = {} as AccountSecurityRepository;

    function expectRepoPassed(expected: AccountSecurityRepository | undefined): void {
      expect(MagicLinkService).toHaveBeenCalledWith(
        mockDb.userRepo,
        mockDb.magicLinkRepo,
        expect.anything(),
        expect.anything(),
        undefined,
        expected
      );
    }

    it("passes the repository when the option is enabled and the adapter provides one", () => {
      strategy.register(
        {},
        { ...mockDb, accountSecurityRepo },
        {
          ...mockOptions,
          accountSecurity: true
        }
      );

      expectRepoPassed(accountSecurityRepo);
    });

    // A custom adapter may return a repository regardless of configuration. Enforcement
    // must still follow the option, otherwise policy switches on without being asked for.
    it("ignores a supplied repository when the option is disabled", () => {
      strategy.register(
        {},
        { ...mockDb, accountSecurityRepo },
        {
          ...mockOptions,
          accountSecurity: false
        }
      );

      expectRepoPassed(undefined);
    });

    it("ignores a supplied repository when the option is absent", () => {
      strategy.register({}, { ...mockDb, accountSecurityRepo }, mockOptions);

      expectRepoPassed(undefined);
    });

    it("passes undefined when neither the option nor a repository is present", () => {
      strategy.register({}, mockDb, mockOptions);

      expectRepoPassed(undefined);
    });
  });
});
