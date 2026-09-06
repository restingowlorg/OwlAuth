---
"@restingowlorg/owlauth": minor
---

Require database-level unique `email` and `username` indexes for the built-in PostgreSQL and MongoDB adapters, validate non-null PostgreSQL identity columns, return a safe conflict response for concurrent duplicate signups, and correct the magic-link token documentation.

Before upgrading, add the documented unique indexes and ensure PostgreSQL user tables include the `updated_at` column used by password updates.

Add PostgreSQL and MongoDB containerized integration tests to CI for adapter schema validation and duplicate-key handling.

Exclude all test files from the generated npm package.
