# Changesets

Use Changesets to manage version bumps and changelog entries for user-facing changes.

## Create a changeset

```bash
npm run changeset
```

Choose the package, select `patch`, `minor`, or `major`, and write a short user-facing summary.

## Generate version updates locally

```bash
npm run version-packages
```

## Publish

Publishing is handled by the GitHub Actions release workflow.
