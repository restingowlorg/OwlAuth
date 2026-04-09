import { BcryptAdapter } from "./bcrypt.adapter";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomBytes: jest.fn()
}));

describe("BcryptAdapter", () => {
  let adapter: BcryptAdapter;

  beforeEach(() => {
    adapter = new BcryptAdapter();
    jest.clearAllMocks();
  });

  it("should correctly hash a password", async () => {
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed_pwd");
    const result = await adapter.hashPassword("my_password");
    expect(result).toBe("hashed_pwd");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(bcrypt.hash).toHaveBeenCalledWith("my_password", 10);
  });

  it("should correctly verify a password", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const result = await adapter.verifyPassword("my_password", "hashed_pwd");
    expect(result).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(bcrypt.compare).toHaveBeenCalledWith("my_password", "hashed_pwd");
  });

  it("should return false if verification fails", async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const result = await adapter.verifyPassword("wrong_password", "hashed_pwd");
    expect(result).toBe(false);
  });

  it("should generate a token as a hex string of the correct length", () => {
    (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from("a".repeat(32)));
    const result = adapter.generateToken(32);
    expect(crypto.randomBytes).toHaveBeenCalledWith(32);
    expect(typeof result).toBe("string");
  });

  it("should generate a token with the default length of 32 bytes", () => {
    (crypto.randomBytes as jest.Mock).mockReturnValue(Buffer.from("b".repeat(32)));
    adapter.generateToken();
    expect(crypto.randomBytes).toHaveBeenCalledWith(32);
  });

  it("should hash a token using sha256", async () => {
    const result = await adapter.hashToken("my_token");
    const expected = crypto.createHash("sha256").update("my_token").digest("hex");
    expect(result).toBe(expected);
  });

  it("should return true when token matches hash using sha256", async () => {
    const hash = crypto.createHash("sha256").update("my_token").digest("hex");
    const result = await adapter.verifyToken("my_token", hash);
    expect(result).toBe(true);
  });

  it("should return false when token does not match hash", async () => {
    const hash = crypto.createHash("sha256").update("wrong_token").digest("hex");
    const result = await adapter.verifyToken("my_token", hash);
    expect(result).toBe(false);
  });

  it("should silently return false when token hash is different length to avoid timingSafeEqual throws", async () => {
    const result = await adapter.verifyToken("my_token", "invalid_length_hash");
    expect(result).toBe(false);
  });
});
