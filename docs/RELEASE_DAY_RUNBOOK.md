# Release Day Runbook

This runbook is the shortest safe path for operators to publish:

- develop → staging (developers merge PRs to this continuously)
- staging → prerelease with npm tag `next` (validation phase)
- staging → main (promotion phase)
- main → stable release with npm tag `latest`

Use this document during release windows.

## 0) Preconditions (must be true)

- npm trusted publishing is enabled for `@restingowlorg/owlauth`
- GitHub Actions has workflow permission `id-token: write`
- Branch protections are enabled for `develop`, `staging`, and `main`
- Required checks are green
- You are not publishing from local machine manually

### 0.1 Publish Authentication Mode

The publish workflow is set up to use:

- npm trusted publishing via GitHub OIDC only

What this means operationally:

- No long-lived npm publish credential is needed in GitHub
- Repo/org secrets should not define `NPM_TOKEN` or `NODE_AUTH_TOKEN` for publish jobs
- `GITHUB_TOKEN` is still required because Changesets uses it to create or update the release PR

Do not publish manually from a local machine unless you are handling a one-off emergency outside the normal release path.

## 1) Development Integration (Continuous)

Developers merge feature PRs to `develop`:

- Open PRs from feature branches into `develop`
- Run `npm run release:validate` locally before opening
- Wait for CI/Security/CodeQL checks to pass
- Merge PR into `develop`
- Add changesets for user-facing changes

## 2) Collect Changes to Staging (Release Prep)

When ready to prepare a release:

### 2.1 Merge develop into staging

- Create PR: `develop` -> `staging`
- Review all accumulated changes
- Verify changesets are present for user-facing updates
- Confirm CI/Security/CodeQL checks pass
- Merge PR into `staging`

### 2.2 Trigger prerelease publish (manual)

- Go to **Actions → Release → Run workflow**
- Select branch: `staging`
- Set `release_mode` to `prerelease`
- Ensure repo/org secrets do **not** set `NPM_TOKEN` or `NODE_AUTH_TOKEN` so npm OIDC trusted publishing is used
- Pipeline does:
  - `npm ci`
  - `npm run release:validate`
  - artifact smoke test
  - `changeset pre enter next`
  - `changeset version`
  - `changeset publish` (publishes to the `next` dist-tag while in prerelease mode)

### 2.3 Verify prerelease tag

```bash
npm view @restingowlorg/owlauth dist-tags
```

Expected:

- `next` points to prerelease version
- `latest` is unchanged

### 2.4 Consumer smoke install (recommended)

```bash
mkdir -p /tmp/owlauth-next-check && cd /tmp/owlauth-next-check
npm init -y
npm i @restingowlorg/owlauth@next
node -e 'require("@restingowlorg/owlauth"); require("@restingowlorg/owlauth/mongo"); require("@restingowlorg/owlauth/postgres"); console.log("next install OK")'
```

## 3) Validation Phase

Test the `next` prerelease in your integration/staging environment:

- Install and run smoke tests
- Verify behavior matches release notes
- Check for regressions
- Monitor any external beta feedback

If issues are found:

- Fix in `develop`
- Merge to `staging` again
- Republish `next`
- Retest

## 4) Promote to Stable (latest)

Once `next` is validated:

### 4.1 Merge staging into main

- Create PR: `staging` -> `main`
- Confirm release notes/changelog quality
- Confirm CI/Security/CodeQL checks pass
- Merge PR into `main`

### 4.2 Trigger stable publish

- Merging into `main` triggers **Actions → Release** automatically
- If you need a manual retry, use **Actions → Release → Run workflow** on the `main` branch and set `release_mode` to `stable`
- Ensure repo/org secrets do **not** set `NPM_TOKEN` or `NODE_AUTH_TOKEN` so npm OIDC trusted publishing is used
- Pipeline does:
  - `npm ci`
  - `npm run release:validate`
  - artifact smoke test
  - `changeset pre exit` (if prerelease mode is active)
  - changesets action: creates versioning PR or publishes if PR already merged
  - GitHub Release and Git tag created automatically

### 4.3 Verify stable tag

```bash
npm view @restingowlorg/owlauth dist-tags
```

Expected:

- `latest` points to new stable version
- GitHub Release with release notes is visible at `https://github.com/restingowlorg/OwlAuth/releases`
- Git tag `v{version}` exists on `main`

### 4.4 Clean up stale next tag

```bash
npm dist-tag rm @restingowlorg/owlauth next
```

- `latest` points to stable version
- `next` may still point to latest prerelease

## 5) Post-Release Verification

### 5.1 Install stable package in clean temp project

```bash
mkdir -p /tmp/owlauth-latest-check && cd /tmp/owlauth-latest-check
npm init -y
npm i @restingowlorg/owlauth@latest
node -e 'require("@restingowlorg/owlauth"); require("@restingowlorg/owlauth/mongo"); require("@restingowlorg/owlauth/postgres"); console.log("latest install OK")'
```

### 5.2 Review release artifacts

- Check GitHub Release notes
- Check published version in npm
- Confirm changelog/version match expected scope

## 6) Failure Handling

### 6.1 If develop → staging merge fails

1. Fix CI issues in `develop`
2. Merge fix to `develop`
3. Retry staging merge

### 6.2 If prerelease workflow fails

1. Open failed workflow logs
2. Fix issue in a PR to `develop`
3. Merge fix PR to `develop`
4. Merge `develop` → `staging` again to retrigger prerelease
5. Recheck `dist-tags`

### 6.3 If stable workflow fails

1. Do not publish manually from local machine
2. Fix issue in PR to `develop` (or PR directly to `staging` if urgent)
3. Rerun workflow after merge

### 6.4 If bad version published

- Publish a corrective patch version quickly
- Add clear release notes with remediation
- For severe auth/security regression: trigger hotfix flow immediately

## 7) No-Go Conditions

Stop release and do not publish if any is true:

- `npm run release:validate` fails
- branch protections/checks were bypassed
- dist-tag output is unexpected
- smoke install/import check fails

## 8) One-Page Checklist

```md
### Staging Phase

- [ ] release:validate passed on develop
- [ ] develop PR merged and checks passed
- [ ] develop → staging merged and prerelease workflow passed
- [ ] next tag verified
- [ ] consumer install check for next passed

### Release Phase

- [ ] validation tests passed on next
- [ ] staging → main merged and stable workflow passed
- [ ] latest tag verified
- [ ] consumer install check for latest passed
- [ ] release notes/changelog verified
```
