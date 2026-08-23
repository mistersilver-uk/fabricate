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

## Icon catalogue

`generate-icon-catalogue.mjs` regenerates `src/ui/svelte/util/foundryIconCatalogue.js` from the Font Awesome bundle a Foundry install ships.

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

# The narrow boot-and-assert arm (issue 1088): boot, join, confirm Fabricate loads,
# assert a few version-sensitive API shapes, exit. Roughly a minute, not the ~32-minute walk.
npm run test:foundry:v13       # Foundry 13.351 + dnd5e 5.2.5
npm run test:foundry:v14       # the default 14.365 build, same assertions
```

The two arms share one container identity (the felddy licence binds to the hostname), so they must
never run at the same time in one worktree.
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

`npm run test:foundry:perf` measures Fabricate at scale **inside a real Foundry**
(issue 1073, part of the performance programme in issue 1070).

It is the `perf` arm of the harness above, not a second harness: the same
`docker-compose.foundry.yml`, the same per-worktree container identity, the same
`up` → `run` → `down` lifecycle, the same disposable world.
Only the thing that runs against the booted container is different —
`foundry-perf-run.mjs` instead of `foundry-test-run.mjs`.

```bash
npm run test:foundry:perf                          # seed, measure, record
npm run test:foundry:perf -- --arm=v13             # the same profile on Foundry 13
node scripts/foundry-perf-run.mjs --preflight      # preconditions only; starts nothing
node scripts/foundry-perf-run.mjs                  # against an already-running container
```

### It is opt-in, and it must stay that way

The profile appears in **no** GitHub Actions workflow and in no required check.
It needs licensed Foundry credentials and local Docker, and
`docker-compose.foundry.yml` documents credential activation as intermittently
flaky.
`tests/foundry-perf-profile.test.js` asserts that no workflow invokes it, so
wiring it into CI fails `npm test` rather than surfacing as a red required check
on somebody else's pull request.

The run also **refuses rather than fetches**.
A missing Docker CLI, missing credentials, a Foundry image that is not already in
the local image store, or a checkout without issue 1071's fixtures each exits 2
with the command that fixes it — before the build, before `up`, and without
pulling anything.
An image pull is hundreds of megabytes and a container boot activates a licence
against the container hostname; neither should be a side effect of asking for a
measurement.

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

Note the difference from issue 1071: there, class 1 is committed to
`benchmarks/baselines/` and asserted by a drift test.
Here it is not, and cannot be.
A count taken inside a live Foundry is invariant only *given the Foundry build and
the game system*, because those decide document schemas, what a `create` call
preserves and which hooks fire.
The committed, cross-machine baseline is the headless one; this profile is the
instrument that tells you whether the headless model still resembles reality.

**Report ratios, never absolute milliseconds.**
`scripts/lib/foundryPerfRecord.js` refuses to compare two runs whose Node version,
CPU model, architecture, arm, Foundry build, image, game system, browser build,
fixture profile or fixture seed differ, naming every field that does.

### What it measures

Every measurement is declared in `scripts/lib/foundryPerfMeasurements.js` with its
class and its status, and the run record reconciles the walk's output against that
registry — so a measurement that produced nothing is reported by name rather than
being indistinguishable from one that measured zero.

Startup attribution is not a stopwatch around the `ready` hook.
`src/utils/startupMarks.js` opens explicit `performance.mark` boundaries around
`Fabricate.initialize()` and around three spans nested inside it — migrations,
corpus load, and startup maintenance — so the profile reports what Fabricate cost
rather than what the whole boot cost.
The remainder (`initialize` minus its three children) is reported too: it is
collaborator construction and hook registration, and a remainder that grows is a
finding a single total would hide.

Two declared measurements are **deferred**, each carrying what blocks it:

- `propagation-unhydrated` — issue 1073 asks for both a hydrated and an
  un-hydrated receiver.
  That distinction belongs to the Documents backend issue 1088 probed; on the
  shipped **settings** backend every world setting replicates in full to every
  client at connect (issue 1088 Q4), so there is no un-hydrated receiver to time
  and a number reported here would be the hydrated one under a second name.
  Issue 1092 fills this slot.
- `persistence-experiments` — issue 1079's prototypes do not exist yet.
  The settings arm is measured by `definition-edit`, which is the control any
  later prototype is compared against.

### Seeding

The corpus is written as **three writes, whatever its size**: one
`fabricate.craftingSystems` setting, one `fabricate.recipes` setting, and one
batched `Actor.createDocuments` carrying every seeded actor with its held items
nested.
Seeding through `createRecipe()` would be one whole-corpus save per recipe —
quadratic, hours long, and a measurement of the defect rather than a setup for
measuring it.

The fixtures are issue 1071's, imported rather than re-generated, so the Foundry
and headless layers measure the same corpus.
`FOUNDRY_PERF_FIXTURE` selects one (`simple-corpus`, `held-inventory`, …).

Measured against those fixtures, the three writes hold at every scale:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Fixture | Recipes | Components | Actors | `craftingSystems` bytes | `recipes` bytes | Writes |
|---|---|---|---|---|---|---|
| `simple-corpus` | 10,000 | 5,000 | 2 | 1,973,024 | 7,177,534 | 2 settings + 1 actor create |
| `held-inventory` (point 0) | 6 | 5,000 | 3 | 1,973,024 | 4,183 | 2 settings + 1 actor create |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**The held-inventory axis is a series, and `FOUNDRY_PERF_INVENTORY` picks the
point.**
`held-inventory` varies 100 / 500 / 1,000 held stacks against the same
5,000-component library, and a bare `fixture.inventory` is only its *first* point.
Seeding that unconditionally would run the whole profile at 100 stacks while
reporting it under the axis's name — the cheapest point of the axis, named after
the axis.
The chosen point and the series length are recorded on every run.

The chosen inventory point's composition is recomputed from the translated
payloads rather than copied from the fixture's own declaration, so a translation
bug that dropped every flag shows up as a mix that disagrees with the fixture
instead of being masked by the fixture restating what it intended.

The seeded world is then **reloaded** before anything is timed, so the startup
measurement is taken against the seeded corpus rather than the empty world the
container booted into.

One thing the seeder cannot assume: `_stats.compendiumSource` is core-managed, so
Foundry may ignore a value supplied to `create`.
If it does, every source-reference stack silently becomes an unmatched one and the
run reports an inventory composition it does not have.
The run therefore takes a census against the **created documents** and prints the
drift.

### Capturing a Chrome trace

```bash
FOUNDRY_PERF_TRACE=1 npm run test:foundry:perf
```

The run opens a CDP `Tracing` session over the GM page for the whole walk and
writes the raw Chrome DevTools trace to `.foundry-perf/traces/`.
Load it with **chrome://tracing**, or via the Performance panel's *Load profile*
button in any Chromium DevTools.
A trace failure never fails the run: a diagnostic aid is not worth losing a walk
that costs a container boot to reproduce.

Long tasks are captured separately and always, through a `PerformanceObserver`
installed by `addInitScript` **before any page script runs** — an observer added
after `game.ready` would miss the boot, which is the densest stretch of the run.
Each task is attributed to the scenario open at the time; one landing between
scenarios is reported as `unattributed` rather than charged to whichever ran next.

### Comparing two commits

```bash
git switch <baseline-commit>
npm run test:foundry:perf                 # writes .foundry-perf/runs/<stamp>-<sha>-<arm>-<fixture>.json
git switch <candidate-commit>
npm run test:foundry:perf
```

Then compare the two records with
`assertFoundryComparable` / `compareTimings` / `compareInvariants` from
`scripts/lib/foundryPerfRecord.js`.
Run both on **one machine, one arm and one fixture**, back to back, and quote the
ratio.
A ratio is the only form that survives being pasted into an issue by someone who
did not run it.

`compareInvariants` is the half worth reading first.
A moved class-1 value — `recipesBytes`, a row count, a hook-delivery count — is a
fact about the code and is reported as a finding.
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

The arm is selected the same way as everywhere else — `--arm=v13` reaches compose
through `FOUNDRY_IMAGE` and never edits `docker-compose.foundry.yml`.

### Baseline runs are a maintainer step

An agent can write the profile, the seeding, the capture and this documentation.
The baseline run itself needs licensed credentials and local Docker and must be
performed and attested by a maintainer.

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
components nothing imports (`RowDisclosure.svelte`; the sweep was motivated by issue 927), whose
warnings would never reach it.
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

### Where the chrome comes from, and which source may attest

Two sources, only one of them authoritative.

```sh
npm run viewlab:chrome:harvest                       # the release archive (default)
npm run viewlab:chrome:harvest -- --from-dir "C:\Program Files\Foundry Virtual Tabletop"
```

The archive is what CI harvests, so it is the only source `--write-provenance` accepts.
`--from-dir` reads an unpacked desktop installation instead, which needs neither Docker nor
credentials and renders identical frames.
It may not record provenance, because the two hold the same Foundry as different bytes: the Windows
installer ships `client/applications/api/application.mjs` with CRLF line endings where the release
archive uses LF, so their digests differ.
A record written from an installation would pin digests CI could never reproduce, and the
frame-builder drift gate would fail on every later pull request.
The harvest refuses rather than letting that happen.

### Keeping the smoke and the lab on one Foundry

The lab has no Foundry of its own.
It harvests whatever archive the smoke's container downloaded, which is the right coupling: the live
smoke is the fidelity authority, and drawing from the same build is what makes a lab frame and a
smoke frame comparable.
`docker-compose.foundry.yml` pins an exact build, `scripts/foundry-test-up.mjs` reads that pin rather
than restating it, and `tests/view-lab-chrome-version-lock.test.js` fails when the committed
provenance names a different build from the pinned image.
Bumping Foundry therefore means bumping the pin, the smoke world fixture, and the provenance record
together.
Re-recording provenance is deliberately a human act: someone re-reads
`client/applications/api/application.mjs` and confirms `scripts/lib/foundryChromeSpec.js` still
transcribes it.
`tests/view-lab-chrome-drift.test.js` names anything that moved.

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
There are 146 `exact` cases, 3 `window`, and 105 `beyond`, out of 254 total.

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
