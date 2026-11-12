---
"@restingowlorg/owlauth": minor
---

Add password recovery. Enable it by adding `"recovery"` to `authTypes` and supplying `recovery.deliver`, which receives each issued token so your application can send the message. OwlAuth does not send email. `recovery.baseUrl` builds a ready-made link, and `recovery.tokenTtlMinutes` sets the lifetime: 5–60 minutes, default 15.

`auth.recovery.request(email)` returns the same `202` result for every address, padded to a minimum duration, so neither the body nor the timing reveals whether an account exists. `auth.recovery.confirm(token, newPassword)` checks the token's format, existence, expiry, single use and integrity, then applies the same password policy as signup and `changePassword()`: length, blocked terms, strength, and the breached-password check honouring `pwnedPasswordFailClosed`. Every unusable token gets one indistinguishable `400`. A password rejected by the policy leaves the token usable, so the user can retry.

Tokens are `selector.verifier`. Only a SHA-256 hash of the purpose-bound verifier is stored. Spending a token is a single atomic conditional write, so two concurrent confirmations cannot both reset the password. A new request supersedes earlier tokens. Success invalidates the user's outstanding magic links and emits `PASSWORD_RECOVERY_COMPLETED`, which never includes the token or the password. Recovery issues no bearer, access, refresh or JWT token and grants no session. When account identity state is enabled, an account whose status does not permit authentication cannot recover either.

The application owns delivery, rate limiting, session revocation and application-token invalidation. The README includes a composition example.

Tokens live in a new action token table or collection, validated at startup when recovery is enabled. PostgreSQL requires a unique `selector`, a `user_id` foreign key and a constraint restricting `purpose`; MongoDB requires a unique `selector` index and `actionTokenCollectionName`. Create it with `docs/migrations/ROOS-35-password-recovery.md`. No backfill is needed, and nothing changes for consumers that leave recovery disabled.

The password policy that signup and `changePassword()` already applied now lives in one shared function used by all three flows. Their messages and audit reasons are unchanged.

PostgreSQL schema validation now also accepts the `column = 'value'` form that PostgreSQL stores for a single-value `IN (...)` constraint.
