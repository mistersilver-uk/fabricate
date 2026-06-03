# UI PR Screenshot Evidence Hardening Design

## CI And Local Dev

Generation stays **local**. `npm run test:foundry` defaults to the `full` smoke profile, which
captures every per-view screenshot under `test-results/`. The full profile is never run on a
GitHub Actions runner (too slow); CI runs only the lightweight `check`.

Local / agent flow for a UI PR:

- `screenshots:ui:plan` — list the screenshot view recipes implied by changed files.
- `npm run test:foundry` — produce real Foundry screenshots under `test-results/`.
- `screenshots:ui` (`collect`) — copy mapped smoke screenshots into `tmp/pr-screenshots/<number>/`.
- `screenshots:ui:publish` — upload each collected PNG with `gh image`, then patch the PR body via `gh pr edit --body-file`, inserting/replacing a delimited block between `<!-- fabricate:screenshots:start -->` and `<!-- fabricate:screenshots:end -->`. Idempotent on re-run.
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

`publish` shells out through an injectable `runGh` seam (so tests never touch real `gh`):
preflight `gh auth status` and `gh image --help`, then per file `gh image upload <file>` →
parse the `user-attachments/assets/<id>` URL → `gh pr view --json body` → `upsertScreenshotsBlock`
→ `gh pr edit --body-file`.

### Token caveat

`gh image upload` creates GitHub attachments, which require a **user-scoped** token. The local
agent (running with the developer's `gh` auth) has this. In CI (team-b), the default
`GITHUB_TOKEN` likely cannot upload; a `WORKFLOW_GH_TOKEN` PAT with attachment scope is needed.
Until then, the team-b publish step warns and the required check correctly fails until a
maintainer publishes manually or applies `screenshots-exempt` (fail-closed).

## Anti-Rot Guards

Two tests prevent the recipe table from drifting from reality: every recipe `matches` pattern
must resolve to ≥1 file in `git ls-files`, and every `smokeLabel` must appear as a
`screenshot(page, '<label>')` literal in `scripts/foundry-test-run.mjs`.
