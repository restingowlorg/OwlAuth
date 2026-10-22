/**
 * Version of the {@link AuthAuditEvent} shape. Bumped only for a breaking change to the
 * envelope; adding an event type or an optional field is not breaking.
 */
export const AUTH_AUDIT_EVENT_VERSION = 1;

export type AuthAuditEventCategory =
  | "signup"
  | "login"
  | "password"
  | "magic_link"
  | "recovery"
  | "email_verification"
  | "oidc"
  | "authenticator";

export type AuthAuditOutcome = "success" | "failure";

/**
 * Every event type OwlAuth can emit, with its category and outcome. Each type has exactly
 * one outcome, so a sink can act on `type` alone without also checking `outcome`.
 *
 * Types for recovery, email verification, OIDC identity linking and authenticator changes
 * are reserved so that sinks can be written against the full catalogue now; they are
 * emitted once the corresponding flows ship.
 */
export const AUTH_AUDIT_EVENTS = {
  SIGNUP: { category: "signup", outcome: "success" },
  SIGNUP_FAILURE: { category: "signup", outcome: "failure" },

  LOGIN_SUCCESS: { category: "login", outcome: "success" },
  LOGIN_FAILURE: { category: "login", outcome: "failure" },

  PASSWORD_CHANGE: { category: "password", outcome: "success" },
  PASSWORD_CHANGE_FAILURE: { category: "password", outcome: "failure" },
  // Outstanding magic links invalidated after a credential change. OwlAuth holds no
  // application sessions; react to this event to revoke them in Owl Session Guard.
  SESSION_INVALIDATION: { category: "password", outcome: "success" },

  MAGIC_LINK_REQUESTED: { category: "magic_link", outcome: "success" },
  MAGIC_LINK_VERIFIED: { category: "magic_link", outcome: "success" },
  MAGIC_LINK_CONSUMED: { category: "magic_link", outcome: "success" },
  MAGIC_LINK_FAILURE: { category: "magic_link", outcome: "failure" },

  PASSWORD_RECOVERY_REQUESTED: { category: "recovery", outcome: "success" },
  PASSWORD_RECOVERY_COMPLETED: { category: "recovery", outcome: "success" },
  PASSWORD_RECOVERY_FAILURE: { category: "recovery", outcome: "failure" },

  EMAIL_VERIFICATION_REQUESTED: { category: "email_verification", outcome: "success" },
  EMAIL_VERIFIED: { category: "email_verification", outcome: "success" },
  EMAIL_VERIFICATION_FAILURE: { category: "email_verification", outcome: "failure" },

  OIDC_IDENTITY_LINKED: { category: "oidc", outcome: "success" },
  OIDC_IDENTITY_UNLINKED: { category: "oidc", outcome: "success" },
  OIDC_IDENTITY_LINK_FAILURE: { category: "oidc", outcome: "failure" },

  AUTHENTICATOR_ENROLLED: { category: "authenticator", outcome: "success" },
  AUTHENTICATOR_REMOVED: { category: "authenticator", outcome: "success" },
  AUTHENTICATOR_CHANGE_FAILURE: { category: "authenticator", outcome: "failure" }
} as const satisfies Record<
  string,
  { category: AuthAuditEventCategory; outcome: AuthAuditOutcome }
>;

export type AuthAuditEventType = keyof typeof AUTH_AUDIT_EVENTS;

export type AuthAuditMetadataValue = string | number | boolean | null;

/**
 * A typed, versioned authentication event as delivered to an audit sink.
 *
 * Emitted after the OwlAuth database action it describes has completed, and redacted
 * before delivery: it never carries passwords, magic-link or other action tokens, cookies,
 * bearer or refresh tokens, or authorization headers.
 *
 * Structurally compatible with the `audit(event)` method of a custom logger, so an
 * existing `{ audit, info, warn, error }` logger can be passed as a sink unchanged.
 */
export type AuthAuditEvent = {
  readonly version: typeof AUTH_AUDIT_EVENT_VERSION;
  /** Unique per event. */
  readonly id: string;
  readonly type: AuthAuditEventType;
  readonly category: AuthAuditEventCategory;
  readonly outcome: AuthAuditOutcome;
  /** ISO-8601, taken when the event is emitted. */
  readonly timestamp: string;
  /** The `correlationId` passed to the auth method, when one was supplied. */
  readonly correlationId?: string;
  readonly userId?: string;
  readonly email?: string;
  /** Why a failure happened, or a short qualifier for a success. */
  readonly reason?: string;
  readonly metadata?: Readonly<Record<string, AuthAuditMetadataValue>>;
};
