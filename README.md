

# 🛡️ MVP Auth (Authentication-Only)

**MVP Auth** is a **framework-agnostic** and **database-agnostic** Node.js **authentication library** focused exclusively on **OWASP ASVS V6 – Authentication**.

It provides **secure user identity verification** (credentials and magic links) without imposing session, token, or state management, allowing consumer applications to fully control **sessions, tokens, cookies, and authorization**.

---

## 🎯 Scope & Philosophy

It intentionally **does NOT**:

* Create or manage sessions
* Issue or rotate tokens
* Store cookies
* Enforce authorization or permissions
* Implement OAuth / OIDC flows

These concerns are expected to be handled by **consumer applications or separate libraries**.

---

## Features

* ✅ Credentials authentication (email + username + password)
* 🔗 Magic Link (passwordless) authentication
* 🔐 OWASP-aligned password validation

  * Minimum length & entropy checks
  * Breached password detection
  * Context-aware blocked passwords
* 🧱 Stateless authentication responses
* 🧩 Framework agnostic (Express, NestJS, Fastify, custom)
* 🗄️ Database agnostic (PostgreSQL, MongoDB, custom adapters)
* 🧪 Strong typing with unified `AuthResult`
* 🧼 Clean architecture: `AuthManager → Services → Repositories → Infra`
* 🔒 Secure password & token hashing
* 📜 Designed for OWASP ASVS V6 compliance


## Installation

```bash
npm install @restingowlorg/mvp-auth
```

---

## Initialization

### PostgreSQL

```ts
import { AuthManager } from "@restingowlorg/mvp-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  blockedPasswords: ["companyname", "admin"],
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

> Database schemas for **users** and **magic links** are validated or created automatically.

---

## Core Types

### `IAuthManager`

```ts
export interface IAuthManager {
  signup(email: string, username: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
  changePassword(
    req: any,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult>;

  requestMagicLink?(email: string): Promise<AuthResult>;
  consumeMagicLink?(token: string): Promise<AuthResult>;
}
```

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

> All APIs return `AuthResult`.
> Passwords, hashes, and secrets are **never exposed**.

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
  // Consumer app decides:
  // - Create session
  // - Issue JWT
  // - Set cookie
  // - Call downstream services
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
const result = await auth.changePassword(
  req, // must contain req.user.id (set by consumer app)
  "CurrentPassword123!",
  "NewStrongPassword456!"
);

res.status(result.httpCode).json(result);
```

> 🔐 Authentication is assumed to be handled **before** calling this method.

---

### Magic Link Flow

#### Request Magic Link

```ts
const result = await auth.requestMagicLink!("user@test.com");

// Send token via email in consumer app
res.status(result.httpCode).json(result);
```

#### Consume Magic Link

```ts
const result = await auth.consumeMagicLink!(token);

if (result.success) {
  // Consumer app decides how to authenticate the user:
  // - Issue token
  // - Create session
}

res.json(result);
```

---

## Security Notes (OWASP ASVS V6)

* Passwords hashed using a strong adaptive hashing algorithm
* Password strength validated using entropy analysis
* Breached passwords rejected
* Context-aware password blocking (email, username, custom words)
* Magic link tokens:

  * Cryptographically secure
  * Single-use
  * Time-limited
  * Stored hashed at rest
* Authentication responses are stateless and safe for APIs

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
| user_id    | User reference         |
| token_hash | Hashed magic token     |
| expires_at | Expiration timestamp   |
| used_at    | Single-use enforcement |

---
