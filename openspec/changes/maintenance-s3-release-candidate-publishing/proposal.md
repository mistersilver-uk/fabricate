# S3 Release-Candidate Publishing

## Summary

Fabricate currently publishes only to GitHub Releases: `release-candidate.yml`
runs `semantic-release` on `main` to cut `v<x.y.z>-rc.N` tags + prerelease
assets, and `promote-release.yml` manually promotes an RC tag to a final
release. There is no way to hand a closed beta cohort an install URL that tracks
the latest RC.

This change adds a manually-dispatched workflow that takes an **existing RC tag**
(produced by `semantic-release`), builds that exact commit, and publishes it to
the shared `fabricate-modules-*` S3 bucket used by `fabricate-premium`. It
mirrors premium's `modules/` (canonical "sources") vs `testers/` (per-cohort
"beta access groups") namespacing, but is collapsed to this repo's single module
and corrects premium's update-routing limitation.

## Goals

- **Manual, tag-driven dispatch.** A `workflow_dispatch` workflow takes an
  `rc_tag` input (validated `v*.*.*-rc.*`), checks out that tag, and publishes —
  structurally parallel to the existing `promote-release.yml`.
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

- Changing `release-candidate.yml` or `promote-release.yml`. RC tags are still
  produced by `semantic-release`; this workflow only *consumes* a tag.
- Auto-publishing on every RC tag push. Dispatch is manual.
- Provisioning AWS infrastructure (bucket policy, IAM role trust/permissions).
  Those are operator-set repo vars + AWS-side config, documented in `tasks.md`.
- A public/default distribution channel. Only the `beta` channel + tester groups
  are configured for now.

## Out of Scope

- The `dist/` build itself, unit tests, semantic-release, and the docs Jekyll
  site are untouched.
- Multi-module support (premium's `release.config.json` registry). Fabricate is
  a single module; config is flattened to `release.s3.config.json`.
