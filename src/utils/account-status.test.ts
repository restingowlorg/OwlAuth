import { isAuthenticationPermitted } from "./account-status";
import { ACCOUNT_STATUSES } from "../repositories/contracts";

describe("isAuthenticationPermitted", () => {
  it("permits an active account", () => {
    expect(isAuthenticationPermitted("active")).toBe(true);
  });

  it("permits an account awaiting email verification", () => {
    expect(isAuthenticationPermitted("pending_email_verification")).toBe(true);
  });

  it("blocks a disabled account", () => {
    expect(isAuthenticationPermitted("disabled")).toBe(false);
  });

  // A column with no CHECK constraint accepts any string. These are the values that
  // would previously have been treated as permitted because they do not equal "disabled".
  it.each([
    ["a misspelled status", "disable"],
    ["an uppercase status", "DISABLED"],
    ["a mixed-case status", "Disabled"],
    ["a padded status", " disabled "],
    ["an unrelated value", "banned"],
    ["an empty string", ""]
  ])("blocks %s", (_label, status) => {
    expect(isAuthenticationPermitted(status)).toBe(false);
  });

  it("covers every declared status", () => {
    // Guards against a status being added to the type without a deliberate decision
    // about whether it permits authentication.
    const decided = ACCOUNT_STATUSES.map((status) => ({
      status,
      permitted: isAuthenticationPermitted(status)
    }));

    expect(decided).toEqual([
      { status: "active", permitted: true },
      { status: "pending_email_verification", permitted: true },
      { status: "disabled", permitted: false }
    ]);
  });
});
