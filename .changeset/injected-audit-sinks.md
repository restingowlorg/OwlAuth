---
"@restingowlorg/owlauth": minor
---

Add injected, per-manager audit sinks. Pass `auditSink` to `createAuthManager()` to receive typed authentication events. It can be a function, an `{ emit }` object, or a custom logger with `audit()` (and optionally `info`, `warn` and `error` for diagnostics). Without one, events go to the console as before.

Events are versioned (`version: 1`), have a unique `id`, an ISO `timestamp`, a `category` and an `outcome`, and carry the caller's `correlationId`. They are redacted before delivery and never contain passwords, action tokens, cookies, bearer or refresh tokens, or authorization headers. Key masking now matches fragments regardless of case and separators (so `refresh_token` and `accessToken` are masked), credential-shaped values are masked under any key, and nested metadata is omitted. The full catalogue is exported as `AUTH_AUDIT_EVENTS`. It also reserves types for password recovery, email verification, OIDC identity linking and authenticator changes, which will be emitted once those flows ship.

The sink only observes. It is never awaited, and a sink that throws, rejects or hangs does not change any auth result. Failures go to the new `onAuditSinkError(error, event)` option, or to the diagnostic logger.

`customMaskingKeys` now applies only to the manager it was passed to. Previously, all managers shared one global logger.

Console payload changes: audit lines now include `version`, `id`, `category`, `outcome` and `reason`. On `PASSWORD_CHANGE`, `outcome` replaces `metadata.success`. `PASSWORD_CHANGE` failures are now also recorded for an unknown user and for a fail-closed breached-password check. `LOGIN_SUCCESS` from a password login carries `metadata.method: "password"`.

See `docs/AUDIT_EVENTS.md`, including examples of reacting to events with Owl Session Guard and Owl Token Guard.
