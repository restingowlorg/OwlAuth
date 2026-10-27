# Authentication Audit Events

OwlAuth reports what happened during each authentication operation as a typed, versioned event delivered to an **audit sink** you supply. Each auth manager has its own sink, and its own masking keys. Nothing is shared between managers, and OwlAuth keeps no global logger.

Without a sink, events go to the console, as they did before sinks existed.

## Supplying a sink

```ts
import { createAuthManager, AuthAuditEvent } from "@restingowlorg/owlauth";

const auth = await createAuthManager({
  adapter,
  authTypes: ["credentials", "magicLink"],
  customMaskingKeys: ["ssn"],
  auditSink: (event: AuthAuditEvent) => siem.send(event),
  onAuditSinkError: (error, event) => metrics.increment("owlauth.audit_sink_failure")
});
```

`auditSink` accepts any of these:

| Form          | Example                                    | Receives                                                                                                                                              |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Function      | `(event) => queue.push(event)`             | Every event.                                                                                                                                          |
| Emitter       | `{ emit: (event) => bus.publish(event) }`  | Every event.                                                                                                                                          |
| Custom logger | `{ audit, info?, warn?, error? }` instance | Events go to `audit()`. Any of `info`, `warn` or `error` it has also receive OwlAuth's diagnostics, already masked. Any it lacks stay on the console. |

An object with `audit()` is always treated as a custom logger, even if it also has `emit()`. Winston, pino and other stream-based loggers inherit `emit` from `EventEmitter`, so they work as loggers. Only the custom-logger form receives diagnostics; a function or an emitter leaves them on the console.

Omitting `auditSink` selects the console. Any other value that is not one of these forms, including `null`, `false` or an empty string, fails `createAuthManager()` with a `TypeError`, so a configuration that resolved to nothing cannot quietly redirect events. `onAuditSinkError` must be a function when given.

The default console adapter is exported as `ConsoleAuditLogger`, so it can be combined with your own sink:

```ts
import { ConsoleAuditLogger } from "@restingowlorg/owlauth";

const consoleAudit = new ConsoleAuditLogger(["ssn"]);
const auditSink = (event: AuthAuditEvent) => {
  consoleAudit.audit(event);
  // Return the promise so a rejected send reaches onAuditSinkError.
  return siem.send(event);
};
```

Return any promise your sink starts, or make the sink `async` and `await` it. A promise the sink drops cannot be reported to `onAuditSinkError`, and its rejection may go unhandled. Returning it does not make OwlAuth wait for delivery.

## Event shape

```ts
type AuthAuditEvent = {
  version: 1; // AUTH_AUDIT_EVENT_VERSION
  id: string; // unique per event (UUID)
  type: AuthAuditEventType; // e.g. "LOGIN_FAILURE"
  category: AuthAuditEventCategory; // e.g. "login"
  outcome: "success" | "failure";
  timestamp: string; // ISO-8601
  correlationId?: string; // the correlationId passed to the auth method
  userId?: string;
  email?: string;
  reason?: string; // why it failed, e.g. "Invalid password"
  metadata?: Record<string, string | number | boolean | null>;
};
```

Events are frozen. `version` changes only for a breaking change to this shape. Adding a new event type or a new optional field is not breaking, so sinks should ignore types they do not recognise.

To link the events from one request, pass the same `correlationId` to the auth method, for example `auth.credentials.login(email, password, { correlationId: req.id })`. Every event that call produces carries it.

## Event catalogue

`AUTH_AUDIT_EVENTS` is exported, and maps each type to its category and outcome. Every type has exactly one outcome, so a sink can act on `type` alone.

