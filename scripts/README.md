# Fabricate Test Scripts

## Latest Module Versions

`latest-module-versions.mjs` queries the current latest manifest for Fabricate and the premium sibling modules without requiring S3 bucket listing permission.
It reads the root `release.s3.config.json` plus `../fabricate-premium/release.config.json`, then fetches exact keys in the form `modules/<moduleId>/<channel>/latest/module.json`.

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

## Tester secret rotation

`rotate-tester-secrets.mjs` rotates every tester path segment in one pass, across this repository and the premium sibling.
It reads the root `release.s3.config.json` plus `../fabricate-premium/release.config.json` to derive which repository secret each tester group's segment is written to, then writes those secrets through `gh secret set` over stdin.
A tester group is one cohort holding one URL prefix, so its segment is one value shared by every repository publishing into it, and rotating one repository alone splits that cohort across two prefixes.

```bash
node scripts/rotate-tester-secrets.mjs
node scripts/rotate-tester-secrets.mjs --apply
node scripts/rotate-tester-secrets.mjs --group closed-beta-2026 --apply
```

Useful options:

| Option | Description |
|---|---|
| `--apply` | Write the secrets; without it the run is a dry run that writes nothing. |
| `--group <name>` | Rotate one group's secret alone; refused when that secret also serves groups the flag did not name. |
| `--config <path>` | Fabricate release config path. |
| `--premium-config <path>` | Premium release config path, for when the sibling is not checked out beside this repository. |
| `--no-premium` | Inspect this repository alone; dry run only. |
| `-h`, `--help` | Print the usage summary. |

`--no-premium` is refused together with `--apply`.
Without the premium config every secret looks single-repository, which suppresses both the collapse warning and the ambiguous-narrowing refusal exactly when they matter.

`gh` is resolved to one absolute executable path before it is run, rather than left for `execFile` to search `PATH` at spawn time.
Set `GH_BIN` to an absolute path when the GitHub CLI is not on `PATH` or a non-standard install must be used; a relative `GH_BIN` is refused.

Rotation is a cohort migration, not hygiene.
It deletes nothing and republishes nothing, so a superseded prefix keeps serving its last manifest and the cohort on it stops receiving updates silently rather than failing.
Under `--apply` the script prints one feed URL per rotated group and module.
`gh` cannot read a secret back, so that report is the only record of where each cohort now lives, and every run must be paired with the announcement carrying those URLs.

The script is deliberately absent from `package.json` and from every workflow, and a test asserts that.
It mutates repository secrets in two repositories, so it stays a deliberate local act.

## Icon catalogue

`generate-icon-catalogue.mjs` regenerates `src/ui/svelte/util/foundryIconCatalogue.json` from the Font Awesome bundle a Foundry install ships.
`src/ui/svelte/util/foundryIconCatalogue.js` is a loader over that JSON and is hand-maintained.

```bash
node scripts/generate-icon-catalogue.mjs   "C:/Program Files/Foundry Virtual Tabletop/resources/app/public/fonts/fontawesome"
```

The argument is the bundled `fontawesome` directory, or the `all.min.css` inside it.
`--check` compares against the committed file without writing, which is what to run after a Foundry upgrade to find out whether the bundle moved.

The catalogue is committed rather than built because CI has no Foundry install to read.
It describes ONE Foundry release's bundle, so rerun the generator when Foundry bumps Font Awesome: names are added between releases, and Font Awesome does retire and re-alias names between majors, which can turn an icon a GM chose into an alias of another glyph.

Two things are MEASURED rather than assumed, and both used to be guessed.
Brands are the glyphs whose codepoint only Font Awesome's brands face carries, read from that face's `cmap`, which is why the exclusion list no longer holds a block of company names.
The classic solid and regular faces are compared the same way; they carry an identical set of codepoints today, which is why an entry no longer records whether a regular weight exists.
If a future bundle breaks that, the generator says so on stderr rather than emitting a header claim that has quietly stopped being true.

## Foundry Integration Smoke Test

The smoke test (`foundry-test-run.mjs`) verifies that Fabricate loads and functions correctly in a live Foundry VTT instance.
It uses Playwright to drive a headless Chromium browser through the full crafting lifecycle.

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

# The narrow boot-and-assert arm (issue 1088): boot, join, confirm Fabricate loads,
# assert a few version-sensitive API shapes, exit. Roughly a minute, not the ~32-minute walk.
npm run test:foundry:v13       # Foundry 13.351 + dnd5e 5.2.5
npm run test:foundry:v14       # the default 14.365 build, same assertions
```

The two arms share one container identity (the felddy licence binds to the hostname), so they must never run at the same time in one worktree.
See "Smoke arms" in `CONTRIBUTING.md`.

### Environment Variables

Every variable the Foundry harness reads, grouped by what it controls.
Read `docker-compose.foundry.yml` alongside this: the container-identity and credential rows are consumed there, not in JavaScript.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

#### Credentials and licensing

Loaded from `.env.foundry` when present; CI sets them directly.

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_USERNAME` | required | Foundry account username. `test:foundry:up` exits 1 without it. |
| `FOUNDRY_PASSWORD` | required | Foundry account password. |
| `FOUNDRY_LICENSE_KEY` | empty | Optional license key forwarded to the container. Credential-only activation can intermittently leave the instance unlicensed (it then boots to the License Key Activation page and the harness fails before the EULA step), so CI forwards the key for a deterministic activation. |
| `FOUNDRY_ADMIN_KEY` | `fabricate-test-admin` | Admin password for the setup/auth page. Set in the compose file; the harness reads the same value to fill the form. |

#### Which Foundry boots

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_SMOKE_ARM` | `v14` | Which Foundry generation the harness boots — `v14` or `v13` (issue 1088). Resolved by `scripts/lib/foundrySmokeArms.js` into an image, a dnd5e release and the world manifest's `coreVersion`. `--arm=<id>` on `foundry-test.mjs` sets it. |
| `FOUNDRY_IMAGE` | the selected arm's image (`v14` reads the pin in `docker-compose.foundry.yml`) | Docker image used by the compose harness. The default arm's pin lives in the compose file and is read rather than restated — the CI archive cache key hashes that file, and the View Lab harvests whatever archive this image downloads. **A non-default arm reaches Docker through this variable only; do not edit the compose pin to switch generation.** |
| `FOUNDRY_VERSION` | derived | Overrides the Foundry build used to name the cached release archive. Normally derived from the image's `com.foundryvtt.version` label, falling back to the arm's image tag. |
| `FOUNDRY_RELEASE_URL` | unset | Optional explicit Foundry release URL. When unset, `test:foundry:up` points the container at a matching local cached zip if one exists (an offline install). |
| `FOUNDRY_RECREATE` | unset | Set to `1` before `npm run test:foundry:up` to discard and recreate the cached container. Not needed for an arm switch — `up` recreates automatically when the cached container's image differs from `FOUNDRY_IMAGE`. |

#### Container identity and endpoint

Derived per worktree by `scripts/lib/foundryRunIdentity.js`; override only to pin a run.

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_URL` | `http://localhost:<derived port>` | Base URL Playwright targets. Reconciled with `FOUNDRY_HOST_PORT` so the two can never name different ports. |
| `FOUNDRY_HOST_PORT` | derived, in `[30100, 30500)` | Host port the container binds. The base is 30100 (not 30000) so the smoke can coexist with a developer's local Foundry; `foundry-test.mjs` scans upward for a free port when neither this nor `FOUNDRY_URL` is pinned. |
| `FOUNDRY_CONTAINER_NAME` | `fabricate-foundry-<hash>` | Container name, hashed from the worktree root so worktrees do not collide. |
| `FOUNDRY_CONTAINER_HOSTNAME` | `fabricate-<hash>` | Container hostname. **The felddy licence binds to this**, so a new value consumes a Foundry activation; it is stable per worktree, and shared by every arm, for exactly that reason. |
| `COMPOSE_PROJECT_NAME` | `fabricate-foundry-<hash>` | Compose project, so `down` tears down this worktree's container and never a sibling's. |
| `FOUNDRY_HOST_UID` / `FOUNDRY_HOST_GID` | `1000` on Windows, else `id -u`/`id -g` | User the container runs as, so bind-mounted volumes are writable. |

