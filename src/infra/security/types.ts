import { AuthAuditEventType } from "../audit/events";

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
  /** Fixes the event's category and outcome; every type has exactly one outcome. */
  type: AuthAuditEventType;
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
