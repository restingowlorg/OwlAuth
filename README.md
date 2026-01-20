
````markdown
# 🛡️ MVP Auth (Authentication-Only)

**MVP Auth** is a **framework-agnostic** and **database-agnostic** Node.js **authentication library** focused exclusively on **OWASP ASVS V6 – Authentication**.  

It provides **secure user identity verification** (credentials and magic links) without managing sessions, tokens, or cookies. Consumer applications remain fully responsible for **session management, tokens, cookies, and authorization**.

---

## 🎯 Scope & Philosophy

MVP Auth **does NOT**:

* Create or manage sessions
* Issue or rotate tokens
* Store cookies
* Enforce authorization or permissions
* Implement OAuth / OIDC flows

All these concerns are left to the **consumer application** or separate libraries.

---

## Features

* ✅ Credentials authentication (email + username + password)
* 🔗 Magic Link (passwordless) authentication
* 🔐 OWASP-aligned password validation:
  * Minimum length & entropy checks
  * Breached password detection
  * Context-aware blocked passwords
* 🧱 Stateless authentication responses
* 🧩 Framework-agnostic (Express, NestJS, Fastify, custom)
* 🗄️ Database-agnostic (PostgreSQL, MongoDB, custom adapters)
* 🧪 Strong typing with unified `AuthResult`
* 🧼 Clean architecture: `AuthManager → Services → Repositories → Infra`
* 🔒 Secure password & token hashing
* 📜 Designed for OWASP ASVS V6 compliance

---

## Installation

```bash
npm install @restingowlorg/mvp-auth
````

---

## Initialization

### PostgreSQL

```ts
import { AuthManager } from "@restingowlorg/mvp-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  blockedPasswords: ["companyname", "admin"], // optional blocked words
});
```

### MongoDB

```ts
const auth = await AuthManager.init({
  dbType: "mongo",
  mongoUri: process.env.MONGO_URI!,
  authTypes: ["credentials"],
});
```

> The library automatically **validates or creates `users` and `magic_links` tables** if they do not exist.

---

## Core Types

### `IAuthManager`

```ts
export interface IAuthManager {
  signup(email: string, username: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  changePassword(
    req: any, // Must contain req.user.id set by consumer app
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult>;

  requestMagicLink?(email: string): Promise<AuthResult>;
  consumeMagicLink?(token: string): Promise<AuthResult>;
}
```

> `changePassword`, `requestMagicLink`, and `consumeMagicLink` are optional in the interface; consumers must check or assert (`!`) if using them.

---

### `AuthResult`

```ts
export interface AuthResult<T = any> {
  success: boolean;
  data: T | null;
  httpCode: number;
  message: string;
}
```

> All APIs return `AuthResult`. Sensitive information (passwords, token hashes) is **never exposed**.

---

## Usage Examples

### Credentials Signup

```ts
const result = await auth.signup(
  "user@test.com",
  "username",
  "StrongPassword123!"
);

res.status(result.httpCode).json(result);
```

---

### Credentials Login (Stateless)

```ts
const result = await auth.login("user@test.com", "StrongPassword123!");

if (result.success) {
  // Consumer decides:
  // - Create session
  // - Issue JWT
  // - Set cookies
}

res.status(result.httpCode).json(result);
```

Returned `data` example:

```json
{
  "user": {
    "id": "user_id",
    "email": "user@test.com",
    "username": "username"
  }
}
```

---

### Change Password

```ts
// Consumer must ensure the user is authenticated
if (!auth.changePassword) throw new Error("Change password not enabled");

const result = await auth.changePassword(
  req, // must contain req.user.id
  "CurrentPassword123!",
  "NewStrongPassword456!"
);

res.status(result.httpCode).json(result);
```

> 🔐 Authentication is assumed to be **handled by the consumer** before calling this method.

---

### Magic Link Flow

#### Request Magic Link

```ts
const result = await auth.requestMagicLink!("user@test.com");

// Send the token via email in consumer application
res.status(result.httpCode).json(result);
```

#### Consume Magic Link

```ts
const result = await auth.consumeMagicLink!(token);

if (result.success) {
  // Consumer decides how to authenticate user
  // e.g., issue token, create session, set cookie
}

res.json(result);
```

---

## Security Notes (OWASP ASVS V6)

* Passwords hashed with a **strong adaptive hashing algorithm**
* Password strength validated using **entropy analysis**
* **Breached passwords rejected**
* Context-aware password blocking (email, username, custom words)
* Magic link tokens:

  * Cryptographically secure
  * Single-use & time-limited
  * Stored hashed at rest
* Responses are stateless and safe for API usage

---

## Database Schema Reference

### Users

| Column   | Description     |
| -------- | --------------- |
| id       | User identifier |
| email    | Unique email    |
| username | Unique username |
| password | Hashed password |

### Magic Links

| Column     | Description            |
| ---------- | ---------------------- |
| id         | Record ID              |
| user_id    | Reference to `users`   |
| token_hash | Hashed magic token     |
| expires_at | Expiration timestamp   |
| used_at    | Single-use enforcement |

```
