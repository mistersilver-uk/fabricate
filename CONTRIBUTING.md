# Contributing to Fabricate

## Development Workflow

### Mandatory Process for ALL Code Changes

**All non-trivial code changes must follow this OpenSpec workflow:**

1. **Read the Canonical Spec** – Start with the relevant file(s) in `openspec/specs/*/spec.md`
2. **Capture the Change Delta in the Issue** – Author the OpenSpec delta in the work's GitHub issue, inside the managed `openspec-delta` block (append it to an existing issue and preserve the reporter's text, or create one from the `OpenSpec Change Delta` issue template for prompt-driven work).
It is not versioned under `openspec/changes/`.
3. **Fill the Delta Sections** – Proposal, Design, Tasks, optional Spec Deltas, Resolved Roster, and Verification & Acceptance before implementation
4. **Await Approval** – Plan-review agents (and any maintainer) accept the delta via plan-review verdicts on the issue before implementation begins
5. **Implement** – Write code and make the canonical spec changes the delta requires under `openspec/specs/`
6. **Reconcile** – Post-implementation and docs review compare the actual `openspec/specs/` diff against the issue delta, confirming a faithful realization or updating the delta (with a `Deviations` note) when implementation justifiably diverged

### OpenSpec Layout

Canonical technical specifications live under `openspec/specs/` — the only versioned spec source of truth.
Per-change deltas are **not** versioned in git; they live in the work's GitHub issue (managed `openspec-delta` block).
The legacy `spec/` directory is retained only as compatibility links and should not be edited directly.

See `openspec/README.md` and `openspec/specs/README.md` for:

- OpenSpec structure
- The canonical spec index
- The issue-based change-delta format and its rules

### Specification-Driven Development

We follow a **spec-driven approach** for development with agents:

- **Specifications define behaviour** – Features are specified before implementation
- **Code implements specs** – Implementation follows the specification
- **Per-change deltas capture intent** – Each change's issue delta records scope, design, and execution steps
- **Specs are living documents** - Updated as features evolve
- **Specs guide testing** – Test scenarios are derived from specifications

This ensures consistency, maintainability, and clear documentation of system behaviour.

## Release Workflow

Fabricate uses a local release build script to assemble the final module distribution before publishing.

### npm Scripts

| Script | Command | What it does |
|:-------|:--------|:-------------|
| `release` | `npm run release` | Full build: clean `dist/`, run Vite, copy assets, write `dist/module.json`, zip, validate |
| `release:build` | `npm run release:build` | Same as `release` but skips the zip step — useful in CI environments |
| `release:validate` | `npm run release:validate` | Validate an existing `dist/` without rebuilding |

All three scripts are implemented in `scripts/release.js`, which exports three utility functions used by both the script and its tests:

- **`rewriteModuleJson(manifest)`** — produces a `dist/`-ready manifest: strips the `dist/` prefix from `esmodules` paths and strips the `.db` suffix from pack paths.
- **`getRequiredFiles(manifest)`** — returns the list of files that must be present in `dist/` based on the rewritten manifest.
- **`validateDist(distDir, srcManifest)`** — checks that all required files exist and that `dist/module.json` is valid JSON.

### Building a Release

```bash
# Standard release (build + zip)
npm run release

# Build only, no zip (e.g. for CI artifact upload)
npm run release:build

# Validate dist/ without rebuilding
npm run release:validate
```

The script exits with code 1 if validation fails and prints a list of missing files or parse errors.

### Local Development (dev server with HMR)

Link the **project root** into Foundry's module directory:

```bash
npm run setup:dev
```

The script is idempotent — re-run it any time (for example after a Foundry update).
It creates a directory junction on Windows (no admin or Developer Mode needed) and a symlink on Linux and macOS.
Default Foundry Data paths:

- Windows: `%LOCALAPPDATA%\FoundryVTT\Data`
- macOS: `~/Library/Application Support/FoundryVTT/Data`
- Linux: `~/.local/share/FoundryVTT/Data`

If your Foundry install uses a custom Data location, set `FOUNDRY_DATA_PATH` before running the script.
If an existing link points at the wrong place, re-run with `--force` to repoint it (the script refuses to clobber a real directory or file at the target path under any flag).

**Troubleshooting:** If the Fabricate module is missing from Foundry's Setup screen after a Foundry major-version update, the symlink is probably fine — check `compatibility.verified` and `compatibility.maximum` in `module.json`.
Foundry hides modules whose `maximum` is below the running major version.

Start Foundry at `http://localhost:30000` with a world that has the module enabled, then:

```bash
npm run dev
```

Open `http://localhost:5173` instead of `:30000`.
Foundry loads normally, but Fabricate's source files are served by Vite with HMR transforms.
Svelte component edits appear instantly without a page reload; other JS changes trigger a full reload.

