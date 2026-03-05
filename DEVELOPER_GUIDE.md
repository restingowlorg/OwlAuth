# Developer Guide

## Purpose

This project uses Git hooks to enforce commit quality, code formatting, type safety, and push-time validation.

Hook management is implemented with Husky and follows conventional commit standards.

## Prerequisites

- Node.js 18+
- npm 9+
- Git

## One-Time Setup

```bash
npm install
npm run prepare
chmod +x .husky/commit-msg .husky/pre-commit .husky/pre-push
```

## Commit Message Standard

Use Conventional Commits:

```text
type(scope): description
```

Examples:

- `feat(auth): add refresh token rotation`
- `fix(db): prevent duplicate session insert`
- `docs(common): update usage examples`

Allowed types:

- `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`

Allowed scopes:

- `api`, `ui`, `db`, `auth`, `core`, `infra`, `config`, `test`, `common`, `docs`

Rules:

- Header length: 10 to 100 characters
- Subject starts lowercase
- No period at the end

## Hook Behavior

### `commit-msg`

- Runs `commitlint`
- Blocks invalid commit messages

### `pre-commit`

Runs these checks in order:

1. Secret scan (`secretlint`)
2. File size check (max 5MB)
3. Package lock consistency (`npm ls`)
4. ESLint auto-fix on `src/`
5. `lint-staged` (includes zero-warning ESLint policy)
6. Incremental TypeScript check (`tsc --noEmit --incremental`)

Commit is blocked if any required check fails.

### `pre-push`

Runs these checks:

1. Blocks direct push to `main`, `develop`, `staging`
2. Runs `npm run typecheck` and `npm run build` in parallel
3. Runs tests when tests are configured
4. Runs production security audit (`npm audit --omit=dev`)

In CI (`CI` or `GITHUB_ACTIONS`), critical vulnerabilities block push.

## Git Branching

Use this flow for all development work:

1. Create a feature branch from `develop`
2. Make commits on your feature branch
3. Push the feature branch
4. Open a pull request to `develop`

Protected branches (no direct push):

- `main`
- `develop`
- `staging`

Recommended branch names:

- `feature/add-magic-link-expiry`
- `fix/session-validation-bug`
- `chore/update-hook-config`

Commands:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/short-description
git push -u origin feature/short-description
```

## Useful Commands

```bash
npm run lint
npm run lint:fix
npm run typecheck
npm run build
npm run format
npm run format:check
```

## Troubleshooting

### Hooks not running

```bash
npm run prepare
git config core.hooksPath
```

Expected hooks path: `.husky`

### Commit blocked by lint or type errors

```bash
npm run lint
npm run lint:fix
npm run typecheck
```

### Commit message rejected

Use:

```text
type(scope): description
```

### Push blocked on protected branch

Use feature branches and open a pull request.

### Emergency bypass (local only)

```bash
SKIP_HOOKS=true git commit -m "emergency: hotfix"
SKIP_HOOKS=true git push
```

## Team Rules

- Keep commits small and focused
- Do not commit secrets
- Keep files under 5MB (use Git LFS for large assets)
- Do not push directly to protected branches
