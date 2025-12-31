
---

# 🛡️ Flex Auth

A **framework-agnostic**, **database-agnostic** authentication library for Node.js that provides **Credentials** and **Magic Link (passwordless)** authentication using a clean, layered architecture.

Flex Auth exposes **pure business services** and returns **structured results**, giving full control to the consuming application (Express, NestJS, Fastify, etc.).

---

## ✨ Features

* ✅ Credentials authentication (email + username + password)
* 🔗 Magic link (passwordless) authentication
* 🍪 Session-based authentication
* 🧩 Framework agnostic (Express, NestJS, Fastify, custom)
* 🗄️ Database agnostic (PostgreSQL, MongoDB)
* 🧪 Strong typing with unified `AuthResult` and `IAuthManager`
* 🧱 Clean architecture (Manager → Services → Repositories → Infra)
* 🔒 Secure password hashing & token handling
* 🔄 Automatic PostgreSQL schema validation & migrations
* 🛡️ Password strength & breach checks (OWASP-aligned)

---

## 🧠 Design Philosophy

> **Flex Auth does not handle HTTP, routes, or controllers.**

Instead, it:

* Exposes **business-level service methods** via `AuthManager`
* Returns **structured results** (`AuthResult`)
* Keeps **framework logic outside the library**

This ensures:

* No framework lock-in
* Predictable behavior
* Easy testing
* Clean separation of concerns

---

## 📦 Installation

```bash
npm install flex-auth
```

---

## 📁 Folder Structure

```txt
src/
├── auth-manager.ts
├── types.ts
├── interfaces.ts
├── config/
│   └── defaults.ts
├── helpers/
│   ├── database.init.ts
│   └── initAuthServices.ts
├── authentication_methods/
│   ├── credentials/
│   │   ├── auth.service.ts
│   │   └── session.service.ts
│   └── magic-links/
│       └── magic-link.service.ts
├── infra/
│   ├── crypto/
│   │   └── crypto.ts
│   ├── security/
│   │   └── pwned-passwords.ts
│   ├── mongo/
│   │   └── db.ts
│   └── postgres/
│       └── db.ts
└── repositories/
    ├── contracts.ts
    ├── mongo/
    │   ├── user.repo.ts
    │   ├── session.repo.ts
    │   └── magicLink.repo.ts
    └── postgres/
        ├── user.repo.ts
        ├── session.repo.ts
        └── magicLink.repo.ts
```

---

## 🧩 Core Types

### `IAuthManager`

```ts
export interface IAuthManager {
  signup: (email: string, username: string, password: string) => Promise<AuthResult>;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: (sessionId: string) => Promise<AuthResult>;
  me: (sessionId: number) => Promise<AuthResult>;
  requestMagicLink?: (email: string) => Promise<AuthResult>;
  consumeMagicLink?: (token: string) => Promise<AuthResult>;
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

> All public APIs **always return `AuthResult`** — no thrown errors leak to consumers.

---

## 🚀 Initializing AuthManager

### PostgreSQL

```ts
import { AuthManager } from "flex-auth";

const auth = await AuthManager.init({
  dbType: "postgres",
  postgresUrl: process.env.POSTGRES_URL!,
  authTypes: ["credentials", "magic-link"],
  sessionTtlSeconds: 60 * 60 * 24 * 7,
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

> ⚠️ PostgreSQL schemas and missing columns are **automatically created or validated** without breaking existing data.

---

## 🔐 Credentials Authentication

### Signup

```ts
const result = await auth.signup("user@test.com", "username", "StrongPassword123!");
if (!result.success) return res.status(result.httpCode).json(result);
res.status(201).json(result);
```

### Login

```ts
const result = await auth.login("user@test.com", "StrongPassword123!");
if (!result.success) return res.status(result.httpCode).json(result);

res.cookie("AUTH_SESSION", result.data.session.id, {
  httpOnly: true,
  sameSite: "lax",
});
```

### Logout

```ts
const result = await auth.logout(sessionId);
res.status(result.httpCode).json(result);
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

> Tokens are **never returned in production**.

### Consume Magic Link

```ts
const result = await auth.consumeMagicLink!(token);
if (!result.success) return res.status(result.httpCode).json(result);

res.cookie("AUTH_SESSION", result.data.session.id);
res.json(result);
```

---

## 🛡️ Security Notes

* Passwords hashed with `bcrypt`
* Magic tokens are hashed & single-use
* Sessions validated server-side
* HTTP-only cookies recommended
* Password checks follow OWASP guidelines

---

## 🧠 Why This Architecture?

### ✅ Benefits

* Database agnostic
* Framework agnostic
* Predictable error handling via `AuthResult`
* No hidden side effects
* Easy to test and extend
* Dynamic service initialization via `initAuthServices`

### ⚠️ Trade-offs

* Consumers manage controllers/routes
* Explicit HTTP mapping required

> Mirrors SDK-style libraries like Prisma Client, Stripe SDK, and AWS SDK.

---