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

> ### ⚠️ The backfill is mandatory
>
> A user with **no record cannot authenticate**. The backfill in each migration below is what
> moves your existing users into the feature — **skip it and every existing user is locked
> out.** Run the migration in full, including the `INSERT`/`updateOne` step.

## Why a missing record denies

The absence of a record is the provisioning marker. It means one of two things, and neither
should authenticate:

- the account predates the feature and the backfill has not reached it
- `signup()` created the user but could not write the state record

`signup()` writes the record itself and **returns a failure if that write does not succeed**.
The user row cannot be rolled back, so the guarantee rests on it being unreachable: no state
record means no authentication, on both the credentials and magic-link paths, including for a
request that arrives during the provisioning window.

Retrying the signup finishes provisioning, **provided the retry supplies the original
password**. Email and username are identifiers rather than secrets, so a matching pair alone
would let anyone who can guess both make an unprovisioned account reachable; the password is
verified against the stored hash first. It is never stored or changed by this path — the
original password stands.

The retry still answers with the ordinary duplicate response whether or not the password
matched, so nothing is revealed, and the verification runs on every duplicate signup so the
timing does not differ either. An account that already has a record is left untouched, so a
`disabled` account is never reactivated by a signup attempt.

Three limits are worth knowing, and they are why the backfill below remains the dependable
repair rather than the retry:

- Because both responses are deliberately generic, the caller is never told that a retry
  provisioned the account. Someone whose signup failed has no signal to retry with the same
  details, and changing the email, username or password means the retry no longer matches.
- A retry still passes the usual password checks first, so a password that has since appeared
  in a breach corpus is rejected before provisioning is reached.
- A signup rejected by the datastore's own uniqueness constraint — the narrow race where a
  concurrent request created the user first — returns the duplicate response without
  attempting provisioning.

In each case the account stays unprovisioned and unable to authenticate, which is the safe
outcome; running the backfill resolves it.

> **Do not disable an account by deleting its record.** A deleted record is
> indistinguishable from a signup that never finished, so the next signup attempt for that
> address would recreate it as `active`. Set `status` to `disabled` instead, which owlauth
> leaves untouched.

Authentication is not the only thing a missing or non-permitting record blocks:
`changePassword()` is refused too, with the same response as a wrong current password. An
account that may not authenticate may not rotate its own credentials either.

A denial caused by a missing record is logged at **warn** severity naming the backfill, since
the HTTP response stays deliberately generic.

## Repairing unprovisioned accounts

The backfill statements below are idempotent (`ON CONFLICT DO NOTHING` on PostgreSQL,
`$setOnInsert` with `upsert` on MongoDB), so re-running one is the repair: it provisions any
account missing a record and leaves every existing record untouched. Safe to schedule
periodically as a safety net, though a signup retry already covers the common case.

## Order of operations

1. Run the migration **including the backfill**.
2. Verify no user is left without a record (see the check below).
3. Deploy the release that sets `accountSecurity: true`.

Verify before deploying — this should return zero rows:

```sql
SELECT u.id FROM public.users u
LEFT JOIN public.account_security a ON a.user_id = u.id
WHERE a.user_id IS NULL;
```

```js
db.users
  .aggregate([
    {
      $lookup: {
        from: "account_security",
        localField: "_id",
        foreignField: "user_id",
        as: "state"
      }
    },
    { $match: { state: { $size: 0 } } },
    { $project: { _id: 1 } }
  ])
  .toArray();
```

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

**The `status` column must be restricted to exactly these three values.** Without a
restriction the column accepts any string, so a mistyped status such as `'disable'` could be
stored where `'disabled'` was intended. owlauth refuses to authenticate an account whose status
it does not recognise, so a bad value fails safe at runtime — but the constraint stops it being
stored at all.

Either form is accepted:

```sql
-- a CHECK constraint, as shown above
CHECK (status IN ('active','pending_email_verification','disabled'))

-- or a native enum type
CREATE TYPE account_status AS ENUM ('active','pending_email_verification','disabled');
-- ... status account_status NOT NULL
```

The permitted set must match **exactly**. A constraint or enum carrying a fourth value is
rejected: it would let an unsupported status reach the datastore, contradicting what this
document and the README promise.

The CHECK form must also be a **single predicate on `status` alone**. Compound forms are
rejected, because they do not actually restrict the column even when they mention the right
values — for example
`CHECK (status = 'active' OR note IN ('pending_email_verification','disabled'))` is satisfied
by `status = 'suspended', note = 'disabled'`.

### Down

```sql
DROP TABLE public.account_security;
```

---

## MongoDB

### Up

```js
// The validator is required. owlauth inspects it at startup and refuses to connect
// without it, because MongoDB has no columns to constrain otherwise.
db.createCollection("account_security", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["user_id", "status", "email_verified_at", "updated_at"],
      properties: {
        user_id: { bsonType: "objectId" },
        status: { enum: ["active", "pending_email_verification", "disabled"] },
        email_verified_at: { bsonType: ["date", "null"] },
        updated_at: { bsonType: "date" }
      }
    }
  }
});

// One state record per user. owlauth validates this index at startup.
db.account_security.createIndex(
  { user_id: 1 },
  { unique: true, name: "account_security_user_id_unique_idx" }
);

// Backfill: every existing user becomes active.
const now = new Date();
db.users.find({}, { _id: 1 }).forEach((user) =>
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

owlauth validates at startup that the collection exists, carries a `$jsonSchema` validator
listing all four fields as required, declares `user_id` as `objectId` and the two timestamps as
`date`, restricts `status` to **exactly** the three known values, and has a unique `user_id`
index. A `status` enum containing a fourth value is rejected — it would reintroduce the very
gap the validator exists to close.

The validator must also be **enforced**. `validationAction: "warn"` logs a violation and
stores the document anyway, and `validationLevel: "off"` skips the rules entirely — either
would leave the collection accepting a status the schema claims to forbid, so both are
rejected at startup. These are MongoDB's defaults (`error` and `strict`), so the
`createCollection` above is already correct; only an explicit downgrade fails.

To add the validator to a collection that already exists, use `collMod`:

```js
db.runCommand({
  collMod: "account_security",
  validator: {
    /* the $jsonSchema shown above */
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

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
