# Detailed Release Sync Runbook

This runbook documents the full release flow for this repository when using long-lived `develop`, `staging`, and `main` branches together with Changesets and npm trusted publishing.

It also covers the release-state sync step that must happen after a stable release reaches `main`.

Use this document when:

- you have released a stable version from `main`
- `develop` and `staging` are still behind in version metadata
- you need to ship another patch or minor release after that
- you want one repeatable process for prerelease and stable publication

## Why This Runbook Exists

This repo uses:

- `develop` for ongoing integration work
- `staging` for prerelease validation and the npm `next` dist-tag
- `main` for stable releases and the npm `latest` dist-tag

Changesets creates release metadata on the branch that is being prepared for publication. After a stable release lands on `main`, that branch can contain release-only commits that do not automatically flow back to `develop`, such as:

- version bumps
- changelog updates
- consumed changeset removals
- release PR merge commits

If `main` is not synced back into `develop`, the next prerelease can be cut from the wrong baseline. In practice that can cause Changesets to try to reuse an already-published prerelease version instead of creating the next correct version.

## Release Model

The expected branch flow is:

1. feature branch -> `develop`
2. `develop` -> `staging`
3. prerelease from `staging` -> npm `next`
4. `staging` -> `main`
5. Changesets release PR -> `main`
6. stable publish from `main` -> npm `latest`
7. `main` -> `develop` sync after stable release

The important rule is:

Stable publication updates npm `latest` only after the Changesets bot PR is merged into `main` and the final release workflow succeeds.

## Dist-Tag Expectations

- `next` is for prereleases from `staging`
- `latest` is for stable releases from `main`

Running the prerelease workflow on `staging` does not update npm `latest`.

## Standard Release Cycle

### Step 1: Merge feature work into develop

Open a PR from your feature branch to `develop`.

Requirements:

1. CI passes
2. Security workflow passes
3. User-facing changes include a changeset
4. Docs are updated if needed

For example, the README logo fix should include:

- the README update
- the logo asset
- a patch changeset

### Step 2: Promote develop to staging

Open a PR from `develop` to `staging`.

Purpose:

- prepare the release candidate
- collect all release-ready work into the validation branch

Recommended PR title:

```text
chore(release): promote develop to staging for next release candidate
```

Merge this PR only after required checks pass.

### Step 3: Trigger prerelease from staging

In GitHub Actions:

1. Open `Actions`
2. Select `Release`
3. Click `Run workflow`
4. Choose branch `staging`
5. Set `release_mode` to `prerelease`

Expected outcome:

1. validation runs
2. Changesets enters prerelease mode if needed
3. npm publishes the new prerelease to `next`

Verify with:

```bash
npm view @restingowlorg/owlauth dist-tags
npm view @restingowlorg/owlauth versions --json
```

Expected result:

- `next` advances to a new prerelease version
- `latest` remains unchanged

### Step 4: Validate the prerelease

Validate the `next` package before promoting to `main`.

Minimum validation:

```bash
mkdir -p /tmp/owlauth-next-check
cd /tmp/owlauth-next-check
npm init -y
npm i @restingowlorg/owlauth@next
node -e 'require("@restingowlorg/owlauth"); require("@restingowlorg/owlauth/mongo"); require("@restingowlorg/owlauth/postgres"); console.log("next install OK")'
```

For source or behavior changes, also validate the affected auth flows in your staging environment.

### Step 5: Promote staging to main

Open a PR from `staging` to `main`.

Purpose:

- promote the validated release candidate into the stable branch

Recommended PR title:

```text
chore(release): promote validated release candidate from staging to main
```

Merge this PR only after checks pass.

### Step 6: Merge the Changesets release PR

After `staging` is merged into `main`, the Release workflow on `main` should create a bot PR from `changeset-release/main` to `main`.

This PR should contain only release bookkeeping such as:

- version bump
- changelog updates
- consumed changeset removal

Merge that bot PR.

This is the step that actually publishes the stable version to npm `latest`.

### Step 7: Verify the stable release

After the Release workflow on `main` completes, verify:

```bash
npm view @restingowlorg/owlauth dist-tags
npm view @restingowlorg/owlauth version
```

Expected result:

- `latest` points to the newly published stable version

Then run a clean install test:

```bash
mkdir -p /tmp/owlauth-latest-check
cd /tmp/owlauth-latest-check
npm init -y
npm i @restingowlorg/owlauth@latest
node -e 'require("@restingowlorg/owlauth"); require("@restingowlorg/owlauth/mongo"); require("@restingowlorg/owlauth/postgres"); console.log("latest install OK")'
```

