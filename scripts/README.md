# Fabricate Test Scripts

## Latest Module Versions

`latest-module-versions.mjs` queries the current latest manifest for Fabricate and the
premium sibling modules without requiring S3 bucket listing permission.
It reads the root
`release.s3.config.json` plus `../fabricate-premium/release.config.json`, then fetches
exact keys in the form `modules/<moduleId>/<channel>/latest/module.json`.

```bash
node scripts/latest-module-versions.mjs --profile fabricate-beta
node scripts/latest-module-versions.mjs --profile fabricate-beta --json
node scripts/latest-module-versions.mjs --profile fabricate-beta --include extra-module
```

Useful options:

| Option | Description |
|---|---|
| `--profile <name>` | AWS CLI/shared-config profile; use the local profile that can read the release bucket. |
| `--region <name>` | AWS region; defaults to `eu-west-2`. |
| `--bucket <name>` | Override the manifest bucket. |
| `--channel <name>` | Release channel; defaults to `beta`. |
| `--config <path>` | Fabricate release config path. |
| `--premium-config <path>` | Premium release config path. |
| `--include <moduleId>` | Add an explicit module id; repeatable. |
| `--no-premium` | Skip the sibling premium config. |
| `--json` | Print machine-readable JSON instead of a table. |

## Foundry Integration Smoke Test

The smoke test (`foundry-test-run.mjs`) verifies that Fabricate loads and functions correctly
in a live Foundry VTT instance.
It uses Playwright to drive a headless Chromium browser
through the full crafting lifecycle.

### Running

```bash
# Full pipeline: build, start Docker, run test, stop Docker
npm run test:foundry

# Individual steps
npm run test:foundry:install   # Install Playwright Chromium
npm run test:foundry:up        # Start Foundry Docker container
npm run test:foundry:run       # Run smoke test (requires running Foundry)
npm run test:foundry:down      # Stop Docker container and keep cached install

# Full reset when the cached Foundry container should be discarded
node scripts/foundry-test-down.mjs --clean

# Against an already-running Foundry instance
node scripts/foundry-test-run.mjs
```

### Environment Variables

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_URL` | `http://localhost:30100` | Base URL of the Foundry instance |
| `FOUNDRY_HOST_PORT` | `30100` | Host port used by the Docker harness. The default is 30100 (not 30000) so the smoke test can coexist with a developer's local Foundry on 30000; override with a matching `FOUNDRY_URL` if 30100 is also occupied. |
| `FOUNDRY_ADMIN_KEY` | `fabricate-test-admin` | Admin password for the setup/auth page |
| `FOUNDRY_IMAGE` | `felddy/foundryvtt:13` | Docker image used by the compose harness. Defaults to Foundry V13 for the V13 smoke world. |
| `FOUNDRY_RELEASE_URL` | unset | Optional explicit Foundry release URL. When unset, `test:foundry:up` uses a matching local cached zip if one exists. |
| `FOUNDRY_RECREATE` | unset | Set to `1` before `npm run test:foundry:up` to discard and recreate the cached container. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Foundry Download Cache

The harness first looks for `.foundry-e2e/cache/foundryvtt-<version>.zip`.
When the archive exists, `test:foundry:up` passes it to the container as a local `FOUNDRY_RELEASE_URL`, which avoids requesting a presigned release URL from Foundry during clean installs.

The harness also preserves the stopped Docker container between normal smoke-test runs.
This keeps the extracted Foundry application cached in the container filesystem, so reruns do not repeat installation work.

Use `node scripts/foundry-test-down.mjs --clean` or `FOUNDRY_RECREATE=1 npm run test:foundry:up` when you need to refresh the cached container after changing Docker image, port, or container-level configuration.

### Test Phases

The smoke test executes 6 phases:

| Phase | Name | What It Does |
|---|---|---|
| A | Setup | Navigates to Foundry, accepts license, authenticates, launches the world, and joins as Gamemaster |
| B | Create Actors & Items | Cleans stale data, imports the dnd5e **Starter Heroes** pack (`dnd5e.heroes`) as the demo actors and creates the world items, then seeds inventories on the crafter + travel-party hero |
| C | Create Crafting System | Creates "Arcane Forge" system, registers 7 components, creates 3 recipes |
| D | Screenshot Recipe Manager | Opens Recipe Manager, selects system, screenshots all 5 tabs |
| E | Craft an Item | Opens Crafting App, crafts a Healing Potion, verifies inventory |
| F | Cleanup | Deletes all test data (recipes, system, actors, items) |

### Screenshot Catalog

All screenshots are written to `test-results/` with auto-incrementing numeric prefixes.
The
stable part of each filename is the trailing label, not the numeric prefix.