#### What runs, and for how long

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_SMOKE_PROFILE` | `full` | Walk profile for the full smoke — `full`, `rc`, `ci` or `screenshots`. `--profile=<id>` sets it. Ignored by the narrow version arm. |
| `FOUNDRY_RUN_TIMEOUT_MS` | profile-derived | Wall-clock budget for the run phase, so a CI job timeout can never preempt teardown and artifact upload. **A check that declares its own budget wins over this** — `--check=version` is always 360000. That reverses the usual precedence on purpose: this variable's documented use is to *enlarge* the long walk's budget (`FOUNDRY_RUN_TIMEOUT_MS=1500000`), so in a shell where it is exported the one-minute version arm would otherwise silently inherit 25 minutes and a hang would stop looking like a hang. Every run prints the budget it chose and where it came from. |
| `FOUNDRY_SKIP_BUILD` | unset | Set to `1` to skip the `npm run build` step `foundry-test.mjs` performs before `up`. CI builds in its own cached step. A stale `dist/` silently tests old code, so only skip when you have just built. |
| `FOUNDRY_SMOKE_THEMES` | unset | Set to `1` (or pass `--themes`) to regenerate the two 7-theme screenshot sweeps, which are off by default because the 14 frames are unasserted and unmapped. |
| `FOUNDRY_SCREENSHOT_TARGET_LABELS` | empty | CSV of smoke screenshot labels to scope the `screenshots` profile to (issue 826). `--target-labels=<csv>` sets it; empty captures the full catalogue. |
| `FOUNDRY_SCREENSHOT_HEAD_SHA` | `git HEAD` | Exact-head override stamped into screenshot evidence. |
| `FOUNDRY_ALLOWED_CONSOLE_ERROR_PATTERNS` | empty | CSV of extra console/`pageerror` waiver patterns, **appended** to the in-source defaults (never replacing them). `--allowed-console-error-patterns <csv>` does the same. Reach for it last: the canvas-priority default that lived in-source for a year was suppressing a real harness defect (issue 1010). |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

`GITHUB_SHA` and `GITHUB_STEP_SUMMARY` are read when present but are set by GitHub Actions, not by a developer.

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
The stable part of each filename is the trailing label, not the numeric prefix.

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

All actors are imported from the dnd5e **Starter Heroes** compendium (`dnd5e.heroes`) and tagged `flags.fabricate.smokeSeed` for idempotent cleanup.
The two heroes' ids are recorded at seed time, and Travel seeding selects the party's crafter and travel member by those stable ids rather than by name-sort position (#816), so grant-only actors can never displace the intended party.
Grant-only actors seeded for the Access-tab grid are additionally namespaced with `flags.fabricate.smokeSeedRole = 'access-grant'` to distinguish them from the two hero fixtures; cleanup still keys solely on `smokeSeed` so both cohorts are torn down.
Sorted by name, the first two heroes are used by current flows; the rest fill the gathering actor-selection bar:

- crafter — first hero alphabetically (inventory: 3x Mystic Herb, 3x Empty Vial, 1x Dragon Scale); owned by the Fabricate Gatherer user and remembered as the default gathering actor
- travel-party member — second hero alphabetically (inventory: 3x Iron Ore, 1x Dragon Scale)

**World Items (7):** Iron Ore, Mystic Herb, Dragon Scale, Empty Vial, Iron Sword, Healing Potion, Dragon Scale Armor

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

### Foundry API Patterns

The smoke test uses `page.evaluate()` to interact with Foundry APIs.
Key patterns, verified against V13.351 and still current on the pinned V14.365:

- **Document types are arrays, not Sets:** `game.documentTypes.Item` comes from `Object.keys(types)` in `Game#setupPackages`, so `.includes()` works directly.
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

## Foundry performance profile

`npm run test:foundry:perf` measures Fabricate at scale **inside a real Foundry** (issue 1073, part of the performance programme in issue 1070).

It is the `perf` arm of the harness above, not a second harness: the same `docker-compose.foundry.yml`, the same per-worktree container identity, the same `up` → `run` → `down` lifecycle, the same disposable world.
Only the thing that runs against the booted container is different — `foundry-perf-run.mjs` instead of `foundry-test-run.mjs`.

```bash
npm run test:foundry:perf                          # seed, measure, record
npm run test:foundry:perf -- --arm=v13             # the same profile on Foundry 13
node scripts/foundry-perf-run.mjs --preflight      # preconditions only; starts nothing
node scripts/foundry-perf-run.mjs                  # against an already-running container
```

### It is opt-in, and it must stay that way

The profile appears in **no** GitHub Actions workflow and in no required check.
It needs licensed Foundry credentials and local Docker, and `docker-compose.foundry.yml` documents credential activation as intermittently flaky.
`tests/foundry-perf-profile.test.js` asserts that no workflow invokes it, so wiring it into CI fails `npm test` rather than surfacing as a red required check on somebody else's pull request.

The run also **refuses rather than fetches**.
A missing Docker CLI, missing credentials, a Foundry image that is not already in the local image store, or a checkout without issue 1071's fixtures each exits 2 with the command that fixes it — before the build, before `up`, and without pulling anything.
An image pull is hundreds of megabytes and a container boot activates a licence against the container hostname; neither should be a side effect of asking for a measurement.

### The two measurement classes

Inherited from issue 1071's headless harness and not re-invented.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| | Class 1 | Class 2 |
|---|---|---|
| What | Corpus counts, rendered row counts, serialized payload bytes, hook-delivery counts, seed fidelity | Wall clock, heap, long-task durations |
| Where | Inside the run record, for forensics | Inside the run record, `.foundry-perf/runs/` — **gitignored** |
| Asserted | **No.** Nothing this profile produces is a CI assertion | **Never** |
| Portable | Only within one Foundry build, game system and fixture | Meaningless off the machine that produced it |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Note the difference from issue 1071: there, class 1 is committed to `benchmarks/baselines/` and asserted by a drift test.
Here it is not, and cannot be.
A count taken inside a live Foundry is invariant only *given the Foundry build and the game system*, because those decide document schemas, what a `create` call preserves and which hooks fire.
The committed, cross-machine baseline is the headless one; this profile is the instrument that tells you whether the headless model still resembles reality.

**Report ratios, never absolute milliseconds.**
`scripts/lib/foundryPerfRecord.js` refuses to compare two runs whose Node version, CPU model, architecture, arm, Foundry build, image, game system, browser build, fixture profile or fixture seed differ, naming every field that does.

