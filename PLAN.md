# Implementation Plan

## T-054: Ship Starter Content Pack and Check Macro Templates

### Overview

Deliver a ready-to-use "Alchemist's Supplies" starter content pack for D&D 5e that lets a GM import one JSON file and immediately have a working crafting system with ingredients, recipes, essences, categories, visibility settings, and check macro templates.

### Source Material

- **PDF reference**: `reference/Alchemist's Supplies v1.1.pdf` -- defines ingredients, essences, recipes, crafting rules
- **Compendium DB**: `packs/alchemists-supplies-v16.db` -- NeDB-format Foundry v10 compendium with item documents for ingredients and crafted products

### Architecture Decisions

1. **Starter pack format**: A single importable JSON file at `packs/starter-alchemists-supplies.json` containing a complete crafting system definition + recipes array + macro templates. The module exposes an import helper at `game.fabricate.importStarterPack()`.
2. **Compendium registration**: Add a `packs` entry in `module.json` pointing to the existing `packs/alchemists-supplies-v16.db` so Foundry loads it as `fabricate.alchemists-supplies`.
3. **Managed components**: Each ingredient and crafted product in the compendium becomes a managed component in the starter system, referenced by `sourceItemUuid` pointing to `Compendium.fabricate.alchemists-supplies.<_id>`.
4. **Essences**: Four primary alchemical essences (Earth, Water, Air, Fire) plus two rare essences (Positive, Negative) as defined in the PDF.
5. **Recipes**: 16 recipes from the PDF, each using essence-based ingredient matching.
6. **Check macro templates**: Two macros shipped as JS template strings -- one dnd5e-specific and one system-agnostic fallback.

### File Plan

| File | Action | Purpose |
|------|--------|---------|
| `module.json` | **Edit** | Add `packs` array for compendium registration |
| `packs/starter-alchemists-supplies.json` | **Create** | Complete starter pack data (system + recipes + macros) |
| `src/macros/check-templates.js` | **Create** | Exported macro template strings for dnd5e and generic |
| `src/starter/importStarterPack.js` | **Create** | Import helper that creates system + recipes from JSON |
| `src/main.js` | **Edit** | Import and expose `importStarterPack` on `game.fabricate` API |
| `tests/starter-pack-import.test.js` | **Create** | Smoke test: validates JSON, validates all recipes, validates cross-references |

### Detailed Design

#### 1. Compendium Registration (`module.json`)

Add to `module.json`:
```json
"packs": [
  {
    "name": "alchemists-supplies",
    "label": "Alchemist's Supplies",
    "path": "packs/alchemists-supplies-v16.db",
    "type": "Item",
    "system": "dnd5e"
  }
]
```

#### 2. Starter Pack JSON (`packs/starter-alchemists-supplies.json`)

Top-level structure:
```json
{
  "formatVersion": 1,
  "id": "alchemists-supplies",
  "name": "Alchemist's Supplies",
  "description": "A complete D&D 5e alchemy crafting system...",
  "system": { ... },
  "recipes": [ ... ],
  "macroTemplates": { "dnd5e": "...", "generic": "..." }
}
```

**System object** matches `CraftingSystemManager._normalizeSystem()` input shape:
- `name`: "Alchemist's Supplies"
- `resolutionMode`: "simple"
- `features`: `{ essences: true, recipeCategories: true, itemTags: true, craftingChecks: true, chatOutput: true }`
- `categories`: ["Common Ingredients", "Special Ingredients", "Potions", "Bombs", "Tools"]
- `essenceDefinitions`: 6 entries (earth, water, air, fire, positive, negative)
- `recipeVisibility`: `{ listMode: "global" }`
- `craftingCheck`: `{ enabled: true, checkSource: "builtIn", mode: "passFail", builtIn: { ability: "int", dc: 12 }, consumption: { consumeIngredientsOnFail: true } }`
- `components`: 22 managed items (14 ingredients + 8 special ingredients mapped from compendium `_id` values, plus crafted product items)

