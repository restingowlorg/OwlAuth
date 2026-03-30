import { BcryptAdapter } from "./bcrypt.adapter";
import * as bcrypt from "bcryptjs";

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn()
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
});