| File label | Contents |
|---|---|
| `license`, `license-accepted`, `auth-complete`, `setup-ready`, `worlds-tab`, `world-launching` | First-run setup and world-launch checkpoints |
| `join-ready` | Join form with the Gamemaster selection confirmed before submission |
| `world-loaded` | Foundry canvas after joining the game session |
| `items-sidebar` | Items sidebar with 7 crafting items (`.webp` icons) |
| `actor-sheet-*` | Actor sheets for every imported dnd5e Starter Hero; the crafter + travel-party hero also carry embedded test items |
| `recipe-manager-default`, `recipe-manager-systems`, `recipe-manager-items`, `recipe-manager-recipes`, `recipe-manager-rules`, `recipe-manager-graph` | Recipe Manager checkpoints across the admin tabs |
| `recipe-manager-environments`, `gm-environments-*` | GM Environments tab and responsive validation/authoring checkpoints |
| `crafting-app-opened`, `post-craft`, `crafter-post-craft-inventory` | Crafting flow checkpoints after opening the app and completing the craft |
| `join-selection-failed`, `join-submit-failed`, `craft-failure`, `screenshot-failure.png` | Failure diagnostics captured when the harness aborts |

### Test Data

The smoke test creates the following Foundry documents:

**Actors:**

All actors are imported from the dnd5e **Starter Heroes** compendium (`dnd5e.heroes`) and
tagged `flags.fabricate.smokeSeed` for idempotent cleanup.
The two heroes' ids are recorded at seed time, and Travel seeding selects the party's crafter and travel member by those stable ids rather than by name-sort position (#816), so grant-only actors can never displace the intended party.
Grant-only actors seeded for the Access-tab grid are additionally namespaced with `flags.fabricate.smokeSeedRole = 'access-grant'` to distinguish them from the two hero fixtures; cleanup still keys solely on `smokeSeed` so both cohorts are torn down.
Sorted by name, the first two heroes are used by current flows; the rest fill the gathering actor-selection bar:

- crafter — first hero alphabetically (inventory: 3x Mystic Herb, 3x Empty Vial, 1x Dragon Scale); owned by the Fabricate Gatherer user and remembered as the default gathering actor
- travel-party member — second hero alphabetically (inventory: 3x Iron Ore, 1x Dragon Scale)

**World Items (7):**
Iron Ore, Mystic Herb, Dragon Scale, Empty Vial, Iron Sword, Healing Potion, Dragon Scale Armor

**Crafting System:** "Arcane Forge" with all 7 items registered as components

**Recipes (3):**

| Recipe | Ingredients | Result |
|---|---|---|
| Forge Iron Sword | 2x Iron Ore | 1x Iron Sword |
| Brew Healing Potion | 1x Mystic Herb + 1x Empty Vial | 1x Healing Potion |
| Craft Dragon Scale Armor | 2x Dragon Scale + 1x Iron Ore | 1x Dragon Scale Armor |

### Artifacts

| File | Description |
|---|---|
| `test-results/summary.json` | Machine-readable pass/fail with step details |
| `test-results/console.log` | Full browser console output |
| `test-results/screenshot-*.png` | Screenshots at key checkpoints |

### Foundry V13 API Patterns

The smoke test uses `page.evaluate()` to interact with Foundry APIs.
Key patterns for V13:

- **Document types are arrays, not Sets:** `game.documentTypes.Item` comes from `Object.keys(types)` in `Game#setupPackages` (V13.351), so `.includes()` works directly.
  The defensive `Array.from()` in this harness is harmless and stays; the note that called it a `Set` was wrong.
- **Tab switching:** `actor.sheet.changeTab('inventory', 'primary')` — DOM clicks on `[data-tab]` don't trigger Foundry's tab management
- **Embedded item source tracking:** Set `flags: { core: { sourceId: worldItem.uuid } }` on embedded copies so the crafting engine can match them to registered components
- **Admin store initialization:** Pre-set `lastManagedCraftingSystem` setting before opening the Recipe Manager to ensure the correct system is selected
- **Stale data cleanup:** Always delete crafting systems/recipes (via `csm.getSystems()` and `rm.getRecipesForSystem()`) before actors/items — the manager method is `getSystems()`, not `getAllSystems()`

### CI Integration

The smoke test gates releases via the `foundry-integration.yml` workflow:

- Runs on push to main, PRs to main (on `src/`, `scripts/`, `module.json` changes), weekly, and as part of `release.yml`
- Uploads `test-results/` as a build artifact on every run
- Opens a GitHub issue with `foundry-smoke-failure` label on failure

## Svelte Render Comparison

`compare-svelte-render.mjs` answers one question a source diff cannot: did a change to a
`.svelte` file change what it RENDERS?

Whitespace between elements is significant in Svelte markup and whitespace inside an attribute
list is not, so a reformat and a real markup change look alike in a diff.
This compiles every `src/**/*.svelte` on both sides and compares the compiler's output — all
generated template literals, every DOM-writing statement (`set_text`, `set_class`,
`set_attribute`, `set_style`, …), and the compiled CSS — with code whitespace and quote style
normalised away.
It reports the compiler warning count for the working tree in the same pass.

```bash
node scripts/compare-svelte-render.mjs
node scripts/compare-svelte-render.mjs --base <ref> --filter manager/tools
node scripts/compare-svelte-render.mjs --json --fail-on-drift
```

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Option | Description |
|---|---|
| `--base <ref>` | Ref to compare against. Defaults to `origin/main`. |
| `--filter <text>` | Only compare components whose path contains `<text>`. |
| `--json` | Emit the full record as JSON instead of a summary. |
| `--fail-on-drift` | Exit 1 when any render drift is found; the default reports and exits 0. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Drift is a finding, not a verdict: it means a whitespace text node appeared or disappeared in the
DOM, which no other gate in this repository can see.
Read the reported window, decide whether it matters, and pin it with a test where it does.

## Svelte Compiler Warning Sweep

`check-svelte-warnings.mjs` fails on any Svelte compiler warning, across every component under
`src/` — not just the reachable ones (issue 924).

`svelte.config.js` carries an `onwarn` hook, so `npm run build` fails on a warning too, and that is
the fast local signal.
It is not sufficient on its own: a Vite build compiles the ENTRY GRAPH, and this repository has
components nothing imports (`GatheringTravelView.svelte`, issue 927), whose warnings would never
reach it.
So this walks the tree directly with `lib/svelteComponentFiles.js` — the same walker
`compare-svelte-render.mjs` uses — and compiles each component with the build's own options, read
out of `svelte.config.js` by `lib/svelteCompilerWarnings.js`.
That shared read is what makes a disagreement between the two halves diagnostic: it can only be
graph reachability, never drift in `compilerOptions`.

A disagreement in which the sweep is the clean one is a bug in the sweep, not grounds to override
`onwarn`.

```bash
npm run lint:svelte:warnings    # what CI runs, as its own step of the lint job
node scripts/check-svelte-warnings.mjs --json
```

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Option | Description |
|---|---|
| `--root <dir>` | Source root to walk, resolved against the repository root. Defaults to `src`. Exists so `tests/svelte-warning-scope.test.js` can drive the real command against a fixture tree. |
| `--json` | Emit the findings as JSON instead of the human report. |

| Exit code | Meaning |
|---|---|
| `0` | Every component compiled with no warning. |
| `1` | At least one warning, or a component that failed to compile (reported as a synthetic `compile_error` finding rather than skipped). |
| `2` | The run could not check — bad arguments, an unreadable root, or NO COMPONENTS FOUND. Finding nothing is a failure, not a clean sweep. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The first line of the report is byte-identical in shape to the `svelte_compiler_warnings=N over M
files` line `compare-svelte-render.mjs` prints, so two runs can be diffed without reading past it.
The bar is zero: fix the code rather than suppressing the warning, or suppress it at its site with a
`<!-- svelte-ignore <code> -->` comment and a stated reason.
There is deliberately no allowlist.

## View Lab window chrome

`scripts/view-lab-screenshots.mjs` renders whole Fabricate application windows in Chromium with no
Foundry, no Docker, and no world, and writes one PNG per registry case into
`ui-screenshot-artifact/apps/`.
The chrome those windows wear is Foundry's own, harvested from the release archive
`npm run test:foundry:up` already caches.

```sh
npm run viewlab:chrome:harvest     # extract chrome + core art into the gitignored .foundry-chrome/
npm run viewlab:chrome:status      # what is cached, and whether it is intact
node scripts/view-lab-screenshots.mjs apps            # every case
node scripts/view-lab-screenshots.mjs apps <id,id>    # a subset
node scripts/view-lab-screenshots.mjs apps --clean    # wipe ui-screenshot-artifact/apps/ first
npm run viewlab:index              # regenerate the index without a capture
```

Nothing harvested is ever committed.
`tests/view-lab-chrome-license.test.js` enforces that against the whole tracked tree and never skips.
Captured PNGs are ordinary evidence and stay publishable.
The restriction is on redistributing Foundry's assets, not on frames drawn with them.

A capture accumulates rather than replacing the directory.
Each frame's manifest entry records the head sha it was drawn at, and a rerun merges into the
existing manifest instead of wiping it.
Pass `--clean` to force a full reset instead.

Every capture writes `ui-screenshot-artifact/apps/index.html` when it finishes, a self-contained
evidence index grouped by application and area with a multi-tag filter.
`npm run viewlab:index` regenerates it on its own from whatever manifest and PNGs are already on
disk, without capturing anything.
It shows the lab's own frames only.
Smoke labels are deliberately not shown, because this page is the lab's evidence, not a comparison
against the smoke.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

## What a case claims

Every entry in `scripts/lib/viewLabCases.js` declares `reaches`, which is the registry's honesty
field — an approximate case that does not say it is approximate is worse than no case at all.

| `reaches` | Meaning | `smokeLabels` |
|---|---|---|
| `exact` | The frame lands on the smoke counterpart's own condition. Directly comparable. | one or more |
| `window` | The frame reaches the right application window but not that counterpart's condition — known remaining work, accounted for by the register below. | one or more |
| `beyond` | A condition the live smoke never walks, so there is no counterpart to fall short of. | empty, always |

`beyond` exists because the smoke is not a coverage ceiling worth inheriting: it visits one crafting
system per window, so two of the three visibility modes, both routed recipe resolution modes, and
Foundry's light application theme appear in no frame it produces.
The lab carries a fixture system per canonical **recipe** resolution mode (`simple`,
`routedByIngredients`, `routedByCheck`, `progressive`, `alchemy`) precisely so those paths can be
photographed.
Salvage has its own separate mode enum and is not covered by that claim — see the register below.

A `window`-reach case does not carry its own written excuse.
Near-identical case comments would rot, so the shortfalls are recorded once per **class** in the
known-gaps register below, which is where a reviewer can actually find them.
There are 132 `exact` cases, 5 `window`, and 13 `beyond`, out of 150 total.

## Fidelity gap

A green View Lab render is trustworthy for the window, its cascade, its typography, and its content.
It is NOT the fidelity authority — the live smoke is.
Where the two disagree about the same view, the smoke is right.

| Gap | Why it exists |
|---|---|
| No canvas backdrop, sidebar, scene-control rails, or chat bar | The lab draws one application, not the Foundry desktop around it. |
| No tooltips, context menus, ProseMirror, drag-and-drop, resize, or minimize | A confirm or prompt dialog is the one exception to "no live Foundry JS". See the row below. |
| No system stylesheet | `dnd5e.css` (production: `layer(system)`) is not loaded. Low risk today — every dnd5e `.application` rule is scoped under `.dnd5e2`/`.sheet` — but re-verify on a dnd5e major. |
| No other modules | A real world loads other modules at `layer(modules)` alongside `fabricate.css`. |
| Fixture world, not the smoke world | Six crafting systems rather than ten, with different names and counts. Structure matches. Content does not. |
| Salvage resolution mode | Progressive and both Simple salvage bodies are covered on the player side (`player-salvage`, `player-salvage-no-check`). Routed salvage's working body is covered only on the manager authoring side (`manager-component-edit-salvage`). No player case reaches a working routed panel yet, and `player-salvage-misconfigured` reaches routed's misconfigured reason instead of the smoke counterpart's Simple-mode one. Recipe resolution modes are all five covered on the player side. The two enums are separate. |
| A confirm or prompt dialog is real, but two import paths still are not | `DialogV2.confirm` and `.prompt`, transcribed from the harvested `client/applications/api/dialog.mjs`, let a case leave the dialog open (`query: { dialog: 'open' }`), press its default button (`'enter'`, the lab default), or press a named button action. This is what moved the multistep-disable confirmation and the player crafting run/roll cases to `exact`. `input` and `query` are not wired. `manager-import-report` drives the real dialog end to end, uploading a file and resolving Import, but the captured frame is still the systems library. The lab's placeholder payload gives `CompendiumImporter` nothing to report on. `manager-import-folder-mapping` needs a synthetic drag-and-drop payload rather than a click, which the runner does not have. |
| States behind a Foundry-side service call | `game.fabricate` is null on purpose, so operations like `repairItemData` and `addItemFromUuid` cannot be driven. Their END states are fixture-able; the operations themselves are not. |
| Legacy set-level essence requirements | `RecipeManager.initialize()` migrates a stored `ingredientSet.essences` map into a first-class essence group, so the pre-migration shape cannot be reached from settings-seeded data at all. The smoke escapes it only because it authors that recipe through `createRecipe` after init. |
| The un-stacked narrow band at 1024px | `player-crafting-progressive-stacked` cannot reach its smoke counterpart's stacked three-column layout. The counterpart shrinks past production's own `.fabricate-app { min-width: 1024px }` floor, and the lab's geometry assertion will not let a capture violate its declared box. At 1024 the grid does not stack and its stage rows overflow. That is a real product finding the live smoke never renders at that width, published as evidence of the finding rather than claimed as the counterpart's own state. |
| Chrome is one Foundry build | Frames carry the harvested version in their manifest; a reviewer on a newer Foundry may see small differences. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->
