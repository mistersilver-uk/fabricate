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
npm run test:foundry:down      # Stop Docker container

# Against an already-running Foundry instance
node scripts/foundry-test-run.mjs
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FOUNDRY_URL` | `http://localhost:30000` | Base URL of the Foundry instance |
| `FOUNDRY_ADMIN_KEY` | `fabricate-test-admin` | Admin password for the setup/auth page |

### Test Phases

The smoke test executes 6 phases:

| Phase | Name | What It Does |
|---|---|---|
| A | Setup | Navigates to Foundry, accepts license, authenticates, launches world |
| B | Create Actors & Items | Cleans stale data, creates 2 actors and 7 items with inventories |
| C | Create Crafting System | Creates "Arcane Forge" system, registers 7 components, creates 3 recipes |
| D | Screenshot Recipe Manager | Opens Recipe Manager, selects system, screenshots all 5 tabs |
| E | Craft an Item | Opens Crafting App, crafts a Healing Potion, verifies inventory |
| F | Cleanup | Deletes all test data (recipes, system, actors, items) |

### Screenshot Catalog

All screenshots are written to `test-results/` with auto-incrementing numeric prefixes.

| File | Contents |
|---|---|
| `screenshot-01-world-loaded.png` | Foundry canvas after joining the game session |
| `screenshot-02-items-sidebar.png` | Items sidebar with 7 crafting items (`.webp` icons) |
| `screenshot-03-actor-sheet-*.png` | First actor — inventory tab with embedded items |
| `screenshot-04-actor-sheet-*.png` | Second actor — inventory tab |
| `screenshot-05-recipe-manager-default.png` | Recipe Manager — Systems tab with "Arcane Forge" selected |
| `screenshot-06-recipe-manager-systems.png` | Systems tab — settings and feature toggles |
| `screenshot-07-recipe-manager-items.png` | Components tab — 8 item cards with icons |
| `screenshot-08-recipe-manager-recipes.png` | Recipes tab — 3 recipes with ingredient counts |
| `screenshot-09-recipe-manager-rules.png` | Rules tab |
| `screenshot-10-recipe-manager-graph.png` | Graph tab — recipe dependency visualization |
| `screenshot-11-crafting-app-opened.png` | Crafting App — actor selection, craftable recipes |
| `screenshot-12-post-craft.png` | Post-craft state with success notification |
| `screenshot-13-alara-post-craft-inventory.png` | Actor inventory after crafting |

### Test Data

The smoke test creates the following Foundry documents:

**Actors:**
- Alara the Alchemist (inventory: 3x Mystic Herb, 2x Empty Vial, 1x Dragon Scale)
- Brom the Blacksmith (inventory: 3x Iron Ore, 1x Dragon Scale)

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
