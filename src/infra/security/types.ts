import { AuthAuditEventType, AuthAuditOutcome } from "../audit/events";

export interface ICryptoAdapter {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  generateToken(length?: number): string;
  hashToken(token: string): Promise<string>;
  verifyToken(token: string, hash: string): Promise<boolean>;
}

/** @deprecated Use `AuthAuditEventType`. */
export type SecurityEventType = AuthAuditEventType;

/**
 * What a service records. The auditor turns it into a versioned {@link AuthAuditEvent}
 * (adding id, timestamp, category and outcome, and redacting) before any sink sees it.
 */
export type SecurityEvent = {
  type: AuthAuditEventType;
  /** Overrides the type's default outcome, for types that cover both. */
  outcome?: AuthAuditOutcome;
  userId?: string | number;
  email?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  /** Present on events produced by the auditor; ignored on input. */
  timestamp?: string;
};

export interface IAuditLogger {
  info(message: string, context?: unknown, correlationId?: string): void;
  warn(message: string, context?: unknown, correlationId?: string): void;
  error(message: string, error: unknown, context?: unknown, correlationId?: string): void;
  audit(event: SecurityEvent): void;
}
