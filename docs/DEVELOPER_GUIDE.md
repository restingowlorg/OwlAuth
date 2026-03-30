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

1. Blocks direct push to `develop`, `staging`, and `main`
2. Runs `npm run typecheck` and `npm run build` in parallel
3. Runs tests when tests are configured
4. Runs production security audit (`npm audit --omit=dev`)

In CI (`CI` or `GITHUB_ACTIONS`), critical vulnerabilities block push.

## Git Branching

Use this three-tier flow for all development work:

1. Create a feature branch from `develop`
2. Make commits on your feature branch
3. Push the feature branch
4. Open a pull request to `develop` (integration branch)
5. After merge to `develop` and validation in staging, the release workflow promotes `staging` → `main`

Protected branches (no direct push):

- `develop` (integration branch, where feature PRs merge first)
- `staging` (validation branch, updated from develop at release time)
- `main` (stable releases only, updated via release workflow)

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

Day-to-day development:

```bash
npm run lint
npm run lint:fix
npm run typecheck
npm run build
npm run format
npm run format:check
```

Before opening a PR:

```bash
npm run release:validate  # runs all checks in one command
```

For user-facing changes:

```bash
npm run changeset  # create a changeset entry
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

Use feature branches and open a pull request. Do not push directly to `develop`, `staging`, or `main`.

### Emergency bypass (local only)

```bash
SKIP_HOOKS=true git commit -m "emergency: hotfix"
SKIP_HOOKS=true git push
```

## Release Branches

Three-tier model for controlled development and releases:

- `develop`: integration branch where all feature PRs merge. Developers work here continuously. Run `npm run release:validate` before merge.
- `staging`: validation branch. Updated from `develop` at release time. This is where prerelease builds (`next` tag) are published for external validation.
- `main`: stable release branch. Only updated by the GitHub Actions release workflow when `staging` is promoted. Every commit to `main` publishes to npm with the `latest` tag.

For details on the release workflow, see `docs/RELEASE_DAY_RUNBOOK.md`.

## Team Rules

- Keep commits small and focused
- Do not commit secrets
- Keep files under 5MB (use Git LFS for large assets)
- Do not push directly to `develop`, `staging`, or `main` — use feature branches and PRs
- Run `npm run release:validate` locally before opening a PR to `develop`
- Include a changeset for any user-facing changes (run `npm run changeset`)
