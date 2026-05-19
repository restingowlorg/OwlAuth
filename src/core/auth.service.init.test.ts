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
