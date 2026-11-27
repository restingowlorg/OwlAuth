# Migration — Password Recovery (ROOS-35)

Adds the action token store used by password recovery.

When `"recovery"` is not in `authTypes`, owlauth never reads or writes this table and **no
migration is required**. Run this only when you intend to turn recovery on.

Unlike the account identity state migration, there is **no backfill**. The table starts
empty and only ever holds tokens issued after the feature is enabled.

## What it stores

One row per issued recovery token.

| Field        | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| `user_id`    | The account the token can recover                                    |
| `purpose`    | What the token authorises. Currently only `password_recovery`        |
| `selector`   | The public half of the token, stored in the clear to find the row    |
| `token_hash` | SHA-256 of the purpose-bound secret half. The secret is never stored |
| `expires_at` | When the token stops being accepted (5–60 minutes, default 15)       |
| `used_at`    | When the token was redeemed or superseded, or `NULL` while live      |
| `created_at` | When the token was issued                                            |

A token is `selector.verifier`. Finding a row by its selector proves nothing on its own: the
verifier still has to match `token_hash`, so a database read does not yield a usable token.

Redeeming a token is one conditional write (`used_at IS NULL AND expires_at > NOW()`), so two
concurrent requests with the same token cannot both reset the password. Issuing a new token
marks the user's previous ones as used, and so does a successful recovery.

## Order of operations

1. Run the migration below.
2. Deploy the release that adds `"recovery"` to `authTypes` and sets `recovery.deliver`.

Enabling recovery before the table exists fails at startup, because owlauth validates the
schema while connecting.

---

## PostgreSQL

### Up

```sql
CREATE TABLE public.action_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('password_recovery')),
  selector    TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- How a token is found. owlauth validates this index at startup.
CREATE UNIQUE INDEX action_tokens_selector_unique_idx
  ON public.action_tokens (selector);

-- Recommended, not validated: keeps invalidating a user's outstanding tokens cheap.
CREATE INDEX action_tokens_user_outstanding_idx
  ON public.action_tokens (user_id, purpose)
  WHERE used_at IS NULL;
```

Adjust `public` and `users` to match your `actionTokenSchema`, `actionTokenTableName`,
`userSchema`, and `userTableName`. The table name defaults to `action_tokens` and the schema
to `public`. Match `user_id` to the type of your `users.id` column: `BIGINT` for `BIGSERIAL`,
`INTEGER` for `SERIAL`, or `UUID` for a UUID primary key.

`created_at` must have a default. owlauth does not supply it on insert.

owlauth validates at startup that the table exists and has the columns
`id, user_id, purpose, selector, token_hash, expires_at, used_at, created_at`, that `user_id`,
`purpose`, `selector`, `token_hash` and `expires_at` are `NOT NULL`, that `selector` has a
non-partial single-column unique index, that `user_id` is a foreign key to your users table,
and that `purpose` is restricted to exactly the purposes owlauth knows.

**The `purpose` column must be restricted to exactly `'password_recovery'`.** Either form is
accepted:

```sql
-- a CHECK constraint, as shown above
CHECK (purpose IN ('password_recovery'))

-- or a native enum type
CREATE TYPE action_token_purpose AS ENUM ('password_recovery');
-- ... purpose action_token_purpose NOT NULL
```

A constraint permitting any other value is rejected at startup, and so is one combined with a
predicate on another column. When a later release adds a purpose, its migration widens this
constraint.

### Down

```sql
DROP TABLE public.action_tokens;
```

---

## MongoDB

### Up

```js
db.createCollection("action_tokens");

// How a token is found. owlauth validates this index at startup.
db.action_tokens.createIndex(
  { selector: 1 },
  { unique: true, name: "action_tokens_selector_unique_idx" }
);

// Recommended, not validated: keeps invalidating a user's outstanding tokens cheap.
db.action_tokens.createIndex(
  { user_id: 1, purpose: 1 },
  { name: "action_tokens_user_purpose_idx" }
);
```

Set `actionTokenCollectionName` to the collection name. Unlike PostgreSQL there is no default,
and startup fails without it when recovery is enabled.

owlauth validates at startup that the collection has a unique, non-partial, non-sparse index
on `selector`. No `$jsonSchema` validator is required. Every lookup and every write filters on
`purpose`, so a document carrying a purpose owlauth does not know is never matched, which
fails safe. You may add a validator if you want the datastore to reject such documents
outright:

```js
db.runCommand({
  collMod: "action_tokens",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["user_id", "purpose", "selector", "token_hash", "expires_at", "used_at"],
      properties: {
        user_id: { bsonType: "objectId" },
        purpose: { enum: ["password_recovery"] },
        selector: { bsonType: "string" },
        token_hash: { bsonType: "string" },
        expires_at: { bsonType: "date" },
        used_at: { bsonType: ["date", "null"] }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

`user_id` is stored as the user's `ObjectId`.

### Down

```js
db.action_tokens.drop();
```

---

## Housekeeping

Rows are never deleted by owlauth. Spent and expired tokens are inert, since redeeming one
requires `used_at IS NULL` and an unexpired `expires_at`, but they accumulate. Prune them on a
schedule if that matters to you:

```sql
DELETE FROM public.action_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
```

On MongoDB a TTL index does the same automatically:

```js
db.action_tokens.createIndex(
  { expires_at: 1 },
  { name: "action_tokens_expiry_ttl_idx", expireAfterSeconds: 86400 }
);
```

## Rollback

Reverse the deployment before reversing the schema:

1. Deploy a release with `"recovery"` removed from `authTypes`. Startup validation stops
   running and owlauth ignores the table entirely.
2. Only then run the `Down` statement above.

Dropping the table while a running instance still has recovery enabled fails that instance's
next startup. Any recovery message already sent stops working once the feature is off, which
is the intended outcome.
