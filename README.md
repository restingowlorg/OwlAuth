
---

# 🛡️ Flex Auth - MVP Open Source Auth Library

A **framework-agnostic**, **database-agnostic** authentication library for Node.js providing **Credentials** and **Magic Link (passwordless)** authentication using a clean, layered architecture.

This library exposes **pure business functions**, not HTTP controllers — giving full control to the consumer application (Express, NestJS, Fastify, etc.).

---

## ✨ Features

* ✅ Credentials authentication (email + password)
* 🔗 Magic link (passwordless) authentication
* 🍪 Session-based authentication
* 🧩 Framework agnostic (Express, NestJS, Fastify, custom)
* 🗄️ Database agnostic (MongoDB, PostgreSQL)
* 🧪 Strong typing with unified result format
* 🧱 Clean architecture (Services, Repositories, Infra)
* 🔒 Secure password hashing & token handling
* 🔄 Automatic PostgreSQL migrations for missing columns
* 🛡️ Password strength validation and breach checks (OWASP guidelines)

---

## 🧠 Design Philosophy

> **The library does not handle HTTP, routes, or responses.**

Instead, it:

* Exposes **pure business functions**
* Returns **structured results** (`AuthResult`)
* Lets **developers decide** how to map results to their framework

This avoids:

* Framework lock-in
* Adapter complexity
* Controller duplication
* Hidden magic

---

## 📦 Installation

```bash
npm i mvp-flex-auth
```

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

### `AuthResult`

```ts
export interface AuthResult<T = any> {
  success: boolean;
  data: T | null;
  httpCode: number;
  message: string;
}
```

### Helper Functions

```ts
export function success<T>(
  data: T,
  message = "Success",
  httpCode = 200
): AuthResult<T> {
  return { success: true, data, httpCode, message };
}

export function failure(
  message: string,
  httpCode = 400
): AuthResult<null> {
  return { success: false, data: null, httpCode, message };
}
```

---

## 🚀 Initializing AuthManager

You can now initialize with **MongoDB or PostgreSQL**:

### MongoDB Example

```ts
import { AuthManager } from "mvp-flex-auth";

const auth = await AuthManager.init({
  dbType: "mongo",
  mongoUri: process.env.MONGO_URI!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7, // 7 days
});
```

### PostgreSQL Example (with automatic migrations)

```ts
import { AuthManager } from "mvp-flex-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7, // 7 days
});
```

> ⚠️ Tables and missing columns will be **created automatically** if they don’t exist. Existing tables with extra columns are preserved.

---

## 🔐 Credentials Authentication

### Signup (with OWASP password checks)

```ts
const result = await auth.signup("user@test.com", "Password123!");
if (!result.success) return res.status(result.httpCode).json(result);
res.status(201).json(result);
```

* Validates password strength
* Checks password against known breaches (Pwned Passwords API)
* Hashes password securely before saving

### Login

```ts
const result = await auth.login("user@test.com", "Password123!");
if (!result.success) return res.status(result.httpCode).json(result);

// result.data = { user, session }
res.cookie("AUTH_SESSION", result.data!.session.id, { httpOnly: true });
res.json(result);
```

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

---

## 🧪 Express Example (Minimal)

```ts
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const result = await auth.login(email, password);
  res.status(result.httpCode).json(result);
});
```

---

## 🛡️ Security Notes

* Passwords hashed using `bcrypt`
* Magic tokens are hashed & single-use
* Sessions are validated server-side
* Cookies are HTTP-only by default
* Passwords are checked for **strength** and **known breaches** following [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 🧠 Why This Approach?

### ✅ Pros

* No framework lock-in
* No adapters to maintain
* Easy testing (pure functions)
* Predictable error handling
* Works with REST, GraphQL, RPC, serverless
* Excellent DX for advanced users

### ⚠️ Trade-offs

* Consumers must define routes/controllers
* HTTP response mapping is manual

> This design mirrors SDKs like Stripe, Prisma Client, Auth0, AWS SDK.

---

## 🧪 Testing

* Use Postman or curl
* Inspect returned `AuthResult`
* Assert `success === true/false`
* Tokens only logged in development

---