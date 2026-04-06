import { CredentialsAuthStrategy } from "./CredentialsStrategy";
import { AuthDB, UserRepository } from "../repositories/contracts";
import { AuthOptions, IAuthMethods } from "../core/types";
import { ICryptoAdapter } from "../infra/security/types";
import { Mutable } from "./types";
import { AuthType } from "../core/types";

describe("CredentialsAuthStrategy", () => {
  let strategy: CredentialsAuthStrategy;
  let mockDb: AuthDB;
  let mockOptions: AuthOptions<AuthType>;

  beforeEach(() => {
    strategy = new CredentialsAuthStrategy();
    mockDb = {
      userRepo: {} as UserRepository,
      close: jest.fn() as unknown as () => Promise<void>
    };
    mockOptions = {
      adapter: {} as unknown as ICryptoAdapter
    } as unknown as AuthOptions<AuthType>;
  });

  it("should register signup, login, and changePassword methods under target.credentials", () => {
    const target: Mutable<Partial<IAuthMethods>> = {};
    strategy.register(target, mockDb, mockOptions);

    expect(target.credentials).toBeDefined();
    if (target.credentials) {
      expect(target.credentials.signup).toBeDefined();
      expect(target.credentials.login).toBeDefined();
      expect(target.credentials.changePassword).toBeDefined();
      expect(typeof target.credentials.signup).toBe("function");
    }
  });
});
