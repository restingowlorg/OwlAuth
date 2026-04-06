import { MagicLinkService } from "./magic-link.service";
import {
  UserRepository,
  MagicLinkRepository,
  MagicLinkToken,
  User
} from "../repositories/contracts";
import { IAuditLogger, ICryptoAdapter } from "../infra/security/types";

describe("MagicLinkService", () => {
  let service: MagicLinkService;
  let mockUserRepo: jest.Mocked<UserRepository>;
  let mockMagicLinkRepo: jest.Mocked<MagicLinkRepository>;
  let mockCrypto: jest.Mocked<ICryptoAdapter>;
  let mockLogger: jest.Mocked<IAuditLogger>;

  beforeEach(() => {
    mockUserRepo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByUsername: jest.fn(),
      create: jest.fn(),
      updatePassword: jest.fn()
    };

    mockMagicLinkRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      consume: jest.fn(),
      invalidateByUserId: jest.fn(),
      deleteByUserId: jest.fn()
    };

    mockCrypto = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      generateToken: jest.fn(),
      hashToken: jest.fn(),
      verifyToken: jest.fn()
    };

    mockLogger = {
      audit: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    service = new MagicLinkService(mockUserRepo, mockMagicLinkRepo, mockCrypto, mockLogger);
  });

  describe("request", () => {
    const email = "test@example.com";

    it("should successfully request a magic link", async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: "1", email } as unknown as User);
      mockMagicLinkRepo.invalidateByUserId.mockResolvedValue(true);
      mockCrypto.generateToken.mockReturnValue("raw_token");
      (mockCrypto.hashToken as jest.Mock).mockResolvedValue("hashed_token");
      mockMagicLinkRepo.create.mockResolvedValue({ id: "link1" } as unknown as MagicLinkToken);

      const result = await service.request(email);

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data).toBe("link1.raw_token");
      }
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_REQUESTED" })
      );
    });

    it("should return a neutral 200 response when user not found (anti-enumeration)", async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);
      const result = await service.request(email);
      expect(result.success).toBe(true);
      expect(result.httpCode).toBe(200);
      if (result.success) {
        expect(result.data).toBe("");
        expect(result.message).toBe("If this email is registered, a magic link has been sent.");
      }
    });

    it("should fail if invalidation fails", async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: "1", email } as unknown as User);
      mockMagicLinkRepo.invalidateByUserId.mockResolvedValue(false);
      const result = await service.request(email);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(500);
    });

    it("should fail if creation fails", async () => {
      mockUserRepo.findByEmail.mockResolvedValue({ id: "1", email } as unknown as User);
      mockMagicLinkRepo.invalidateByUserId.mockResolvedValue(true);
      mockCrypto.generateToken.mockReturnValue("t");
      (mockCrypto.hashToken as jest.Mock).mockResolvedValue("ht");
      (mockMagicLinkRepo.create as jest.Mock).mockResolvedValue(null);
      const result = await service.request(email);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(500);
    });

    it("should propagate correlationId to auditLogger and error logs during request", async () => {
      const correlationId = "magic-req-id";
      mockUserRepo.findByEmail.mockResolvedValue({ id: "1", email } as unknown as User);
      mockMagicLinkRepo.invalidateByUserId.mockResolvedValue(true);
      mockCrypto.generateToken.mockReturnValue("t");
      (mockCrypto.hashToken as jest.Mock).mockResolvedValue("ht");
      mockMagicLinkRepo.create.mockResolvedValue({ id: "l" } as unknown as MagicLinkToken);

      // 1. Audit log on success
      await service.request(email, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_REQUESTED", correlationId })
      );

      // 2. Error log on exception
      const error = new Error("DB Error");
      mockUserRepo.findByEmail.mockRejectedValue(error);
      await service.request(email, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Magic link request exception",
        error,
        { email },
        correlationId
      );
    });

    it("should return a full URL when magicLinkBaseUrl is configured", async () => {
      const serviceWithUrl = new MagicLinkService(
        mockUserRepo,
        mockMagicLinkRepo,
        mockCrypto,
        mockLogger,
        "https://example.com/auth/verify"
      );

      mockUserRepo.findByEmail.mockResolvedValue({ id: "1", email } as unknown as User);
      mockMagicLinkRepo.invalidateByUserId.mockResolvedValue(true);
      mockCrypto.generateToken.mockReturnValue("raw_token");
      (mockCrypto.hashToken as jest.Mock).mockResolvedValue("hashed_token");
      mockMagicLinkRepo.create.mockResolvedValue({ id: "link1" } as unknown as MagicLinkToken);

      const result = await serviceWithUrl.request(email);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("https://example.com/auth/verify?token=link1.raw_token");
      }
    });
  });

  describe("verify", () => {
    it("should successfully verify a token", async () => {
      const token = "link1.raw_token";
      mockMagicLinkRepo.findById.mockResolvedValue({
        id: "link1",
        userId: "1",
        tokenHash: "hashed_token",
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null
      } as unknown as MagicLinkToken);
      mockCrypto.verifyToken.mockResolvedValue(true);

      const result = await service.verify(token);
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.userId).toBe("1");
      }
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_VERIFIED" })
      );
    });

    it("should fail if token is malformed", async () => {
      const result = await service.verify("invalid_token");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(400);
    });

    it("should fail if record not found", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue(null);
      const result = await service.verify("link1.t");
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should fail if token expired", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue({
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null
      } as unknown as MagicLinkToken);
      const result = await service.verify("link1.t");
      expect(result.success).toBe(false);
      expect(result.message).toContain("expired");
    });

    it("should fail if token already used", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue({
        expiresAt: new Date(Date.now() + 1000),
        usedAt: new Date()
      } as unknown as MagicLinkToken);
      const result = await service.verify("link1.t");
      expect(result.success).toBe(false);
      expect(result.message).toContain("expired"); // Service message is same for both
    });

    it("should propagate correlationId to auditLogger and error logs during verification", async () => {
      const token = "link1.raw_token";
      const correlationId = "magic-verify-id";

      // 1. Audit log on failure
      mockMagicLinkRepo.findById.mockResolvedValue(null);
      await service.verify(token, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_FAILURE", correlationId })
      );

      // 2. Error log on exception
      const error = new Error("DB Error");
      mockMagicLinkRepo.findById.mockRejectedValue(error);
      await service.verify(token, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Magic link verify exception",
        error,
        undefined,
        correlationId
      );
    });

    it("should fail with 401 when token hash does not match", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue({
        id: "link1",
        userId: "1",
        tokenHash: "hashed_token",
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null
      } as unknown as MagicLinkToken);
      mockCrypto.verifyToken.mockResolvedValue(false);

      const result = await service.verify("link1.raw_token");

      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });
  });

  describe("consume", () => {
    const token = "link1.raw_token";

    it("should successfully consume a token", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue({
        id: "link1",
        userId: "123",
        tokenHash: "ht",
        expiresAt: new Date(Date.now() + 1000),
        usedAt: null
      } as unknown as MagicLinkToken);
      mockCrypto.verifyToken.mockResolvedValue(true);
      mockMagicLinkRepo.consume.mockResolvedValue(true);

      const result = await service.consume(token);
      expect(result.success).toBe(true);
      if (result.success && result.data) {
        expect(result.data.userId).toBe("123");
      }
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockMagicLinkRepo.consume).toHaveBeenCalledWith("link1");
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_CONSUMED" })
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "LOGIN_SUCCESS", metadata: { method: "magic-link" } })
      );
    });

    it("should fail if verification fails", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue(null);
      const result = await service.consume(token);
      expect(result.success).toBe(false);
    });

    it("should fail if consume fails", async () => {
      mockMagicLinkRepo.findById.mockResolvedValue({
        id: "link1",
        userId: "123",
        expiresAt: new Date(Date.now() + 1000),
        usedAt: null
      } as unknown as MagicLinkToken);
      mockCrypto.verifyToken.mockResolvedValue(true);
      mockMagicLinkRepo.consume.mockResolvedValue(false);

      const result = await service.consume(token);
      expect(result.success).toBe(false);
      expect(result.httpCode).toBe(401);
    });

    it("should propagate correlationId to auditLogger and error logs during consumption", async () => {
      const token = "link1.raw_token";
      const correlationId = "magic-consume-id";

      // 1. Audit log on failure
      mockMagicLinkRepo.findById.mockResolvedValue(null);
      await service.consume(token, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.audit).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MAGIC_LINK_FAILURE", correlationId })
      );

      // 2. Error log on exception (test consume's own catch block)
      mockMagicLinkRepo.findById.mockResolvedValue({
        id: "link1",
        userId: "123",
        tokenHash: "ht",
        expiresAt: new Date(Date.now() + 1000),
        usedAt: null
      } as unknown as MagicLinkToken);
      mockCrypto.verifyToken.mockResolvedValue(true);
      const error = new Error("DB Error on Consume");
      mockMagicLinkRepo.consume.mockRejectedValue(error);

      await service.consume(token, { correlationId });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Magic link consume exception",
        error,
        undefined,
        correlationId
      );
    });
  });
});