**How it works:**

- A custom Vite plugin (`scripts/vite-foundry-proxy.js`) proxies all requests to Foundry at `:30000`
- Foundry requests `/modules/fabricate/main.js`, which Vite serves from the repo root
- The repo-root `main.js` shim loads `src/main.js` on the Vite dev server and `dist/main.js` for direct Foundry or release-like loads
- `/@vite/client` is injected into Foundry's HTML to bootstrap the HMR WebSocket
- Foundry's `socket.io` is proxied with WebSocket upgrade support
- HMR uses a separate port (5174) to avoid collision with Foundry's socket.io

### Release Script CI Usage

The `--no-zip` flag (`npm run release:build`) is designed for use in GitHub Actions:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
- run: npm ci
- run: npm run release:build
- uses: actions/upload-artifact@v4
  with:
    name: fabricate-dist
    path: dist/
```

## UI Architecture (Svelte)

Fabricate's UI is built with **Svelte 5** (runes mode).
All components use `$props()`, `$state`, `$derived`, `$effect`, and `onclick`/`onchange` event attributes.

### File Layout

```text
src/ui/svelte/
├── apps/                        # Root components (one per Foundry window)
│   ├── CraftingAppRoot.svelte   # Player crafting interface
│   ├── RecipeManagerRoot.svelte # GM admin interface
│   └── editor/
│       └── RecipeEditorRoot.svelte  # GM recipe editor
├── components/                  # Shared/reusable components
│   └── DropZone.svelte
├── stores/                      # Reactive state (one per app surface)
│   ├── craftingStore.js
│   ├── adminStore.js
│   └── editorStore.js
├── actions/                     # Svelte use:action directives
│   └── dragDrop.js              # Foundry drag-and-drop integration
├── util/
│   └── foundryBridge.js         # Thin wrappers for Foundry APIs
├── SvelteApplicationMixin.svelte.js  # Mounts Svelte into ApplicationV2
└── SvelteApplicationMixinCore.js     # Core mixin logic (testable without Svelte)
```

### Foundry Integration

Each Foundry window is an `ApplicationV2` subclass using `SvelteApplicationMixin`.
The mixin mounts a root Svelte component in `_renderHTML()` and unmounts it in `close()`.
App classes are registered via factory functions in `src/ui/appFactory.js` to avoid importing `.svelte.js` files in the Node test environment.

### Store Pattern

Stores use a **factory pattern** — `createCraftingStore(services)`, `createEditorStore(services, options)`, `createAdminStore(services)`.
Each app instance creates its own store to prevent state leaking between multiple open windows.
Services (RecipeManager, CraftingEngine, etc.) are injected for testability.

### Foundry Bridge

`src/ui/svelte/util/foundryBridge.js` wraps Foundry APIs (`game.i18n.localize`, `Dialog.confirm`, notifications).
Components import from this module rather than accessing `game.*` directly, making them testable outside Foundry.

### Drag-and-Drop

The `use:dragDrop` action (`src/ui/svelte/actions/dragDrop.js`) integrates with Foundry's drag-and-drop system.
Apply it to any element that should accept drops from Foundry sidebars or other modules.

### Testing

- **Store tests** (pure JS, no DOM): `tests/stores/*.test.js` — exercise state transitions and service interactions using `node --test` with Foundry global mocks.
- **App/UI tests**: existing test files in `tests/` test store and app-class behaviour with mocked services.
- **Test runner**: Node's built-in `node --test`.
No Jest, Vitest, or Playwright.

### CSS

- Component-scoped `<style>` blocks handle per-component styles.
- `styles/fabricate.css` contains shared/global rules (layout, admin panel, design tokens).
- Foundry core CSS classes (`flexrow`, `flexcol`) are used where appropriate.

### Foundry vs Fabricate CSS overrides

Foundry core ships global styles for `button`, `input`, `select`, `textarea`, and `[tabindex]` controls.
These frequently win over — or fight with — Fabricate's own styling.
The override almost always belongs in **global per-area CSS in `styles/fabricate.css`**, not in a scoped Svelte component `<style>`.

**Why global, not scoped:**

- `styles/fabricate.css` is served directly by Foundry, so edits take effect on reload with no Svelte rebuild.
  A scoped component `<style>` only ships after the Vite bundle is rebuilt — a stale bundle silently keeps the old behavior.
- Scoped component rules race the global stylesheet on specificity in ways that are easy to get wrong (see the specificity ladder below).
  Centralizing the override in one per-area block keeps the cascade predictable.
- The areas are keyed by the root application classes (`SvelteFabricateApp` → `['fabricate', 'fabricate-app']`; the manager → `.fabricate-manager`; the admin shell → `.fabricate-admin`).

**Instance 1 — button layout.**
Foundry's global `button` styles center content (`justify-content: center`) and pin a fixed height.
A Svelte component rendering a `<button>` with custom content (icon+label triggers, portrait+name option rows) must set `justify-content: flex-start`, `height: auto`, and an explicit `min-height`, or content centers and taller children (e.g. actor portraits) clip.
Verify in real Foundry, not just compiled source.

**Instance 2 — the orange focus ring.**
Foundry paints an orange focus ring on focusable controls.
Each app-area neutralizes it with a **paired block** in `styles/fabricate.css`:

```css
/* strip Foundry's orange ring (mouse focus) */
.fabricate-app button:focus,
.fabricate-app input:focus,
.fabricate-app select:focus,
.fabricate-app textarea:focus,
.fabricate-app [tabindex]:focus {
  outline: none;
  box-shadow: none;
}

