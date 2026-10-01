---
"@restingowlorg/owlauth": minor
---

Add optional account identity state. Enable it with `accountSecurity: true` to track whether an account is `active`, `pending_email_verification`, or `disabled`, stored in a new account security table or collection alongside `emailVerifiedAt` and `updatedAt`.

Authentication is permitted only for `active` and `pending_email_verification`. Every other stored value is denied, including `disabled` and any status owlauth does not recognise, so a mistyped or wrong-case value fails safe instead of re-enabling a suspended account. Denials use the existing generic responses: login returns the same `401 Invalid credentials.` as a wrong password, and magic links are neither issued nor accepted. The status is checked after password verification so the endpoint cannot be used to discover which accounts are disabled. `signup()` records new accounts as `active`, and a user with no record is treated as `active`.

The built-in PostgreSQL and MongoDB adapters validate the account security schema at startup when the feature is enabled. PostgreSQL additionally requires a `CHECK` constraint restricting `status` to the three valid values. Behaviour is unchanged for consumers that leave it disabled, and no migration is required in that case.

Enforcement follows the `accountSecurity` option rather than the presence of a repository: a repository supplied while the option is disabled is ignored, and enabling the option without one is a configuration error raised at startup instead of silently enforcing nothing.

Before enabling, create the table or collection and backfill existing users using `docs/migrations/ROOS-34-account-identity-state.md`, which also documents rollback.
