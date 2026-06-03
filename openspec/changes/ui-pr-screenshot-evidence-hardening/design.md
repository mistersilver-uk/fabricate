# UI PR Screenshot Evidence Hardening Design

## CI And Local Dev

Generation stays **local**. `npm run test:foundry` defaults to the `full` smoke profile, which
captures every per-view screenshot under `test-results/`. The full profile is never run on a
GitHub Actions runner (too slow); CI runs only the lightweight `check`.

Local / agent flow for a UI PR:

- `screenshots:ui:plan` — list the screenshot view recipes implied by changed files.
- `npm run test:foundry` — produce real Foundry screenshots under `test-results/`.
- `screenshots:ui` (`collect`) — copy mapped smoke screenshots into `tmp/pr-screenshots/<number>/`.
- `screenshots:ui:publish` — upload each collected PNG to `s3://<bucket>/pr-screenshots/<number>/<view>.png`, then patch the PR body via `gh pr edit --body-file`, inserting/replacing a delimited block between `<!-- fabricate:screenshots:start -->` and `<!-- fabricate:screenshots:end -->`. Idempotent on re-run.
- `screenshots:ui:clean` — remove `tmp/pr-screenshots/<number>/`.

CI `check-screenshots` reads the live body, changed files, and labels, then runs
`node scripts/ui-pr-screenshot-evidence.mjs check --changed-files … --body-file … --labels … --exempt-label screenshots-exempt --pr …`.

## Check Precedence

1. `screenshots-exempt` label present (maintainer-only) → PASS, unconditional.
2. `--changed-files` supplied but empty → FAIL (cannot determine UI changes).
3. No UI changes → PASS.
4. Otherwise: PASS only with PR-scoped screenshot evidence in the body, else FAIL.

## Evidence Rules

UI changes are files under `src/ui/`, `styles/`, `lang/`, or ending in `.svelte` / `.css`.

Normal evidence: GitHub attachment markdown whose alt text includes `pr-<pr-number>`.

Automation fallback evidence (accepted for CI compatibility): PR-scoped `codex-ui-evidence-<pr-number>`
artifact references and PR-scoped `test-results/...png|jpg|jpeg|webp|gif` paths.

There is no `SCREENSHOTS_NEEDED:` bypass. Generic unrelated image markdown is not sufficient.

## Upload Mechanics

`publish` uploads each collected PNG to S3 via an injectable `putObject` seam (so tests never touch
AWS): `PutObjectCommand` with `Key = pr-screenshots/<n>/<view>.png`, `ContentType` by extension, no
ACL (public read comes from the bucket policy). Bucket/baseUrl come from `release.s3.config.json`
(env overrides `S3_RELEASE_BUCKET`/`RELEASE_BASE_URL`/`AWS_REGION`). The embedded URL is
`${baseUrl}/pr-screenshots/<n>/<view>.png`. The PR body is read/patched through an injectable
`runGh` seam (`gh auth status` → `gh pr view --json body` → `upsertScreenshotsBlock` →
`gh pr edit --body-file`). `check` accepts a PR-scoped S3 URL (`…amazonaws.com/pr-screenshots/<n>/…`)
or a `pr-<number>`-alt-text `user-attachments` embed; release-download URLs are no longer accepted.

### Why S3 (not GitHub Releases/branches or user-attachments)

GitHub has no API for `user-attachments/assets/...` URLs (that needs an interactive browser session),
and hosting on GitHub Releases or an orphan branch pollutes the repo. S3 is headless, no-login, reuses
existing release infra, and is cleaned by an object-lifecycle rule. Tradeoff: objects are public-read
(a private app's screenshots become world-readable by unguessable URL).

### Cleanup

`clean` removes the local tmp dir and best-effort deletes the S3 objects under `pr-screenshots/<n>/`.
An S3 **lifecycle rule** expiring the `pr-screenshots/` prefix after N days is the backstop so nothing
orphans.

### Credentials

Local: AWS default provider chain (env or `aws` CLI profile). CI: **OIDC role assumption only**
(`aws-actions/configure-aws-credentials` + `id-token: write` + the repository variable
`vars.AWS_SCREENSHOTS_ROLE_TO_ASSUME`, a dedicated least-privilege role); never static AWS keys. Until the role exists, the team-b publish step warns and the required check fails
closed until a maintainer publishes manually or applies `screenshots-exempt`.

## Anti-Rot Guards

Two tests prevent the recipe table from drifting from reality: every recipe `matches` pattern
must resolve to ≥1 file in `git ls-files`, and every `smokeLabel` must appear as a
`screenshot(page, '<label>')` literal in `scripts/foundry-test-run.mjs`.