/* repaint an intentional accent ring (keyboard focus) */
.fabricate-app button:focus-visible,
.fabricate-app input:focus-visible,
.fabricate-app select:focus-visible,
.fabricate-app textarea:focus-visible,
.fabricate-app [tabindex]:focus-visible {
  outline: 2px solid var(--fab-accent);
  outline-offset: 2px;
}
```

`:focus` vs `:focus-visible` is load-bearing.
Handle `:focus-visible` **explicitly**.
A button lands in the `:focus-visible` state after a sibling/panel re-render — for example the player nav's tab panel swapping content on click.
A `:focus:not(:focus-visible)` rule alone strips the ring on a plain mouse click but leaves it in exactly that "clicked-away, panel re-rendered" state, which is the symptom that originally got reported.

**Specificity ladder.**
Keep area blocks at **single area-class** specificity so per-component focus rings still win:

| Selector | Specificity | Role |
| --- | --- | --- |
| `.fabricate-app button:focus-visible` | 0,2,1 | area default — strips/repaints Foundry's ring |
| `.some-widget:focus-visible` (scoped Svelte, `+ .svelte-hash`) | 0,3,0 | per-component ring (custom offset, inset, color) |
| `.fabricate.fabricate-app button:focus-visible` | 0,3,1 | ❌ clobbers the per-component ring |

Using the doubled root class (`.fabricate.fabricate-app …`) raises the area default to 0,3,1, which overrides component-scoped rings (e.g. gathering rows that intentionally use `outline-offset: -2px`).
Use the single class (`.fabricate-app …`) — matching how `.fabricate-admin`/`.fabricate-manager` are written — so component rings at 0,3,0 stay authoritative.

**Checklist when adding/auditing a control or surface:**

- New top-level app surface (new root application class)? It needs its own paired focus block — a partial `:focus:not(:focus-visible)` rule reads as "handled" but isn't.
- Don't add scoped `:focus`/`:focus-visible` CSS in a component to fight Foundry — put it in the area block.
Reserve scoped focus CSS for genuinely per-widget rings, and keep them at component specificity (0,3,0) so the area default doesn't fight them.
- Custom-content button clipping? Apply the layout fix in Instance 1.
- Verify both in real Foundry (`npm run test:foundry`) — Foundry's global cascade is not reproduced by compiled-source inspection or unit tests.

## Commit conventions

All commits to Fabricate must follow the [Conventional Commits](https://www.conventionalcommits.org/) format.
A GitHub Actions workflow validates every commit on a pull request and the PR title itself using `commitlint`.

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

```text
feat(#42): add shopping list panel to crafting UI
fix(#99): correct ingredient deduplication in alchemy mode
```

The scope is optional for all other types.
Header lines must be 100 characters or fewer.

## Linting & formatting

Fabricate uses [ESLint](https://eslint.org/) (flat config in `eslint.config.js`) for JavaScript static analysis, [Stylelint](https://stylelint.io/) (config in `stylelint.config.js`) for CSS, and [Prettier](https://prettier.io/) for formatting.
All three run as a **required CI check** (`lint` job in `.github/workflows/ci.yml`).

```bash
npm run lint           # ESLint over the gated JS scope (fails on any warning)
npm run lint:fix       # …and auto-fix what can be fixed
npm run lint:css       # Stylelint over styles/**/*.{css,scss} (what CI runs)
npm run lint:css:fix   # …and auto-fix what can be fixed
npm run format         # Prettier-format the gated scope
npm run format:check   # verify formatting (what CI runs)
```

### CSS linting (Stylelint)

`npm run lint:css` gates `styles/**/*.{css,scss}` (today: the global `styles/fabricate.css`).
The config extends `stylelint-config-standard` and is tuned to enforce the dimensions a linter can actually check — each is mapped to its rule(s) in the header comment of `stylelint.config.js`:

- **Quality** — invalid/unknown syntax, modern value notation, malformed selectors.
- **Reliability** — duplicate/contradictory declarations, shorthand-property overrides, deprecated properties/values.
- **Duplication** — duplicate selectors, duplicate properties / custom properties, duplicate `@import`s and font-family names.
- **Reuse / DRY** — collapses redundant longhands into shorthands (`declaration-block-no-redundant-longhand-properties`) and strips redundant shorthand values.
- **Cross-browser** — `stylelint-no-unsupported-browser-features` checks every property/value against the `browserslist` matrix in `package.json` (Foundry's supported browsers).

Stylelint has **no** robust rule for detecting two near-identical rule blocks that *could be merged* (structural similarity); the duplicate/shorthand rules above are the closest proxy, and SonarCloud also scores CSS duplication on a PR's new code.
A handful of standard rules are deliberately turned off with justification in `stylelint.config.js` (e.g. `no-descending-specificity` — reordering the single large global sheet is regression-prone and unreviewable; the cosmetic `selector-not-notation` / `media-feature-range-notation` modernizers — pure churn for no enforcement value).
The Svelte components' scoped `<style>` blocks are not linted here (they compile to hashed classes and are owned by the Svelte toolchain).

### Staged rollout

Linting is being introduced **path by path** so each step lands green rather than in one unreviewable sweep.
Each path is added only once it is clean for **both** ESLint and the SonarCloud quality gate (which scores duplication, reliability, and security on the PR's *new code* — so a path is widened in its own focused PR, not bundled into an unrelated change).
The gate (`npm run lint` / `npm run format:check`) now covers the **entire `src/` JavaScript surface**:

- `src/models/`, `src/utils/`, `src/integrations/`, `src/config/`, `src/migration/`, `src/canvas/`, `src/systems/`, and `src/toolBreakageRuntime.js`

Not yet gated (tracked for follow-up — run `npm run lint:all` / `npm run lint:svelte` to see them):

- the `tests/` suite — sort comparators, fixture duplication
- `src/ui/**` and all `*.svelte` components (Svelte parsing is wired up; findings triaged later)
- `src/main.js`, `src/gatheringBootstrapAdapters.js`, `src/gatheringToolRuntime.js` (covered by source-text assertions in `tests/gathering-bootstrap-api.test.js`, so they change with that test)
- `scripts/**` build/release tooling

When you bring a new path to green (ESLint **and** SonarCloud), add it to the `lint`/`format` globs in `package.json` so the gate keeps it green.

## Foundry integration (smoke) tests

The smoke harness boots a real Foundry VTT instance in Docker, loads the built module, and walks the Crafting System Manager UI and the unified Fabricate shell end-to-end with Playwright.
It catches regressions the JS-level unit suite can't — actual layout, DOM events, real Foundry APIs.

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

Never commit `.env.foundry`.
It is listed in `.gitignore`, but double-check before pushing.

Install the Playwright browser used by the smoke test:

```bash
npm run test:foundry:install
```

Build the module so the Docker container has a `dist/` directory to mount:

```bash
npm run build
```

### Entrypoints

- `npm run test:foundry` — full pipeline: `up` → `run` → `down`. ~7–8 minutes including docker boot.
- `npm run test:foundry:up` — start the Foundry container and wait for it to be healthy; leave it running (useful when iterating on the harness itself).
- `npm run test:foundry:run` — run the Playwright smoke test against an already-running container.
- `npm run test:foundry:down` — stop and remove the container (preserve the image).
- `npm run test:foundry:rc` — release-candidate profile.

To run the release-candidate CI profile locally:

```bash
npm run test:foundry:rc
# or
FOUNDRY_SMOKE_PROFILE=rc npm run test:foundry      # POSIX
$env:FOUNDRY_SMOKE_PROFILE='rc'; npm run test:foundry  # PowerShell
```

To do a full clean reset including volumes:

```bash
node scripts/foundry-test-down.mjs --clean
```

Scripts live in `scripts/foundry-test-*.mjs`.
The main harness is `scripts/foundry-test-run.mjs` (~3700 lines).

### Phases

The run walks several phases in order; if an earlier phase fails, later phases are skipped:

- **boot-and-join** — health-poll the container, log in as Gamemaster.
- **Phase B** — create test actors and items, screenshot sheets.
- **Phase C** — create a crafting system + sample recipes.
- **Phase D0** — open the Crafting System Manager, exercise its surfaces, screenshot (the `screenshot-manager` step).
  **This is where most drift shows up** when manager markup changes.
  After the default-selection capture it also re-themes the real manager via the `data-fabricate-theme` attribute (exactly as the theme setting's `applyFabricateTheme` onChange does) and captures `manager-theme-<themeId>` for every Fabricate theme, then restores the default.
  These are real, Foundry-rendered themed captures — theme fidelity is not validated via hand-authored mocks.
- **Phase E** — API-driven crafting flow, then open the unified Fabricate shell (`#fabricate-app`) from the Craft Item and Gathering sidebar buttons and assert the four-tab left nav (`fabricate-app-shell` screenshot).
  The shared actor-selection top bar mounts with the shell; the phase waits for it to flip `[data-actor-bar-state]` from `loading` to `ready` before capturing.
  The full profile also walks staged player gathering screenshots: environment list, event inspection, ready attempt detail, post-attempt refresh, missing-tool block, timed-run ready and active states, blind gathering, realm-locked listing, and stacked narrow-window layout.
- **Phase F** — cleanup.

The former standalone player-facing Crafting and Gathering app phases (D2/D3/E2) and standalone Recipe Editor were removed when those surfaces were retired; both sidebar buttons now open the unified Fabricate window.

### Test artifacts

After any run (success or failure), results are written to `test-results/`:

| File | Description |
|------|-------------|
| `summary.json` | Machine-readable `{ passed, steps[], errors[], consoleErrors[], phaseTimings[] }` — pass/fail result, smoke profile, timings, and list of errors |
| `console.log` | Full browser console output captured during the test |
| `screenshot-*.png` | Per-step screenshots captured by the selected profile |
| `screenshot-failure.png` | Captured only when a step throws (last DOM state) |

When debugging a smoke failure, read `summary.json` first: the failing step's `error` field plus the surrounding successful steps usually point straight at the broken selector.

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

A single orchestrator (`scripts/foundry-test.mjs`) and run script (`scripts/foundry-test-run.mjs`) handle both profiles.
The profile is selected by `FOUNDRY_SMOKE_PROFILE` (or `--profile=<value>` on `node scripts/foundry-test.mjs`).

| Profile | When | Phases | Target |
|---------|------|--------|--------|
| `rc` | Release-candidate CI | Phase B → C → E (unified shell, one Gathering success, Healing Potion craft) → console-error check | < 20 min including cold setup |
| `ci` | Deprecated alias for `rc` (removed after one release) | same as `rc` | same |
| `full` (default) | Local and visual-regression runs | + Phase D0 (manager screenshots), extended Gathering states, non-GM redaction, no-selectable actors, Phase F (cleanup) | ~10–15 min locally |

The `rc` profile captures a pinned screenshot budget (`world-loaded`, `fabricate-app-shell`, `post-craft`, `alara-post-craft-inventory`, plus `screenshot-failure.png` on failure) — every other `screenshot(page, label)` call is a no-op under `rc`, but the surrounding behavioral assertions still run.

The orchestrator gives the in-browser run its own wall-clock budget (`FOUNDRY_RUN_TIMEOUT_MS`, default 15 minutes).
On overrun, the run process is sent `SIGTERM` and the orchestrator proceeds to Docker teardown + artifact upload, so the 20-minute Actions budget can never preempt cleanup.
Override locally if you need a longer or shorter cap:

```bash
FOUNDRY_RUN_TIMEOUT_MS=600000 npm run test:foundry:rc          # POSIX (10 minutes)
$env:FOUNDRY_RUN_TIMEOUT_MS='600000'; npm run test:foundry:rc  # PowerShell
```

Every run prints a phase-timing table to stdout at the end and writes timings into `summary.json` under `phaseTimings` and `bootTimings`, so slow phases jump out in CI logs.
Use `full` whenever you need fresh visual references for design review.

### Interpreting `passed: false`

`summary.json.passed` is false if **either** a phase step fails **or** `consoleErrors[]` is non-empty.
These are very different signals:

- A failed **step** (an entry in `steps[]` with an `error`) is a real regression — a broken selector, a thrown assertion, a surface that didn't render.
- A non-empty **`consoleErrors[]`** can be benign.
  The fixture world routinely emits browser `404 (Not Found)` loads for missing tiles, portraits, or sounds, and any such console error flips `passed` to false even when every step passed.

So before treating a run as broken — or discarding its captured screenshots — confirm whether `steps[]` contains an actual failing step.
A `passed: false` driven purely by `404` console noise with zero failed steps means the walk succeeded and the `screenshot-*.png` artifacts are valid evidence.
(Example seen in practice: all phases B–F passed and `fabricate-app-shell` captured correctly, but `passed: false` came solely from 12 generic `404` console errors.)

### Known drift pattern: Phase D0 selectors

`exerciseManagerEnvironmentPointerTargets` (~line 905 in `foundry-test-run.mjs`) and the env-edit checks (~line 2490) pin many selectors by class, child index (`.nth(N)`), and visible button text.
When the manager UI evolves, these go stale silently — the harness only fails when the next smoke run hits the broken locator.

Hit list seen historically:

- `.manager-environment-row .manager-icon-button .nth(3)` / `.nth(4)` — expected move-up / move-down buttons that were dropped when reordering moved to drag-and-drop.
- `.manager-environment-edit-view.is-placeholder` and `.manager-environment-placeholder-card` — gone since the real composition editor replaced the placeholder.
- "Return to environments" button text — renamed to "Back to environments" and rewired through `confirmRouteExit`.
- `.manager-environment-details-band` — CSS rule survived in `styles/fabricate.css`, but the Svelte usage was removed; the harness kept waiting on it.
- `.manager-travel-party-row` / `.manager-travel-member-row` — the **singular** classes from the retired `GatheringTravelView`.
The live Travel tab renders `GatheringPartiesTab` (`.manager-travel-parties-row`, **plural**) and `PartyExpandedBody` (`.manager-party-member-row`); the harness `waitFor` timed out until the selectors were repointed.

**Workflow rule:** Whenever editing manager UI markup (env browser row, env-edit view, CompositionList, header actions, Travel tabs, etc.), grep `scripts/foundry-test-run.mjs` for the changed classes / text BEFORE declaring the change done.
Prefer running `npm run test:foundry` locally at least once on UI-touching PRs.
If the harness asserts on something the new markup no longer has, update the harness in the same PR.

**CI blind spot:** PR CI runs a reduced profile that skips full-only steps (e.g. the Travel screenshot).
A selector that only the **full** profile exercises rots invisibly until someone runs `npm run test:foundry` locally.
Don't assume green PR CI means the full smoke walk passes.

### Running it locally (gotchas)

- Needs Docker Desktop running and `.env.foundry` with `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` (the `up` script loads it; CI sets the vars directly).
The container is cached between runs, so re-runs boot in ~5s.
- The `run` phase **wipes `test-results/`** at startup.
Do **not** redirect run logs into `test-results/` (e.g. `... | Tee-Object test-results/x.log`) — on Windows the open log file can't be unlinked and the run dies with `EBUSY`.
Tee to a path outside `test-results/` if you need a copy.

### Documentation screenshot source

The docs increasingly use real Foundry screenshots for each stage of gathering setup and play.
The source of truth is the local `full` smoke profile, not hand-captured one-off browser images.
Run `npm run test:foundry` locally, then copy only curated frames from `test-results/screenshot-*.png` into `docs/img/screenshots/` with durable names.
Do not link docs directly to `test-results/`; that directory is transient and is wiped at the start of the next smoke run.

The reduced `rc`/`ci` smoke profiles intentionally do not regenerate this whole docs source set; local `full` runs provide documentation evidence.
Only copy a frame into `docs/img/screenshots/` when an authored docs page references it.
`tests/docs-screenshots.test.js` fails on any committed screenshot that is not referenced from a docs page, so a frame that was deliberately dropped from the docs cannot quietly creep back in from a later smoke run.
If you remove a screenshot from a page, delete the `.webp` too (and vice versa).

## UI PR screenshot evidence

UI changes must include screenshot evidence in the PR body.
The CI `check-screenshots` job enforces this with `scripts/ui-pr-screenshot-evidence.mjs`: the body must contain a **Screenshots** heading (any ATX level, normally `##`) with at least one image beneath it.
The smoke-harness/S3 workflow below is the recommended way to produce real screenshots, but any image under a Screenshots heading — including a drag-and-dropped GitHub attachment — satisfies the check.

### When it applies

The rule applies when a PR changes any file under `src/ui/`, `styles/`, `lang/` (visible UI text), any `*.svelte` file, or any `*.css` file.

### Prerequisites

- A `gh` CLI authenticated (used only to read and patch the PR body).
- AWS credentials for the release S3 bucket.
  **Locally**, the AWS default provider chain (env vars or an `aws` CLI profile).
  **In CI**, OIDC role assumption only — never static keys.
  `publish` uploads PNGs to `s3://<bucket>/pr-screenshots/<number>/` (bucket/baseUrl from `release.s3.config.json`, overridable via `S3_RELEASE_BUCKET`/`RELEASE_BASE_URL`/`AWS_REGION`).

### Local workflow

1. Plan the required screenshot views:

   ```sh
   npm run screenshots:ui:plan -- --base origin/main
   ```

2. Run the Foundry smoke harness to generate real UI screenshots (local default is the `full` profile, which captures every per-view screen):

   ```sh
   npm run test:foundry
   ```

   The harness writes real Foundry-mounted screenshots under `test-results/`.

3. Collect only the mapped smoke screenshots for the PR:

   ```sh
   npm run screenshots:ui -- --base origin/main --pr <number>
   ```

   This copies the relevant smoke artifacts from `test-results/` into `tmp/pr-screenshots/<number>/`.
PR-scoped screenshots are temporary handoff files only.

4. Upload and embed automatically:

   ```sh
   npm run screenshots:ui:publish -- --pr <number>
   ```

   This uploads each collected PNG to `s3://<bucket>/pr-screenshots/<number>/<view>.png`, then patches the PR body via `gh pr edit --body-file`, inserting (or replacing, on re-run) a managed block:

   ```md
   <!-- fabricate:screenshots:start -->
   ![pr-123 Manager gathering environments](https://<bucket>.s3.<region>.amazonaws.com/pr-screenshots/123/manager-environments.png)
   <!-- fabricate:screenshots:end -->
   ```

   The S3 key is PR-scoped, so the object URL itself identifies the PR and the block alt text also includes `pr-<number>`.
   The block is idempotent — re-running `publish` replaces it in place rather than appending duplicates.

5. Clean up:

   ```sh
   npm run screenshots:ui:clean -- --pr <number>
   ```

   This removes the local `tmp/pr-screenshots/<number>/` only.
   The uploaded S3 objects stay live so the embedded image URLs keep working while the PR is open.
   Do not commit files from `tmp/pr-screenshots/<number>/` or move them into `docs/`, `assets/`, or any other repository asset directory.

   **Removing the S3 objects** (e.g. when the PR closes): `npm run screenshots:ui:clean -- --pr <number> --s3` deletes them best-effort (a missing-credentials/permission failure only warns).

   **Orphan prevention:** the S3 bucket has a lifecycle rule expiring the `pr-screenshots/` prefix after N days as a backstop, so PR screenshots never accumulate even if `--s3` cleanup is skipped.

### Screenshot source

Screenshot evidence must come from real smoke-harness artifacts in `test-results/`.
The script does not render hand-authored HTML fixtures, does not use copied mock asset manifests, and does not generate synthetic previews.
Smoke fixture data should use Foundry core or dnd5e non-SVG raster icon paths directly when a preview image is needed.

### CI behavior

CI runs only the lightweight `check` (no smoke run on the runner).
It reads the live PR body, changed files, and labels, then passes when the body has a **Screenshots** heading whose section contains at least one image.

- The heading match is case-insensitive, accepts any ATX level (`#`–`######`) and the singular form (`## Screenshot`).
- The section runs from the heading to the next heading of the same or higher level, so an image under a *different* later heading does not count.
- Images may be markdown (`![alt](url)`) or HTML (`<img src=...>`).
GitHub drag-and-drop attachment URLs have no file extension, so the image syntax — not the URL shape — is what matters.
- An image with no Screenshots heading, or a Screenshots heading with no image, does not pass.
There is **no `SCREENSHOTS_NEEDED:` text bypass**.

The only way to skip the check is the **`screenshots-exempt` label**, which only a maintainer can apply.
An agent must never apply it.
Use it only when screenshot capture is genuinely impossible (e.g. the smoke harness cannot boot for an unrelated reason).

## CI workflows

### Conventional Commits workflow

File: `.github/workflows/conventional-commits.yml`

Runs on every pull request.
Validates all commits in the PR using `commitlint` and checks that the PR title itself also follows the Conventional Commits format.

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
4. Compare RC tags pointing at `HEAD` before and after `semantic-release`.
If exactly one new `v<x.y.z>-rc.N` tag was created, call `.github/workflows/release-s3.yml` with `dry_run: false` and `overwrite: false`.
If no RC tag was created, skip S3 publishing.
If multiple new RC tags are detected at `HEAD`, fail the run because the S3 publish target is ambiguous.

### S3 release-candidate workflow

File: `.github/workflows/release-s3.yml`

Triggers:

- Manual `workflow_dispatch`, with `rc_tag`, `dry_run`, and `overwrite` inputs.
- Reusable `workflow_call` from the release-candidate workflow, using the same inputs.

Manual dispatch is the operator path for dry-runs, recovery reruns, and intentional overwrite attempts.
Automatic calls from `release-candidate.yml` publish only a newly-created RC tag and do not overwrite an existing versioned zip.

**Closed-beta tester path secret.**
The tester feed lives at an unguessable path: `testers/<group>/<segment>/<moduleId>/…`, where `<segment>` comes from the repository **secret** `S3_TESTER_PATH_SECRET` (env var of the same name locally) — never the committed config.
Generate it once (`openssl rand -hex 16`) and set it before publishing; the publish **refuses to run** when tester groups are configured but the secret is unset, so the feed can never fall back to a guessable URL.
`release-s3.js` withholds all S3 keys and install URLs from CI logs (they only print on local/`--dry-run` runs); GitHub also masks the secret value.
To rotate a compromised path: set a new `S3_TESTER_PATH_SECRET`, publish, distribute the new manifest URL to testers privately, then delete the old objects (`aws s3 rm --recursive s3://<bucket>/testers/<group>/fabricate/` — the legacy prefix only; the new `<segment>/` path is not matched).

### Codex workflows

Codex GitHub Actions workflows are manual-only in this repository.
Codex does not run automatically on `push`, `pull_request`, `pull_request_target`, `issue_comment`, `schedule`, or any other automatic trigger.

Files:

- `.github/workflows/team-a-research.yml`
- `.github/workflows/team-b-backlog.yml`
- `.github/workflows/codex-code-review.yml`

Requirements:

- Repository secret: `OPENAI_API_KEY`
- Repository secret: `WORKFLOW_GH_TOKEN` — a GitHub token used by `team-b-backlog.yml` (and other agent workflows) to push the implementation branch, create the PR, manage issue/PR labels and comments, delete the branch on cleanup, and patch the PR body when publishing UI screenshots.
The default `GITHUB_TOKEN` is insufficient because org policy blocks Actions from creating PRs.
A **fine-grained, repo-scoped** token needs these repository permissions:
  - **Contents: Read and write** — push commits/branches and delete refs.
  - **Pull requests: Read and write** — create PRs, apply PR labels, read and patch the PR body.
  - **Issues: Read and write** — edit issue labels and post issue comments.
  - **Metadata: Read** — mandatory baseline (auto-selected).
  - **Workflows: Read and write** — *only* if agent implementations may modify files under `.github/workflows/`; without it, any push that touches a workflow file is rejected.

  The labels it applies (`agent-created`, `in-progress`, `agent-failed`, `screenshots-exempt`) must already exist in the repo.
  This token grants no AWS access — S3 screenshot uploads authenticate separately via OIDC (see below).
- AWS for S3 screenshot publishing: in CI, **OIDC only** (never static keys), via a **dedicated, least-privilege role** distinct from the module-release role.
Repository variable `AWS_SCREENSHOTS_ROLE_TO_ASSUME` (the role ARN) plus the shared `AWS_REGION`, `S3_RELEASE_BUCKET`, `RELEASE_BASE_URL` variables and `permissions: id-token: write`.
Local runs use the AWS default provider chain.
See [Screenshot publishing infrastructure](#screenshot-publishing-infrastructure) for the exact IAM and bucket policies.

Behavior:

- `team-a-research.yml`: manual research and audit workflow
- `team-b-backlog.yml`: manual backlog implementation workflow, optionally scoped to `workflow_dispatch.issue_number`
- `codex-code-review.yml`: manual PR review workflow, scoped to `workflow_dispatch.pr_number`

Use these workflows only when you explicitly want a Codex run and have available usage for it.

### Screenshot publishing infrastructure

`npm run screenshots:ui:publish` uploads UI-PR screenshots to S3 under `pr-screenshots/<pr-number>/` and embeds the public object URLs in the PR body.
In CI (`team-b-backlog.yml`) this authenticates via GitHub OIDC using a **dedicated, least-privilege IAM role** — deliberately separate from the module-release role so agent-driven workflows can never write or overwrite real release artifacts.

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
GitHub emits that claim for reusable workflow jobs, while both screenshot workflows here are normal repository workflows.
The cleanup workflow uses `pull_request_target`, so its default `sub` is the pull-request subject (`repo:mistersilver-uk/fabricate:pull_request`) rather than the branch subject.

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

**Cleanup** — `screenshots:ui:clean` removes only local temp files (the S3 objects must stay live while the PR is open).
The `pr-screenshots-cleanup.yml` workflow runs `screenshots:ui:clean -- --pr <n> --s3` automatically when a PR closes (merged or not) to delete that PR's S3 objects.
A bucket **lifecycle rule** expiring the `pr-screenshots/` prefix after N days is the backstop so nothing accumulates even if the cleanup workflow is skipped or fails.
(Set N comfortably above how long PRs stay open, or the images break while a PR is still under review.)

These objects are public-read by URL (the accepted tradeoff for inline GitHub rendering of a private repo's screenshots).
Until the role/variable/bucket policy exist, the team-b publish step warns and the required `check-screenshots` gate fails closed until a maintainer publishes manually or applies the `screenshots-exempt` label.

## Release pipeline

Fabricate uses [semantic-release](https://semantic-release.gitbook.io/) to automate version management.
The pipeline is configured in `release.config.js`.

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
3. Calls `node scripts/release.js --version <new-version>` via `@semantic-release/exec`.
This injects the version into `module.json`, runs `vite build`, copies static assets, and creates `dist/fabricate-v<version>.zip`.
4. Creates a GitHub Release with the zip and the raw `module.json` as assets.
5. On `main`, the release-candidate workflow detects the newly-created RC tag at `HEAD` and publishes that exact tag to S3 through the reusable S3 workflow.

GitHub Releases are the canonical release history.
There is no committed `CHANGELOG.md` in this repository; release notes are generated from Conventional Commits per release candidate and aggregated across that base's RCs when an RC is promoted.
The CI release flow does not commit a repository changelog back to `main`; branch protection requires pull requests and status checks on `main`, so release automation publishes tags and GitHub Releases without a protected-branch writeback step.

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
