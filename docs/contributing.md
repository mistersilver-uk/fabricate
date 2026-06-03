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
5. Opens the Gathering app and completes one successful **Gather Meadow Herbs** task on Alara the Alchemist.
6. Opens the Crafting app and crafts one **Healing Potion**, verifying it lands in Alara's inventory.
7. Fails if any non-ignored browser console errors were captured during the session.

The `full` profile additionally captures the Crafting System Manager v2 + legacy Recipe Manager screenshots, exercises the blocked / failure / timed gathering states, the non-GM redaction path, the no-selectable-actors state, and runs document cleanup.

### Smoke profiles (`rc` vs `full`)

A single orchestrator (`scripts/foundry-test.mjs`) and run script (`scripts/foundry-test-run.mjs`) handle both profiles. The profile is selected by `FOUNDRY_SMOKE_PROFILE` (or `--profile=<value>` on `node scripts/foundry-test.mjs`).

| Profile | When | Phases | Target |
|---------|------|--------|--------|
| `rc` | Release-candidate CI | Phase B → C → D2 (one Gathering success) → E (Healing Potion craft) → console-error check | < 20 min including cold setup |
| `ci` | Deprecated alias for `rc` (removed after one release) | same as `rc` | same |
| `full` (default) | Local and visual-regression runs | + Phase D0 (manager screenshots), Phase D (legacy Recipe Manager), Phase D2 blocked/failure/timed gathering states, Phase D3 (non-GM redaction), Phase E2 (no-selectable actors), Phase F (cleanup) | ~10–15 min locally |

The `rc` profile captures a pinned screenshot budget (`world-loaded`, `crafting-app-opened`, `post-craft`, `alara-post-craft-inventory`, `gathering-targeted-ready`, `gathering-immediate-success`, plus `screenshot-failure.png` on failure) — every other `screenshot(page, label)` call is a no-op under `rc`, but the surrounding behavioral assertions still run.

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
- AWS for S3 screenshot publishing: in CI, **OIDC only** — reuses the same repository variables as the module-release workflow (`AWS_ROLE_TO_ASSUME`, `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL`) plus `permissions: id-token: write`. No new secret is required. For screenshot uploads to succeed through that role, its IAM trust policy must allow the `team-b-backlog.yml` workflow context to assume it, and its permissions policy plus the bucket policy must cover the `pr-screenshots/*` prefix (`s3:PutObject`/`s3:DeleteObject`/`s3:ListBucket`, and public-read so GitHub can render the images). Never use static AWS keys in CI. Local runs use the AWS default provider chain.

Behavior:
- `team-a-research.yml`: manual research and audit workflow
- `team-b-backlog.yml`: manual backlog implementation workflow, optionally scoped to `workflow_dispatch.issue_number`
- `codex-code-review.yml`: manual PR review workflow, scoped to `workflow_dispatch.pr_number`

Use these workflows only when you explicitly want a Codex run and have available usage for it.

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
