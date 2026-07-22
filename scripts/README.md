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

- crafter — first hero alphabetically (inventory: 3x Mystic Herb, 2x Empty Vial, 1x Dragon Scale); owned by the Fabricate Gatherer user and remembered as the default gathering actor
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

- **Document types are Sets:** `Array.from(game.documentTypes.Item)` before `.includes()`
- **Tab switching:** `actor.sheet.changeTab('inventory', 'primary')` — DOM clicks on `[data-tab]` don't trigger Foundry's tab management
- **Embedded item source tracking:** Set `flags: { core: { sourceId: worldItem.uuid } }` on embedded copies so the crafting engine can match them to registered components
- **Admin store initialization:** Pre-set `lastManagedCraftingSystem` setting before opening the Recipe Manager to ensure the correct system is selected
- **Stale data cleanup:** Always delete crafting systems/recipes (via `csm.getSystems()` and `rm.getRecipesForSystem()`) before actors/items — the manager method is `getSystems()`, not `getAllSystems()`

### CI Integration

The smoke test gates releases via the `foundry-integration.yml` workflow:

- Runs on push to main, PRs to main (on `src/`, `scripts/`, `module.json` changes), weekly, and as part of `release.yml`
- Uploads `test-results/` as a build artifact on every run
- Opens a GitHub issue with `foundry-smoke-failure` label on failure