| Category             | Types                                                                                      | Emitted by                                     |
| -------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `signup`             | `SIGNUP`, `SIGNUP_FAILURE`                                                                 | `credentials.signup()`                         |
| `login`              | `LOGIN_SUCCESS`, `LOGIN_FAILURE`                                                           | `credentials.login()`, `magicLink.consume()`   |
| `password`           | `PASSWORD_CHANGE`, `PASSWORD_CHANGE_FAILURE`, `SESSION_INVALIDATION`                       | `credentials.changePassword()`                 |
| `magic_link`         | `MAGIC_LINK_REQUESTED`, `MAGIC_LINK_VERIFIED`, `MAGIC_LINK_CONSUMED`, `MAGIC_LINK_FAILURE` | `magicLink.request()`, `verify()`, `consume()` |
| `recovery`           | `PASSWORD_RECOVERY_REQUESTED`, `PASSWORD_RECOVERY_COMPLETED`, `PASSWORD_RECOVERY_FAILURE`  | Reserved for password recovery                 |
| `email_verification` | `EMAIL_VERIFICATION_REQUESTED`, `EMAIL_VERIFIED`, `EMAIL_VERIFICATION_FAILURE`             | Reserved for email verification                |
| `oidc`               | `OIDC_IDENTITY_LINKED`, `OIDC_IDENTITY_UNLINKED`, `OIDC_IDENTITY_LINK_FAILURE`             | Reserved for OIDC identity linking             |
| `authenticator`      | `AUTHENTICATOR_ENROLLED`, `AUTHENTICATOR_REMOVED`, `AUTHENTICATOR_CHANGE_FAILURE`          | Reserved for MFA and passkey authenticators    |

Reserved types are already in the type union, so a sink can handle them now. OwlAuth starts emitting each one when its flow ships.

Useful metadata:

- `LOGIN_SUCCESS` carries `method`: `"password"` or `"magic-link"`.
- A successful `PASSWORD_CHANGE` carries `magicLinksInvalidated`.
- `SESSION_INVALIDATION` means OwlAuth invalidated the user's outstanding magic links. OwlAuth holds no application sessions. Revoking those is up to your application (see below).
- Operational failures are reported too. When a repository or crypto adapter throws, or a write does not complete, the method still returns its usual 500 result and emits the failure type for its flow (`SIGNUP_FAILURE`, `LOGIN_FAILURE`, `PASSWORD_CHANGE_FAILURE` or `MAGIC_LINK_FAILURE`). The `reason` is fixed text such as `"Internal error"` or `"Password update failed"`. The underlying error goes only to the diagnostic logger.
- `MAGIC_LINK_FAILURE` from `magicLink.request()` carries the requested `email`, so failures can be counted per account. Mask it with `customMaskingKeys: ["email"]` if your sink must not hold addresses.

## What is never in an event

Events never contain passwords, magic-link or other action tokens, cookies, bearer or refresh tokens, or authorization headers. OwlAuth enforces this in three layers before any sink sees an event:

1. Services never put credentials into events.
2. Metadata keys containing `password`, `passwd`, `token`, `secret`, `authorization`, `cookie`, `apikey` or `bearer` are masked as `********`. Matching ignores case and separators, so `refresh_token`, `accessToken` and `Set-Cookie` are all masked. Keys in `customMaskingKeys` are masked too, matched exactly but ignoring case and separators. They also apply to the top-level `email` and `userId`, so `customMaskingKeys: ["email"]` keeps addresses out of every event. Masking `userId` also means a sink can no longer tell which user an event is about.
3. Values shaped like credentials are masked whatever key they sit under, and wherever they appear in the string. That covers compact JWTs, and any non-empty value after `Bearer` or `Basic` (in any case), because the scheme itself marks that value as a credential. Prose that happens to follow those words is masked too, so "Missing bearer token" is logged as "Missing **\*\*\*\***". In `reason` and metadata strings only the credential is replaced. A credential-shaped `correlationId`, `email` or `userId` is replaced whole. Nested objects and arrays are replaced with `"[Omitted]"`, so a credential cannot hide under a key OwlAuth has never seen.

The same masking applies to diagnostics, on the console and in a custom logger: sensitive keys, and credential-shaped text in messages, context values, error messages, stacks and correlation IDs.

Shape detection has limits. OwlAuth cannot recognise an arbitrary opaque secret, such as an API key or a random session ID, by its value. Do not pass secrets as a `correlationId`, and if you add your own keys that carry secrets, list them in `customMaskingKeys`.

## Timing and failure behaviour

