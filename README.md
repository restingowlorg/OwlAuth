# owlauth

<p align="center">
  <img src="https://raw.githubusercontent.com/restingowlorg/OwlAuth/main/docs/assets/restingowl-logo.png" alt="owlauth logo" width="320" />
</p>

---

[![npm package](https://img.shields.io/badge/npm-%40restingowlorg%2Fowlauth-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@restingowlorg/owlauth) [![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://www.npmjs.com/package/@restingowlorg/owlauth) [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Open-source OWASP-aligned authentication and account-security library for Node.js.

owlauth, published as `@restingowlorg/owlauth`, gives your Node.js app the core pieces of authentication: credentials login, magic links, password checks, and security-focused audit logging. It works with PostgreSQL and MongoDB and stays out of your framework.

- **Package:** `@restingowlorg/owlauth`
- **Latest stable tag:** `latest`
- **Prerelease tag:** `next`
- **Install:** `npm install @restingowlorg/owlauth`
- **Developer guide:** [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)

## What You Get

- **Credentials authentication**: Sign up users, log them in, and rotate passwords through one library surface.
- **Passwordless magic links**: Request, verify, and consume single-use login tokens.
- **PostgreSQL and MongoDB adapters**: Use the same auth API across two common persistence stacks.
- **Password hygiene controls**: Enforce minimum strength with `zxcvbn`, reject context-based weak passwords, and check candidate passwords against Have I Been Pwned using the k-anonymity API.
- **Security-focused logging**: Audit events are logged with built-in masking for sensitive fields such as passwords, tokens, secrets, cookies, and authorization data.
- **Request tracing support**: Pass a `correlationId` through auth operations to align library logs with your application logs.
- **Pluggable cryptography**: Swap the default crypto adapter if your stack requires a different hashing or token strategy.
- **Typed, predictable results**: Every auth method returns a consistent `AuthResult<T>` shape.

## Support Matrix

| Area          | Current Support         |
| ------------- | ----------------------- |
| Runtime       | Node.js 18+             |
| Language      | TypeScript, JavaScript  |
| Module output | CommonJS                |
| Databases     | PostgreSQL, MongoDB     |
| Auth flows    | Credentials, Magic Link |

## Installation

```bash
npm install @restingowlorg/owlauth
```

## Quick Start

```ts
import { createAuthManager, PostgresAdapter } from "@restingowlorg/owlauth";

const auth = await createAuthManager({
  adapter: new PostgresAdapter({
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users",
    magicLinkTableName: "magic_links"
  }),
  authTypes: ["credentials", "magicLink"],
  blockedPasswords: ["company-name", "product-name"],
  pwnedPasswordFailClosed: true,
  customMaskingKeys: ["apiKey", "accessToken"]
});

const signup = await auth.credentials.signup(
  "user@example.com",
  "engineer01",
  "CorrectHorseBatteryStaple!2026",
  { correlationId: "req_123" }
);

if (signup.success) {
  console.log(signup.data.user.email);
}

await auth.disconnectDB();
```

## Database Adapters

### PostgreSQL

```ts
import { createAuthManager, PostgresAdapter } from "@restingowlorg/owlauth";

const auth = await createAuthManager({
  adapter: new PostgresAdapter({
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users",
    userSchema: "public",
    magicLinkTableName: "magic_links",
    magicLinkSchema: "public"
  }),
  authTypes: ["credentials", "magicLink"]
});
```

### MongoDB

```ts
import { createAuthManager, MongoAdapter } from "@restingowlorg/owlauth";

const auth = await createAuthManager({
  adapter: new MongoAdapter({
    mongoUri: process.env.MONGO_URI!,
    userCollectionName: "users",
    magicLinkCollectionName: "magic_links"
  }),
  authTypes: ["credentials", "magicLink"]
});
```

## Cryptography

owlauth ships with a default `BcryptAdapter` (10 rounds). You can customize it or provide your own implementation of `ICryptoAdapter`.

### Customizing Default Crypto

```ts
import { createAuthManager, BcryptAdapter } from "@restingowlorg/owlauth";

const auth = await createAuthManager({
  // ... rest of config
  cryptoAdapter: new BcryptAdapter()
});
```

### Implementing Your Own

If you need Argon2, PBKDF2, or a custom token strategy, implement the `ICryptoAdapter` interface:

```ts
import { ICryptoAdapter } from "@restingowlorg/owlauth";

class MyCrypto implements ICryptoAdapter {
  async hashPassword(p: string) {
    /* ... */
  }
  async verifyPassword(p: string, h: string) {
    /* ... */
  }
  generateToken() {
    /* ... */
  }
  async hashToken(t: string) {
    /* ... */
  }
  async verifyToken(t: string, h: string) {
    /* ... */
  }
}

const auth = await createAuthManager({
  // ...
  cryptoAdapter: new MyCrypto()
});
```

## Core Usage

### Credentials Flow

```ts
import {
  AuthResult,
  SignupResult,
  LoginResult,
  ChangePasswordResult
} from "@restingowlorg/owlauth";

const signup: AuthResult<SignupResult> = await auth.credentials.signup(
  "user@example.com",
  "engineer01",
  "CorrectHorseBatteryStaple!2026"
);

const login: AuthResult<LoginResult> = await auth.credentials.login(
  "user@example.com",
  "CorrectHorseBatteryStaple!2026",
  {
    correlationId: "req_login_001"
  }
);

const passwordChange: AuthResult<ChangePasswordResult> = await auth.credentials.changePassword(
  "user_id123456",
  "current_strong_password",
  "new_strong_password_example",
  {
    correlationId: "req_password_001"
  }
);
```

### Magic Link Flow

```ts
import {
  AuthResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult
} from "@restingowlorg/owlauth";

const requested: AuthResult<RequestMagicLinkResult> = await auth.magicLink.request(
  "user@example.com",
  { correlationId: "req_magic_001" }
);

if (requested.success) {
  const token = requested.data;
  const verified: AuthResult<VerifyMagicLinkResult> = await auth.magicLink.verify(token);
  const consumed: AuthResult<ConsumeMagicLinkResult> = await auth.magicLink.consume(token);
}
```

`request()` returns a composite token string in the format `{recordId}.{rawToken}`. Both parts are required — `verify()` and `consume()` expect the full composite value as-is. Putting it in a URL, sending the email, and handling delivery is your application's job. owlauth does not touch any of that.

> **Note:** The `recordId` segment is the database record's primary key. It is not sensitive, but treat the full composite token as a secret: it grants one-time login access and must only be transmitted over TLS.

## Configuration Options

### Shared Options

| Option                    | Type                               | Purpose                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authTypes`               | `("credentials" \| "magicLink")[]` | Enables one or both supported auth flows. Defaults to credentials only.                                                                                                                                  |
| `blockedPasswords`        | `string[]`                         | Rejects passwords containing the user's email, username, or any supplied blocked terms.                                                                                                                  |
| `magicLinkBaseUrl`        | `string`                           | Base URL for magic link emails. When set, `request()` returns a ready-to-use URL in the format `{baseUrl}?token={token}`. When omitted, the raw composite token is returned for manual URL construction. |
| `cryptoAdapter`           | `ICryptoAdapter`                   | Replaces the default bcrypt-based crypto implementation.                                                                                                                                                 |
| `customMaskingKeys`       | `string[]`                         | Adds case-insensitive keys to the audit logger masking list.                                                                                                                                             |
| `pwnedPasswordFailClosed` | `boolean`                          | Rejects signups and password changes when the breached-password API cannot be reached.                                                                                                                   |
| `usernameValidator`       | `(username: string) => boolean`    | Overrides the default username validation rule. Default: `3–20 chars, alphanumeric + underscore only` (`/^[a-zA-Z0-9_]{3,20}$/`). Return `true` to accept, `false` to reject.                            |

> **Note:** The built-in `PostgresAdapter` and `MongoAdapter` implement `findByUsername` and enforce username uniqueness at signup. If you supply a custom `UserRepository` that does not implement `findByUsername`, duplicate-username detection is skipped silently. Implement the method if your application requires unique usernames.

### Method-Level Options

- `signup()`: `blockedPasswords`, `pwnedPasswordFailClosed`, `correlationId`
- `login()`: `correlationId`
- `changePassword()`: `blockedPasswords`, `pwnedPasswordFailClosed`, `correlationId`
- `magicLink.request()`: `correlationId`
- `magicLink.verify()`: `correlationId`
- `magicLink.consume()`: `correlationId`

## Response Model

Every public method returns the same envelope:

```ts
type AuthResult<T = unknown> =
  | { success: true; data: T; httpCode: number; message: string }
  | { success: false; data?: undefined; httpCode: number; message: string };
```

Result payloads are:

- `SignupResult`: `{ user: SafeUser }` — where `SafeUser = { id, email, username }`
- `LoginResult`: `{ user: SafeUser }`
- `ChangePasswordResult`: `{ user: SafeUser ; tokensInvalidated: boolean}`
- `RequestMagicLinkResult`: `string` — when `magicLinkBaseUrl` is configured: full URL `"{baseUrl}?token={recordId}.{rawToken}"` ready to embed in an email. Without `magicLinkBaseUrl`: raw composite `"{recordId}.{rawToken}"` for manual URL construction. Pass the token portion directly to `verify()` and `consume()`.
- `VerifyMagicLinkResult`: `{ isValid: boolean; userId: UserId; lookupKey: string; }`
- `ConsumeMagicLinkResult`: `{ userId: UserId }`

`SafeUser` and `UserId` are exported directly from the package and can be imported for type annotations:

```ts
import type { SafeUser, UserId } from "@restingowlorg/owlauth";
```

## OWASP Alignment

Here's exactly what owlauth does, and where each decision comes from. Every control is traced back to the [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/), or [OWASP Top 10:2025](https://owasp.org/www-project-top-ten/).

### Password Security

| Control                   | What the library does                                                                                                                                                                                                                                  | OWASP reference                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password strength scoring | Candidate passwords are scored with `@zxcvbn-ts/core` at signup and on every password change. Scores below 3 of 4 are rejected.                                                                                                                        | [Auth Cheat Sheet — Implement Proper Password Strength Controls](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls) |
| Breached password check   | The [Have I Been Pwned Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords) is queried using the k-anonymity range method. Only the first 5 characters of the SHA-1 hash are transmitted; the raw password never leaves the process. | [Auth Cheat Sheet — Block previously breached passwords](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls)         |
| Context-aware blocking    | Passwords are rejected if they contain the user's email local part, username, or any caller-supplied blocked terms, preventing context-guessable passwords.                                                                                            | [NIST SP 800-63B § 5.1.1.2](https://pages.nist.gov/800-63-4/sp800-63b.html), context-specific word verification                                                                              |
| Fail-closed breach check  | When `pwnedPasswordFailClosed: true`, a network error on the breach API causes the request to fail rather than silently pass.                                                                                                                          | Defense-in-depth, fail-safe defaults                                                                                                                                                         |

### Credential Storage

| Control                   | What the library does                                                                                                                                                 | OWASP reference                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Adaptive password hashing | Passwords are hashed with bcrypt at 10 salt rounds via the built-in `BcryptAdapter`.                                                                                  | [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), use bcrypt |
| Pluggable crypto adapter  | The `ICryptoAdapter` interface allows swapping the default bcrypt implementation for any alternative hashing or token strategy without changing the auth API surface. | ASVS 5.0, algorithm agility                                                                                                        |

### Authentication Logic

| Control                          | What the library does                                                                                                                                                                                                                                                                                                                                                              | OWASP reference                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic login error messages     | Login failure returns `"Invalid credentials."` regardless of whether the email is unknown or the password is wrong, preventing user enumeration. Magic link `request()` always returns `200` with a neutral message (`"If this email is registered, a magic link has been sent."`) regardless of whether the email exists, preventing email enumeration via the passwordless flow. | [Auth Cheat Sheet, Authentication and Error Messages](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages) |
| Current password re-verification | `changePassword()` requires the caller to supply and verify the current password before a new one is accepted, preventing silent takeover through a hijacked session.                                                                                                                                                                                                              | [Auth Cheat Sheet, Change Password Feature](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#change-password-feature)                     |

### Passwordless Authentication

| Control                                   | What the library does                                                                                                                                          | OWASP reference                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cryptographically secure token generation | Magic link tokens are produced with `crypto.randomBytes(32)` from Node.js's built-in CSPRNG.                                                                   | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), use a cryptographically random value |
| Token hashing at rest                     | The raw token is never stored. Only the SHA-256 hash of the token is persisted using a timing-safe comparison; the database contains no recoverable plaintext. | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), hash tokens before storage           |
| Short expiry window                       | Tokens expire 15 minutes after issuance.                                                                                                                       | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), use a short token lifetime           |
| Single-use with prior invalidation        | Requesting a new magic link immediately invalidates all previous active tokens for that user. Consumed tokens cannot be reused.                                | [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), single-use tokens                    |

### Security Logging and Audit Trail

| Control                    | What the library does                                                                                                                                                                    | OWASP reference                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security event logging     | Every auth operation, signup, login, password change, and all magic link steps, emits a structured audit event with event type, email, outcome, and reason.                              | [Auth Cheat Sheet, Logging and Monitoring](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#logging-and-monitoring); [A09:2025 Security Logging and Alerting Failures](https://owasp.org/www-project-top-ten/) |
| Sensitive field masking    | The audit logger automatically redacts values at keys matching `password`, `token`, `secret`, `authorization`, `cookie`, and `apikey`. Callers can extend this with `customMaskingKeys`. | ASVS 5.0, do not log sensitive data;[OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)                                                                                                     |
| Correlation ID propagation | Every auth method accepts an optional `correlationId`. When supplied, it is included in all log output for that operation, enabling trace correlation with application-level logs.       | [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), include trace identifiers                                                                                                              |

## Security Notes

The table above covers what this library actually does. It's **not** an OWASP certification, and it won't make your app ASVS-compliant on its own. You still need to handle:

- TLS and secure transport
- secure email delivery for magic links
- rate limiting, brute-force protection, and account lockout
- session management
- CSRF defenses where relevant
- account verification and recovery workflows
- MFA or passkeys if the risk model requires them
- authorization and role enforcement

## Roadmap

owlauth is part of a wider RestingOwl effort focused on building secure-by-default tooling for various technology stacks, not limited to Node.js.

Here's what's coming next:

- **More application stacks**: First-party integrations for Express, Fastify, NestJS, Next.js, and serverless Node runtimes
- **More data stores**: Additional adapters for MySQL, SQLite, DynamoDB, and other operationally common backends
- **Stronger auth options**: WebAuthn, passkeys, TOTP-based MFA, and recovery-oriented flows
- **Operational hardening**: Built-in rate limiting hooks, lockout strategies, and safer recovery patterns
- **Broader RestingOwl package family**: Adjacent packages for rate limiting, input sanitization, audit logging, secrets management, and CSRF protection

## Community

[![Website](https://img.shields.io/badge/restingowl.com-111827?style=flat-square&logo=googlechrome&logoColor=white)](https://restingowl.com/) [![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/showcase/restingowl/) [![GitHub](https://img.shields.io/badge/Source-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/restingowlorg/OwlAuth) [![Issues](https://img.shields.io/badge/Issues-GitHub-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/restingowlorg/OwlAuth/issues) [![Security Policy](https://img.shields.io/badge/Security_Policy-B91C1C?style=flat-square&logo=owasp&logoColor=white)](SECURITY.md) [![Contributing](https://img.shields.io/badge/Contributing-15803D?style=flat-square&logo=git&logoColor=white)](CONTRIBUTING.md)

## License

[MIT License](LICENSE)