## Required Sync Step After Stable Release

### Why this step matters

After a stable release is published from `main`, `develop` can be behind in release metadata even if the feature code is conceptually up to date.

If you skip the sync, the next release from `staging` may be cut from the wrong version baseline.

### Step 8: Sync main back into develop

Open a PR from `main` to `develop`.

Purpose:

- bring the released version baseline back to the development line
- carry version metadata and consumed changeset state into `develop`
- prevent duplicate prerelease version attempts

Recommended PR title:

```text
chore(release): sync main back into develop after stable release
```

Recommended PR description:

```md
## Summary

Syncs the released `main` branch back into `develop` after stable publication.

This brings release metadata back into the development line so future
Changesets-based prereleases and stable releases are cut from the correct
version baseline.

## Release Impact

- Type: patch
- User-facing change: no
- Breaking change: no

## Checklist

- [ ] `npm run release:validate` passes
- [ ] docs updated if needed
- [ ] changeset added for user-facing changes
- [ ] migration notes added for breaking changes
```

Merge this PR before preparing the next prerelease from `staging`.

## Full Patch-Release Flow After a Stable Release

Use this exact sequence when you have already published a stable version, then need to release another patch such as the README logo fix.

### 1. Make the patch change on a feature branch

For example:

- update the README
- add any required asset
- add a patch changeset

### 2. Merge the patch PR into develop

Open feature branch -> `develop` and merge after checks pass.

### 3. Sync main back into develop

Open `main` -> `develop` and merge it.

This is required if `main` contains the most recent stable release metadata that `develop` does not yet have.

### 4. Promote develop to staging

Open `develop` -> `staging` and merge it.

### 5. Trigger prerelease from staging

Run the Release workflow with:

- branch: `staging`
- `release_mode`: `prerelease`

Expected outcome:

- npm `next` advances to the new prerelease version, such as `1.1.1-next.0`

### 6. Validate the prerelease

Confirm the prerelease works and installs.

For the README logo fix specifically:

1. verify the package installs from `@next`
2. verify the logo asset path is correct in the branch that will be promoted

### 7. Promote staging to main

Open `staging` -> `main` and merge it.

### 8. Verify branch-level asset availability if README depends on main

If the README references an asset hosted on `main`, verify the URL after the merge to `main`.

Example:

```text
https://raw.githubusercontent.com/restingowlorg/OwlAuth/main/docs/assets/restingowl-logo.png
```

The URL must load successfully before npm can render it from a new stable publish.

### 9. Merge the new Changesets release PR

Wait for `changeset-release/main` -> `main`, review it, and merge it.

### 10. Verify npm latest

Run:

```bash
npm view @restingowlorg/owlauth dist-tags
npm view @restingowlorg/owlauth version
```

Expected outcome:

- `latest` advances to the new stable version, for example `1.1.1`

### 11. Verify the npm package page

Open the npm package page and confirm:

1. the package version shown is the new stable version
2. the README reflects the latest published README
3. the logo renders successfully

## README Logo Fix Specific Notes

For the current logo-fix patch, the important behavior is:

1. prerelease updates `next`, not `latest`
2. npm will continue showing the old README until a new stable version is published
3. if the README image points to a file on remote `main`, the image may appear broken in preview branches before the change reaches `main`

This is expected.

## Failure Cases

### Prerelease publishes nothing

If prerelease logs say the version is already published, check whether:

1. `develop` and `staging` are behind `main` in release metadata
2. the `main` -> `develop` sync was skipped
3. the branch version baseline is stale

Fix:

1. merge `main` into `develop`
2. merge `develop` into `staging`
3. rerun prerelease

### npm latest still shows the old package page

If `next` has the new version but npm still shows the old README/logo, check whether:

1. `staging` has been merged into `main`
2. the Changesets bot PR has been merged into `main`
3. npm `latest` has advanced to the new stable version

Fix:

1. complete `staging` -> `main`
2. merge the bot release PR
3. wait for the stable publish workflow to complete

### README logo still broken after stable publish

Check:

1. the README on `main`
2. the asset URL referenced by the README
3. whether the asset URL loads directly in a browser

If the raw asset URL returns `404`, npm will not render the image.

## Recommended Ongoing Team Practice

To avoid repeating this problem, make this part of the normal release process:

1. release from `staging` to `main`
2. merge the Changesets bot PR to publish stable
3. immediately open `main` -> `develop`
4. merge that sync PR before the next release cycle starts

That keeps Changesets version baselines aligned across branches.
