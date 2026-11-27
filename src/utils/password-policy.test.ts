import { zxcvbn } from "@zxcvbn-ts/core";
import { isBreachedPassword } from "../infra/security/pwned-passwords";
import { containsBlockedPasswords } from "./check-blocked-passwords";
import { MAX_PASSWORD_LENGTH, checkNewPassword } from "./password-policy";

jest.mock("@zxcvbn-ts/core");
jest.mock("../infra/security/pwned-passwords");
jest.mock("./check-blocked-passwords");

const PASSWORD = "Correct-Horse-Battery-9";

describe("checkNewPassword", () => {
  const context = { email: "a@b.com", username: "alice" };

  /** The happy path: nothing blocked, strong enough, not breached. */
  function allowEverything(): void {
    (containsBlockedPasswords as jest.Mock).mockReturnValue(false);
    (zxcvbn as jest.Mock).mockReturnValue({ score: 4 });
    (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false });
  }

  beforeEach(() => {
    allowEverything();
  });

  it("accepts a password that passes every check", async () => {
    await expect(checkNewPassword(PASSWORD, context)).resolves.toEqual({ ok: true });
  });

  it("rejects a password longer than the bcrypt limit", async () => {
    const result = await checkNewPassword("a".repeat(MAX_PASSWORD_LENGTH + 1), context);

    expect(result).toEqual({ ok: false, code: "too_long" });
  });

  it("accepts a password exactly at the limit", async () => {
    const result = await checkNewPassword("a".repeat(MAX_PASSWORD_LENGTH), context);

    expect(result).toEqual({ ok: true });
  });

  it("rejects a password containing a blocked term", async () => {
    (containsBlockedPasswords as jest.Mock).mockReturnValue(true);

    await expect(checkNewPassword(PASSWORD, context)).resolves.toEqual({
      ok: false,
      code: "blocked"
    });
  });

  it("passes the identity fields and custom list to the blocked-term check", async () => {
    await checkNewPassword(PASSWORD, { ...context, blockedPasswords: ["owlauth"] });

    expect(containsBlockedPasswords).toHaveBeenCalledWith(PASSWORD, "a@b.com", "alice", [
      "owlauth"
    ]);
  });

  it.each([0, 1, 2])("rejects a password scoring %i", async (score) => {
    (zxcvbn as jest.Mock).mockReturnValue({ score });

    await expect(checkNewPassword(PASSWORD, context)).resolves.toEqual({ ok: false, code: "weak" });
  });

  it("accepts a password at the minimum score", async () => {
    (zxcvbn as jest.Mock).mockReturnValue({ score: 3 });

    await expect(checkNewPassword(PASSWORD, context)).resolves.toEqual({ ok: true });
  });

  it("rejects a breached password", async () => {
    (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: true });

    await expect(checkNewPassword(PASSWORD, context)).resolves.toEqual({
      ok: false,
      code: "breached"
    });
  });

  describe("when the breach lookup itself fails", () => {
    const error = new Error("HIBP unreachable");

    beforeEach(() => {
      (isBreachedPassword as jest.Mock).mockResolvedValue({ detected: false, error });
    });

    it("refuses the password when running fail-closed", async () => {
      const result = await checkNewPassword(PASSWORD, {
        ...context,
        pwnedPasswordFailClosed: true
      });

      expect(result).toEqual({ ok: false, code: "check_unavailable" });
    });

    it("accepts the password but reports the error when running fail-open", async () => {
      const result = await checkNewPassword(PASSWORD, context);

      expect(result).toEqual({ ok: true, breachCheckError: error });
    });
  });

  describe("check order", () => {
    it("rejects on length without consulting the remote breach API", async () => {
      await checkNewPassword("a".repeat(MAX_PASSWORD_LENGTH + 1), context);

      expect(containsBlockedPasswords).not.toHaveBeenCalled();
      expect(zxcvbn).not.toHaveBeenCalled();
      expect(isBreachedPassword).not.toHaveBeenCalled();
    });

    it("rejects a blocked term before scoring or the breach lookup", async () => {
      (containsBlockedPasswords as jest.Mock).mockReturnValue(true);

      await checkNewPassword(PASSWORD, context);

      expect(zxcvbn).not.toHaveBeenCalled();
      expect(isBreachedPassword).not.toHaveBeenCalled();
    });

    it("rejects a weak password before the breach lookup", async () => {
      (zxcvbn as jest.Mock).mockReturnValue({ score: 1 });

      await checkNewPassword(PASSWORD, context);

      expect(isBreachedPassword).not.toHaveBeenCalled();
    });
  });

  it("hands the logger to the breach lookup so transport failures are warned about", async () => {
    const logger = { warn: jest.fn() };

    await checkNewPassword(PASSWORD, context, logger);

    expect(isBreachedPassword).toHaveBeenCalledWith(PASSWORD, logger);
  });
});