### What it measures

Every measurement is declared in `scripts/lib/foundryPerfMeasurements.js` with its class and its status, and the run record reconciles the walk's output against that registry — so a measurement that produced nothing is reported by name rather than being indistinguishable from one that measured zero.

Startup attribution is not a stopwatch around the `ready` hook.
`src/utils/startupMarks.js` opens explicit `performance.mark` boundaries around `Fabricate.initialize()` and around three spans nested inside it — migrations, corpus load, and startup maintenance — so the profile reports what Fabricate cost rather than what the whole boot cost.
The remainder (`initialize` minus its three children) is reported too: it is collaborator construction and hook registration, and a remainder that grows is a finding a single total would hide.

Two declared measurements are **deferred**, each carrying what blocks it:

- `propagation-unhydrated` — issue 1073 asks for both a hydrated and an un-hydrated receiver.
  That distinction belongs to the Documents backend issue 1088 probed; on the shipped **settings** backend every world setting replicates in full to every client at connect (issue 1088 Q4), so there is no un-hydrated receiver to time and a number reported here would be the hydrated one under a second name.
  Issue 1092 fills this slot.
- `persistence-experiments` — issue 1079's prototypes do not exist yet.
  The settings arm is measured by `definition-edit`, which is the control any later prototype is compared against.

### Seeding

The corpus is written as **three writes, whatever its size**: one `fabricate.craftingSystems` setting, one `fabricate.recipes` setting, and one batched `Actor.createDocuments` carrying every seeded actor with its held items nested.
Seeding through `createRecipe()` would be one whole-corpus save per recipe — quadratic, hours long, and a measurement of the defect rather than a setup for measuring it.

The fixtures are issue 1071's, imported rather than re-generated, so the Foundry and headless layers measure the same corpus.
`FOUNDRY_PERF_FIXTURE` selects one (`simple-corpus`, `held-inventory`, …).

Measured against those fixtures, the three writes hold at every scale:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Fixture | Recipes | Components | Actors | `craftingSystems` bytes | `recipes` bytes | Writes |
|---|---|---|---|---|---|---|
| `simple-corpus` | 10,000 | 5,000 | 2 | 1,973,024 | 7,177,534 | 2 settings + 1 actor create |
| `held-inventory` (point 0) | 6 | 5,000 | 3 | 1,973,024 | 4,183 | 2 settings + 1 actor create |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The held-inventory axis is a series, and `FOUNDRY_PERF_INVENTORY` picks the point.**
`held-inventory` varies 100 / 500 / 1,000 held stacks against the same 5,000-component library, and a bare `fixture.inventory` is only its *first* point.
Seeding that unconditionally would run the whole profile at 100 stacks while reporting it under the axis's name — the cheapest point of the axis, named after the axis.
The chosen point and the series length are recorded on every run.

The chosen inventory point's composition is recomputed from the translated payloads rather than copied from the fixture's own declaration, so a translation bug that dropped every flag shows up as a mix that disagrees with the fixture instead of being masked by the fixture restating what it intended.

The seeded world is then **reloaded** before anything is timed, so the startup measurement is taken against the seeded corpus rather than the empty world the container booted into.

One thing the seeder cannot assume: `_stats.compendiumSource` is core-managed, so Foundry may ignore a value supplied to `create`.
If it does, every source-reference stack silently becomes an unmatched one and the run reports an inventory composition it does not have.
The run therefore takes a census against the **created documents** and prints the drift.

### Capturing a Chrome trace

```bash
FOUNDRY_PERF_TRACE=1 npm run test:foundry:perf
```

The run opens a CDP `Tracing` session over the GM page for the whole walk and writes the raw Chrome DevTools trace to `.foundry-perf/traces/`.
Load it with **chrome://tracing**, or via the Performance panel's *Load profile* button in any Chromium DevTools.
A trace failure never fails the run: a diagnostic aid is not worth losing a walk that costs a container boot to reproduce.

Long tasks are captured separately and always, through a `PerformanceObserver` installed by `addInitScript` **before any page script runs** — an observer added after `game.ready` would miss the boot, which is the densest stretch of the run.
Each task is attributed to the scenario open at the time; one landing between scenarios is reported as `unattributed` rather than charged to whichever ran next.

### Comparing two commits

```bash
git switch <baseline-commit>
npm run test:foundry:perf                 # writes .foundry-perf/runs/<stamp>-<sha>-<arm>-<fixture>.json
git switch <candidate-commit>
npm run test:foundry:perf
```

Then compare the two records with `assertFoundryComparable` / `compareTimings` / `compareInvariants` from `scripts/lib/foundryPerfRecord.js`.
Run both on **one machine, one arm and one fixture**, back to back, and quote the ratio.
A ratio is the only form that survives being pasted into an issue by someone who did not run it.

`compareInvariants` is the half worth reading first.
A moved class-1 value — `recipesBytes`, a row count, a hook-delivery count — is a fact about the code and is reported as a finding.
A moved duration may only be a fact about the machine.

### Environment

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Variable | Default | Meaning |
|---|---|---|
| `FOUNDRY_PERF_FIXTURE` | `simple-corpus` | Which issue-1071 scale profile to seed. |
| `FOUNDRY_PERF_SEED` | issue 1071's default | Fixture seed; the fixture is reproducible from `{profile, seed}` alone. |
| `FOUNDRY_PERF_INVENTORY` | `0` | Which point of a held-inventory series to seed (100 / 500 / 1,000 stacks). Ignored by corpus-axis fixtures, which have no series. |
| `FOUNDRY_PERF_IMPORT_LIMIT` | `200` | Recipes the import scenario imports. Bounded because import is quadratic today (issue 1086). |
| `FOUNDRY_PERF_TRACE` | unset | `1` exports a Chrome DevTools trace. |
| `FOUNDRY_PERF_SECOND_CLIENT` | unset | `0` skips the cross-client propagation scenario. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The arm is selected the same way as everywhere else — `--arm=v13` reaches compose through `FOUNDRY_IMAGE` and never edits `docker-compose.foundry.yml`.

### Baseline runs are a maintainer step

An agent can write the profile, the seeding, the capture and this documentation.
The baseline run itself needs licensed credentials and local Docker and must be performed and attested by a maintainer.

## Svelte Render Comparison

`compare-svelte-render.mjs` answers one question a source diff cannot: did a change to a `.svelte` file change what it RENDERS?

Whitespace between elements is significant in Svelte markup and whitespace inside an attribute list is not, so a reformat and a real markup change look alike in a diff.
This compiles every `src/**/*.svelte` on both sides and compares the compiler's output — all generated template literals, every DOM-writing statement (`set_text`, `set_class`, `set_attribute`, `set_style`, …), and the compiled CSS — with code whitespace and quote style normalised away.
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

Drift is a finding, not a verdict: it means a whitespace text node appeared or disappeared in the DOM, which no other gate in this repository can see.
Read the reported window, decide whether it matters, and pin it with a test where it does.

## Svelte Compiler Warning Sweep

`check-svelte-warnings.mjs` fails on any Svelte compiler warning, across every component under `src/` — not just the reachable ones (issue 924).

