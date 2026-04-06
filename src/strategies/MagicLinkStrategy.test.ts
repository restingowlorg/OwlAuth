import { AuthType, IAuthMethods } from "../core/types";
import { ICryptoAdapter } from "../infra/security/types";
import { UserRepository, MagicLinkRepository, AuthDB } from "../repositories/contracts";
import { MagicLinkAuthStrategy } from "./MagicLinkStrategy";
import { Mutable } from "./types";
import { AuthOptions } from "../core/types";

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
});
