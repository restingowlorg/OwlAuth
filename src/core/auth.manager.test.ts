import { createAuthManager } from "./auth.manager";
import type { AccountSecurityRepository, AuthDB, UserRepository } from "../repositories/contracts";
import type { AuthOptions, AuthType } from "./types";
import type { IDatabaseAdapter } from "../infra/databases/types";

describe("createAuthManager connection lifetime", () => {
  let close: jest.Mock<Promise<void>, []>;

  function buildAdapter(db: Partial<AuthDB>): IDatabaseAdapter {
    return {
      connect: jest.fn<Promise<AuthDB>, [AuthOptions<AuthType>]>().mockResolvedValue({
        userRepo: {} as UserRepository,
        close,
        ...db
      } as AuthDB)
    } as unknown as IDatabaseAdapter;
  }

  function buildOptions(
    adapter: IDatabaseAdapter,
    accountSecurity?: boolean
  ): AuthOptions<AuthType> {
    return {
      adapter,
      authTypes: ["credentials"],
      accountSecurity
    };
  }

  beforeEach(() => {
    close = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  });

  // The adapter is already connected when a configuration guard throws, so a caller that
  // catches and retries would otherwise leak one pool or socket per attempt.
  it("closes the adapter when service initialisation throws", async () => {
    const adapter = buildAdapter({ accountSecurityRepo: undefined });

    await expect(createAuthManager(buildOptions(adapter, true))).rejects.toThrow(
      "accountSecurity is enabled but the adapter did not provide an account security repository"
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("surfaces the original error even when closing the adapter fails", async () => {
    close.mockRejectedValue(new Error("pool already destroyed"));
    const adapter = buildAdapter({ accountSecurityRepo: undefined });

    await expect(createAuthManager(buildOptions(adapter, true))).rejects.toThrow(
      "accountSecurity is enabled but the adapter did not provide an account security repository"
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes the adapter when a strategy rejects its configuration", async () => {
    // magicLink without a magic link repository throws from inside the strategy, a path
    // that predates the account security guard.
    const adapter = buildAdapter({ magicLinkRepo: undefined });
    const options: AuthOptions<AuthType> = {
      adapter,
      authTypes: ["magicLink"]
    };

    await expect(createAuthManager(options)).rejects.toThrow(
      "MagicLinkRepository is required for MagicLinkAuthStrategy"
    );

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the connection open on a successful initialisation", async () => {
    const adapter = buildAdapter({
      accountSecurityRepo: {} as AccountSecurityRepository
    });

    const auth = await createAuthManager(buildOptions(adapter, true));

    expect(close).not.toHaveBeenCalled();
    expect(auth.disconnectDB).toBeDefined();
  });

  it("exposes the adapter close as disconnectDB", async () => {
    const adapter = buildAdapter({});

    const auth = await createAuthManager(buildOptions(adapter));
    await auth.disconnectDB();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not connect when no adapter is supplied", async () => {
    await expect(
      createAuthManager({ authTypes: ["credentials"] } as unknown as AuthOptions<AuthType>)
    ).rejects.toThrow("Database adapter is required");

    expect(close).not.toHaveBeenCalled();
  });
});
