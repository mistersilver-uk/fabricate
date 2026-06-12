---
layout: default
title: Contributing
nav_order: 13
---

# Contributing

This page is for developers who want to contribute to Fabricate, run the integration test suite locally, or understand how releases are published.

## Commit conventions

All commits to Fabricate must follow the [Conventional Commits](https://www.conventionalcommits.org/) format. A GitHub Actions workflow validates every commit on a pull request and the PR title itself using `commitlint`.

The accepted commit types are:

| Type | When to use |
|------|-------------|
| `feat` | A new feature visible to users or module consumers |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `style` | Formatting changes with no logic change |
| `refactor` | Code restructuring that is neither a fix nor a feature |
| `perf` | A performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependency changes |
| `ci` | CI/CD workflow changes |
| `chore` | Anything else that does not modify `src/` or tests |
| `revert` | Reverting a previous commit |

For `feat` and `fix` commits, include the related GitHub issue number as the scope:

```
feat(#42): add shopping list panel to crafting UI
fix(#99): correct ingredient deduplication in alchemy mode
```

The scope is optional for all other types.

Header lines must be 100 characters or fewer.

---

## Linting & formatting

Fabricate uses [ESLint](https://eslint.org/) (flat config in `eslint.config.js`) for static
analysis and [Prettier](https://prettier.io/) for formatting. Both run as a **required CI check**
(`lint` job in `.github/workflows/ci.yml`).

```bash
npm run lint           # ESLint over the gated scope (fails on any warning)
npm run lint:fix       # …and auto-fix what can be fixed
npm run format         # Prettier-format the gated scope
npm run format:check   # verify formatting (what CI runs)
```

### Staged rollout

Linting is being introduced **path by path** so each step lands green rather than in one
unreviewable sweep. Each path is added only once it is clean for **both** ESLint and the
SonarCloud quality gate (which scores duplication, reliability, and security on the PR's *new
code* — so a path is widened in its own focused PR, not bundled into an unrelated change). The
gate (`npm run lint` / `npm run format:check`) now covers the **entire `src/` JavaScript surface**:

- `src/models/`, `src/utils/`, `src/integrations/`, `src/config/`, `src/migration/`,
  `src/canvas/`, `src/systems/`, and `src/toolBreakageRuntime.js`

Not yet gated (tracked for follow-up — run `npm run lint:all` / `npm run lint:svelte` to see them):

- the `tests/` suite — sort comparators, fixture duplication
- `src/ui/**` and all `*.svelte` components (Svelte parsing is wired up; findings triaged later)
- `src/main.js`, `src/gatheringBootstrapAdapters.js`, `src/gatheringToolRuntime.js` (covered by
  source-text assertions in `tests/gathering-bootstrap-api.test.js`, so they change with that test)
- `scripts/**` build/release tooling

When you bring a new path to green (ESLint **and** SonarCloud), add it to the `lint`/`format`
globs in `package.json` so the gate keeps it green.

---

## Foundry integration tests

Fabricate ships a Docker-based smoke test that starts a real Foundry VTT instance, loads the built module, and verifies the Crafting and Gathering surfaces work without runtime errors.

### Prerequisites

- Docker and Docker Compose installed and running.
- A Foundry VTT account (needed to pull the `felddy/foundryvtt` image, which activates via username and password).
- Node.js 20 or later.

### First-time setup

Copy the credentials template and fill in your Foundry account details:

```bash
cp .env.foundry.example .env.foundry
# Edit .env.foundry and set FOUNDRY_USERNAME and FOUNDRY_PASSWORD
```

{: .warning }
> Never commit `.env.foundry`. It is listed in `.gitignore`, but double-check before pushing.

Install the Playwright browser used by the smoke test:

```bash
npm run test:foundry:install
```

Build the module so the Docker container has a `dist/` directory to mount:

```bash
npm run build
```

### Running the smoke tests

To run the default full pipeline (start container, run the visual/regression-heavy smoke test, stop container):

```bash
npm run test:foundry
```

To run the release-candidate CI profile locally:

```bash
npm run test:foundry:rc
# or
FOUNDRY_SMOKE_PROFILE=rc npm run test:foundry      # POSIX
$env:FOUNDRY_SMOKE_PROFILE='rc'; npm run test:foundry  # PowerShell
```

To run each phase separately (useful for debugging):

```bash
npm run test:foundry:up    # Start the Foundry container and wait for it to be healthy
npm run test:foundry:run   # Run the Playwright smoke test against the running container
npm run test:foundry:down  # Stop and remove the container
```

To do a full clean reset including volumes:

```bash
node scripts/foundry-test-down.mjs --clean
```

### Test artifacts

After a run, results are written to `test-results/`:

| File | Description |
|------|-------------|
| `summary.json` | Machine-readable pass/fail result, smoke profile, timings, and list of errors |
| `console.log` | Full browser console output captured during the test |
| `screenshot-*.png` | Screenshots captured by the selected profile |
| `screenshot-failure.png` | Captured only when the test fails |

### What the smoke test checks

Every profile boots a real Foundry instance, joins the `fabricate-smoke-ci` world, and verifies the load-bearing crafting and gathering paths:

1. Navigates to the Foundry setup page and authenticates as admin.
2. Launches the `fabricate-smoke-ci` world (auto-wiped from the fixture under `.foundry-e2e/worlds/fabricate-smoke-ci/` on every `test:foundry:up`).
3. Waits for `game.ready` and `game.fabricate.ready`.
4. Verifies the Fabricate module is active (`game.modules.get('fabricate')?.active === true`).
5. Opens the unified Fabricate shell from the sidebar actions, verifies the shared navigation/actor bar, and completes one successful **Gather Meadow Herbs** task on Alara the Alchemist.
6. Crafts one **Healing Potion** through the runtime API, verifying it lands in Alara's inventory.
7. Fails if any non-ignored browser console errors were captured during the session.

The `full` profile additionally captures Crafting System Manager v2 screenshots, exercises the blocked / failure / timed gathering states, the non-GM redaction path, the no-selectable-actors state, and runs document cleanup.

### Smoke profiles (`rc` vs `full`)

A single orchestrator (`scripts/foundry-test.mjs`) and run script (`scripts/foundry-test-run.mjs`) handle both profiles. The profile is selected by `FOUNDRY_SMOKE_PROFILE` (or `--profile=<value>` on `node scripts/foundry-test.mjs`).

| Profile | When | Phases | Target |
|---------|------|--------|--------|
| `rc` | Release-candidate CI | Phase B → C → E (unified shell, one Gathering success, Healing Potion craft) → console-error check | < 20 min including cold setup |
| `ci` | Deprecated alias for `rc` (removed after one release) | same as `rc` | same |
| `full` (default) | Local and visual-regression runs | + Phase D0 (manager screenshots), extended Gathering states, non-GM redaction, no-selectable actors, Phase F (cleanup) | ~10–15 min locally |

The `rc` profile captures a pinned screenshot budget (`world-loaded`, `fabricate-app-shell`, `post-craft`, `alara-post-craft-inventory`, plus `screenshot-failure.png` on failure) — every other `screenshot(page, label)` call is a no-op under `rc`, but the surrounding behavioral assertions still run.

The orchestrator gives the in-browser run its own wall-clock budget (`FOUNDRY_RUN_TIMEOUT_MS`, default 15 minutes). On overrun, the run process is sent `SIGTERM` and the orchestrator proceeds to Docker teardown + artifact upload, so the 20-minute Actions budget can never preempt cleanup. Override locally if you need a longer or shorter cap:

```bash
FOUNDRY_RUN_TIMEOUT_MS=600000 npm run test:foundry:rc          # POSIX (10 minutes)
$env:FOUNDRY_RUN_TIMEOUT_MS='600000'; npm run test:foundry:rc  # PowerShell
```

Every run prints a phase-timing table to stdout at the end and writes timings into `summary.json` under `phaseTimings` and `bootTimings`, so slow phases jump out in CI logs.

Use `full` whenever you need fresh visual references for design review.

## CI workflows

### Conventional Commits workflow

File: `.github/workflows/conventional-commits.yml`

Runs on every pull request. Validates all commits in the PR using `commitlint` and checks that the PR title itself also follows the Conventional Commits format.

### Foundry integration workflow

File: `.github/workflows/foundry-integration.yml`

Runs:
- On push to `main` when `src/`, `scripts/`, `module.json`, or `docker-compose.foundry.yml` change.
- On a weekly schedule (Monday 04:00 UTC).
- On manual trigger via `workflow_dispatch`.
- As a reusable workflow called by the release pipeline.

If the smoke test fails, the workflow opens (or comments on an existing) GitHub Issue labelled `foundry-smoke-failure`.

Requires two repository secrets: `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD`.

### Release-candidate workflow

File: `.github/workflows/release-candidate.yml`

Trigger: push to `main`.

Steps:
1. Run unit tests (`npm test`) and build.
2. Run the Foundry integration smoke test (via the reusable workflow).
3. Run `semantic-release` to determine the version bump, inject the release version into `module.json`, build and zip the module, and publish a GitHub prerelease.
4. Compare RC tags pointing at `HEAD` before and after `semantic-release`. If exactly one new `v<x.y.z>-rc.N` tag was created, call `.github/workflows/release-s3.yml` with `dry_run: false` and `overwrite: false`. If no RC tag was created, skip S3 publishing. If multiple new RC tags are detected at `HEAD`, fail the run because the S3 publish target is ambiguous.

### S3 release-candidate workflow

File: `.github/workflows/release-s3.yml`

Triggers:
- Manual `workflow_dispatch`, with `rc_tag`, `dry_run`, and `overwrite` inputs.
- Reusable `workflow_call` from the release-candidate workflow, using the same inputs.

Manual dispatch is the operator path for dry-runs, recovery reruns, and intentional overwrite attempts. Automatic calls from `release-candidate.yml` publish only a newly-created RC tag and do not overwrite an existing versioned zip.

**Closed-beta tester path secret.** The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, where `<segment>` comes from the repository **secret** `S3_TESTER_PATH_SECRET` (env var of the same name locally) — never the committed config. Generate it once (`openssl rand -hex 16`) and set it before publishing; the publish **refuses to run** when tester groups are configured but the secret is unset, so the feed can never fall back to a guessable URL. `release-s3.js` withholds all S3 keys and install URLs from CI logs (they only print on local/`--dry-run` runs); GitHub also masks the secret value. To rotate a compromised path: set a new `S3_TESTER_PATH_SECRET`, publish, distribute the new manifest URL to testers privately, then delete the old objects (`aws s3 rm --recursive s3://<bucket>/testers/<group>/fabricate/` — the legacy prefix only; the new `<segment>/` path is not matched).

### Codex workflows

Codex GitHub Actions workflows are manual-only in this repository. Codex does not run automatically on `push`, `pull_request`, `pull_request_target`, `issue_comment`, `schedule`, or any other automatic trigger.

Files:
- `.github/workflows/team-a-research.yml`
- `.github/workflows/team-b-backlog.yml`
- `.github/workflows/codex-code-review.yml`

Requirements:
- Repository secret: `OPENAI_API_KEY`
- Repository secret: `WORKFLOW_GH_TOKEN` — a GitHub token used by `team-b-backlog.yml` (and other agent workflows) to push the implementation branch, create the PR, manage issue/PR labels and comments, delete the branch on cleanup, and patch the PR body when publishing UI screenshots. The default `GITHUB_TOKEN` is insufficient because org policy blocks Actions from creating PRs. A **fine-grained, repo-scoped** token needs these repository permissions:
  - **Contents: Read and write** — push commits/branches and delete refs.
  - **Pull requests: Read and write** — create PRs, apply PR labels, read and patch the PR body.
  - **Issues: Read and write** — edit issue labels and post issue comments.
  - **Metadata: Read** — mandatory baseline (auto-selected).
  - **Workflows: Read and write** — *only* if agent implementations may modify files under `.github/workflows/`; without it, any push that touches a workflow file is rejected.

  The labels it applies (`agent-created`, `in-progress`, `agent-failed`, `screenshots-exempt`) must already exist in the repo. This token grants no AWS access — S3 screenshot uploads authenticate separately via OIDC (see below).
- AWS for S3 screenshot publishing: in CI, **OIDC only** (never static keys), via a **dedicated, least-privilege role** distinct from the module-release role. Repository variable `AWS_SCREENSHOTS_ROLE_TO_ASSUME` (the role ARN) plus the shared `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL` variables and `permissions: id-token: write`. Local runs use the AWS default provider chain. See [Screenshot publishing infrastructure](#screenshot-publishing-infrastructure) for the exact IAM and bucket policies.

Behavior:
- `team-a-research.yml`: manual research and audit workflow
- `team-b-backlog.yml`: manual backlog implementation workflow, optionally scoped to `workflow_dispatch.issue_number`
- `codex-code-review.yml`: manual PR review workflow, scoped to `workflow_dispatch.pr_number`

Use these workflows only when you explicitly want a Codex run and have available usage for it.

### Screenshot publishing infrastructure

`npm run screenshots:ui:publish` uploads UI-PR screenshots to S3 under `pr-screenshots/<pr-number>/` and embeds the public object URLs in the PR body. In CI (`team-b-backlog.yml`) this authenticates via GitHub OIDC using a **dedicated, least-privilege IAM role** — deliberately separate from the module-release role so agent-driven workflows can never write or overwrite real release artifacts.

Repository variables (role ARNs and bucket names are not secrets):

- `AWS_SCREENSHOTS_ROLE_TO_ASSUME` — ARN of the dedicated screenshot role (below).
- `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL` — shared with the release workflow.

**IAM role trust policy** (`GitHubFabricatePrScreenshotsRole`) — only the team-b backlog and PR-screenshots-cleanup workflows in this repo may assume it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::088545273404:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:repository": "mistersilver-uk/fabricate",
          "token.actions.githubusercontent.com:ref": "refs/heads/main",
          "token.actions.githubusercontent.com:workflow": [
            "Team B: Codex Backlog Processing Manual Only",
            "PR screenshots cleanup"
          ]
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": [
            "repo:mistersilver-uk/fabricate:ref:refs/heads/main",
            "repo:mistersilver-uk/fabricate:pull_request"
          ]
        }
      }
    }
  ]
}
```

Do not use `token.actions.githubusercontent.com:job_workflow_ref` for these jobs.
GitHub emits that claim for reusable workflow jobs, while both screenshot workflows
here are normal repository workflows. The cleanup workflow uses `pull_request_target`,
so its default `sub` is the pull-request subject
(`repo:mistersilver-uk/fabricate:pull_request`) rather than the branch subject.

**IAM role permission policy** (`PublishPrScreenshots`) — `pr-screenshots/*` only, including delete for cleanup:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListPrScreenshots",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an",
      "Condition": { "StringLike": { "s3:prefix": "pr-screenshots/*" } }
    },
    {
      "Sid": "WritePrScreenshots",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an/pr-screenshots/*"
    }
  ]
}
```

**Bucket policy** — add public read for `pr-screenshots/*` so GitHub can render the images (alongside the existing `modules/*` / `testers/*` grant):

```json
{
  "Sid": "PublicReadPrScreenshots",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::fabricate-modules-088545273404-eu-west-2-an/pr-screenshots/*"
}
```

**Cleanup** — `screenshots:ui:clean` removes only local temp files (the S3 objects must stay live while the PR is open). The `pr-screenshots-cleanup.yml` workflow runs `screenshots:ui:clean -- --pr <n> --s3` automatically when a PR closes (merged or not) to delete that PR's S3 objects. A bucket **lifecycle rule** expiring the `pr-screenshots/` prefix after N days is the backstop so nothing accumulates even if the cleanup workflow is skipped or fails. (Set N comfortably above how long PRs stay open, or the images break while a PR is still under review.)

These objects are public-read by URL (the accepted tradeoff for inline GitHub rendering of a private repo's screenshots). Until the role/variable/bucket policy exist, the team-b publish step warns and the required `check-screenshots` gate fails closed until a maintainer publishes manually or applies the `screenshots-exempt` label.

## Release pipeline

Fabricate uses [semantic-release](https://semantic-release.gitbook.io/) to automate version management. The pipeline is configured in `release.config.js`.

### How version bumps are determined

| Commit type | Version bump |
|-------------|-------------|
| `feat` | Minor |
| `fix`, `perf`, `revert` | Patch |
| Any with `BREAKING CHANGE` footer | Major |
| All other types | No release |

### What semantic-release does on a release

1. Reads all commits since the last tag using `@semantic-release/commit-analyzer`.
2. Generates release notes with `@semantic-release/release-notes-generator`.
3. Calls `node scripts/release.js --version <new-version>` via `@semantic-release/exec`. This injects the version into `module.json`, runs `vite build`, copies static assets, and creates `dist/fabricate-v<version>.zip`.
4. Creates a GitHub Release with the zip and the raw `module.json` as assets.
5. On `main`, the release-candidate workflow detects the newly-created RC tag at `HEAD` and publishes that exact tag to S3 through the reusable S3 workflow.

GitHub Releases are the canonical release history. The CI release flow does not commit a repository changelog back to `main`; branch protection requires pull requests and status checks on `main`, so release automation publishes tags and GitHub Releases without a protected-branch writeback step.

### Running the release script locally

You can invoke the build script directly without going through semantic-release:

```bash
# Build and zip
node scripts/release.js

# Build without creating a zip (useful in CI steps that zip separately)
node scripts/release.js --no-zip

# Validate an existing dist/ directory without rebuilding
node scripts/release.js --validate-only

# Inject a specific version into module.json, then build
node scripts/release.js --version 1.2.3
```

## See also

- [Quickstart]({% link quickstart.md %}) -- install and configure Fabricate in your world
- [API Reference]({% link api/index.md %}) -- full developer documentation
- [Troubleshooting]({% link troubleshooting.md %}) -- common runtime issues
