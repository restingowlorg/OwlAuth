import { initAuthServices } from "./auth.service.init";
import type { AuthDB } from "../repositories/contracts";
import type { AuthOptions, AuthType } from "./types";

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

describe("initAuthServices zxcvbn configuration", () => {
  it("configures zxcvbn dictionaries only once", () => {
    jest.resetModules();

    const setOptions = jest.fn<void, [unknown]>();

    jest.doMock("@zxcvbn-ts/core", () => ({
      zxcvbnOptions: { setOptions }
    }));

    jest.doMock("@zxcvbn-ts/language-common", () => ({
      dictionary: { passwords: ["password"] },
      adjacencyGraphs: { qwerty: {} }
    }));

    jest.doMock("@zxcvbn-ts/language-en", () => ({
      dictionary: { userInputs: ["user"] }
    }));

    const { initAuthServices } =
      jest.requireActual<typeof import("./auth.service.init")>("./auth.service.init");

    const db: AuthDB = {
      userRepo: {} as AuthDB["userRepo"],
      close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
    };

    const options: AuthOptions<AuthType> = {
      adapter: {} as AuthOptions<AuthType>["adapter"],
      authTypes: []
    };

    initAuthServices(db, options);
    initAuthServices(db, options);

    expect(setOptions).toHaveBeenCalledTimes(1);

    const firstCallArg = setOptions.mock.calls[0]?.[0];
    expect(isObjectRecord(firstCallArg)).toBe(true);

    if (!isObjectRecord(firstCallArg)) {
      throw new Error("Expected zxcvbnOptions.setOptions to be called with an object");
    }

    const dictionary = firstCallArg["dictionary"];
    const graphs = firstCallArg["graphs"];

    expect(isObjectRecord(dictionary)).toBe(true);
    expect(isObjectRecord(graphs)).toBe(true);

    if (!isObjectRecord(dictionary) || !isObjectRecord(graphs)) {
      throw new Error("Expected dictionary and graphs to be configured");
    }

    expect(dictionary["passwords"]).toEqual(["password"]);
    expect(dictionary["userInputs"]).toEqual(["user"]);
    expect(isObjectRecord(graphs["qwerty"])).toBe(true);
  });
});

describe("initAuthServices account security configuration", () => {
  function buildDb(accountSecurityRepo?: AuthDB["accountSecurityRepo"]): AuthDB {
    return {
      userRepo: {} as AuthDB["userRepo"],
      accountSecurityRepo,
      close: jest.fn<Promise<void>, []>().mockResolvedValue(undefined)
    };
  }

  function buildOptions(accountSecurity?: boolean): AuthOptions<AuthType> {
    return {
      adapter: {} as AuthOptions<AuthType>["adapter"],
      authTypes: [],
      accountSecurity
    };
  }

  // The repository field is optional for backward compatibility, so an enabled feature with
  // no repository would otherwise start up enforcing nothing at all.
  it("throws when the feature is enabled but the adapter provided no repository", () => {
    expect(() => initAuthServices(buildDb(undefined), buildOptions(true))).toThrow(
      "accountSecurity is enabled but the adapter did not provide an account security repository"
    );
  });

  it("names the configuration a caller needs to fix", () => {
    expect(() => initAuthServices(buildDb(undefined), buildOptions(true))).toThrow(
      /accountSecurityTableName.*accountSecurityCollectionName/s
    );
  });

  it("accepts an enabled feature when the adapter provided a repository", () => {
    const repo = {} as NonNullable<AuthDB["accountSecurityRepo"]>;

    expect(() => initAuthServices(buildDb(repo), buildOptions(true))).not.toThrow();
  });

  it.each([
    ["disabled", false],
    ["absent", undefined]
  ])("does not require a repository when the feature is %s", (_label, accountSecurity) => {
    expect(() => initAuthServices(buildDb(undefined), buildOptions(accountSecurity))).not.toThrow();
  });
});