- **Emitted after the database action.** A success event is emitted only after OwlAuth's write has completed: the user created, the link stored, the link consumed, or the password updated.
- **Never awaited.** OwlAuth calls the sink and carries on without waiting for any promise it returns, so slow I/O in a sink does not slow authentication. The sink is still called synchronously, so keep it quick: hand the event to a queue or an async call instead of doing heavy work inline.
- **Diagnostics are isolated too.** If a custom logger's `info`, `warn` or `error` throws or rejects, the error is discarded. Auth results never depend on it. The same applies if OwlAuth fails to build an event: the event is dropped and the failure is logged.
- **Failures are isolated.** If the sink throws, or returns a promise that rejects, the error goes to `onAuditSinkError(error, event)`. Without that handler, it goes to the diagnostic logger's `error()`. The handler may be `async`. Anything it throws or rejects with is discarded, as is a failure of the diagnostic logger here.
- **Results are deterministic.** A sink that fails, hangs or succeeds produces the same auth result, with the same `success`, `message`, `httpCode` and `data`.
- **Best-effort delivery.** OwlAuth does not await, retry or buffer events, and emitting an event is not part of the database transaction. A process crash, or a send that fails, can lose an event even when the destination is durable: a durable queue protects an event only once it has acknowledged it. Stronger guarantees need a coordinated design, such as a transactional outbox written in the same transaction as the auth change. Keep security-critical steps, such as revoking sessions, in an explicit application workflow rather than in an event reaction.

## Reacting to events with Owl Session Guard and Owl Token Guard

A sink **observes**. OwlAuth never creates or revokes sessions, and never issues or terminates application tokens, from a sink or anywhere else. Your application owns those decisions and can make them in response to events.

> The Session Guard and Token Guard method names below are illustrative. Use the equivalent calls from the versions you have installed.

```ts
import { createAuthManager, AuthAuditEvent } from "@restingowlorg/owlauth";
import { sessionGuard } from "./session-guard"; // your Owl Session Guard instance
import { tokenGuard } from "./token-guard"; // your Owl Token Guard instance

async function onAuthEvent(event: AuthAuditEvent): Promise<void> {
  if (event.outcome !== "success" || !event.userId) return;

  switch (event.type) {
    // The user's credentials changed: end every existing session and token.
    case "PASSWORD_CHANGE":
    case "PASSWORD_RECOVERY_COMPLETED":
      await sessionGuard.revokeAllSessionsForUser(event.userId);
      await tokenGuard.revokeAllTokensForSubject(event.userId);
      break;

    // A second factor was added or removed: require fresh tokens.
    case "AUTHENTICATOR_ENROLLED":
    case "AUTHENTICATOR_REMOVED":
      await tokenGuard.requireFreshAuthentication(event.userId);
      break;
  }
}

const auth = await createAuthManager({
  adapter,
  auditSink: (event) => onAuthEvent(event),
  // Failures land here, never in the auth result.
  onAuditSinkError: (error, event) =>
    logger.error({ error, eventId: event.id }, "auth reaction failed")
});
```

Use events for **reactions** like these, which can run alongside the request. **Do not** use them for steps the request depends on. For example, create the session after a login in the request handler, from the returned result:

```ts
app.post("/login", async (req, res) => {
  const result = await auth.credentials.login(req.body.email, req.body.password, {
    correlationId: req.id
  });
  if (!result.success) return res.status(result.httpCode).json({ message: result.message });

  const session = await sessionGuard.createSession(result.data.user.id, req); // the application decides
  res.cookie("sid", session.id, { httpOnly: true, secure: true, sameSite: "lax" });
  res.status(200).json({ user: result.data.user });
});
```

Delivery is best-effort, so a revocation that must happen before the response returns belongs in the handler too. For example, call `revokeAllSessionsForUser()` right after a successful `changePassword()` result. Event reactions should be idempotent, so running one twice does no harm.

## Upgrading from console-only logging

You do not need to change anything. With no `auditSink`, events still go to the console with the `OWL-AUTH [AUDIT]` prefix. The payload now includes `version`, `id`, `category`, `outcome` and `reason`. Failed password changes are now `PASSWORD_CHANGE_FAILURE` rather than `PASSWORD_CHANGE` with `metadata.success: false`; a successful change is still `PASSWORD_CHANGE`.

`customMaskingKeys` now applies only to the manager it was passed to. Previously, every manager in the process shared one global logger, so whichever manager last set masking keys set them for all of them.
