---
"@restingowlorg/owlauth": minor
---

Add optional account identity state. Enable it with `accountSecurity: true` to track whether an account is `active`, `pending_email_verification`, or `disabled`, stored in a new account security table or collection alongside `emailVerifiedAt` and `updatedAt`.

A `disabled` account is denied authentication using the existing generic responses: login returns the same `401 Invalid credentials.` as a wrong password, and magic links are neither issued nor accepted. The status is checked after password verification so the endpoint cannot be used to discover which accounts are disabled. `pending_email_verification` does not block authentication. `signup()` records new accounts as `active`, and a user with no record is treated as `active`.

The built-in PostgreSQL and MongoDB adapters validate the account security schema at startup when the feature is enabled. Behaviour is unchanged for consumers that leave it disabled, and no migration is required in that case.

Before enabling, create the table or collection and backfill existing users using `docs/migrations/ROOS-34-account-identity-state.md`, which also documents rollback.
