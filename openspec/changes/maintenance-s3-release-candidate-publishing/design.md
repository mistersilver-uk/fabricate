# Design

## S3 layout

For `moduleId=fabricate`, `channel=beta`, `version=0.2.0-rc.1`, group
`closed-beta-2026`:

```
modules/fabricate/beta/versions/0.2.0-rc.1/fabricate-0.2.0-rc.1.zip       # SOURCES: immutable (1yr cache)
modules/fabricate/beta/latest/module.json                                # SOURCES: channel manifest (no-cache)
testers/closed-beta-2026/fabricate/versions/0.2.0-rc.1/fabricate-…​.zip    # ACCESS GROUP: immutable (1yr cache)
testers/closed-beta-2026/fabricate/module.json                           # ACCESS GROUP: cohort manifest (no-cache)
```

Each feed is **self-contained**: its `latest` manifest's `download` points at
*its own* versioned zip, and that zip's in-zip `module.json` bakes *its own*
`manifest` URL.

## Why per-cohort zips (the load-bearing decision)

When Foundry installs a module from a manifest URL, it downloads the zip named by
that manifest's `download` field and extracts the zip's `module.json` to disk.
Future "Check for Updates" calls read the `manifest` field from the **on-disk**
(i.e. in-zip) `module.json` — not the URL the operator originally installed from.

Consequence: a single shared zip can bake only one `manifest` URL. If every
cohort installed the same zip, they would all poll the same feed for updates, so
"per-cohort" manifests would be cosmetic (install-time links only). This is the
behavior `fabricate-premium` ships today.

To make each access group a genuine, independently-advanceable feed, the script
builds **one zip per target**, each baking that target's own cohort/channel
`manifest` URL. Cost is a duplicate (small) zip per cohort, which is acceptable
for a handful of groups and removes any dependency on uncertain Foundry
internals.

## Tag → version

`semantic-release` cuts tags like `v0.2.0-rc.1`. The workflow validates
`^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$` (same regex as `promote-release.yml`),
checks the tag exists, checks it out, and strips the leading `v` to get the
version passed to the script.

## Components

- **`release.s3.config.json`** — flattened single-module config: `moduleId`,
  `bucket`, `baseUrl`, `channel`, `testerGroups`. `bucket`/`baseUrl` are
  overridable via `S3_RELEASE_BUCKET` / `RELEASE_BASE_URL` env (repo vars in CI).
- **`scripts/release-s3.js`** — orchestrator. Reuses `scripts/release.js`
  (`--version <ver> --no-zip`) for the build so there is a single build path,
  then for each target rewrites `dist/module.json`, zips to a per-target staging
  path under `build/s3/<label>/`, and uploads. Exports the pure
  `deriveS3Layout()` (unit-tested without AWS) and `getFlag()`.
- **`scripts/lib/zip.js`** — Windows-safe `zipDirectory` (PowerShell
  `Compress-Archive` + Unix `zip`), ported from premium because the inline
  `tar -a` in `release.js` produces archives Foundry's installer reads as empty
  on Windows.
- **`.github/workflows/release-s3.yml`** — `workflow_dispatch` (`rc_tag`,
  `dry_run`, `overwrite`); OIDC auth via `aws-actions/configure-aws-credentials`.

## Upload semantics

- Versioned zips: `Cache-Control: public, max-age=31536000, immutable`.
- Manifests (`latest`/cohort): `Cache-Control: no-cache, max-age=0, must-revalidate`.
- Fail-fast overwrite pre-flight: every target's versioned zip key is HEAD-checked
  before any upload; an existing key aborts the whole run unless `--overwrite`.

## CI vs local behavior (shared script — explicit per AGENTS.md)

`scripts/release-s3.js` is invoked from `package.json` (`release:s3`,
`release:s3:dry-run`) and from CI, so both environments are specified:

- **CI (Ubuntu, `release-s3.yml`).** After `npm ci`, the job resolves
  `bucket`/`baseUrl` from repo vars (`S3_RELEASE_BUCKET`, `RELEASE_BASE_URL`) and
  credentials from GitHub OIDC (`AWS_ROLE_TO_ASSUME`, `AWS_REGION`). The AWS
  credentials step is gated `if: ${{ !inputs.dry_run }}`, so a dry-run dispatch
  needs no OIDC/role and cannot fail on missing AWS config. `scripts/lib/zip.js`
  takes its Unix `zip` path. A non-dry-run uploads to S3.
- **Local dev (Windows/macOS/Linux).** `npm run release:s3:dry-run` builds and
  stages per-target zips under `build/s3/` (git-ignored) using config defaults,
  imports no AWS SDK, and contacts no network. On Windows the zip is produced via
  PowerShell `Compress-Archive`. A real local publish (`npm run release:s3 --
  --version <v>`) requires resolvable AWS credentials + bucket/baseUrl in the
  environment.

## Dependencies

- Adds `@aws-sdk/client-s3` (dev). Required to `HeadObject`/`PutObject` against
  S3; pinned to the same major premium uses. Imported lazily inside the upload
  branch so dry-runs and unit tests need neither the dependency resolved at
  import time nor any credentials. (Logged here per AGENTS.md's "no npm deps
  without a plan entry" rule.)
