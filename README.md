# MVP Auth

A framework-agnostic and database-agnostic authentication library for Node.js.

## Features

- Credentials authentication:
  - signup
  - login
  - change password
- Magic link authentication:
  - request magic link
  - consume magic link
- OWASP-aligned password protections:
  - strength checks with `@zxcvbn-ts/core`
  - breached password checks via Have I Been Pwned k-anonymity API
  - blocked password word checks (email, username, and custom values)
- PostgreSQL and MongoDB support
- Consistent typed `AuthResult` responses
- Clean layered architecture

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
import { createAuthManager } from "@restingowlorg/mvp-auth";

const auth = await createAuthManager({
  dbType: "postgres",
  dbOptions: {
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users",
    userSchema: "public",
    magicLinkTableName: "magic_links",
    magicLinkSchema: "public"
  },
  authTypes: ["credentials", "magic-link"],
  blockedPasswords: ["company", "admin"]
});
```

## Initialization

### MongoDB

```ts
const auth = await createAuthManager({
  dbType: "mongo",
  dbOptions: {
    mongoUri: process.env.MONGO_URI!,
    userCollectionName: "users",
    magicLinkCollectionName: "magic_links"
  },
  authTypes: ["credentials", "magic-link"]
});
```

### PostgreSQL

```ts
const auth = await createAuthManager({
  dbType: "postgres",
  dbOptions: {
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users"
  },
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
authTypes: ["credentials", "magic-link"]; // Defaults to credentials if omitted
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

When using `dbType: "postgres"`, provide the connection details and table names.

```ts
dbOptions: {
  postgresUrl: "postgresql://user:pass@localhost:5432/db",
  userTableName: "users",      // Table for user data
  userSchema: "auth",          // Optional: Database schema (default: "public")
  magicLinkTableName: "links", // Optional: Table for magic tokens
  magicLinkSchema: "auth"      // Optional: Schema for links (default: "public")
}
```

#### MongoDB Configuration

When using `dbType: "mongo"`, provide the connection URI and collection names.

```ts
dbOptions: {
  mongoUri: "mongodb://localhost:27017/auth_db",
  userCollectionName: "users",           // Collection for user data
  magicLinkCollectionName: "magic_tokens" // Optional: Default is "magic_links"
}
```

## Core API

```ts
import {
  IAuthManager,
  AuthResult,
  SignupResponse,
  LoginResponse,
  ChangePasswordResponse,
  RequestMagicLinkResponse,
  ConsumeMagicLinkResponse
} from "@restingowlorg/mvp-auth";

interface IAuthManager {
  signup(email: string, username: string, password: string): Promise<AuthResult<SignupResponse>>;
  login(email: string, password: string): Promise<AuthResult<LoginResponse>>;
  changePassword(
    userId: string | number,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult<ChangePasswordResponse>>;

  requestMagicLink?(email: string): Promise<AuthResult<RequestMagicLinkResponse>>;
  consumeMagicLink?(token: string): Promise<AuthResult<ConsumeMagicLinkResponse>>;
}
```

## Usage

### Signup

```ts
import { SignupResponse, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<SignupResponse> = await auth.signup(
  "user@example.com",
  "username",
  "StrongPassword123!"
);
```

### Login

```ts
import { LoginResponse, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<LoginResponse> = await auth.login(
  "user@example.com",
  "StrongPassword123!"
);

if (result.success) {
  const { user } = result.data!;
  console.log(`User ${user.username} logged in with ID ${user.id}`);
}
```

### Change Password

```ts
import { ChangePasswordResponse, AuthResult } from "@restingowlorg/mvp-auth";

const result: AuthResult<ChangePasswordResponse> = await auth.changePassword(
  userId,
  "CurrentPassword123!",
  "NewStrongPassword456!"
);
```

### Magic Link

```ts
import {
  RequestMagicLinkResponse,
  ConsumeMagicLinkResponse,
  AuthResult
} from "@restingowlorg/mvp-auth";

const request: AuthResult<RequestMagicLinkResponse> | undefined =
  await auth.requestMagicLink?.("user@example.com");
if (request?.success) {
  const token = request.data; // token string
}

const consume: AuthResult<ConsumeMagicLinkResponse> | undefined =
  await auth.consumeMagicLink?.("token-from-email");
if (consume?.success) {
  const { userId } = consume.data!;
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

- `SignupResponse`: `{ user: SafeUser }`
- `LoginResponse`: `{ user: SafeUser }`
- `ChangePasswordResponse`: `undefined`
- `RequestMagicLinkResponse`: `string`
- `ConsumeMagicLinkResponse`: `{ userId: string }`

## Development

- Build: `npm run build`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for local workflow and standards.

## License

MIT
