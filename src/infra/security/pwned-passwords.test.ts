import { isBreachedPassword } from "./pwned-passwords";
import { auditLogger } from "./security-audit-logger";
import { sha1 } from "js-sha1";

// Mock dependencies
jest.mock("./security-audit-logger", () => ({
  auditLogger: {
    warn: jest.fn()
  }
}));

jest.mock("js-sha1", () => ({
  sha1: jest.fn()
}));

describe("isBreachedPassword", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    (sha1 as unknown as jest.Mock).mockReturnValue("DEFAULT_HASH_FOR_TESTS");
  });

  it("should return detected true if password suffix is found in the API response", async () => {
    const fakeHash = "0123456789ABCDEF0123456789ABCDEF01234567";
    (sha1 as unknown as jest.Mock).mockReturnValue(fakeHash);

    const suffix = "56789ABCDEF0123456789ABCDEF01234567";
    const mockResponse = `${suffix}:10\nOTHERHASH:5\n`;

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockResponse)
    });

    const result = await isBreachedPassword("any_password");
    expect(result.detected).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("01234"), expect.any(Object));
  });

  it("should return detected false if password suffix is NOT found", async () => {
    (sha1 as unknown as jest.Mock).mockReturnValue("0123456789ABCDEF0123456789ABCDEF01234567");
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("OTHERHASH:10\n")
    });

    const result = await isBreachedPassword("secure_password");
    expect(result.detected).toBe(false);
  });

  it("should handle API error and return error object", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500
    });

    const result = await isBreachedPassword("test");
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(auditLogger.warn).toHaveBeenCalled();
  });

  it("should handle fetch timeout/error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network Error"));

    const result = await isBreachedPassword("test");
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(auditLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to check breached password")
    );
  });
});
