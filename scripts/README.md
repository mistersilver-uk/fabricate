# Fabricate Test Scripts

## Foundry Integration Smoke Test

The smoke test (`foundry-test-run.mjs`) verifies that Fabricate loads and functions correctly
in a live Foundry VTT instance. It uses Playwright to drive a headless Chromium browser
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

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_URL` | `http://localhost:30100` | Base URL of the Foundry instance |
| `FOUNDRY_HOST_PORT` | `30100` | Host port used by the Docker harness. The default is 30100 (not 30000) so the smoke test can coexist with a developer's local Foundry on 30000; override with a matching `FOUNDRY_URL` if 30100 is also occupied. |
| `FOUNDRY_ADMIN_KEY` | `fabricate-test-admin` | Admin password for the setup/auth page |
| `FOUNDRY_IMAGE` | `felddy/foundryvtt:13` | Docker image used by the compose harness. Defaults to Foundry V13 for the V13 smoke world. |
| `FOUNDRY_RELEASE_URL` | unset | Optional explicit Foundry release URL. When unset, `test:foundry:up` uses a matching local cached zip if one exists. |
| `FOUNDRY_RECREATE` | unset | Set to `1` before `npm run test:foundry:up` to discard and recreate the cached container. |

### Foundry Download Cache

The harness first looks for `.foundry-e2e/cache/foundryvtt-<version>.zip`. When the archive exists, `test:foundry:up` passes it to the container as a local `FOUNDRY_RELEASE_URL`, which avoids requesting a presigned release URL from Foundry during clean installs.

The harness also preserves the stopped Docker container between normal smoke-test runs. This keeps the extracted Foundry application cached in the container filesystem, so reruns do not repeat installation work.

Use `node scripts/foundry-test-down.mjs --clean` or `FOUNDRY_RECREATE=1 npm run test:foundry:up` when you need to refresh the cached container after changing Docker image, port, or container-level configuration.

### Test Phases

The smoke test executes 6 phases:

| Phase | Name | What It Does |
|---|---|---|
| A | Setup | Navigates to Foundry, accepts license, authenticates, launches the world, and joins as Gamemaster |
| B | Create Actors & Items | Cleans stale data, creates every raster actor under `assets/img/actors/` and 7 items, then seeds inventories on the actors used by current flows |
| C | Create Crafting System | Creates "Arcane Forge" system, registers 7 components, creates 3 recipes |
| D | Screenshot Recipe Manager | Opens Recipe Manager, selects system, screenshots all 5 tabs |
| E | Craft an Item | Opens Crafting App, crafts a Healing Potion, verifies inventory |
| F | Cleanup | Deletes all test data (recipes, system, actors, items) |

### Screenshot Catalog

All screenshots are written to `test-results/` with auto-incrementing numeric prefixes. The
stable part of each filename is the trailing label, not the numeric prefix.

| File label | Contents |
|---|---|
| `license`, `license-accepted`, `auth-complete`, `setup-ready`, `worlds-tab`, `world-launching` | First-run setup and world-launch checkpoints |
| `join-ready` | Join form with the Gamemaster selection confirmed before submission |
| `world-loaded` | Foundry canvas after joining the game session |
| `items-sidebar` | Items sidebar with 7 crafting items (`.webp` icons) |
| `actor-sheet-*` | Actor sheets for every `assets/img/actors/` portrait fixture; current flow actors include embedded test items |
| `recipe-manager-default`, `recipe-manager-systems`, `recipe-manager-items`, `recipe-manager-recipes`, `recipe-manager-rules`, `recipe-manager-graph` | Recipe Manager checkpoints across the admin tabs |
| `recipe-manager-environments`, `gm-environments-*` | GM Environments tab and responsive validation/authoring checkpoints |
| `crafting-app-opened`, `post-craft`, `alara-post-craft-inventory` | Crafting flow checkpoints after opening the app and completing the craft |
| `join-selection-failed`, `join-submit-failed`, `craft-failure`, `screenshot-failure.png` | Failure diagnostics captured when the harness aborts |

### Test Data

The smoke test creates the following Foundry documents:

**Actors:**
- Alara the Alchemist (inventory: 3x Mystic Herb, 2x Empty Vial, 1x Dragon Scale)
- Barek The Hunter (portrait fixture only)
- Bromm the Blacksmith (inventory: 3x Iron Ore, 1x Dragon Scale)
- Mirelle the Herbalist (portrait fixture only)
- Samira the Enchanter (portrait fixture only)
- Tomas The Cook (portrait fixture only)
- Zahra the Jeweller (portrait fixture only)

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

The smoke test uses `page.evaluate()` to interact with Foundry APIs. Key patterns for V13:

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
