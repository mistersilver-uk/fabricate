# Implementation Plan: CI/CD Pipeline — Foundry Integration Tests, Conventional Commits, Semantic Release

## Overview

Add 5 new capabilities to Fabricate's CI/CD:

1. **Conventional commit enforcement** on every PR
2. **Foundry VTT integration test infrastructure** (Docker + Playwright scripts)
3. **Foundry integration test workflow** (manually triggerable, reusable as release gate)
4. **Release workflow** (manual trigger, semantic-release for versioning + tagging)
5. **Team A UX audit** updated with live Foundry + Playwright MCP

## Deliverable 1: Conventional Commits

### Files to create/modify

- **Create `.github/workflows/commitlint.yml`** — validates PR title follows conventional commits
- **Create `commitlint.config.js`** — commitlint configuration
- **Modify `package.json`** — add `@commitlint/cli`, `@commitlint/config-conventional` as devDependencies
- **Modify `.claude/agents/implementer.md`** — add conventional commit rule
- **Modify `.claude/agents/orchestrator.md`** — add conventional commit rule
- **Modify `.github/workflows/team-b-backlog.yml`** — update commit message format

### Conventional commit format for agents

```
<type>(#<issue>): <description>

Types: feat, fix, docs, chore, refactor, test, style, perf
```

### commitlint.yml workflow

```yaml
name: Commit Lint
on:
  pull_request:
    types: [opened, edited, synchronize]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Validate PR title
        run: echo "${{ github.event.pull_request.title }}" | npx commitlint
      - name: Validate commits
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }}
```

### commitlint.config.js

```js
export default {
  extends: ['@commitlint/config-conventional'],
};
```

---

## Deliverable 2: Foundry Integration Test Infrastructure

### Files to create

- **`docker-compose.foundry.yml`** — Docker Compose for Foundry container
- **`.env.foundry.example`** — env template
- **`scripts/foundry-test-up.mjs`** — start container + wait for health
- **`scripts/foundry-test-run.mjs`** — Playwright smoke tests against running Foundry
- **`scripts/foundry-test-down.mjs`** — teardown container
- **`scripts/foundry-test.mjs`** — orchestrator: build → up → run → down
- **`test-fixtures/worlds/fabricate-test/world.json`** — minimal test world

### docker-compose.foundry.yml

```yaml
services:
  foundry:
    image: felddy/foundryvtt:13
    ports:
      - "30000:30000"
    environment:
      FOUNDRY_USERNAME: ${FOUNDRY_USERNAME}
      FOUNDRY_PASSWORD: ${FOUNDRY_PASSWORD}
      FOUNDRY_LICENSE_KEY: ${FOUNDRY_LICENSE_KEY}
      FOUNDRY_ADMIN_KEY: test-admin-key
      FOUNDRY_WORLD: fabricate-test
      CONTAINER_CACHE: /data/container_cache
      TZ: UTC
    volumes:
      - foundry-data:/data
      - ./dist:/data/Data/modules/fabricate:ro
      - ./test-fixtures/worlds/fabricate-test:/data/Data/worlds/fabricate-test
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:30000"]
      interval: 5s
      timeout: 3s
      retries: 24
      start_period: 30s
volumes:
  foundry-data:
```

### world.json (test fixture)

Minimal world targeting Foundry v13 with Fabricate dependency, no game system required for smoke tests. Passwordless Gamemaster user.

```json
{
  "id": "fabricate-test",
  "title": "Fabricate Test World",
  "system": "dnd5e",
  "coreVersion": "13",
  "systemVersion": "4",
  "description": "Automated test world for Fabricate CI",
  "modules": [
    { "id": "fabricate", "active": true }
  ]
}
```

Note: The actual user data (passwordless GM) is configured on first launch. The test scripts must handle the initial join screen by selecting the Gamemaster user.

### foundry-test-up.mjs

1. Check for required env vars (FOUNDRY_USERNAME, FOUNDRY_PASSWORD, FOUNDRY_LICENSE_KEY) — read from `.env.foundry` locally or process.env in CI
2. Run `docker compose -f docker-compose.foundry.yml up -d`
3. Poll `http://localhost:30000` every 2s until 200 response (max 120s)
4. Verify world is accessible by checking response contains expected content
5. Exit 0 on success, 1 on timeout

### foundry-test-run.mjs

Uses Playwright (already a devDependency) to:

1. Launch chromium headless
2. Navigate to `http://localhost:30000/join`
3. Wait for join screen to render
4. Click the Gamemaster user select option
5. Click "Join Game Session" button (no password)
6. Wait for `game.ready` by polling `page.evaluate(() => typeof game !== 'undefined' && game.ready)`
7. Run smoke checks:
   - `game.modules.get('fabricate')?.active === true`
   - `typeof game.fabricate?.api !== 'undefined'`
8. Run UI checks (screenshot each at 1920x1080, 1366x768, 800x600):
   - Open crafting app: `game.fabricate.api.getCraftingAppClass().show()`
   - Screenshot → `test-results/foundry/screenshots/crafting-app-{width}.png`
   - Open recipe manager: `game.fabricate.api.getRecipeManagerAppClass().show()`
   - Screenshot → `test-results/foundry/screenshots/recipe-manager-{width}.png`
9. Collect console errors during the session
10. Write `test-results/foundry/summary.json` with pass/fail + check results
11. Exit 0 if all checks pass, 1 if any fail

