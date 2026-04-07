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

Fabricate ships a Docker-based smoke test that starts a real Foundry VTT instance, loads the built module, and verifies the Crafting App opens without runtime errors.

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

### Running the full smoke test

To run the complete pipeline (start container, run test, stop container) in one command:

```bash
npm run test:foundry
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
| `summary.json` | Machine-readable pass/fail result and list of errors |
| `console.log` | Full browser console output captured during the test |
| `screenshot-01-setup.png` | Foundry setup page after navigation |
| `screenshot-02-authenticated.png` | After admin authentication |
| `screenshot-03-world-loaded.png` | After the smoke world launches |
| `screenshot-04-crafting-app.png` | After opening the Crafting App |
| `screenshot-failure.png` | Captured only when the test fails |

### What the smoke test checks

1. Navigates to the Foundry setup page and authenticates as admin.
2. Launches the `fabricate-smoke` world.
3. Waits for `game.ready` in the browser.
4. Verifies the Fabricate module is active (`game.modules.get('fabricate')?.active === true`).
5. Opens the Items sidebar and clicks the **Craft Item** button injected by Fabricate.
6. Asserts the Crafting App window is visible.
7. Fails if any browser console errors were captured during the session.

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

### Release workflow

File: `.github/workflows/release.yml`

Trigger: manual (`workflow_dispatch`) with an optional dry-run flag.

Steps:
1. Run unit tests (`npm test`) and build.
2. Run the Foundry integration smoke test (via the reusable workflow).
3. Run `semantic-release` to determine the version bump, inject the release version into `module.json`, build and zip the module, and publish a GitHub Release.

### Codex Team B backlog workflow

File: `.github/workflows/team-b-backlog.yml`

This workflow runs Codex Team B backlog processing on a schedule and can also be started manually with `workflow_dispatch`.

Requirements:
- Repository secret: `OPENAI_API_KEY`

Behavior:
- Selects eligible backlog issues automatically on the schedule
- Accepts a specific issue number through `workflow_dispatch.issue_number`
- Adds the `in-progress` label
- Runs Codex against the checked-out repo with local repo instructions
- Requires `npm test` and `npm run build` before PR creation
- Opens a PR if changes were produced
- Marks the issue `agent-failed` if the run fails or produces no code changes

Use the manual dispatch with `issue_number` when you want a supervised, explicitly chosen Codex Team B run outside the scheduled automation lane.

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