**Components** -- each uses the actual `_id` from `packs/alchemists-supplies-v16.db`:

Common Ingredients (from PDF d12 table):
| Name | Compendium _id | Essences |
|------|---------------|----------|
| Rockvine | (from db) | `{ "earth": 1 }` |
| Amanita Cap | (from db) | `{ "water": 1 }` |
| Fennel Silk | (from db) | `{ "air": 1 }` |
| Lightningbug Thorax | (from db) | `{ "fire": 1 }` |
| Radiant Synthseed | (from db) | `{ "positive": 1 }` |
| Voidroot | (from db) | `{ "negative": 1 }` |

Special Ingredients (from PDF d8 table):
| Name | Compendium _id | Essences |
|------|---------------|----------|
| Ironwood Heart | (from db) | `{ "earth": 2 }` |
| Hydrathistle | (from db) | `{ "water": 2 }` |
| Wisp Stalks | (from db) | `{ "air": 2 }` |
| Drakus Flower | (from db) | `{ "fire": 2 }` |
| Frozen Seedlings | (from db) | `{ "earth": 1, "water": 1 }` |
| Blue Toadshade | (from db) | `{ "water": 1, "air": 1 }` |
| Luminous Cap Dust | (from db) | `{ "air": 1, "fire": 1 }` |
| Wrackwort Bulbs | (from db) | `{ "fire": 1, "earth": 1 }` |

Crafted Products (one per recipe -- each has a compendium entry):
Acid, Alchemist's Fire, Alchemist's Frost (Alchemical Bomb), Alchemist's Spark (Alchemical Bomb), Breath Bottle, Dust of Dryness, Firesnuff, Flash Pellet, Instant Rope, Melt Powder, Night Eyes, Noxious Smokestick, Smokestick, Snappowder, Tanglefoot Bag, Titan Gum

**Recipes** -- 16 recipes, each with essence-based ingredientSets:

| Recipe | Category | Essences Required |
|--------|----------|------------------|
| Acid (25gp) | Potions | earth x1, fire x1, positive x1 |
| Alchemist's Fire (50gp) | Bombs | fire x2, earth x1, water x1, positive x1 |
| Alchemist's Frost (50gp) | Bombs | water x2, air x2, positive x1 |
| Alchemist's Spark (50gp) | Bombs | air x4, negative x1 |
| Breath Bottle (20gp) | Tools | air x3 |
| Dust of Dryness (60gp) | Tools | earth x3, negative x2 |
| Firesnuff (10gp) | Tools | fire x1, negative x1 |
| Flash Pellet (25gp) | Bombs | fire x2, positive x1 |
| Gashglue | Potions | (from compendium) |
| Instant Rope (75gp) | Tools | earth x2, water x2, negative x1 |
| Melt Powder (25gp) | Potions | earth x1, fire x2 |
| Night Eyes (25gp) | Potions | water x1, fire x1, negative x1 |
| Noxious Smokestick (40gp) | Bombs | air x2, fire x2, negative x1 |
| Smokestick (20gp) | Tools | air x2, fire x1 |
| Snappowder (25gp) | Tools | earth x2, positive x1 |
| Tanglefoot Bag (50gp) | Tools | earth x2, water x2 |
| Titan Gum (55gp) | Tools | earth x2, water x1, positive x1 |
| Zaebelle's Torpor | Potions | (from compendium) |

Each recipe structure:
```json
{
  "name": "Acid",
  "description": "As a ranged attack, you can throw this vial up to 20 feet...",
  "img": "(from compendium item img)",
  "category": "Potions",
  "craftingSystemId": "__SYSTEM_ID__",
  "tags": ["acid", "25gp"],
  "enabled": true,
  "ingredientSets": [{
    "id": "default",
    "name": "Default",
    "ingredientGroups": [],
    "essences": { "earth": 1, "fire": 1, "positive": 1 }
  }],
  "resultGroups": [{
    "id": "default",
    "name": "Default",
    "results": [{
      "id": "acid-result",
      "componentId": "<acid-managed-component-id>",
      "quantity": 1
    }]
  }]
}
```

