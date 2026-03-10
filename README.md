---
# 🛡️ Flex Auth - MVP Open Source Auth Library

<<<<<<< HEAD
A **framework-agnostic**, **database-agnostic** authentication library for Node.js providing **Credentials** and **Magic Link (passwordless)** authentication using a clean, layered architecture.

This library exposes **pure business functions**, not HTTP controllers — giving full control to the consumer application (Express, NestJS, Fastify, etc.).
---

## ✨ Features

- ✅ Credentials authentication (email + password)
- 🔗 Magic link (passwordless) authentication
- 🍪 Session-based authentication
- 🧩 Framework agnostic (Express, NestJS, Fastify, custom)
- 🗄️ Database agnostic (MongoDB, PostgreSQL)
- 🧪 Strong typing with unified result format
- 🧱 Clean architecture (Services, Repositories, Infra)
- 🔒 Secure password hashing & token handling
- 🔄 Automatic PostgreSQL migrations for missing columns
- # 🛡️ Password strength validation and breach checks (OWASP guidelines)

````markdown
# 🛡️ MVP Auth (Authentication-Only)

**MVP Auth** is a **framework-agnostic** and **database-agnostic** Node.js **authentication library** focused exclusively on **OWASP ASVS V6 – Authentication**.

It provides **secure user identity verification** (credentials and magic links) without managing sessions, tokens, or cookies. Consumer applications remain fully responsible for **session management, tokens, cookies, and authorization**.

> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

---

## 🧠 Design Philosophy

<<<<<<< HEAD

> # **The library does not handle HTTP, routes, or responses.**
>
> MVP Auth **does NOT**:
>
> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

Instead, it:

<<<<<<< HEAD

- Exposes **pure business functions**
- Returns **structured results** (`AuthResult`)
- Lets **developers decide** how to map results to their framework

This avoids:

- Framework lock-in
- Adapter complexity
- Controller duplication
- Hidden magic

---

## 📦 Installation

```bash
npm i mvp-flex-auth
```

## Development

For local development workflow, commit conventions, and Git hooks, see:

- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

---

## 📁 Folder Structure

```txt
src/
├── auth-manager.ts
├── types.ts
├── config/
│   └── defaults.ts
├── authentication_methods/
│   ├── credentials/
│   │   ├── auth.service.ts
│   │   └── session.service.ts
│   └── magic-links/
│       └── magic-link.service.ts
├── infra/
│   ├── crypto/
│   │   └── crypto.ts
│   ├── mongo/
│   │   └── db.ts
│   └── postgres/
│       └── db.ts          # PostgreSQL infra with automatic migrations
└── repositories/
    ├── mongo/
    │   ├── user.repo.ts
    │   ├── session.repo.ts
    │   └── magicLink.repo.ts
    └── postgres/
        ├── user.ts
        ├── session.ts
        └── magicLink.ts
```

---

## 🧩 Core Types

=======
All these concerns are left to the **consumer application** or separate libraries.

---

## Features

- ✅ Credentials authentication (email + username + password)
- 🔗 Magic Link (passwordless) authentication
- 🔐 OWASP-aligned password validation:
  - Minimum length & entropy checks
  - Breached password detection
  - Context-aware blocked passwords
- 🧱 Stateless authentication responses
- 🧩 Framework-agnostic (Express, NestJS, Fastify, custom)
- 🗄️ Database-agnostic (PostgreSQL, MongoDB, custom adapters)
- 🧪 Strong typing with unified `AuthResult`
- 🧼 Clean architecture: `AuthManager → Services → Repositories → Infra`
- 🔒 Secure password & token hashing
- 📜 Designed for OWASP ASVS V6 compliance

---

## Installation

