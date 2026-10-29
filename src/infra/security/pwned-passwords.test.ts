import * as crypto from "crypto";
import { isBreachedPassword } from "./pwned-passwords";

// Mock dependencies
jest.mock("crypto", () => ({
  createHash: jest.fn()
}));

const mockCreateHash = crypto.createHash as jest.Mock;

describe("isBreachedPassword", () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    const mockDigest = jest.fn().mockReturnValue("default_hash_for_tests");
    const mockUpdate = jest.fn().mockReturnThis();
    mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });
  });

  it("should return detected true if password suffix is found in the API response", async () => {
    const fakeHash = "0123456789abcdef0123456789abcdef01234567";
    const mockDigest = jest.fn().mockReturnValue(fakeHash);
    const mockUpdate = jest.fn().mockReturnThis();
    mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

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
    const fakeHash = "0123456789abcdef0123456789abcdef01234567";
    const mockDigest = jest.fn().mockReturnValue(fakeHash);
    const mockUpdate = jest.fn().mockReturnThis();
    mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

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

    const result = await isBreachedPassword("test", logger);
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("should handle fetch timeout/error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network Error"));

    const result = await isBreachedPassword("test", logger);
    expect(result.detected).toBe(false);
    expect(result.error).toBeDefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Failed to check breached password")
    );
  });

  it("does not require a logger", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network Error"));

    const result = await isBreachedPassword("test");
    expect(result.error).toBeDefined();
  });
});
