import { CredentialsAuthStrategy } from "./CredentialsStrategy";
import { AuthService } from "../services/auth.service";
import { AuthDB, UserRepository } from "../repositories/contracts";
import { AuthOptions, IAuthMethods } from "../core/types";
import { ICryptoAdapter } from "../infra/security/types";
import { Mutable } from "./types";
import { AuthType } from "../core/types";

jest.mock("../services/auth.service");
jest.mock("../infra/security/security-audit-logger", () => ({ auditLogger: {} }));

describe("CredentialsAuthStrategy", () => {
  let strategy: CredentialsAuthStrategy;
  let mockDb: AuthDB;
  let mockOptions: AuthOptions<AuthType>;
  let mockSignup: jest.Mock;
  let mockLogin: jest.Mock;
  let mockChangePassword: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignup = jest.fn().mockResolvedValue({ success: true });
    mockLogin = jest.fn().mockResolvedValue({ success: true });
    mockChangePassword = jest.fn().mockResolvedValue({ success: true });

    (AuthService as jest.MockedClass<typeof AuthService>).mockImplementation(
      () =>
        ({
          signup: mockSignup,
          login: mockLogin,
          changePassword: mockChangePassword
        }) as unknown as AuthService
    );

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

  describe("option merging", () => {
    it("should use optionsOverride.blockedPasswords and fall back to global pwnedPasswordFailClosed in signup", async () => {
      mockOptions = {
        blockedPasswords: ["global"],
        pwnedPasswordFailClosed: true
      } as unknown as AuthOptions<AuthType>;
      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(target, mockDb, mockOptions);

      await target.credentials!.signup("a@b.com", "user", "pass", {
        blockedPasswords: ["override"]
      });

      expect(mockSignup).toHaveBeenCalledWith(
        "a@b.com",
        "user",
        "pass",
        expect.objectContaining({ blockedPasswords: ["override"], pwnedPasswordFailClosed: true })
      );
    });

    it("should fall back to global options when no override provided in signup", async () => {
      mockOptions = {
        blockedPasswords: ["global"],
        pwnedPasswordFailClosed: false
      } as unknown as AuthOptions<AuthType>;
      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(target, mockDb, mockOptions);

      await target.credentials!.signup("a@b.com", "user", "pass");

      expect(mockSignup).toHaveBeenCalledWith(
        "a@b.com",
        "user",
        "pass",
        expect.objectContaining({ blockedPasswords: ["global"], pwnedPasswordFailClosed: false })
      );
    });

    it("should use optionsOverride values over global options in changePassword", async () => {
      mockOptions = {
        blockedPasswords: ["global"],
        pwnedPasswordFailClosed: false
      } as unknown as AuthOptions<AuthType>;
      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(target, mockDb, mockOptions);

      await target.credentials!.changePassword("1", "old", "new", {
        blockedPasswords: ["override"],
        pwnedPasswordFailClosed: true
      });

      expect(mockChangePassword).toHaveBeenCalledWith(
        "1",
        "old",
        "new",
        expect.objectContaining({ blockedPasswords: ["override"], pwnedPasswordFailClosed: true })
      );
    });

    it("should fall back to global options in changePassword when no override provided", async () => {
      mockOptions = {
        blockedPasswords: ["global"],
        pwnedPasswordFailClosed: true
      } as unknown as AuthOptions<AuthType>;
      const target: Mutable<Partial<IAuthMethods>> = {};
      strategy.register(target, mockDb, mockOptions);

      await target.credentials!.changePassword("1", "old", "new");

      expect(mockChangePassword).toHaveBeenCalledWith(
        "1",
        "old",
        "new",
        expect.objectContaining({ blockedPasswords: ["global"], pwnedPasswordFailClosed: true })
      );
    });
  });
});