```bash
npm install @restingowlorg/mvp-auth
```
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
  blockedPasswords: ["companyname", "admin"] // optional blocked words
});
```

### MongoDB

```ts
const auth = await AuthManager.init({
  dbType: "mongo",
  mongoUri: process.env.MONGO_URI!,
  authTypes: ["credentials"]
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

> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

### `AuthResult`

```ts
export interface AuthResult<T = any> {
  success: boolean;
  data: T | null;
  httpCode: number;
  message: string;
}
```

<<<<<<< HEAD

### Helper Functions

````ts
export function success<T>(data: T, message = "Success", httpCode = 200): AuthResult<T> {
  return { success: true, data, httpCode, message };
=======
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
````

---

### Credentials Login (Stateless)

```ts
const result = await auth.login("user@test.com", "StrongPassword123!");

if (result.success) {
  // Consumer decides:
  // - Create session
  // - Issue JWT
  // - Set cookies
>>>>>>> 3681d1f (Refactor changePassword to use userId and update docs)
}

export function failure(message: string, httpCode = 400): AuthResult<null> {
  return { success: false, data: null, httpCode, message };
}
```

---

## 🚀 Initializing AuthManager

You can now initialize with **MongoDB or PostgreSQL**:

### MongoDB Example

```ts
<<<<<<< HEAD
import { AuthManager } from "mvp-flex-auth";
=======
// Consumer must ensure the user is authenticated
if (!auth.changePassword) throw new Error("Change password not enabled");

const result = await auth.changePassword(
  req, // must contain req.user.id
  "CurrentPassword123!",
  "NewStrongPassword456!"
);
>>>>>>> 3681d1f (Refactor changePassword to use userId and update docs)

const auth = await AuthManager.init({
  dbType: "mongo",
  mongoUri: process.env.MONGO_URI!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7 // 7 days
});
```

<<<<<<< HEAD

### PostgreSQL Example (with automatic migrations)

```ts
import { AuthManager } from "mvp-flex-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7 // 7 days
});
```

> # ⚠️ Tables and missing columns will be **created automatically** if they don’t exist. Existing tables with extra columns are preserved.
>
> 🔐 Authentication is assumed to be **handled by the consumer** before calling this method.
>
> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

---

## 🔐 Credentials Authentication

### Signup (with OWASP password checks)

```ts
<<<<<<< HEAD
const result = await auth.signup("user@test.com", "Password123!");
if (!result.success) return res.status(result.httpCode).json(result);
res.status(201).json(result);
=======
const result = await auth.requestMagicLink!("user@test.com");

// Send the token via email in consumer application
res.status(result.httpCode).json(result);
>>>>>>> 3681d1f (Refactor changePassword to use userId and update docs)
```

- Validates password strength
- Checks password against known breaches (Pwned Passwords API)
- Hashes password securely before saving

### Login

```ts
const result = await auth.login("user@test.com", "Password123!");
if (!result.success) return res.status(result.httpCode).json(result);

<<<<<<< HEAD
// result.data = { user, session }
res.cookie("AUTH_SESSION", result.data!.session.id, { httpOnly: true });
res.json(result);
```

=======
if (result.success) {
// Consumer decides how to authenticate user
// e.g., issue token, create session, set cookie
}

> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

### Logout

```ts
await auth.logout(sessionId);
```

### Get Current User (`me`)

```ts
const result = await auth.me(sessionId);
if (!result.success) return res.status(401).json(result);
res.json(result);
```

---

## 🔗 Magic Link Authentication

<<<<<<< HEAD

### Request Magic Link

```ts
const result = await auth.requestMagicLink!("user@test.com");
res.status(result.httpCode).json(result);
```

> ⚠️ Token is **logged only in development**, never returned in production.

### Consume Magic Link

```ts
const result = await auth.consumeMagicLink!(token);
if (!result.success) return res.status(result.httpCode).json(result);

// result.data = { userId, session }
res.cookie("AUTH_SESSION", result.data!.session.id);
res.json(result);
```

=======

- Passwords hashed with a **strong adaptive hashing algorithm**
- Password strength validated using **entropy analysis**
- **Breached passwords rejected**
- Context-aware password blocking (email, username, custom words)
- Magic link tokens:
  - Cryptographically secure
  - Single-use & time-limited
  - Stored hashed at rest

- Responses are stateless and safe for API usage
  > > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

---

## 🧪 Express Example (Minimal)

<<<<<<< HEAD

```ts
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await auth.login(email, password);
  res.status(result.httpCode).json(result);
});
```

---

## 🛡️ Security Notes

- Passwords hashed using `bcrypt`
- Magic tokens are hashed & single-use
- Sessions are validated server-side
- Cookies are HTTP-only by default
- Passwords are checked for **strength** and **known breaches** following [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 🧠 Why This Approach?

### ✅ Pros

- No framework lock-in
- No adapters to maintain
- Easy testing (pure functions)
- Predictable error handling
- Works with REST, GraphQL, RPC, serverless
- Excellent DX for advanced users

### ⚠️ Trade-offs

- Consumers must define routes/controllers
- HTTP response mapping is manual

> This design mirrors SDKs like Stripe, Prisma Client, Auth0, AWS SDK.

---

## 🧪 Testing

- Use Postman or curl
- Inspect returned `AuthResult`
- Assert `success === true/false`
- # Tokens only logged in development

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

> > > > > > > 3681d1f (Refactor changePassword to use userId and update docs)

```

```
