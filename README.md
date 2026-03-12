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

## Installation

```bash
npm install @restingowlorg/mvp-auth
```

## Quick Start

```ts
import { AuthManager } from "@restingowlorg/mvp-auth";

const auth = await AuthManager.init({
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
const auth = await AuthManager.init({
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
const auth = await AuthManager.init({
  dbType: "postgres",
  dbOptions: {
    postgresUrl: process.env.POSTGRES_URL!,
    userTableName: "users"
  },
  authTypes: ["credentials"]
});
```

## Core API

```ts
interface IAuthManager {
  signup(email: string, username: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  changePassword(
    userId: string | number,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult>;

  requestMagicLink?(email: string): Promise<AuthResult>;
  consumeMagicLink?(token: string): Promise<AuthResult>;
}
```

## Usage

### Signup

```ts
const result = await auth.signup("user@example.com", "username", "StrongPassword123!");
```

### Login

```ts
const result = await auth.login("user@example.com", "StrongPassword123!");

if (result.success) {
  // Consumer app decides how to issue sessions or tokens.
}
```

### Change Password

```ts
const result = await auth.changePassword(userId, "CurrentPassword123!", "NewStrongPassword456!");
```

### Magic Link

```ts
const request = await auth.requestMagicLink?.("user@example.com");
const consume = await auth.consumeMagicLink?.("token-from-email");
```

## AuthResult

```ts
type AuthResult<T = unknown> = {
  success: boolean;
  data?: T;
  httpCode: number;
  message: string;
};
```

## Development

- Build: `npm run build`
- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Format check: `npm run format:check`

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for local workflow and standards.

## License

MIT