#### 3. Macro Templates (`src/macros/check-templates.js`)

Export two string constants:

**`dnd5eCheckTemplate`**: D&D 5e Alchemist's Supplies proficiency check
```js
// Uses actor.rollAbilityTest or the built-in check adapter
// DC = 6 + (2 * number of raw ingredients used)
// On success: { pass: true }
// On failure: { pass: false }
```

**`genericCheckTemplate`**: System-agnostic fallback
```js
// Uses Roll('1d20 + @mod') with configurable modifier
// Posts result to chat via ChatMessage.create()
// Returns { pass: boolean } based on DC comparison
```

#### 4. Import Helper (`src/starter/importStarterPack.js`)

```js
export async function importStarterPack(packId = 'alchemists-supplies') {
  // 1. Fetch JSON from module path: `modules/fabricate/packs/starter-${packId}.json`
  // 2. Create crafting system via game.fabricate.getCraftingSystemManager().createSystem(data.system)
  // 3. Replace __SYSTEM_ID__ placeholders in recipes with actual system ID
  // 4. Create all recipes via game.fabricate.getRecipeManager().createRecipe(recipe) for each
  // 5. Return { system, recipes, macroTemplates: data.macroTemplates }
}
```

#### 5. main.js Changes

In the `Hooks.once('init')` block, add to `game.fabricate.api`:
```js
importStarterPack
```

Also add to the globalThis.fabricate helper:
```js
importStarterPack: async (packId) => {
  const { importStarterPack } = await import('./starter/importStarterPack.js');
  return importStarterPack(packId);
}
```

#### 6. Smoke Test (`tests/starter-pack-import.test.js`)

Uses `node:test` + `node:assert/strict`, following existing test conventions.

Test groups:
1. **JSON structure validation**
   - Loads `packs/starter-alchemists-supplies.json` via `fs.readFileSync`
   - Validates top-level keys: formatVersion, id, name, system, recipes, macroTemplates
   - Validates system has required fields
   - Validates recipes array length >= 10

2. **Recipe validation**
   - For each recipe in the JSON, creates `Recipe.fromJSON(recipe)` and calls `.validate()`
   - All must pass (after replacing `__SYSTEM_ID__` placeholder)

3. **Cross-reference integrity**
   - All `componentId` values in recipe results exist in `system.components[].id`
   - All `system.components[].id` values are referenced by at least one recipe (ingredient essences or result componentId)
   - All essence keys in recipe ingredientSets exist in `system.essenceDefinitions[].id`

4. **Macro template validation**
   - `macroTemplates.dnd5e` is a non-empty string
   - `macroTemplates.generic` is a non-empty string

5. **End-to-end import simulation**
   - Mock `CraftingSystemManager.createSystem` and `RecipeManager.createRecipe`
   - Call `importStarterPack` logic
   - Verify system created with correct shape
   - Verify correct number of recipes created
   - Verify `__SYSTEM_ID__` replaced in all recipes

### Implementation Order

1. Extract compendium `_id` values by parsing `packs/alchemists-supplies-v16.db`
2. Create `packs/starter-alchemists-supplies.json` with all data
3. Create `src/macros/check-templates.js`
4. Create `src/starter/importStarterPack.js`
5. Edit `module.json` to add packs
6. Edit `src/main.js` to expose API
7. Create `tests/starter-pack-import.test.js`
8. Run `npm test` to verify

### Constraints

- Do NOT edit files under `docs/` (docs-writer handles that)
- All component `sourceItemUuid` values must use format `Compendium.fabricate.alchemists-supplies.<_id>` with actual `_id` values from the compendium DB
- Recipe essence requirements must match the PDF exactly
- The starter JSON must be self-contained and importable without network access
- Test must use `node:test` and `node:assert/strict` per project conventions
