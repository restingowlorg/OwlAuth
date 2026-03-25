# MVP Auth

A robust, multi-platform authentication framework built on OWASP security standards.

## Features

- Credentials authentication:
  - signup
  - login
  - change password
- Magic link authentication:
  - request magic link
  - verify magic link
  - consume magic link
- PostgreSQL and MongoDB support
- Consistent typed `AuthResult` responses
- Explicit, named public API to prevent drift
- Subpath exports for modular database support (`/mongo`, `/postgres`)
- Clean layered architecture (Core, Infra, Services, Strategies)

## OWASP Authentication Alignment

**MVP Auth** is designed with security as a first-class citizen, strictly aligning with the **OWASP Application Security Verification Standard (ASVS v4.0)** for authentication.

### Core Security Strengths

- **V6.2 Password Security**:
  - **Entropy-Based Strength**: Leverages `@zxcvbn-ts/core` to enforce complex passwords based on entropy scores rather than simple character rules (ASVS 6.2.1, 6.2.5).
  - **Breached Password Protection**: Real-time checks against over 600 million compromised credentials using the Have I Been Pwned k-anonymity API (ASVS 6.2.12).
  - **Context-Aware Defense**: Automatically blocks passwords that contain the user's email, username, or custom-defined forbidden words (ASVS 6.2.11).
  - **No Truncation**: Passwords of any length (64+ characters) are supported and verified exactly as received (ASVS 6.2.8, 6.2.9).
- **V6.3 General Security**:
  - **Enumeration Protection**: Consistent error messaging and response times prevent attackers from identifying valid user accounts via login attempts (ASVS 6.3.8).
- **V6.5 MFA & Tokens**:
  - **Standardized Magic Links**: Passwordless authentication uses single-use tokens with cryptographically secure generation and strict 15-minute expiration windows (ASVS 6.5.1, 6.5.3, 6.5.5).

### Future Security Roadmap

We are committed to continuous security improvements. Planned updates to further enhance OWASP alignment include:

- **Rate Limiting & Anti-Brute Force**: Implementing adaptive delays and account lockout mechanisms (ASVS 6.3.1).
- **Multi-factor Authentication (MFA)**: Adding support for TOTP (Time-based One-Time Passwords) for Level 2 authentication (ASVS 6.3.3).
- **Security Notifications**: Real-time user alerts for password changes, account updates, and suspicious login activity (ASVS 6.3.5, 6.3.7).

## Support Matrix

| Feature        | Support                           |
| :------------- | :-------------------------------- |
| **Node.js**    | >= 18.x                           |
| **Databases**  | PostgreSQL, MongoDB               |
| **Auth Modes** | Credentials, Magic Link           |
| **Languages**  | TypeScript, JavaScript (CommonJS) |

## Installation

```bash
npm install @restingowlorg/mvp-auth
```

## Quick Start

```ts
import { createAuthManager, PostgresAdapter } from "@restingowlorg/mvp-auth";
// OR import { PostgresAdapter } from "@restingowlorg/mvp-auth/postgres";

const auth = await createAuthManager({
  adapter: new PostgresAdapter({
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users",
    userSchema: "public",
    magicLinkTableName: "magic_links",
    magicLinkSchema: "public"
  }),
  authTypes: ["credentials", "magicLink"],
  blockedPasswords: ["company", "admin"]
});
```

## Initialization

### MongoDB

```ts
import { createAuthManager, MongoAdapter } from "@restingowlorg/mvp-auth";

const auth = await createAuthManager({
  adapter: new MongoAdapter({
    mongoUri: process.env.MONGO_URI!,
    userCollectionName: "users",
    magicLinkCollectionName: "magic_links"
  }),
  authTypes: ["credentials", "magicLink"]
});
```

### PostgreSQL

```ts
import { createAuthManager, PostgresAdapter } from "@restingowlorg/mvp-auth";

const auth = await createAuthManager({
  adapter: new PostgresAdapter({
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users"
  }),
  authTypes: ["credentials"]
});
```

## Configuration

The `createAuthManager` function accepts a configuration object. Here is a breakdown of the available settings.

### Common Options

These options apply regardless of the database type you Choose.

#### Authentication Types

Define which authentication flows are enabled for your instance.

```ts
authTypes: ["credentials", "magicLink"]; // Defaults to credentials if omitted
```

#### Password Protections

Add a list of custom words to block during registration or password updates.