`svelte.config.js` carries an `onwarn` hook, so `npm run build` fails on a warning too, and that is the fast local signal.
It is not sufficient on its own: a Vite build compiles the ENTRY GRAPH, and this repository has components nothing imports (`RowDisclosure.svelte`; the sweep was motivated by issue 927), whose warnings would never reach it.
So this walks the tree directly with `lib/svelteComponentFiles.js` — the same walker `compare-svelte-render.mjs` uses — and compiles each component with the build's own options, read out of `svelte.config.js` by `lib/svelteCompilerWarnings.js`.
That shared read is what makes a disagreement between the two halves diagnostic: it can only be graph reachability, never drift in `compilerOptions`.

A disagreement in which the sweep is the clean one is a bug in the sweep, not grounds to override `onwarn`.

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

The first line of the report is byte-identical in shape to the `svelte_compiler_warnings=N over M files` line `compare-svelte-render.mjs` prints, so two runs can be diffed without reading past it.
The bar is zero: fix the code rather than suppressing the warning, or suppress it at its site with a
`<!-- svelte-ignore <code> -->` comment and a stated reason.
There is deliberately no allowlist.

## View Lab window chrome

`scripts/view-lab-screenshots.mjs` renders whole Fabricate application windows in Chromium with no Foundry, no Docker, and no world, and writes one PNG per registry case into `ui-screenshot-artifact/apps/`.
The chrome those windows wear is Foundry's own, harvested from the release archive `npm run test:foundry:up` already caches.

```sh
npm run viewlab:chrome:harvest     # extract chrome + core art into the gitignored .foundry-chrome/
npm run viewlab:chrome:status      # what is cached, and whether it is intact
node scripts/view-lab-screenshots.mjs apps            # every case
node scripts/view-lab-screenshots.mjs apps <id,id>    # a subset
node scripts/view-lab-screenshots.mjs apps --clean    # wipe ui-screenshot-artifact/apps/ first
npm run viewlab:index              # regenerate the index without a capture
npm run viewlab:totals             # regenerate the registry totals region in this file
```

### Where the chrome comes from, and which source may attest

Two sources, only one of them authoritative.

```sh
npm run viewlab:chrome:harvest                       # the release archive (default)
npm run viewlab:chrome:harvest -- --from-dir "C:\Program Files\Foundry Virtual Tabletop"
```

The archive is what CI harvests, so it is the only source `--write-provenance` accepts.
`--from-dir` reads an unpacked desktop installation instead, which needs neither Docker nor credentials and renders identical frames.
It may not record provenance, because the two hold the same Foundry as different bytes: the Windows installer ships `client/applications/api/application.mjs` with CRLF line endings where the release archive uses LF, so their digests differ.
A record written from an installation would pin digests CI could never reproduce, and the frame-builder drift gate would fail on every later pull request.
The harvest refuses rather than letting that happen.

### Keeping the smoke and the lab on one Foundry

The lab has no Foundry of its own.
It harvests whatever archive the smoke's container downloaded, which is the right coupling: the live smoke is the fidelity authority, and drawing from the same build is what makes a lab frame and a smoke frame comparable.
`docker-compose.foundry.yml` pins an exact build, `scripts/foundry-test-up.mjs` reads that pin rather than restating it, and `tests/view-lab-chrome-version-lock.test.js` fails when the committed provenance names a different build from the pinned image.
Bumping Foundry therefore means bumping the pin, the smoke world fixture, and the provenance record together.
Re-recording provenance is deliberately a human act: someone re-reads `client/applications/api/application.mjs` and confirms `scripts/lib/foundryChromeSpec.js` still transcribes it.
`tests/view-lab-chrome-drift.test.js` names anything that moved.

Nothing harvested is ever committed.
`tests/view-lab-chrome-license.test.js` enforces that against the whole tracked tree and never skips.
Captured PNGs are ordinary evidence and stay publishable.
The restriction is on redistributing Foundry's assets, not on frames drawn with them.

A capture accumulates rather than replacing the directory.
Each frame's manifest entry records the head sha it was drawn at, and a rerun merges into the existing manifest instead of wiping it.
Pass `--clean` to force a full reset instead.

Every capture writes `ui-screenshot-artifact/apps/index.html` when it finishes, a self-contained evidence index grouped by application and area with a multi-tag filter.
`npm run viewlab:index` regenerates it on its own from whatever manifest and PNGs are already on disk, without capturing anything.
It shows the lab's own frames only.
Smoke labels are deliberately not shown, because this page is the lab's evidence, not a comparison against the smoke.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

## What a case claims

Every entry in `scripts/lib/view-lab-cases/` declares `reaches`, which is the registry's honesty field — an approximate case that does not say it is approximate is worse than no case at all.

| `reaches` | Meaning | `smokeLabels` |
|---|---|---|
| `exact` | The frame lands on the smoke counterpart's own condition. Directly comparable. | one or more |
| `window` | The frame reaches the right application window but not that counterpart's condition — known remaining work, accounted for by the register below. | one or more |
| `beyond` | A condition the live smoke never walks, so there is no counterpart to fall short of. | empty, always |

`beyond` exists because the smoke is not a coverage ceiling worth inheriting: it visits one crafting system per window, so two of the three visibility modes, both routed recipe resolution modes, and Foundry's light application theme appear in no frame it produces.
The lab carries a fixture system per canonical **recipe** resolution mode (`simple`, `routedByIngredients`, `routedByCheck`, `progressive`, `alchemy`) precisely so those paths can be photographed.
Salvage has its own separate mode enum and is not covered by that claim — see the register below.

A `window`-reach case does not carry its own written excuse.
Near-identical case comments would rot, so the shortfalls are recorded once per **class** in the known-gaps register below, which is where a reviewer can actually find them.

<!-- viewlab-totals:start -->
The registry holds 511 publishable cases: 148 `exact`, 8 `window`, and 355 `beyond`.
Surface coverage — one frame of every route and tab the lab renders — is 48 of them.
These counts are generated by `npm run viewlab:totals`; change a case file, not this region.
<!-- viewlab-totals:end -->

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
| A confirm or prompt dialog is real; one import path still is not | `DialogV2.confirm` and `.prompt`, transcribed from the harvested `client/applications/api/dialog.mjs`, let a case leave the dialog open (`query: { dialog: 'open' }`), press its default button (`'enter'`, the lab default), or press a named button action. This is what moved the multistep-disable confirmation, the player crafting run/roll cases, and `manager-import-report` — which uploads a real export envelope and drives the import end to end — to `exact`. `input` and `query` are not wired. `manager-import-folder-mapping` remains out of reach: its modal opens only from a drag-and-drop carrying a folder or compendium-pack payload, and the runner has no `drop` verb. |
| Operations needing real Foundry documents | `game.fabricate` is the REAL runtime facade (`labWorld.js` installs it after `initialize()`), so service calls through it do run — that is how the import case reaches its report. What is not drivable is anything needing document or compendium behaviour past what the shim models: `Item` supports creation and uuid resolution, not the full document API. Those END states are fixture-able; the operations are not. |
| Legacy set-level essence requirements | `RecipeManager.initialize()` migrates a stored `ingredientSet.essences` map into a first-class essence group, so the pre-migration shape cannot be reached from settings-seeded data at all. The smoke escapes it only because it authors that recipe through `createRecipe` after init. |
| Chrome is one Foundry build | Frames carry the harvested version in their manifest; a reviewer on a newer Foundry may see small differences. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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
- `npm run test:foundry:screenshots` — scoped PR screenshot evidence (issue 826): full real-Foundry frames for only the views a PR affects (pass `-- --target-labels=<csv>` from `npm run screenshots:ui:targets` to scope it; empty captures the full catalogue).
- `npm run test:foundry:v13` — the narrow **V13 boot-and-assert arm** (issue 1088), about a minute on a warm container; see "The narrow V13 arm" below.
- `npm run test:foundry:v14` — the same narrow arm against the default (14.365) build.

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
The main harness is `scripts/foundry-test-run.mjs` (~230 lines).
It boots the browser, builds the run context, drives the scenario registry and runs the cleanup from its `finally`; the walk itself lives in `scripts/foundry-smoke/`, where `registry.mjs` lists the scenarios in walk order, `runScenarios.mjs` drives them, `scenarios/` holds one module per walk section, `pageOps/` holds the page primitives they share, and `profile.mjs`, `context.mjs` and `cleanup.mjs` hold the run-scoped state.

