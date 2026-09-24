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
    it("should pass the repository to MagicLinkService when the adapter provides one", () => {
      const accountSecurityRepo = {} as AccountSecurityRepository;

      strategy.register({}, { ...mockDb, accountSecurityRepo }, mockOptions);

      expect(MagicLinkService).toHaveBeenCalledWith(
        mockDb.userRepo,
        mockDb.magicLinkRepo,
        expect.anything(),
        expect.anything(),
        undefined,
        accountSecurityRepo
      );
    });

    it("should pass undefined when the adapter provides none", () => {
      strategy.register({}, mockDb, mockOptions);

      expect(MagicLinkService).toHaveBeenCalledWith(
        mockDb.userRepo,
        mockDb.magicLinkRepo,
        expect.anything(),
        expect.anything(),
        undefined,
        undefined
      );
    });
  });
});
