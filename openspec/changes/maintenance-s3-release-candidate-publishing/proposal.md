# S3 Release-Candidate Publishing

## Summary

Fabricate currently publishes only to GitHub Releases: `release-candidate.yml`
runs `semantic-release` on `main` to cut `v<x.y.z>-rc.N` tags + prerelease
assets, and `promote-release.yml` manually promotes an RC tag to a final
release. There is no way to hand a closed beta cohort an install URL that tracks
the latest RC.

This change adds S3 publishing for release candidates. The S3 workflow can still
be manually dispatched with an **existing RC tag** (produced by
`semantic-release`) for dry-runs, reruns, and operator recovery. It is also a
reusable workflow called by the release-candidate pipeline after
`semantic-release` creates a new RC tag on `main`.

The workflow builds the exact RC commit and publishes it to the shared
`fabricate-modules-*` S3 bucket used by `fabricate-premium`. It mirrors
premium's `modules/` (canonical "sources") vs `testers/` (per-cohort "beta
access groups") namespacing, but is collapsed to this repo's single module and
corrects premium's update-routing limitation.

## Goals

- **Tag-driven dispatch and reuse.** `release-s3.yml` accepts the same `rc_tag`,
  `dry_run`, and `overwrite` inputs from manual `workflow_dispatch` and reusable
  `workflow_call` invocations. It validates `v*.*.*-rc.*`, checks out that tag,
  and publishes structurally parallel to the existing `promote-release.yml`.
- **Automatic RC publication.** `release-candidate.yml` compares RC tags
  pointing at `HEAD` before and after `semantic-release`. If exactly one new
  `^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$` tag appears, it calls
  `release-s3.yml` with `dry_run: false` and `overwrite: false`.
- **No-release skip.** When `semantic-release` determines there is no release,
  no new RC tag appears and S3 publishing is skipped.
- **Foundry-correct manifest URLs.** Each published `module.json` carries
  `manifest`/`download` URLs that resolve in Foundry's install + update flow.
- **Sources vs beta-access-group separation.** Canonical artifacts live under
  `modules/fabricate/<channel>/…`; each access group gets its own feed under
  `testers/<group>/fabricate/…`.
- **Genuine per-cohort update routing.** Each access group installs and updates
  via its own URL and can be advanced independently (see `design.md` for why
  this requires a per-cohort zip).
- **Safe by default.** Dry-run that builds/stages without touching AWS; refusal
  to overwrite an existing immutable versioned zip unless `--overwrite`.

## Non-Goals

- Changing `promote-release.yml`; final promotion remains a separate manual
  workflow.
- Adding an `on.push.tags` trigger. RC tags are created by `semantic-release`
  using `GITHUB_TOKEN`, so the reliable automatic path is the existing
  `release-candidate.yml` run calling the reusable S3 workflow directly.
- Provisioning AWS infrastructure (bucket policy, IAM role trust/permissions).
  Those are operator-set repo vars + AWS-side config, documented in `tasks.md`.
- A public/default distribution channel. Only the `beta` channel + tester groups
  are configured for now.

## Out of Scope

- The `dist/` build itself, unit tests, semantic-release, and the docs Jekyll
  site are untouched.
- Multi-module support (premium's `release.config.json` registry). Fabricate is
  a single module; config is flattened to `release.s3.config.json`.