### foundry-test-down.mjs

1. Run `docker compose -f docker-compose.foundry.yml down -v`
2. Clean up any temp state

### foundry-test.mjs (orchestrator)

1. Run `npm run build` (ensures dist/ is fresh)
2. Run `node scripts/foundry-test-up.mjs`
3. Run `node scripts/foundry-test-run.mjs`
4. Always run `node scripts/foundry-test-down.mjs` (even on failure)
5. Exit with the run script's exit code

---

## Deliverable 3: Foundry Integration Test Workflow

### File to create: `.github/workflows/foundry-integration.yml`

Manually triggerable. Also callable as a reusable workflow (for the release gate).

```yaml
name: Foundry Integration Tests

on:
  workflow_dispatch:
  workflow_call:

permissions:
  contents: read

jobs:
  foundry-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npx playwright install chromium --with-deps
      - name: Start Foundry
        env:
          FOUNDRY_USERNAME: ${{ secrets.FOUNDRY_USERNAME }}
          FOUNDRY_PASSWORD: ${{ secrets.FOUNDRY_PASSWORD }}
          FOUNDRY_LICENSE_KEY: ${{ secrets.FOUNDRY_LICENSE_KEY }}
        run: node scripts/foundry-test-up.mjs
      - name: Run integration tests
        run: node scripts/foundry-test-run.mjs
      - name: Stop Foundry
        if: always()
        run: node scripts/foundry-test-down.mjs
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: foundry-test-results
          path: test-results/foundry/
```

---

## Deliverable 4: Release Workflow

### Files to create/modify

- **Create `.github/workflows/release.yml`** — manually triggered release workflow
- **Create `.releaserc.json`** — semantic-release configuration
- **Modify `package.json`** — add `semantic-release` + plugins as devDependencies
- **Modify `scripts/release.js`** — add `--version` flag to accept version from CLI

### .releaserc.json

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/npm",
      { "npmPublish": false }
    ],
    [
      "@semantic-release/exec",
      {
        "prepareCmd": "node scripts/release.js --version ${nextRelease.version}"
      }
    ],
    [
      "@semantic-release/github",
      {
        "assets": [
          { "path": "dist/fabricate-v*.zip", "label": "Module package" },
          { "path": "dist/module.json", "label": "Module manifest" }
        ]
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["package.json", "module.json"],
        "message": "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}"
      }
    ]
  ]
}
```

### release.yml

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Dry run (no publish)"
        required: false
        default: "false"
        type: choice
        options: ["true", "false"]

permissions:
  contents: write
  issues: read

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build

  integration-tests:
    needs: unit-tests
    uses: ./.github/workflows/foundry-integration.yml
    secrets: inherit

  release:
    needs: integration-tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Semantic Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if [ "${{ inputs.dry_run }}" = "true" ]; then
            npx semantic-release --dry-run
          else
            npx semantic-release
          fi
```

### release.js modification

Add `--version <ver>` flag that:
1. Writes the version to `package.json` and `module.json` before building
2. Uses that version in the zip filename (`fabricate-v<ver>.zip`)

---

## Deliverable 5: Team A UX Audit with Foundry + Playwright MCP

### Modify `.github/workflows/team-a-research.yml`

Replace the `ux-audit` job with a version that:
1. Builds Fabricate (`npm run build`)
2. Starts Foundry container with the built module mounted
3. Waits for Foundry to be healthy
4. Installs Playwright browsers
5. Runs Claude Code Action with Playwright MCP configured
6. Agent navigates to Foundry, logs in, opens crafting UIs, takes screenshots, analyses
7. Tears down Foundry on completion (always)

Uses docker compose approach (not GHA `services:`) because `services:` doesn't support workspace bind mounts.

---

## Agent configuration updates summary

### implementer.md changes
- Add rule: "Use conventional commits: `<type>(#<issue>): <description>`"
- Fix test runner reference: "node:test" not "Jest"

### orchestrator.md changes
- Add rule: "All commits must follow conventional commit format"

### team-b-backlog.yml changes
- Update commit message format to follow conventional commits properly

---

## Implementation order

1. Conventional commits (commitlint config + workflow + agent updates)
2. Foundry test infrastructure (docker-compose + scripts + world fixture)
3. Foundry integration workflow
4. Release workflow (semantic-release config + release.yml + release.js update)
5. Team A UX audit update

## Files changed (complete list)

### New files
- `.github/workflows/commitlint.yml`
- `.github/workflows/foundry-integration.yml`
- `.github/workflows/release.yml`
- `commitlint.config.js`
- `.releaserc.json`
- `docker-compose.foundry.yml`
- `.env.foundry.example`
- `scripts/foundry-test-up.mjs`
- `scripts/foundry-test-run.mjs`
- `scripts/foundry-test-down.mjs`
- `scripts/foundry-test.mjs`
- `test-fixtures/worlds/fabricate-test/world.json`

### Modified files
- `package.json` (devDependencies: commitlint, semantic-release + plugins)
- `scripts/release.js` (add --version flag)
- `.claude/agents/implementer.md` (conventional commits rule, fix test runner name)
- `.claude/agents/orchestrator.md` (conventional commits rule)
- `.github/workflows/team-a-research.yml` (ux-audit job with Foundry + Playwright)
- `.github/workflows/team-b-backlog.yml` (conventional commit message format)
