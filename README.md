
---

# 🛡️ MVP Auth

**MVP Auth** is a **framework-agnostic** and **database-agnostic** Node.js authentication library providing:

* Credentials authentication (`email + username + password`)
* Magic link (passwordless) authentication
* Session-based authentication (**token-based sessions with rotation**)

It exposes **business-level services** (`AuthManager`) and returns **structured results** (`AuthResult`) without leaking sensitive information.

---

## Features

* ✅ Credentials authentication (email + username + password)
* 🔗 Magic Link (passwordless) authentication
* 🍪 Session-based authentication with **secure token sessions**
* 🔄 **Token rotation on every session validation**
* 💤 **Idle session expiration** (configurable)
* 🧱 Max concurrent sessions per user with automatic revocation
* 🧩 Framework agnostic (Express, NestJS, Fastify, custom)
* 🗄️ Database agnostic (PostgreSQL, MongoDB)
* 🧪 Strong typing with unified `AuthResult` and `IAuthManager`
* 🧱 Clean architecture: `AuthManager → Services → Repositories → Infra`
* 🔒 Secure password hashing & token handling
* 🔄 PostgreSQL schema auto-validation and migration
* 🛡️ OWASP-aligned password strength and session handling

---

## Installation

```bash
npm install @restingowlorg/mvp-auth
```

**Environment Variables:**

* PostgreSQL: `POSTGRES_URL`
* MongoDB: `MONGO_URI`

---

## Initialization

### PostgreSQL

```ts
import { AuthManager } from "@restingowlorg/mvp-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7, // 7 days
  idleTtlSeconds: 60, // 1 min idle expiration
  maxSessionsPerUser: 3, // Limit concurrent sessions
});
```

### MongoDB

```ts
const auth = await AuthManager.init({
  dbType: "mongo",
  mongoUri: process.env.MONGO_URI!,
  authTypes: ["credentials"],
  sessionTtlSeconds: 60 * 60 * 24 * 7,
  idleTtlSeconds: 60,
  maxSessionsPerUser: 3,
});
```

> PostgreSQL schemas are auto-validated/created if missing. Custom table names supported via `userTableName`.

---

## Core Types

### `IAuthManager`

```ts
export interface IAuthManager {
  signup(email: string, username: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  logout(sessionToken: string): Promise<AuthResult>;
  me(sessionToken: string): Promise<AuthResult>;
  requestMagicLink?(email: string): Promise<AuthResult>;
  consumeMagicLink?(token: string): Promise<AuthResult>;
}
```

### `AuthResult`

```ts
export interface AuthResult<T = any> {
  success: boolean;
  data: T | null;
  httpCode: number;
  message: string;
}
```

> All APIs return `AuthResult` — sensitive information (passwords, token hashes) is never exposed.

---

## Usage Examples

### Credentials Signup & Login

```ts
// Signup
const signupResult = await auth.signup("user@test.com", "username", "StrongPassword123!");
res.status(signupResult.httpCode).json(signupResult);

// Login
const loginResult = await auth.login("user@test.com", "StrongPassword123!");
if (loginResult.success) {
  res.cookie("AUTH_SESSION", loginResult.data.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: loginResult.data.session.expiresAt.getTime() - Date.now(),
  });
}
res.status(loginResult.httpCode).json(loginResult);

// Validate / Rotate session
const meResult = await auth.me(loginResult.data.sessionToken);
console.log(meResult.data.sessionToken); // ⚡ New rotated token
```

### Magic Link Flow

```ts
// Request Magic Link
const magicResult = await auth.requestMagicLink!("user@test.com");
res.status(magicResult.httpCode).json(magicResult);

// Consume Magic Link
const consumeResult = await auth.consumeMagicLink!(token);
if (consumeResult.success) {
  res.cookie("AUTH_SESSION", consumeResult.data.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}
res.json(consumeResult);
```

> ⚠️ Tokens (`sessionToken`) are safe for API clients; passwords and token hashes are never returned.

---

## Security Notes

* Passwords hashed with `bcrypt`
* Sessions use **secure, revocable token-based approach**
* **Token rotation** on every validation prevents token reuse
* HTTP-only cookies recommended
* **Idle timeout** revokes inactive sessions
* **Max concurrent sessions** prevents account abuse
* Password checks follow OWASP guidelines

---

## Database Schema Reference (PostgreSQL)

| Table         | Columns                                                       |
| ------------- | ------------------------------------------------------------- |
| `users`       | id, email, username, password                                 |
| `sessions`    | id, user_id, token_hash, expires_at, last_used_at, revoked_at |
| `magic_links` | id, user_id, token, created_at, used_at                       |

> Library auto-creates or migrates schemas as needed.

---

## Best Practices

* Always use **HTTPS + Secure cookies**
* Keep **sessions short-lived**
* Validate external user tables before use
* Use **strong passwords** with optional breach checks
* Revoke tokens on logout, inactivity, or suspicious activity
* Monitor logs for **session rotations** 🔄 and revocations 🗑️

---

