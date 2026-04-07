# Contributing

Thanks for contributing to `@restingowlorg/owlauth`.

This project is a security-sensitive authentication library, so all changes are expected to meet a higher review and release quality bar.

## Development Setup

```bash
npm install
npm run prepare
```

## Branching

- Branch from `develop`, not `main` or `staging`
- Use names like `feature/...`, `fix/...`, `chore/...`
- PRs target `develop` first — work is integrated here continuously
- `staging` is validation-only (managed by releases)
- `main` is release-only (updated by the release workflow)
- Open a pull request for every change

## Pull Request Expectations

PRs should be:

- Small and focused
- Backed by tests when behavior changes
- Documented when public behavior changes
- Accompanied by a changeset for user-facing changes

## Required Checks

Before opening or updating a PR, run:

```bash
npm run release:validate
```

This runs format check, lint (zero warnings), type check, build, and the full test suite. All must pass.

## Changesets

Add a changeset for any user-facing change:

```bash
npm run changeset
```

Use:

- `patch` for fixes and safe security improvements
- `minor` for backward-compatible features
- `major` for breaking changes

## Security-Sensitive Changes

Changes involving authentication flows, password policy, token handling, logging, or database adapters should include:

- Clear rationale
- Regression tests where feasible
- Notes about compatibility or migration impact

## Commit Messages

This repository uses Conventional Commits and commitlint.

Examples:

- `fix(auth): prevent magic link replay`
- `feat(core): add audit logger interface`
- `docs(release): add maintainer workflow`
