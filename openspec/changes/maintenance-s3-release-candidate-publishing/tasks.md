# Tasks

## Implementation

- [x] Add `release.s3.config.json` (moduleId, bucket, baseUrl, channel, testerGroups).
- [x] Add `scripts/lib/zip.js` — Windows-safe `zipDirectory` (Compress-Archive + Unix `zip`).
- [x] Add `scripts/release-s3.js` — build via `release.js`, `deriveS3Layout()` per-target,
      stage one zip per target baking that target's own manifest URL, fail-fast overwrite
      pre-flight, upload zip (immutable) + manifest (no-cache) per target, dry-run support.
- [x] Add `scripts/release.js --dist-version <ver>` so S3 publishing injects a release
      version only into generated `dist/module.json` and never writes source `module.json`.
- [x] Add `.github/workflows/release-s3.yml` — manual `rc_tag` dispatch, RC-tag validation,
      checkout tag, OIDC auth (gated `if: ${{ !inputs.dry_run }}`), run the script.
- [x] Add reusable `workflow_call` inputs to `.github/workflows/release-s3.yml` matching
      the manual `rc_tag`, `dry_run`, and `overwrite` inputs.
- [x] Update `.github/workflows/release-candidate.yml` to snapshot RC tags at `HEAD`
      before `semantic-release`, detect exactly one new RC tag afterward, and expose it
      as a job output.
- [x] Add the gated `publish-s3` reusable-workflow job to `release-candidate.yml` with
      `dry_run: false`, `overwrite: false`, `contents: read`, and `id-token: write`.
- [x] Add `@aws-sdk/client-s3` devDependency + `release:s3` / `release:s3:dry-run` scripts;
      regenerate `package-lock.json`.
- [x] Ignore `build/` staging dir in `.gitignore`.

## Tests

- [x] `tests/release-s3.test.js` — `deriveS3Layout()` per-target keys/URLs, cohort feed
      self-references its own zip (distinct from channel), target ordering, trailing-slash
      strip, RC version preservation, channel override, labels; `getFlag()` cases.
- [x] `tests/release-build.test.js` — release version option parsing, including
      `--dist-version` and `--version` / `--dist-version` mutual exclusion.

## Verification

- [x] `npm test` (full suite green; new release-s3 tests pass).
- [x] `node scripts/release-s3.js --version 0.2.0-rc.1 --dry-run` — builds, stages a
      channel zip and a per-cohort zip, prints both install URLs, no AWS contact. Confirmed
      each zip's in-zip `module.json` bakes its own `manifest`/`download` URLs (channel vs
      cohort). Confirmed the command leaves the tracked root `module.json` untouched.
- [x] Static-check workflow syntax and the release-candidate tag-detection shell logic.
- [x] Verify the tag-detection logic emits an empty output when no new RC tag appears.
- [x] Verify the tag-detection logic emits the single tag when exactly one new RC tag appears.
- [x] Verify the tag-detection logic fails when multiple new RC tags appear at `HEAD`.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `git diff --check main...HEAD`.
- [ ] (User, AWS-side) Extend IAM role `GitHubFoundryModulePublisherRole` trust policy to
      allow `repo:mistersilver-uk/fabricate:*` OIDC subject; ensure its permissions policy
      allows `modules/fabricate/*` and `testers/*/fabricate/*` writes.
- [x] Set repo vars `AWS_ROLE_TO_ASSUME`, `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL`.
- [ ] (User) Dispatch `release-s3.yml` with a real RC tag + `dry_run: true`, then `dry_run: false`;
      verify channel + cohort keys exist and install the module in Foundry from the cohort URL.
