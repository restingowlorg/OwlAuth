export interface ICryptoAdapter {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(length?: number): string;
  hashToken(token: string): Promise<string>;
  verifyToken(token: string, hash: string): Promise<boolean>;
}

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "SIGNUP"
  | "SIGNUP_FAILURE"
  | "PASSWORD_CHANGE"
  | "MAGIC_LINK_REQUESTED"
  | "MAGIC_LINK_VERIFIED"
  | "MAGIC_LINK_CONSUMED"
  | "MAGIC_LINK_FAILURE";

export type SecurityEvent = {
  type: SecurityEventType;
  userId?: string | number;
  email?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

export interface IAuditLogger {
  info(message: string, context?: unknown, correlationId?: string): void;
  warn(message: string, context?: unknown, correlationId?: string): void;
  error(message: string, error: unknown, context?: unknown, correlationId?: string): void;
  audit(event: SecurityEvent): void;
}