```ts
blockedPasswords: ["admin", "password", "company-name"];
```

#### Magic Link Setup

If you use magic links, you can configure the base URL for the links sent to users.

```ts
magicLinkBaseUrl: "https://auth.example.com/verify";
```

### Database Specifics

#### PostgreSQL Configuration

When using `PostgresAdapter`, provide the connection details and table names.

```ts
import { PostgresAdapter } from "@restingowlorg/mvp-auth/postgres";

adapter: new PostgresAdapter({
  postgresUrl: "postgresql://user:pass@localhost:5432/db",
  userTableName: "users", // Table for user data
  userSchema: "auth", // Optional: Database schema (default: "public")
  magicLinkTableName: "links", // Optional: Table for magic tokens
  magicLinkSchema: "auth" // Optional: Schema for links (default: "public")
});
```

#### MongoDB Configuration

When using `MongoAdapter`, provide the connection URI and collection names.

```ts
import { MongoAdapter } from "@restingowlorg/mvp-auth/mongo";

adapter: new MongoAdapter({
  mongoUri: "mongodb://localhost:27017/auth_db",
  userCollectionName: "users", // Collection for user data
  magicLinkCollectionName: "magic_links" // Optional: Default is "magic_links"
});
```

## Subpath Exports

For modularity and better tree-shaking, you can import database-specific repositories and connection helpers directly:

```ts
// MongoDB specialized exports
import { MongoAdapter, connectMongo, MongoUserRepo } from "@restingowlorg/mvp-auth/mongo";

// PostgreSQL specialized exports
import {
  PostgresAdapter,
  initPostgres,
  PostgresUserRepository
} from "@restingowlorg/mvp-auth/postgres";
```

## Core API

```ts
import {
  IAuthManager,
  AuthResult,
  SignupResult,
  LoginResult,
  ChangePasswordResult,
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult,
  AuthUser,
  SafeUser,
  MagicLinkToken
} from "@restingowlorg/mvp-auth";

export interface IAuthMethods {
  credentials: ICredentialsMethods;
  magicLink: IMagicLinkMethods;
}

export type IAuthManager<T extends AuthType = AuthType> = {
  [K in T]: IAuthMethods[K];
} & {
  readonly disconnectDB: () => Promise<void>;
};
```

## Usage

### Signup

```ts
import { SignupResult, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<SignupResult> = await auth.credentials.signup(
  "user@example.com",
  "username",
  "StrongPassword123!"
);
```

### Login

```ts
import { LoginResult, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<LoginResult> = await auth.credentials.login(
  "user@example.com",
  "StrongPassword123!"
);

if (result.success) {
  const { user } = result.data;
  console.log(`User ${user.username} logged in (${user.email})`);
}
```

### Change Password

```ts
import { ChangePasswordResult, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<ChangePasswordResult> = await auth.credentials.changePassword(
  userId,
  "CurrentPassword123!",
  "NewStrongPassword456!"
);
```

### Magic Link

```ts
import {
  RequestMagicLinkResult,
  VerifyMagicLinkResult,
  ConsumeMagicLinkResult,
  AuthResult
} from "@restingowlorg/mvp-auth";

const request: AuthResult<RequestMagicLinkResult> =
  await auth.magicLink.request("user@example.com");
if (request.success) {
  const token = request.data; // token string
}

const verify: AuthResult<VerifyMagicLinkResult> = await auth.magicLink.verify("token-from-email");
if (verify.success) {
  const { isValid } = verify.data;
  console.log(`Token is ${isValid ? "valid" : "invalid"}`);
}

const consume: AuthResult<ConsumeMagicLinkResult> =
  await auth.magicLink.consume("token-from-email");
if (consume.success) {
  console.log("Magic link consumed");
}
```

## Response Types

All endpoints return a consistent `AuthResult` object with a specific data payload:

```ts
type AuthResult<T = unknown> = {
  success: boolean;
  data?: T;
  httpCode: number;
  message: string;
};
```

Available specific data types:

- `SignupResult`: `{ user: SafeUser }`
- `LoginResult`: `{ user: SafeUser }`
- `ChangePasswordResult`: `{ user: SafeUser }`
- `RequestMagicLinkResult`: `string`
- `VerifyMagicLinkResult`: `{ isValid: boolean; tokenId: string }`
- `ConsumeMagicLinkResult`: `undefined`

## Development

- Build: `npm run build`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for local workflow and standards.

## License

MIT
