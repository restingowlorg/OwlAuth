# Migration — Account Identity State (ROOS-34)

Adds the optional account identity state store introduced in owlauth v1.3.0.

When `accountSecurity` is not enabled, owlauth never reads or writes this table and **no
migration is required**. Run this only when you intend to turn the feature on.

## What it stores

| Field               | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `status`            | `active`, `pending_email_verification`, or `disabled` |
| `email_verified_at` | When the mailbox was confirmed, or `NULL`             |
| `updated_at`        | When the record last changed                          |

`active` and `pending_email_verification` permit authentication. Everything else denies it,
including `disabled` and any value owlauth does not recognise. `pending_email_verification` is
stored but does not block login — the email-verification flow is a separate feature.

A user with **no record** is treated as `active`, so the backfill below is what actually moves
your existing users into the feature. It is included in both migrations.

## Order of operations

1. Run the migration (including the backfill).
2. Deploy the release that sets `accountSecurity: true`.

Enabling the feature before the table exists will fail at startup — owlauth validates the
schema while connecting.

---

## PostgreSQL

### Up

```sql
CREATE TABLE public.account_security (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL
                      CHECK (status IN ('active','pending_email_verification','disabled')),
  email_verified_at TIMESTAMPTZ NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One state record per user. owlauth validates this index at startup.
CREATE UNIQUE INDEX account_security_user_id_unique_idx
  ON public.account_security (user_id);

-- Backfill: every existing user becomes active.
INSERT INTO public.account_security (user_id, status, email_verified_at, updated_at)
SELECT id, 'active', NULL, NOW()
FROM public.users
ON CONFLICT (user_id) DO NOTHING;
```

Adjust `public` and `users` to match your `accountSecuritySchema`, `accountSecurityTableName`,
`userSchema`, and `userTableName`. Match `user_id` to the type of your `users.id` column: use
`BIGINT` for `BIGSERIAL`, `INTEGER` for `SERIAL`, or `UUID` for a UUID primary key.

owlauth validates at startup that the table exists, has the columns
`id, user_id, status, email_verified_at, updated_at`, that `user_id`, `status`, and
`updated_at` are `NOT NULL`, that `user_id` has a non-partial single-column unique index, that
`user_id` is a foreign key to your users table, and that a `CHECK` constraint restricts
`status` to the three valid values.

**The `CHECK` constraint is required, not optional.** Without it the column accepts any
string, so a mistyped status such as `'disable'` could be stored where `'disabled'` was
intended. owlauth refuses to authenticate an account whose status it does not recognise, so
such a typo fails safe rather than re-enabling a suspended account — but the constraint stops
the bad value being stored in the first place.

### Down

```sql
DROP TABLE public.account_security;
```

---

## MongoDB

### Up

```js
db.createCollection("account_security");

// One state record per user. owlauth validates this index at startup.
db.account_security.createIndex(
  { user_id: 1 },
  { unique: true, name: "account_security_user_id_unique_idx" }
);

// Backfill: every existing user becomes active.
const now = new Date();
db.users
  .find({}, { _id: 1 })
  .forEach((user) =>
    db.account_security.updateOne(
      { user_id: user._id },
      {
        $setOnInsert: {
          user_id: user._id,
          status: "active",
          email_verified_at: null,
          updated_at: now
        }
      },
      { upsert: true }
    )
  );
```

`user_id` must be the user's `ObjectId`, not its string form. The index must be unique,
non-partial, and non-sparse; owlauth rejects the connection otherwise.

### Down

```js
db.account_security.drop();
```

---

## Rollback

Reverse the deployment before reversing the schema:

1. Deploy a release with `accountSecurity` disabled (remove the option or set it to `false`).
   Startup validation stops running and owlauth ignores the table entirely.
2. Only then run the `Down` statement above.

Dropping the table while a running instance still has the feature enabled will fail that
instance's next startup.

Rolling back discards every recorded status, including any `disabled` account. Those users can
authenticate again as soon as the feature is off, so revoke their sessions through your
application if that matters. Export the table first if you intend to re-enable the feature
later:

```sql
CREATE TABLE public.account_security_backup AS TABLE public.account_security;
```