### Smoke arms: which Foundry generation boots

`module.json` declares `minimum: "13"` and `verified: "14"`, and the harness can boot either.
Which one is an **arm**, selected with `--arm=<v14|v13>` (or the `FOUNDRY_SMOKE_ARM` environment variable) and defined once in `scripts/lib/foundrySmokeArms.js`.
An arm bundles the three things that must agree: the Docker image, the dnd5e release, and the world manifest's `coreVersion`.

| Arm | Foundry | dnd5e | Selected by |
|-----|---------|-------|-------------|
| `v14` (default) | the pin in `docker-compose.foundry.yml` (14.365) | 5.3.3 (`verified: "14"`) | nothing — it is the default |
| `v13` | 13.351 | 5.2.5 (`verified: "13"`) | `--arm=v13` / `FOUNDRY_SMOKE_ARM=v13` |

Three properties of that design are load-bearing, and `tests/foundry-smoke-arms.test.js` pins each of them.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **The non-default arm is env-only.** It reaches Docker through `FOUNDRY_IMAGE`, and nothing writes it into `docker-compose.foundry.yml`. Editing that pin to boot 13 would red `tests/view-lab-chrome-version-lock.test.js` (which holds the View Lab's harvested window chrome to the build the smoke boots), rotate the CI `foundry-binary-*` cache key, and leave the lab attesting a build nothing runs.
- **There is one committed world fixture.** `.foundry-e2e/worlds/fabricate-smoke-ci/world.json` targets the default arm; `scripts/foundry-setup-data.mjs` stamps `coreVersion`, `systemVersion` and `compatibility` onto the *runtime copy* for whichever arm is booting. A second committed fixture would drift, and the drift presents as a world-launch timeout that names nothing.
- **Every arm shares one container identity.** The felddy licence binds to the container **hostname**, so a per-arm hostname would burn a second Foundry activation per worktree. Both arms therefore use the same container name, hostname, host port and data directory — which means **two arms can never run at the same time in one worktree**. Switching arms recreates the container (the felddy image extracts Foundry into the container filesystem, so a reused container would keep booting the previous generation); `foundry-test-up.mjs` detects the image mismatch and does this for you.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Downloaded game systems are kept per version under the gitignored `.foundry-e2e/systems-cache/`, so switching arms is a local copy rather than a repeat ~50 MB download.

An arm switch installs a different dnd5e release, so Foundry migrates package data on the world's first launch afterwards.
That is a one-off that can run past the compose healthcheck's grace period, and Docker then reports the container `unhealthy` — a state it clears again on the very next passing probe.
`foundry-test-up.mjs` therefore treats `unhealthy` as "not answering yet" and waits for its own deadline rather than aborting, which is what it used to do; a run that hits this says so and carries on.

### The narrow V13 arm (`npm run test:foundry:v13`)

`scripts/foundry-version-assert.mjs` boots the arm's Foundry, launches the smoke world, joins as Gamemaster, confirms Fabricate loads, asserts a handful of version-sensitive API shapes, and exits.
It is deliberately **not** the ~32-minute walk: it answers "is Fabricate broken on V13?" in about a minute, which is the question that otherwise goes unanswered between releases because V13 is unexercised everywhere else.

It writes `test-results/version-arm-<arm>.json` (`{ arm, expectedFoundryVersion, image, passed, failure, assertions[], pageErrors[], consoleErrors[] }`) and `test-results/version-arm-<arm>-console.log`.
A run fails on any failing assertion, any `pageerror`, or any non-waived console error; the waiver list is one entry (`/favicon/i`) on purpose.

The assertions, and why each is there, are documented at the top of that script.
In summary: `core-build` (the container really is running the arm's Foundry — without it a mis-set image tests 14 twice and reports a V13 pass), `fabricate-ready`, `compendium-directory`, `compendium-context` (the modern `{label, icon, visible, onClick}` entry shape, exercised against a really-rendered Item pack row **and** a non-Item control row), `settings-round-trip`, `region-subtype`, `region-sheet`, `scene-control`, `app-renders`.

Two properties of that list are deliberate and worth preserving.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

- **Every entry is a check some build could fail.** An observation no verdict rests on goes in the summary's `reportedOnly` instead — which is where the `CompendiumCollection` namespace probe lives, because both supported builds expose the namespaced path *and* the bare global, so any assertion over it would pass by construction. A check that cannot fail is worse than no check: it buys confidence it has not earned and inflates the pass count a reader uses to judge coverage.
- **`compendium-directory` is a named precondition, not padding.** `compendium-context` exercises Fabricate's `visible()` against a really-rendered sidebar row, so it needs one row of each kind to exist; the arm waits for them explicitly and reports the wait under its own name. Without that, a slow or unrendered Compendium Directory reported `compendium-context: FAIL` — that is, "Fabricate is broken on V13" — and the arm's whole value is that a red result is believable.

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The `compendium-directory` wait was verified by mutating its predicate to demand an impossible document type: the run went red on `compendium-directory` with a message naming the sidebar, and `compendium-context` reported `blockedBy: compendium-directory` rather than sending anyone to debug `visible()`.

The arm never touches the canvas and adds no console-error waiver keyed on a render-flag queue name.
`Canvas##activateTicker` builds `pendingRenderFlags` with two queues on 13.351 and three on 14.365, so a placeable created before the first scene draw throws `reading 'OBJECTS'` on V13 and `reading 'INTERFACE'` on V14 — the same defect under two names.
Issue 1010 retired that waiver from the full smoke after it hid a real defect for a year; anything needing a drawn canvas belongs in the full walk, which waits properly via `scripts/lib/foundryCanvasReadiness.js`.

The setup → license → auth → launch → join path is shared with the full smoke through `scripts/lib/foundryBrowserBoot.js`, so both harnesses log in the same way and the join-control select-vs-tile fallback exists once.
That module takes a Playwright `page` but never imports Playwright, and reporting (step records, screenshots, progress output) is injected by the caller.

### Phases

The run walks several phases in order; if an earlier phase fails, later phases are skipped:

- **boot-and-join** — health-poll the container, log in as Gamemaster.
- **Phase B** — create test actors and items, screenshot sheets.
- **Phase C** — create a crafting system + sample recipes.
- **Phase D0** — open the Crafting System Manager, exercise its surfaces, screenshot (the `screenshot-manager` step).
  **This is where most drift shows up** when manager markup changes.
  After the default-selection capture it can also re-theme the real manager via the `data-fabricate-theme` attribute (exactly as the theme setting's `applyFabricateTheme` onChange does) and capture `manager-theme-<themeId>` for every Fabricate theme, then restore the default.
  These are real, Foundry-rendered themed captures — theme fidelity is not validated via hand-authored mocks.
  The theme sweep (and the matching player-alchemy `player-alchemy-theme-<themeId>` sweep in Phase E) is OFF by default because those 14 frames are unasserted and are not mapped to any PR view; set `FOUNDRY_SMOKE_THEMES=1` (or pass `--themes` to `node scripts/foundry-test-run.mjs`) to regenerate them when auditing theme fidelity.
- **Phase E** — API-driven crafting flow, then open the unified Fabricate shell (`#fabricate-app`) from the Craft Item and Gathering sidebar buttons and assert the four-tab left nav (`fabricate-app-shell` screenshot).
  The shared actor-selection top bar mounts with the shell; the phase waits for it to flip `[data-actor-bar-state]` from `loading` to `ready` before capturing.
  The full profile also walks staged player gathering screenshots: environment list, event inspection, ready attempt detail, post-attempt refresh, missing-tool block, timed-run ready and active states, blind gathering, realm-locked listing, and stacked narrow-window layout.
- **Phase F** — cleanup.

The former standalone player-facing Crafting and Gathering app phases (D2/D3/E2) and standalone Recipe Editor were removed when those surfaces were retired; both sidebar buttons now open the unified Fabricate window.

The `full` profile also captures seven demonstration frames whose purpose is to show an in-flight PR's fix once it rebases, not to satisfy the screenshot gate (issue 752).
Each is full-profile only, leaves the world as it found it, and rides an existing manager or player session.

- `manager-experimental-off` — the selected-system rail with `fabricate.experimentalFeatures` disabled (the world-scoped flag is restored afterward).
- `manager-checks-crafting-consumption` — the Checks → Crafting tab scrolled to the failure-consumption controls.
- `manager-alchemy-settings` — the Crafting → Settings surface of the minimal "Smoke Alchemy Bench" alchemy-mode system seeded in Phase C.
- `fabricate-journal-craft-detail` — the Journal with a crafting history run selected so the run-detail requirements card is visible.
- `player-crafting-roll-result` — the crafting run summary's roll-result box (awarded pills and outcome) after a UI craft.
- `chat-craft-card` — the chat sidebar clipped to the crafting result card posted by the Phase E craft.
- `manager-tags-categories-tags-tab` — the Tags & Categories screen's Item tags rows (the three seeded tags).
  The id predates issue 1915's retirement of the tabs and is kept for golden and evidence-map stability; there is no tab to open, the band is addressed by `[data-vocabulary-panel="componentTags"]`, and its direction toggle is clicked first so the frame shows the vocabulary sorted descending, as the View Lab case of the same id does.

### Test artifacts

After any run (success or failure), results are written to `test-results/`:

| File | Description |
|------|-------------|
| `summary.json` | Machine-readable `{ passed, steps[], errors[], consoleErrors[], stepFailures, consoleErrorCount, degraded, rendererCrashed, phaseTimings[], viewTimings[] }` — pass/fail result, the split `stepFailures`/`consoleErrorCount` signals, the `degraded`/`rendererCrashed` flags, smoke profile, timings, and list of errors |
| `console.log` | Full browser console output captured during the test |
| `screenshot-*.png` | Per-step screenshots captured by the selected profile |
| `screenshot-failure.png` | Captured only when a step throws (last DOM state) |

When debugging a smoke failure, read `summary.json` first: the failing step's `error` field plus the surrounding successful steps usually point straight at the broken selector.

At the end of every run the harness prints a phase-timings table followed by a "Slowest views" table.
The per-view timings record the wall-clock spent reaching each captured frame (elapsed time between the previous captured frame, or the current phase start, and this frame) and are also persisted to `summary.json` as `viewTimings[]`.
Use the slowest-views list to target future harness speedups at the views that actually cost time.

### What the smoke test checks

Every profile boots a real Foundry instance, joins the `fabricate-smoke-ci` world, and verifies the load-bearing crafting and gathering paths:

1. Navigates to the Foundry setup page and authenticates as admin.
2. Launches the `fabricate-smoke-ci` world (auto-wiped from the fixture under `.foundry-e2e/worlds/fabricate-smoke-ci/` on every `test:foundry:up`).
3. Waits for `game.ready` and `game.fabricate.ready`.
4. Verifies the Fabricate module is active (`game.modules.get('fabricate')?.active === true`).
5. Opens the unified Fabricate shell from the sidebar actions, verifies the shared navigation/actor bar, and completes one successful **Gather Meadow Herbs** task on Alara the Alchemist.
6. Crafts one **Healing Potion** through the runtime API, verifying it lands in Alara's inventory.
7. Executes and asserts craft coverage across every resolution mode through the runtime API: a `simple` craft, a `routedByCheck` craft on a recipe with two result groups on different outcome tiers (the selected tier's item is produced and the sibling's is not), a `routedByIngredients` craft across two ingredient sets mapped to different groups (the chosen set's item is produced and the other's is not), and a `progressive` craft completed in a single deterministic advance.
8. Executes and asserts a `breakageChance` and a `limitedUses` tool breakage (the backing tool item ends flagged broken with the localized " (broken)" name suffix), one salvage run (the result components land in inventory), a negative tool-gating craft (returns `success: false` when the required tool is absent), and one guaranteed-success gather (the actor's inventory increases).
9. Fails if any non-ignored browser console errors were captured during the session.

The `full` profile additionally captures Crafting System Manager v2 screenshots, exercises the blocked / failure / timed gathering states, the non-GM redaction path, the no-selectable-actors state, asserts the seeded 0%-drop and scene-blocked gathers plus the hazardous "Bramble Snare" event firing, and runs document cleanup.

### Smoke profiles (`rc`, `full`, `screenshots`)

A single orchestrator (`scripts/foundry-test.mjs`) and run script (`scripts/foundry-test-run.mjs`) handle every profile.
The profile is selected by `FOUNDRY_SMOKE_PROFILE` (or `--profile=<value>` on `node scripts/foundry-test.mjs`).

| Profile | When | Phases | Target |
|---------|------|--------|--------|
| `rc` | Release-candidate CI | Phase B → C → E (unified shell, one Gathering success, Healing Potion craft) → console-error check | < 25 min including cold setup |
| `ci` | Deprecated alias for `rc` (removed after one release) | same as `rc` | same |
| `full` (default) | Local and visual-regression runs | + Phase D0 (manager screenshots), extended Gathering states, non-GM redaction, no-selectable actors, Phase F (cleanup) | ~10–15 min locally |
| `screenshots` | Scoped PR screenshot evidence (issue 826) | Same rendering path and budget as `full`, but captures ONLY the labels a PR's changed files affect and skips a view-bearing phase whose labels are all off-target; the full-only behavioral assert phases do NOT run | Modestly faster for a manager-only PR (phase E skipped, ~25% off) but ≈no win yet for player PRs since phase D0 still fully navigates — the per-view within-D0 scoping that yields the larger win is a follow-on |

The `rc` profile captures a pinned screenshot budget (`world-loaded`, `fabricate-app-shell`, `post-craft`, `alara-post-craft-inventory`, plus `screenshot-failure.png` on failure) — every other `screenshot(page, label)` call is a no-op under `rc`, but the surrounding behavioral assertions still run.

The `screenshots` profile is the PR-evidence producer: it renders the same real-Foundry app windows as `full` but scopes the captured set to the views a PR touches.
Its target label set comes from `mapChangedFilesToViews` — derive it with `npm run screenshots:ui:targets -- --base origin/main` (or `--changed-files <file>`) and pass it via `--target-labels=<csv>` / `FOUNDRY_SCREENSHOT_TARGET_LABELS`; an empty set (no UI change) means capture the full catalogue.
Phase E (the player/craft/journal frames) is skipped when no target label maps to it, so a manager-only PR drops that whole phase.
The label → phase registration lives in `scripts/lib/screenshotCaptureMap.js` (a pure, playwright-free module the harness and the unit tests share).

The orchestrator gives the in-browser run its own wall-clock budget (`FOUNDRY_RUN_TIMEOUT_MS`).
When unset, the default is **profile-derived**: the expected walk duration for the resolved profile plus a fixed finalization grace (`scripts/lib/foundryRunBudget.js`), so the budget always clears a legitimately-passing walk *plus* its post-verdict `summary.json` write rather than SIGTERM-killing finalization on a green run.
`rc`/`ci` keep today's 18-minute budget (headroom over the observed ~870-930s rc walk), while `full`/`screenshots` derive ~26 minutes — so the `full` walk no longer needs a manual `FOUNDRY_RUN_TIMEOUT_MS` override to finish teardown and write `summary.json`.
On overrun, the run process is sent `SIGTERM` and the orchestrator proceeds to Docker teardown + artifact upload, so the 25-minute Actions budget can never preempt cleanup.
An explicit `FOUNDRY_RUN_TIMEOUT_MS` (for example CI's pinned value) always wins; override locally if you need a longer or shorter cap:

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

### Tolerated transient renderer teardown (`degraded` / `rendererCrashed`)

A long `full` run can hit a transient Chromium renderer/page teardown at the tail — the message class `Target page, context or browser has been closed` (or `disconnected`/`crashed`).
This is the same infra flake the Phase E Journal step and the process-level `unhandledRejection` guard already absorb.
The Phase D0 manager walk now absorbs it too, but only after its last load-bearing capture (the `manager-experimental-off` milestone).

`d0RequiredCapturesComplete` flips true immediately after the `manager-experimental-off` screenshot — the last genuine D0 capture.
A teardown after that milestone records the `screenshot-manager` step skipped (not failed) and the run continues.
A teardown before it still records `screenshot-manager: false` and fails the run, because the later frames were genuinely never captured and a PR relying on them must not go green.
The tolerated window is deliberately minimal, so any earlier teardown fails loudly.

`degraded: true` means a transient teardown was tolerated (a `screenshot-manager` or `player-journal` step is `skipped: true` with a `transient page teardown (skipped): …` error), so the run still exits 0 but is distinguishable from a clean pass.
`rendererCrashed: true` means Playwright fired a page `crash` event (canonically an OOM) — the causation-bearing renderer-crash signal that `page.isClosed()` cannot distinguish from an intentional close — so a crash-flagged tolerated run stays exit 0 but warrants a confirming re-run.
A real Fabricate JS error surfaces as a `pageerror`/`console.error` in the independent `consoleErrors[]` gate, not through the teardown path, so a tolerated teardown coincident with any non-waived console error still fails the run.
The tolerance can therefore only ever mask a post-captures renderer process crash, never a JS regression.
A persistent `rendererCrashed`/`degraded` pattern across runs is actionable (a systematic tail OOM), not cosmetic.
When `npm run screenshots:ui` refuses a run on any of these, it prints which of the five evidence conditions tripped, the value each one measured, an excerpt of the failing steps and un-waived console errors behind them, and how to check whether the same fault is already present at your PR's base — read that refusal rather than re-deriving it from `summary.json` by hand.

### Known drift pattern: Phase D0 selectors

`exerciseManagerEnvironmentPointerTargets` in `scripts/foundry-smoke/pageOps/pageLifecycle.mjs` and the env-edit checks in the same file pin many selectors by class, child index (`.nth(N)`), and visible button text.
When the manager UI evolves, these go stale silently — the harness only fails when the next smoke run hits the broken locator.

Hit list seen historically:

- `.manager-environment-row .manager-icon-button .nth(3)` / `.nth(4)` — expected move-up / move-down buttons that were dropped when reordering moved to drag-and-drop.
- `.manager-environment-edit-view.is-placeholder` and `.manager-environment-placeholder-card` — gone since the real composition editor replaced the placeholder.
- "Return to environments" button text — renamed to "Back to environments" and rewired through `confirmRouteExit`.
- `.manager-environment-details-band` — CSS rule survived in `styles/fabricate.css`, but the Svelte usage was removed; the harness kept waiting on it.
- `.manager-travel-party-row` / `.manager-travel-member-row` — the **singular** classes from a retired combined Travel view.
World > Parties renders `GatheringPartiesTab` (`.manager-travel-parties-row`, **plural**) and `PartyExpandedBody` (`.manager-party-member-row`); the harness `waitFor` timed out until the selectors were repointed.

**Workflow rule:** Whenever editing manager UI markup (env browser row, env-edit view, CompositionList, header actions, Travel tabs, etc.), grep `scripts/foundry-smoke/` for the changed classes / text BEFORE declaring the change done.
Prefer running `npm run test:foundry` locally at least once on UI-touching PRs.
If the harness asserts on something the new markup no longer has, update the harness in the same PR.

**CI blind spot:** PR CI runs a reduced profile that skips full-only steps (e.g. the Travel screenshot).
A selector that only the **full** profile exercises rots invisibly until someone runs `npm run test:foundry` locally.
Don't assume green PR CI means the full smoke walk passes.

### Running it locally (gotchas)

- Needs Docker Desktop running and `.env.foundry` with `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` (the `up` script loads it; CI sets the vars directly).
The container is cached between runs, so re-runs boot in ~5s.
- Running smoke from a disposable worktree needs a few extras the main checkout has already.
Copy `.env.foundry` from the main checkout (a fresh worktree does not carry it).
The container identity (name, hostname, compose project, host port) is now derived deterministically from the worktree root by `scripts/lib/foundryRunIdentity.js`, so it is unique per worktree and no longer collides — the old pre-run/post-run `docker rm -f fabricate-foundry-test` dance is superseded and unnecessary.
Tear a disposed worktree down with `npm run test:foundry:down -- --clean` so its per-worktree container and compose network are removed; that is a cleaner reclaim than the periodic `docker network prune -f` guard (which stays safe, since it only frees networks with no attached container — preserved stopped containers keep theirs in use).
The default run budget is now profile-derived, so a local `full` walk (`npm run test:foundry`, no `FOUNDRY_RUN_TIMEOUT_MS`) already gets ~26 minutes and no longer needs a manual headroom override to finish teardown and write `summary.json`.
On a branch that predates this profile-derived default, still give the run `FOUNDRY_RUN_TIMEOUT_MS` headroom so the older flat 18-minute default does not trip the watchdog on an otherwise-passing full walk.
- The `run` phase **wipes `test-results/`** at startup.
Do **not** redirect run logs into `test-results/` (e.g. `... | Tee-Object test-results/x.log`) — on Windows the open log file can't be unlinked and the run dies with `EBUSY`.
Tee to a path outside `test-results/` if you need a copy.

### Documentation screenshot source

A new or replaced screenshot on the documentation site is generated from a named View Lab case.
Nothing on the site is hand-captured from a browser any more, because a curated frame has no producer and goes stale with nothing to say so.

A page declares an image slot by naming a case id.
The generator fills the slot, and both halves are gated, so neither can move without the other.

```sh
node scripts/docs-screenshots.mjs plan   # what a run would rewrite, without starting a browser
npm run docs:screenshots                 # render, encode what changed, update the map
npm run docs:screenshots:check           # re-render, and compare every committed frame against it
```

Three files make up the mechanism.

- `docs/_data/screenshots.json` is the committed map.
  It carries a provenance header and one entry per case, each with the alternative text the site publishes and the SHA-256 of the source frame the committed image was encoded from.
  That digest is provenance and only provenance: it records WHICH render produced the committed asset, and it moves only when a frame is actually rewritten.
  Nothing re-derives it, and nothing can.
  The renderer is not byte-deterministic, so a fresh render of the same case yields a different source PNG and therefore a different digest while showing the identical view.
  `docs:screenshots:check` compares pixels, not digests.
  `tests/docs-screenshot-map.test.js` checks the digest's shape and uniqueness, which is all that can be checked without rendering.
  The asset path is derived from the case id and never stored, so there is only ever one name for a frame.
- `docs/_includes/screenshot.html` is the slot.
  Write `{% raw %}{% include screenshot.html case="manager-recipe-edit-normal" %}{% endraw %}` on a page, optionally with `alt` to override the map's text or `caption` to add a visible one.
- `docs/img/screenshots/lab/` holds the generated images, one per mapped case.

The generated set has a directory of its own, and that is load-bearing rather than tidiness.
`docs/img/screenshots/` still holds a hand-curated frame that predates the generator, five case ids share the `fabricate-` prefix with it, and mixed together the only available test for "did the generator produce this" would be "is it in the map".
That reduces the reverse gate to the map restating itself.
`tests/docs-screenshots.test.js` owns the flat directory and `tests/docs-screenshot-map.test.js` owns `lab/`, and each says in its own comments which facts keep them apart.

What is left of that pre-existing population stays exactly as it is.
It remains valid documentation evidence and is not migrated, because retiring evidence that is still accurate buys nothing.
The rule applies to a new or replaced screenshot.
The population is also closed and may only shrink, and `tests/docs-screenshots.test.js` now enumerates what is in it and why no view case can reach it, so adding to it is a visible act rather than a silent one.

`npm run docs:screenshots` rewrites only the frames whose view actually moved, and reports which ones it left alone.
Run it after any change that alters one of the mapped views, and read what it reports before committing.
Then run `npm run docs:screenshots:check` to confirm every committed frame still matches a fresh render.
Both verbs decide with the same comparison, so a `check` failure means the same thing a `generate` rewrite would have.

That comparison is perceptual rather than byte-equal, and the reason is measured rather than assumed.
This renderer is not byte-deterministic: two clean renders of the identical set of mapped cases differ in a handful of frames, and the differing set moves between runs rather than settling, so it is per-run timing and not a property of any case.
Byte equality would therefore report roughly a tenth of the set as changed on every run forever, which is the churn the selective rewrite exists to prevent.

So a frame is compared like this.
The fresh render is encoded with the same `cwebp` settings the committed asset uses, and the two WebP files are compared byte for byte.
Identical means unchanged, and that is the fast path.
Only on a mismatch are both decoded with `dwebp -ppm` and compared pixel by pixel.
Comparing WebP against WebP keeps both sides under identical encoder treatment, so nothing but a genuine render difference survives.
Comparing a fresh PNG against the committed WebP would fold the encoder's own preprocessing into every measurement.

The tolerance has two rules, because a difference can be loud or it can be broad, and this renderer's noise is neither.

The first rule is amplitude, and it was derived from the measurement rather than chosen.
Four full renders of the forty-six mapped cases give six pairings, which is 276 frame comparisons.
Nineteen of those frame pairs differed at all.
The worst carried 2116 differing pixels, and the largest per-channel difference any pair reached anywhere was sixteen levels, on three pixels.
Not one noise pixel reached twenty-four, so the budget is zero: one pixel differing by twenty-four levels or more is a changed view.
The other side was measured the same way.
Changing one character of one recipe name in the View Lab world fixture, between two letters of equal advance width so nothing reflowed, put forty-seven pixels past twenty-four levels in the smallest of the three places that name appears on screen, reaching sixty levels.
So the threshold sits eight levels above a noise population that never reaches it and well below the weakest real signal, and every scrap of margin the rule has is in amplitude rather than in a pixel budget.

The second rule is area: more than five percent of a frame differing at all, at any amplitude, is a changed view.
Amplitude alone cannot see a shallow change that covers a lot of frame, and that is not a hypothetical shape.
Lightening every pixel of a real committed frame by twenty-three levels puts no pixel past twenty-four, and was reported unchanged.
That is a Fabricate colour token changing across a panel, which is the sort of change documentation exists to show.
The worst noise measured touched 2116 pixels of a 1280x860 frame, which is 0.19% of it, so five percent sits about twenty-six times above the measurement.

What still passes is a difference under twenty-four levels on every pixel AND under five percent of the frame: a subtle recolour of something small.
That is the residual cost of a tolerance wide enough to absorb this renderer's jitter at all.
The cost runs the other way too.
A libwebp release that changes `-near_lossless` preprocessing would move many pixels a little, trip the area rule, and rewrite the set once with no visual change to review.

`tests/docs-screenshot-frames.test.js` holds every one of these numbers against committed fixtures, and its header records where they came from and which of them are synthesized.
Do not widen any of them without repeating that measurement.
A tolerance that cannot separate renderer jitter from a changed character is not a tolerance, it is a blindfold.

Generation fails closed.
Without the harvested Foundry chrome it aborts naming the harvest command, and without `cwebp` and `dwebp` on `PATH` it aborts naming libwebp.
The decoder is required even by a run that encodes nothing, because without it the only available comparison is byte equality.
This renderer's own jitter fails byte equality.
A case the renderer failed on this run is refused even when an earlier run left a frame for it on disk, because the renderer accumulates output and republishing that frame would ship an older commit's picture as current documentation.
A run whose renderer died before it produced anything is refused whole, on the modification time of the manifest rather than on its contents: the renderer writes that file last, so a throw before its render loop leaves an earlier run's manifest in place, and every frame in it agrees with its own recorded head by construction.
Without that, a `check` could report that every committed frame matches a fresh render having rendered nothing.
A run that refused any case leaves the provenance header alone, because stamping it would certify frames that run never rendered.

There is no CI job that regenerates any of this.
Generation needs the harvested chrome, which never leaves your machine, so CI builds and deploys what is committed.

A Foundry chrome rotation or a Playwright resolution change rewrites the whole set with no visual change to review.
The map's provenance header makes that identifiable, and such a rewrite lands as its own commit, separate from any content change.
