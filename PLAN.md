# Implementation Plan

## T-079 Plan - Make `visibility.md` the Single Canonical Visibility Guide

### Overview

Eliminate duplicated visibility guidance by replacing the detailed "Recipe Visibility" section in `docs/crafting-systems.md` (lines 204-279) with a short summary and link to `docs/visibility.md`. Move the API configuration examples to `docs/visibility.md` so no useful content is lost.

### Audit Results

Pages mentioning visibility and their status:

| Page | Content | Action |
|------|---------|--------|
| `docs/crafting-systems.md` lines 204-279 | Full mode-by-mode explanations, knowledge sub-options, API examples | **Replace with short summary + link** |
| `docs/visibility.md` | Comprehensive canonical guide | **Add API examples section** |
| `docs/recipes/index.md` line 30, lines 131-133 | Brief field mention in recipe structure table; status badges | No change (contextual reference only) |
| `docs/troubleshooting.md` line 33 | Links to visibility.md with "See also" | No change (already links correctly) |
| `docs/api/visibility-service.md` | API reference for RecipeVisibilityService | No change (API docs, not conceptual duplication) |
| `docs/api/models.md` line 33-36 | Lists `visibility` as Recipe field | No change (API docs) |
| `docs/index.md` line 25 | One-line feature mention | No change |

### Changes Required

#### 1. `docs/crafting-systems.md` -- Replace lines 204-279

Replace the entire "Recipe Visibility" section (from `### Recipe Visibility` through the two API code blocks, ending just before the `---` separator and `## Salvage`) with:

```markdown
### Recipe Visibility

Recipe visibility controls which players can see and access recipes in the crafting app. You configure this per crafting system in the **Recipe Visibility** feature card on the System tab of the Crafting Admin panel.

Fabricate supports three list modes:

| `listMode` value | Description |
|:----------------|:------------|
| `"global"` (default) | All recipes visible to all users |
| `"player"` | GM restricts individual recipes to named players |
| `"knowledge"` | Recipes discovered through gameplay via recipe items or learning |

For full details on each mode, knowledge sub-options, recipe items, the learn flow, and API configuration examples, see [Visibility & Knowledge]({% link visibility.md %}).
```

This removes approximately 75 lines of duplicated mode-by-mode explanations and API examples.

#### 2. `docs/visibility.md` -- Add API configuration section

Insert a new `## Configuring via the API` section just before the existing `## What's next?` section (before line 187). This preserves the two API code examples that were in `crafting-systems.md`:

```markdown
## Configuring via the API

You can set visibility programmatically through the `CraftingSystemManager`:

\```javascript
// Switch an Alchemy system to player-specific visibility
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: { listMode: 'player' }
  });
});
\```

\```javascript
// Switch to knowledge mode: players must own a recipe scroll to see the recipe,
// and the scroll is consumed when they learn it.
Hooks.once('fabricate.ready', async () => {
  const mgr = game.fabricate.getCraftingSystemManager();
  await mgr.updateSystem('alchemy-system-id', {
    recipeVisibility: {
      listMode: 'knowledge',
      knowledge: {
        mode: 'itemOrLearned',
        learn: { consumeOnLearn: true }
      }
    }
  });
});
\```
```

(Remove the backslash escapes on the code fences -- they are shown here only so this plan renders correctly.)

#### 3. No other file changes needed

The audit confirms no other docs pages contain duplicated visibility explanations. Contextual references in `recipes/index.md` and `troubleshooting.md` are brief and already link to `visibility.md`.

### File Change Summary

| File | Action |
|------|--------|
| `docs/crafting-systems.md` | Replace lines 204-279 with short summary table and link |
| `docs/visibility.md` | Add "Configuring via the API" section before "What's next?" |

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: Long visibility section in crafting-systems.md replaced | Replaced with 10-line summary + link |
| AC2: visibility.md contains full authoritative explanation | Already complete; API examples added |
| AC3: Duplicate mode-by-mode explanations removed | Removed from crafting-systems.md |
| AC4: Other mentions signal visibility.md as canonical | crafting-systems.md summary links directly; troubleshooting.md already links |
| AC5: Cross-links updated | crafting-systems.md links to visibility.md; existing cross-links verified |
| AC6: Docs-content audit confirms no conflicts | Audit table above shows all pages checked |

### Constraints

- Only modify `docs/crafting-systems.md` and `docs/visibility.md`.
- Do NOT edit spec/, src/, or test files.

---

## T-062 Plan -- Publish Item Piles Integration Guides and Macros

### Goal

Create first-class documentation and ready-to-use macro examples for integrating Fabricate with the Item Piles module. All new files live under `docs/integrations/` and are linked from the docs index.

### New Files

#### 1. `docs/integrations/index.md`
- Front matter: `title: Integrations`, `nav_order: 9`, `has_children: true`
- Short intro explaining that Fabricate can be extended with other FoundryVTT modules
- Links to the three child guides below

#### 2. `docs/integrations/item-piles-merchants.md`
- Front matter: `title: Item Piles -- Merchants`, `parent: Integrations`, `nav_order: 1`
- **Concept:** Use Item Piles merchant actors as ingredient vendors so players can buy crafting materials through the Item Piles merchant UI, then craft with Fabricate.
- **Step-by-step guide:**
  1. Install and enable Item Piles module
  2. Create a merchant actor via Item Piles
  3. Stock the merchant with items that are also Fabricate managed items (same source items / compendium entries)
  4. Players buy items from the merchant -- items land in player inventory
  5. Player opens Fabricate crafting UI -- purchased items are recognised as ingredients
  6. Craft as normal
- **Macro example -- "Check Merchant Stock vs Recipe Requirements":**
  - Given a recipe ID and a merchant actor, list which required ingredients the merchant sells and which are missing
  - Uses `game.fabricate.getRecipeManager().getRecipe()` and iterates ingredient sets
  - Cross-references merchant actor items to show availability and prices
  - Guard: `if (!game.modules.get('item-piles')?.active)` early return
- **Verification checklist** at bottom

#### 3. `docs/integrations/item-piles-currency.md`
- Front matter: `title: Item Piles -- Currency`, `parent: Integrations`, `nav_order: 2`
- **Concept:** Use Item Piles currency system alongside Fabricate crafting checks to charge players for crafting.
- **Step-by-step guide:**
  1. Configure Item Piles currencies for your game system
  2. Decide on a crafting cost per recipe (stored in recipe description or a flag)
  3. In a crafting check macro, use Item Piles API to verify and deduct currency
  4. Return `{ success: true/false }` based on currency availability
- **Macro example -- "Deduct Currency on Craft" (crafting check macro):**
  - Reads a cost from `scope.recipe` metadata
  - Uses `game.itempiles.API.getActorCurrencies(actor)` to check balance
  - Uses `game.itempiles.API.removeCurrencies(actor, currencies)` to deduct
  - Returns `{ success: true }` or `{ success: false }` if insufficient funds
  - Guard: checks Item Piles is active
- **Macro example -- "Refund Currency on Failure" (failure macro):**
  - Uses `game.itempiles.API.addCurrencies(actor, currencies)` to refund
  - Guard: checks Item Piles is active
- **Verification checklist** at bottom

#### 4. `docs/integrations/item-piles-time-gated.md`
- Front matter: `title: Item Piles -- Time-Gated Crafting`, `parent: Integrations`, `nav_order: 3`
- **Concept:** Combine Item Piles containers/vaults with Fabricate multi-step time-gated recipes.
- **Step-by-step guide:**
  1. Create an Item Piles container actor (e.g. "Workshop Bench")
  2. Use the container as a `componentSourceActor` in Fabricate so the engine draws ingredients from it
  3. Create a multi-step recipe with `timeRequirement` on one or more steps
  4. Players deposit ingredients into the container via Item Piles drag-and-drop
  5. Start the crafting run -- Fabricate validates ingredients from the container
  6. Time gate triggers; results appear after world time advances
- **Macro example -- "Start Time-Gated Craft from Container":**
  - Takes a container actor ID and recipe ID as editable constants
  - Gets the container actor via `game.actors.get()`
  - Gets the recipe via `game.fabricate.getRecipeManager().getRecipe()`
  - Calls `game.fabricate.getCraftingEngine().craft()` with `componentSourceActors` set to `[containerActor]`
  - Posts a chat message with the result
  - Guard: checks both modules are active
- **Verification checklist** at bottom

### Edits to Existing Files

#### 5. `docs/index.md`
- Add an "Integrations" row to the feature table:
  `| **Integrations** | Combine Fabricate with Item Piles for merchants, currency, and shared containers |`
- Add a bullet link to the integrations index in the bottom navigation

### Macro Validation Rules

All macros must:
- Use only API methods documented in `docs/api/` and `docs/macros/index.md`
- Reference `game.fabricate.getRecipeManager()`, `game.fabricate.getCraftingEngine()`, `game.fabricate.getCraftingRunManager()` -- not internal paths
- Use `game.itempiles.API.*` for Item Piles calls (the official public API)
- Include placeholder IDs clearly marked with comments like `// Replace with your recipe ID`
- Include a guard check for Item Piles: `if (!game.modules.get('item-piles')?.active)`

### Verification Checklist Template

Each guide ends with a manual verification checklist:
- [ ] Item Piles module is installed and active
- [ ] Fabricate module is installed and active
- [ ] All placeholder IDs/UUIDs replaced with your world values
- [ ] Macro runs without errors in the browser console (F12)
- [ ] Expected items/currencies are transferred/deducted correctly
- [ ] Crafting result appears in the correct actor's inventory

### AC Mapping

| AC | Covered By |
|----|-----------|
| 1. Merchants guide | `docs/integrations/item-piles-merchants.md` |
| 2. Currency guide | `docs/integrations/item-piles-currency.md` |
| 3. Time-gated guide | `docs/integrations/item-piles-time-gated.md` |
| 4. Three+ macro examples | Merchant stock checker, currency deduction, currency refund, time-gated craft start (4 macros) |
| 5. Under docs/, linked from index | `docs/integrations/` section + index.md updates |
| 6. Verification checklist | Each guide ends with a checklist; only IDs/UUIDs need replacing |

### Constraints

- Create/edit files only under `docs/integrations/` (new) and `docs/index.md`.
- Do NOT edit `docs/visibility.md`, `docs/crafting-systems.md`, or `docs/how-to/`.
- Do NOT edit `spec/`, `src/`, or test files.

## T-076 Plan - Add Task-Oriented `docs/how-to/` Documentation Section

### Overview

Create a new `docs/how-to/` directory with an index page and six concise, answer-first how-to guides. Update `docs/index.md` to link into the new section.

### File Boundaries

- Create: `docs/how-to/index.md`, plus six how-to pages
- Edit: `docs/index.md` (add how-to section entry)
- Do NOT edit: `docs/visibility.md`, `docs/crafting-systems.md` (Alpha stream owns those)

### Nav Structure

The `docs/how-to/` section uses Just the Docs parent/child nav:
- `docs/how-to/index.md` -- parent page, `nav_order: 10`, `has_children: true`
- Each how-to page -- `parent: How-To Guides`, sequential `nav_order`

### Files to Create

#### 1. `docs/how-to/index.md` (landing page)

Front matter: `title: How-To Guides`, `nav_order: 10`, `has_children: true`

Content:
- Brief intro: "Short, answer-first guides for common Fabricate tasks. Each page gives you the direct answer, the minimal steps, and links to deeper reference material."
- Table listing all six how-to pages with one-line descriptions:

| Guide | Question |
|:------|:---------|
| Skill-Check Recipes | How do I add a skill check to a recipe? |
| Recipe Discovery | How do I make players discover recipes during play? |
| Degrading Tools | How do I make tools degrade and break after repeated use? |
| Effect Transfer | How do I transfer active effects from ingredients to crafted items? |
| Shared Party Storage | How do I let players craft using items from a shared inventory? |
| Recipe Import/Export | How do I export recipes and import them into another world? |

#### 2. `docs/how-to/skill-check-recipes.md`

Front matter: `title: Skill-Check Recipes`, `parent: How-To Guides`, `nav_order: 1`

**Problem:** How do I add a skill check to a recipe so the outcome depends on a player's roll?

**Short answer:** Switch the crafting system to **tiered** or **progressive** resolution mode, write a Foundry macro that performs the roll and returns the result in the expected shape, then assign that macro's UUID to the system's crafting check configuration.

**Steps:**
1. Open the Crafting Admin panel, select your system, and change the **Resolution Mode** to Tiered or Progressive.
2. Create a new Script macro in Foundry. For tiered mode, return `{ success: boolean, outcome: string }`; for progressive mode, return `{ success: boolean, value: number }`.
3. In the system's **Crafting Check** settings, paste the macro's UUID into the **Check Macro** field and enable checks.
4. (Optional) Assign success and failure macro UUIDs for post-check side effects.
5. Configure `consumeIngredientsOnFail` and `consumeCatalystsOnFail` under Consumption on Failure.

**Learn more:**
- [Crafting Systems -- Crafting Checks]({% link crafting-systems.md %}#crafting-checks)
- [Tiered Mode]({% link recipes/tiered.md %})
- [Progressive Mode]({% link recipes/progressive.md %})
- [Macros -- Crafting Check contract]({% link macros/index.md %}#crafting-check-macro)

#### 3. `docs/how-to/recipe-discovery.md`

Front matter: `title: Recipe Discovery`, `parent: How-To Guides`, `nav_order: 2`

**Problem:** How do I make players discover recipes during play instead of seeing everything from the start?

**Short answer:** Set the crafting system's **list mode** to `"knowledge"`. Players will only see recipes they have learned or whose recipe item they possess.

**Steps:**
1. Open the Crafting Admin panel, select your system, and go to the **Recipe Visibility** card.
2. Change the **List Mode** to `Knowledge`.
3. Choose a **Knowledge Source** -- `item` (must own a linked item), `learned` (must explicitly learn), or `itemOrLearned` (either).
4. For each recipe, open the recipe editor and set a **Linked Recipe Item** -- either browse for an existing item or click **Create Recipe Item** to generate a new scroll/manual.
5. Optionally set **Consume on Learn** to `true` if you want recipe scrolls to be one-time-use.
6. Players can now discover recipes by finding recipe items in the world or learning them via drag-and-drop onto their character sheet.

**Learn more:**
- [Visibility & Knowledge]({% link visibility.md %})
- [Visibility & Knowledge -- Knowledge Modes]({% link visibility.md %}#knowledge-modes)
- [Recipes -- linkedRecipeItemUuid]({% link recipes/index.md %}#recipe-structure)

#### 4. `docs/how-to/degrading-tools.md`

Front matter: `title: Degrading Tools`, `parent: How-To Guides`, `nav_order: 3`

**Problem:** How do I make tools or workstations degrade and eventually break after repeated crafting use?

**Short answer:** Add the tool as a **catalyst** on the recipe with `degradesOnUse: true`, set a `maxUses` limit, and optionally enable `destroyWhenExhausted` to delete the item when it wears out.

**Steps:**
1. Add the tool item as a **managed item** in your crafting system's Items tab.
2. Open the recipe editor and add the managed item as a **catalyst**.
3. Enable **Degrades on Use** on the catalyst entry.
4. Set **Max Uses** to the number of crafts the tool survives (e.g. `50`).
5. If the item should be deleted from inventory when exhausted, enable **Destroy When Exhausted**. Otherwise the item remains but is marked exhausted.

**Learn more:**
- [Catalysts]({% link catalysts.md %})
- [Catalysts -- Usage Tracking]({% link catalysts.md %}#how-usage-tracking-works)

#### 5. `docs/how-to/effect-transfer.md`

Front matter: `title: Effect Transfer`, `parent: How-To Guides`, `nav_order: 4`

**Problem:** How do I make active effects from ingredients automatically transfer to crafted items?

**Short answer:** Enable both the **essences** and **effectTransfer** feature toggles on the system, configure essence definitions with source items that carry the desired active effects, and set `transferEffects: true` on each recipe that should inherit those effects.

**Steps:**
1. In the Crafting Admin panel, enable the **Essences** and **Effect Transfer** feature toggles for your system.
2. Under advanced options, define your essences (e.g. "Fire", "Frost") in the Essences card.
3. For each essence, set a **Source Item** -- this is the managed item whose active effects represent that essence.
4. Assign essence quantities to your managed ingredient items (e.g. Dragon Scale = 3 Fire, 1 Arcane).
5. In the recipe editor, enable **Transfer Effects** on recipes that should inherit effects from their ingredients' essences.
6. When a player crafts, the engine collects active effects from the source items of all contributing essences and applies them to the created result.

**Learn more:**
- [Crafting Systems -- Effect Transfer]({% link crafting-systems.md %}#effect-transfer)
- [Essences]({% link essences.md %})
- [Essences -- Effect Transfer via Essences]({% link essences.md %}#effect-transfer-via-essences)

#### 6. `docs/how-to/shared-party-storage.md`

Front matter: `title: Shared Party Storage`, `parent: How-To Guides`, `nav_order: 5`

**Problem:** How do I let players craft using ingredients stored in a shared party inventory or loot container?

**Short answer:** Add a shared actor (such as a party loot character) as a **component source actor** alongside the player's own character in the crafting app. Fabricate aggregates ingredients from all source actors.

**Steps:**
1. Create an actor in Foundry to represent the shared inventory (e.g. "Party Chest"). Give it the shared items.
2. Make sure all players who need access have at least Observer permission on the shared actor.
3. Open the crafting app, select the crafting character, and add the shared actor as an additional **component source** using the source actor picker.
4. The crafting app now shows combined ingredients from both the player's character and the shared actor.
5. When a recipe is crafted, ingredients are consumed from whichever source actors hold them.

**Learn more:**
- [Recipes -- The Crafting App]({% link recipes/index.md %}#the-crafting-app)
- [CraftingEngine API]({% link api/crafting-engine.md %})

#### 7. `docs/how-to/recipe-import-export.md`

Front matter: `title: Recipe Import/Export`, `parent: How-To Guides`, `nav_order: 6`

**Problem:** How do I export recipes from one world and import them into another?

**Short answer:** Use the **Export Recipes** macro to copy all recipes as JSON to your clipboard, then paste them into the **Import Recipes** macro in the target world.

**Steps:**
1. In the source world, create a new Script macro and paste the Export Recipes example macro code.
2. Run the macro. All recipes are serialised to JSON and copied to your clipboard. Check the browser console (F12) to see the output.
3. In the target world, create a new Script macro and paste the Import Recipes example macro code.
4. Paste your clipboard JSON into the `recipesJson` variable in the macro.
5. Run the macro. Choose **Overwrite Existing** to replace recipes with the same ID, or **Skip Existing** to keep the target world's versions.

**Learn more:**
- [Example Macros -- Export Recipes]({% link macros/examples.md %}#export-recipes)
- [Example Macros -- Import Recipes]({% link macros/examples.md %}#import-recipes)
- [Recipe Manager API]({% link api/recipe-manager.md %})

### Changes to `docs/index.md`

Add a new section after "Having trouble?" and before the end of the file:

```markdown
## How-to guides

Need a quick answer? The [How-To Guides]({% link how-to/index.md %}) cover common tasks like adding skill checks, setting up recipe discovery, and importing recipes.
```

Also add a row to the feature table:

```markdown
| **How-To Guides** | Quick answers to common crafting tasks |
```

### Page Template (consistent four-block structure)

Every how-to page follows exactly this structure:

```
## Problem
One sentence: "How do I ...?"

## Short answer
One paragraph with the direct answer.

## Steps
Numbered list of minimal UI or code steps to accomplish the task.

## Learn more
Bulleted links to reference pages for deeper reading.
```

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: New docs/how-to/ with index linked from nav | index.md with has_children, nav_order: 10 |
| AC2: Six pages added | skill-check-recipes, recipe-discovery, degrading-tools, effect-transfer, shared-party-storage, recipe-import-export |
| AC3: Four consistent blocks per page | Problem, Short answer, Steps, Learn more |
| AC4: Concise and answer-first | Each page targets short-form guidance |
| AC5: Cross-links valid | All links use `{% link ... %}` with verified file paths |
| AC6: Main docs home includes entry point | New section + table row in index.md |

### Constraints

- Do NOT edit `docs/visibility.md` or `docs/crafting-systems.md` (Alpha stream owns those).
- Only create/edit files under `docs/how-to/`, edit `docs/index.md`, and edit `BACKLOG.md`.

---

## T-058 Plan - Add Favourites and Recently Crafted Lists

### Overview

Add two quick-access sections to the CraftingApp: **Favourites** (user-pinned recipes) and **Recently Crafted** (automatically tracked). Both persist per user per world using FoundryVTT client-scoped settings. No changes to systems/ files or RecipeEditorApp.

### Architecture Decisions

1. **Storage**: Two new client-scoped settings in `src/config/settings.js`:
   - `FAVOURITE_RECIPES` — `Array` of recipe IDs, default `[]`. Client-scoped means each user in each world gets their own list automatically (FoundryVTT isolates client settings per user per world).
   - `RECENTLY_CRAFTED` — `Array` of `{ recipeId, timestamp }` objects, default `[]`, capped at 10 entries. Client-scoped for the same isolation.

2. **No flags on actors or recipes** — favourites/recents are purely UI preferences, not game data. Settings are the right storage layer.

3. **UI sections** — Two new collapsible sections appear above the main recipe list in the template when they have content. Favourites first, then Recently Crafted. When empty, the sections are hidden entirely (no empty-state chrome).

4. **Toggle mechanism** — A star icon button on each recipe card toggles favourite status. The button uses a `data-action="toggleFavourite"` attribute to wire into the existing ApplicationV2 action system.

5. **Recently Crafted tracking** — After a successful craft in `_onCraft`, the recipe ID and current timestamp are prepended to the recently-crafted list, deduplicated, and truncated to 10. This happens in CraftingApp only — no CraftingEngine changes.

### File Changes

#### 1. `src/config/settings.js`

Add two new keys to `SETTING_KEYS`:
```js
FAVOURITE_RECIPES: 'favouriteRecipes',
RECENTLY_CRAFTED: 'recentlyCrafted'
```

Add two new entries to `BASE_DEFINITIONS`:
```js
[SETTING_KEYS.FAVOURITE_RECIPES]: {
  name: 'Favourite Recipes',
  scope: 'client',
  config: false,
  type: Array,
  default: []
},
[SETTING_KEYS.RECENTLY_CRAFTED]: {
  name: 'Recently Crafted Recipes',
  scope: 'client',
  config: false,
  type: Array,
  default: []
}
```

#### 2. `src/ui/CraftingApp.js`

**New methods:**

- `_getFavourites()` — returns `this._getSetting(SETTING_KEYS.FAVOURITE_RECIPES) || []`
- `_setFavourites(ids)` — calls `this._setSetting(SETTING_KEYS.FAVOURITE_RECIPES, ids)`
- `_getRecentlyCrafted()` — returns `this._getSetting(SETTING_KEYS.RECENTLY_CRAFTED) || []`
- `_setRecentlyCrafted(entries)` — calls `this._setSetting(SETTING_KEYS.RECENTLY_CRAFTED, entries)`
- `_trackRecentCraft(recipeId)` — prepend `{ recipeId, timestamp: Date.now() }`, deduplicate by recipeId (keep most recent), truncate to 10, save.

**Changes to `_prepareContext`:**

After preparing `preparedRecipes`, compute:
- `favouriteIds` from `_getFavourites()`
- `recentEntries` from `_getRecentlyCrafted()`
- Add `isFavourite` boolean to each prepared recipe based on `favouriteIds.includes(recipe.id)`
- Build `favouriteRecipes` array: filter `preparedRecipes` to those in `favouriteIds`, preserving favouriteIds order
- Build `recentRecipes` array: map `recentEntries` to matching `preparedRecipes`, filter out nulls (deleted/invisible recipes). Each entry gets the recipe display data plus `craftedAt` timestamp.
- Add `favouriteRecipes`, `recentRecipes` to the returned context.

**New action handler:**

- `static async _onToggleFavourite(event, target)` — reads `target.dataset.recipeId`, toggles its presence in the favourites array, saves, re-renders.

Register `toggleFavourite: this._onToggleFavourite` in `DEFAULT_OPTIONS.actions`.

**Changes to `_onCraft`:**

After `result.success` block (after the chat message), call `this._trackRecentCraft(recipeId)`.

#### 3. `templates/crafting-app.hbs`

**Add favourite toggle button** to each recipe card's `.recipe-actions` div (before the existing details button):
```handlebars
<button
  type="button"
  class="details-btn favourite-btn {{#if isFavourite}}is-favourite{{/if}}"
  data-action="toggleFavourite"
  data-recipe-id="{{id}}"
  title="{{#if isFavourite}}Remove from favourites{{else}}Add to favourites{{/if}}"
>
  <i class="fas fa-star"></i>
</button>
```

**Add Favourites section** above the main recipe list (inside `{{#if recipes.length}}` block, before the `{{#each recipes}}` loop):
```handlebars
{{#if favouriteRecipes.length}}
  <div class="fabricate-quick-section favourites-section">
    <h4><i class="fas fa-star"></i> Favourites</h4>
    <div class="quick-recipe-list">
      {{#each favouriteRecipes}}
        <div class="quick-recipe-item" data-recipe-id="{{id}}">
          <img src="{{img}}" alt="{{name}}" class="quick-recipe-icon" />
          <span class="quick-recipe-name">{{name}}</span>
          <span class="badge">{{statusLabel}}</span>
          {{#if allowCraftAction}}
            <button type="button" class="craft-btn" data-action="craft" data-recipe-id="{{id}}" data-run-id="{{activeRunId}}">
              <i class="fas fa-hammer"></i> {{craftButtonLabel}}
            </button>
          {{/if}}
          <button type="button" class="details-btn favourite-btn is-favourite" data-action="toggleFavourite" data-recipe-id="{{id}}" title="Remove from favourites">
            <i class="fas fa-star"></i>
          </button>
        </div>
      {{/each}}
    </div>
  </div>
{{/if}}
```

**Add Recently Crafted section** after favourites, before main list:
```handlebars
{{#if recentRecipes.length}}
  <div class="fabricate-quick-section recent-section">
    <h4><i class="fas fa-clock"></i> Recently Crafted</h4>
    <div class="quick-recipe-list">
      {{#each recentRecipes}}
        <div class="quick-recipe-item" data-recipe-id="{{id}}">
          <img src="{{img}}" alt="{{name}}" class="quick-recipe-icon" />
          <span class="quick-recipe-name">{{name}}</span>
          <span class="badge">{{statusLabel}}</span>
          {{#if allowCraftAction}}
            <button type="button" class="craft-btn" data-action="craft" data-recipe-id="{{id}}" data-run-id="{{activeRunId}}">
              <i class="fas fa-hammer"></i> {{craftButtonLabel}}
            </button>
          {{/if}}
          <button type="button" class="details-btn" data-action="showDetails" data-recipe-id="{{id}}" title="Show recipe details">
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      {{/each}}
    </div>
  </div>
{{/if}}
```

#### 4. `tests/favourites-and-recents.test.js` (new file)

Test file using node:test and node:assert/strict, following the pattern in `tests/crafting-app-ui-actions.test.js`.

**Test cases:**

1. **Toggle favourite on** — calling `_onToggleFavourite` with a recipe ID adds it to the setting.
2. **Toggle favourite off** — calling it again removes it.
3. **Favourites persist via getSetting/setSetting** — verify the correct setting key is used.
4. **Recently crafted tracking** — `_trackRecentCraft` prepends a new entry.
5. **Recently crafted deduplication** — crafting the same recipe twice keeps only the most recent entry.
6. **Recently crafted cap at 10** — crafting 12 different recipes results in only 10 entries, oldest dropped.
7. **Favourites section in context** — `_prepareContext` includes `favouriteRecipes` when favourites exist and recipes match.
8. **Recently crafted section in context** — `_prepareContext` includes `recentRecipes` when recent entries exist and recipes match.
9. **Empty state** — when no favourites/recents exist, the arrays are empty (sections hidden by template conditionals).
10. **Invisible/deleted recipes excluded** — if a favourite recipe ID no longer appears in prepared recipes, it is omitted from `favouriteRecipes`.
11. **Sorting** — `favouriteRecipes` preserves insertion order; `recentRecipes` is sorted most-recent-first.
12. **Data isolation** — verify that the setting keys use `scope: 'client'` (check via `BASE_DEFINITIONS` import or by asserting the key names match expected constants).

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: Toggle favourite status | Star button with `toggleFavourite` action on each recipe card |
| AC2: Favourites section at top | Template renders `favouriteRecipes` section above main list |
| AC3: Recently crafted tracked and shown | `_trackRecentCraft` on successful craft; `recentRecipes` section in template |
| AC4: Persist via client-scoped settings | Two new `scope: 'client'` settings in settings.js |
| AC5: Data isolated per user per world | FoundryVTT client-scoped settings are inherently per-user-per-world |
| AC6: UI tests | 12 test cases in `tests/favourites-and-recents.test.js` |

### Constraints

- Only modify: `src/ui/CraftingApp.js`, `src/config/settings.js`, `templates/crafting-app.hbs`
- Only create: `tests/favourites-and-recents.test.js`
- Do NOT edit: `src/systems/`, `src/ui/RecipeEditorApp.js`, `docs/`, `spec/`

---

## T-055 Plan -- Add Built-In Roll/Check UI (No Macro Required)

### Goal

Allow GMs to configure crafting checks through UI fields instead of writing JavaScript macros. Add a `builtIn` check mode alongside the existing `macro` mode, with a system adapter layer for game-system-specific roll execution.

### Current State

- `CraftingSystemManager._normalizeCraftingCheck()` (line 123) produces `craftingCheck` with `macroUuid`, `mode`, `outcomes`, `consumption`, `progressive`.
- `CraftingEngine._runCraftingCheck()` (line 979) only resolves checks via `MacroExecutor.run(config.macroUuid, context)`.
- When `macroUuid` is absent and the mode requires a check, it returns a hard failure: `"${mode} mode requires a crafting check macro"`.
- The check result contract is `{ success, outcome, value, data, message }`.

### Design

#### 1. New `craftingCheck` Fields

Extend the `craftingCheck` object on the crafting system:

```javascript
craftingCheck: {
  // existing fields unchanged
  enabled: true,
  mode: 'passFail',           // unchanged
  macroUuid: null,             // unchanged
  // NEW: check source selection
  checkSource: 'macro',       // 'builtIn' | 'macro' -- default 'macro' for backward compat
  // NEW: built-in check configuration
  builtIn: {
    ability: '',               // e.g. 'str', 'dex', 'int' -- adapter-specific key
    skill: '',                 // optional skill key, e.g. 'arc', 'nat' -- empty means pure ability check
    dc: 15,                    // difficulty class (positive integer)
    advantage: 'normal'        // 'advantage' | 'disadvantage' | 'normal'
  },
  // existing fields preserved
  successMacroUuid: null,
  failureMacroUuid: null,
  consumption: { ... },
  progressive: { ... },
  outcomes: [...]
}
```

**Backward compatibility:** `checkSource` defaults to `'macro'`. Existing systems with `macroUuid` set continue to work unchanged. If `checkSource` is `'builtIn'` but no adapter is available, the engine falls back with a clear error.

#### 2. System Adapter Interface (`src/systems/CraftingCheckAdapter.js`)

Create a new file defining the adapter interface and a dnd5e reference implementation:

```javascript
export class CraftingCheckAdapter {
  constructor(systemId) { this.systemId = systemId; }
  
  // Returns list of abilities for the game system
  getAbilities() { return []; }
  
  // Returns list of skills for the game system
  getSkills() { return []; }
  
  // Execute a check and return normalized result
  // @returns {Promise<{success: boolean, outcome: string|null, value: number|null, data: object}>}
  async executeCheck(actor, config) { throw new Error('Not implemented'); }
}

export class Dnd5eCraftingCheckAdapter extends CraftingCheckAdapter {
  getAbilities() {
    return [
      { key: 'str', label: 'Strength' },
      { key: 'dex', label: 'Dexterity' },
      { key: 'con', label: 'Constitution' },
      { key: 'int', label: 'Intelligence' },
      { key: 'wis', label: 'Wisdom' },
      { key: 'cha', label: 'Charisma' }
    ];
  }
  
  getSkills() {
    return [
      { key: 'arc', label: 'Arcana' },
      { key: 'nat', label: 'Nature' },
      { key: 'med', label: 'Medicine' },
      // ... full list
    ];
  }
  
  async executeCheck(actor, config) {
    // Uses actor.rollAbilityCheck() or actor.rollSkill() depending on config.skill
    // Applies advantage/disadvantage
    // Compares total against config.dc
    // Returns normalized { success, outcome, value, data }
  }
}

// Registry
export class CraftingCheckAdapterRegistry {
  static _adapters = new Map();
  
  static register(systemId, adapterClass) { ... }
  static get(systemId) { ... }
  static has(systemId) { ... }
  
  // Auto-register known adapters at module init
  static initialize() {
    const gameSystemId = game.system?.id;
    if (gameSystemId === 'dnd5e') {
      this.register('dnd5e', Dnd5eCraftingCheckAdapter);
    }
    // Future: pf2e, etc.
  }
}
```

#### 3. CraftingEngine Changes (`src/systems/CraftingEngine.js`)

Modify `_runCraftingCheck()` (line 979) to branch on `checkSource`:

```
Current flow:
  config.macroUuid ? -> MacroExecutor.run() -> normalize result
  no macroUuid && checkRequired? -> fail "requires a crafting check macro"

New flow:
  if checkSource === 'builtIn':
    adapter = CraftingCheckAdapterRegistry.get(game.system.id)
    if !adapter:
      return { success: false, message: 'No system adapter available for built-in checks. Switch to macro mode or install a compatible game system.' }
    result = await adapter.executeCheck(craftingActor, config.builtIn)
    normalize and return result
  else (checkSource === 'macro' or unset):
    existing macro flow unchanged
```

The method signature and return shape remain identical. All downstream code (failure handling, resolution mode validation, run manager) is unaffected.

#### 4. CraftingSystemManager Normalization Changes

Update `_normalizeCraftingCheck()` to handle the new fields:

```javascript
_normalizeCraftingCheck(check = {}) {
  // ... existing normalization ...
  const checkSource = check?.checkSource === 'builtIn' ? 'builtIn' : 'macro';
  const builtIn = this._normalizeBuiltInCheck(check?.builtIn);
  return {
    // ... existing fields ...
    checkSource,
    builtIn
  };
}

_normalizeBuiltInCheck(config = {}) {
  const dc = Number(config?.dc);
  return {
    ability: String(config?.ability || '').trim().toLowerCase(),
    skill: String(config?.skill || '').trim().toLowerCase(),
    dc: Number.isFinite(dc) && dc >= 1 ? Math.floor(dc) : 15,
    advantage: ['advantage', 'disadvantage', 'normal'].includes(config?.advantage)
      ? config.advantage
      : 'normal'
  };
}
```

#### 5. ResolutionModeService Changes

Update `validateRecipe()` to accept built-in checks as valid when `checkSource === 'builtIn'`:

Currently line 32 checks: `const checkEnabled = system?.craftingCheck?.enabled === true || !!system?.craftingCheck?.macroUuid;`

Change to: `const checkEnabled = system?.craftingCheck?.enabled === true || !!system?.craftingCheck?.macroUuid || system?.craftingCheck?.checkSource === 'builtIn';`

### File Changes

| File | Action |
|------|--------|
| `src/systems/CraftingCheckAdapter.js` | **CREATE** -- Adapter interface, Dnd5e adapter, registry |
| `src/systems/CraftingEngine.js` | **EDIT** -- Branch `_runCraftingCheck()` on `checkSource` |
| `src/systems/CraftingSystemManager.js` | **EDIT** -- Add `checkSource`, `builtIn` normalization |
| `src/systems/ResolutionModeService.js` | **EDIT** -- Accept builtIn as valid check source |
| `tests/built-in-check.test.js` | **CREATE** -- Unit tests |

### Test Plan (`tests/built-in-check.test.js`)

#### Serialization / Normalization Tests
1. `_normalizeCraftingCheck` with `checkSource: 'builtIn'` preserves builtIn config
2. `_normalizeCraftingCheck` with missing `checkSource` defaults to `'macro'`
3. `_normalizeBuiltInCheck` with invalid dc defaults to 15
4. `_normalizeBuiltInCheck` with invalid advantage defaults to `'normal'`
5. `_normalizeBuiltInCheck` with empty ability normalizes to empty string

#### Adapter Tests
6. `CraftingCheckAdapterRegistry.get()` returns null for unknown system
7. `CraftingCheckAdapterRegistry.has()` returns true after registration
8. `Dnd5eCraftingCheckAdapter.getAbilities()` returns correct ability list
9. `Dnd5eCraftingCheckAdapter.getSkills()` returns correct skill list
10. `Dnd5eCraftingCheckAdapter.executeCheck()` returns pass when roll >= dc
11. `Dnd5eCraftingCheckAdapter.executeCheck()` returns fail when roll < dc

#### Engine Integration Tests
12. `_runCraftingCheck` with `checkSource: 'macro'` calls MacroExecutor (existing behavior)
13. `_runCraftingCheck` with `checkSource: 'builtIn'` calls adapter
14. `_runCraftingCheck` with `checkSource: 'builtIn'` and no adapter returns error
15. `_runCraftingCheck` with `checkSource: 'builtIn'` adapter error returns failure
16. Backward compat: system without `checkSource` uses macro path

#### ResolutionModeService Tests
17. `validateRecipe` accepts `checkSource: 'builtIn'` as valid for tiered mode
18. `validateRecipe` accepts `checkSource: 'builtIn'` as valid for progressive mode

### Acceptance Criteria Mapping

| AC | How Addressed |
|----|---------------|
| AC1: checkMode selection `builtIn` or `macro` | `checkSource` field on `craftingCheck`, normalized in `_normalizeCraftingCheck()` |
| AC2: builtIn provides configurable fields | `builtIn: { ability, skill, dc, advantage }` with normalization and defaults |
| AC3: Engine resolves via adapter, returns normalized payload | `CraftingCheckAdapter.executeCheck()` returns `{ success, outcome, value, data }` consumed by existing resolution modes |
| AC4: No adapter = clear fallback/error path | `_runCraftingCheck` returns `{ success: false, message: '...' }` when adapter missing |
| AC5: Unit tests cover serialization, defaults, adapter, failures | 18 test cases covering all paths |
| AC6: Backward compat for macro-based systems | `checkSource` defaults to `'macro'`, all existing code paths preserved |

### Constraints

- Edit only files under `src/systems/`, create new files under `src/systems/`, and create/edit test files.
- Do NOT edit `src/ui/CraftingApp.js` or `src/ui/RecipeEditorApp.js`.
- Do NOT edit `docs/` files (docs-writer handles those).

---

## T-060 Plan -- Redesign Recipe Editor UX for Complex Recipes

### Problem

The current recipe editor uses carousel pagination (prev/next buttons) for ingredient sets and result groups. When editing mapped or tiered recipes with many sets/groups, users can only see one at a time and must click through sequentially. This makes authoring complex recipes slow and error-prone.

### Design

Replace the carousel pattern for ingredient sets and result groups with an **accordion layout** where all panels are visible simultaneously in a vertical stack. Each panel is collapsible, reorderable via drag-handle, and maintains a stable `data-panel-id` attribute tied to the group's `id` field.

Key changes:

1. **Template**: Replace carousel prev/next controls with accordion panels rendered via `{{#each}}`. Each panel has a collapse toggle, drag handle, and inline action buttons.
2. **JS**: Remove `activeIngredientSetIndex` / `activeResultGroupIndex` pagination state. Replace with `collapsedPanels` Set tracking which panel IDs are collapsed. Add reorder logic. Keep all existing action handlers functional.
3. **Validation**: Attach `data-validation-target` attributes to panels and fields. When validation errors reference a specific group/set, scroll to and highlight the panel.
4. **Accessibility**: Accordion headers get `role="button"`, `aria-expanded`, `aria-controls`. Panels get `role="region"`, `aria-labelledby`. Drag handles have `aria-label`.
5. **Tests**: New test file covering create/edit flows for large mapped and tiered recipes.

### File Changes

| File | Action |
|------|--------|
| `src/ui/RecipeEditorApp.js` | Remove carousel index state, add accordion collapse/reorder state, update `_prepareContext` to pass all sets/groups, update action handlers, add `_onTogglePanel`/`_onReorderPanel` actions, update validation to anchor errors |
| `templates/recipe-editor-v2.hbs` | Replace carousel sections with accordion `{{#each}}` loops, add collapse/expand controls, drag handles, panel data attributes, ARIA attributes |
| `tests/recipe-editor-accordion.test.js` | New: regression tests for create/edit flows with large mapped and tiered recipes |

### Detailed Changes

#### 1. `src/ui/RecipeEditorApp.js`

**Constructor changes:**
- Remove `this.activeIngredientSetIndex` and `this.activeResultGroupIndex`
- Add `this.collapsedPanels = new Set()` to track collapsed panel IDs
- Add `this.ingredientSetOrder = []` and `this.resultGroupOrder = []` for reorder state

**New actions to register:**
- `toggleIngredientSetPanel` -- toggles panel ID in `collapsedPanels`, re-renders
- `toggleResultGroupPanel` -- toggles panel ID in `collapsedPanels`, re-renders
- `moveIngredientSetUp` / `moveIngredientSetDown` -- swap adjacent sets in the array, re-render
- `moveResultGroupUp` / `moveResultGroupDown` -- swap adjacent groups in the array, re-render

**Remove actions:**
- `prevIngredientSet`, `nextIngredientSet`, `prevResultSet`, `nextResultSet` -- no longer needed (keep them as no-ops briefly for backward compat, then remove)

**`_prepareContext` changes:**
- Instead of passing a single `ingredientSet` and `resultGroup`, pass `ingredientSets` (all, decorated) and `resultGroups` (all, decorated)
- Each set/group gets `panelId`, `isCollapsed`, `panelIndex` added by the context builder
- Validation errors get a `panelId` and `fieldSelector` so the template can anchor them

**`_syncDraftFromForm` changes:**
- Iterate all ingredient sets visible in the DOM (by `data-panel-id`) instead of just the active one
- Iterate all result groups similarly
- Use `data-set-index` / `data-group-index` attributes on form fields to associate inputs with their parent container

**`_clampActiveContainerIndices` removal:**
- This method managed pagination clamping. Replace with a simpler `_ensureMinimumContainers` that guarantees at least one set and one group exist.

**Action handler updates for set/group-specific actions:**
- `_onAddIngredientGroup`, `_onRemoveIngredientGroup`, `_onAddIngredientOption`, `_onRemoveIngredientOption`: These already take `data-group-index` from the target. Update them to also read `data-set-index` from the target so they operate on the correct set (not just the "active" one).
- `_onAddCatalystRow`, `_onRemoveCatalystRow`: Same -- read `data-set-index`.
- `_onAddResultRow`, `_onRemoveResultRow`: Read `data-group-index` from the target.

**Validation anchoring:**
- `_validatePayload` returns errors as objects: `{ message: string, panelId?: string, fieldName?: string }`
- `_prepareContext` maps these to `{ message, panelId, fieldSelector }` for the template
- On render, if errors exist, auto-expand collapsed panels that contain errors and scroll the first error into view

#### 2. `templates/recipe-editor-v2.hbs`

**Ingredient Sets section:**
Replace the carousel block (lines 198-421) with:

```handlebars
<section class="editor-block">
  <div class="section-header">
    <h3>Ingredient Sets</h3>
    {{#if showComplexRecipes}}
      <button type="button" data-action="addIngredientSet" title="Add Ingredient Set">
        <i class="fas fa-plus"></i> Add Set
      </button>
    {{/if}}
  </div>

  {{#each ingredientSets}}
    <article class="accordion-panel ingredient-set-panel"
             data-panel-id="{{panelId}}"
             data-set-index="{{panelIndex}}"
             aria-labelledby="ingredient-set-heading-{{panelId}}">
      <div class="accordion-header"
           id="ingredient-set-heading-{{panelId}}"
           role="button"
           aria-expanded="{{#unless isCollapsed}}true{{else}}false{{/unless}}"
           aria-controls="ingredient-set-body-{{panelId}}"
           data-action="toggleIngredientSetPanel"
           data-panel-id="{{panelId}}">
        {{#if ../showComplexRecipes}}
          <span class="drag-handle" aria-label="Reorder ingredient set">
            <i class="fas fa-grip-vertical"></i>
          </span>
        {{/if}}
        <i class="fas fa-chevron-{{#if isCollapsed}}right{{else}}down{{/if}} accordion-chevron"></i>
        <h4>{{name}}</h4>
        <span class="panel-summary">{{ingredientGroups.length}} groups, {{catalysts.length}} catalysts</span>
        {{#if ../showComplexRecipes}}
          <div class="accordion-actions">
            <button type="button" data-action="moveIngredientSetUp"
                    data-set-index="{{panelIndex}}" title="Move Up">
              <i class="fas fa-arrow-up"></i>
            </button>
            <button type="button" data-action="moveIngredientSetDown"
                    data-set-index="{{panelIndex}}" title="Move Down">
              <i class="fas fa-arrow-down"></i>
            </button>
            <button type="button" data-action="removeIngredientSet"
                    data-set-index="{{panelIndex}}" title="Remove Set">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        {{/if}}
      </div>

      {{#unless isCollapsed}}
        <div class="accordion-body" id="ingredient-set-body-{{panelId}}">
          <!-- Set name, ingredient groups, catalysts, mapping controls -->
          <!-- Same content as current template but with data-set-index on all inputs -->
        </div>
      {{/unless}}
    </article>
  {{/each}}
</section>
```

**Result Groups section:**
Same accordion pattern, replacing the carousel block (lines 426-501).

**Validation banner:**
Replace the flat `<ul>` of error strings with anchored error links:

```handlebars
{{#if validationErrors.length}}
  <div class="validation-banner" role="alert">
    <strong>Fix before saving:</strong>
    <ul>
      {{#each validationErrors}}
        <li>
          {{#if panelId}}
            <a href="#" data-action="scrollToError"
               data-panel-id="{{panelId}}"
               data-field="{{fieldSelector}}">{{message}}</a>
          {{else}}
            {{message}}
          {{/if}}
        </li>
      {{/each}}
    </ul>
  </div>
{{/if}}
```

**ARIA attributes summary:**
- Accordion headers: `role="button"`, `aria-expanded`, `aria-controls="<body-id>"`
- Accordion bodies: `role="region"`, `aria-labelledby="<header-id>"`
- Drag handles: `aria-label="Reorder ingredient set"` / `"Reorder result group"`
- Reorder buttons: descriptive `title` attributes

#### 3. `tests/recipe-editor-accordion.test.js`

Test cases:
1. **Create mapped recipe with 5 ingredient sets** -- build draft, verify all 5 sets appear in context, verify panel IDs are stable across re-renders
2. **Create tiered recipe with 3 result groups** -- verify all 3 groups in context
3. **Toggle collapse** -- verify `collapsedPanels` state toggles correctly and context reflects `isCollapsed`
4. **Reorder ingredient sets** -- move set index 2 up, verify set order changes, verify IDs are preserved
5. **Reorder result groups** -- same for result groups
6. **Edit across multiple sets** -- simulate form sync with fields from 2 different sets, verify both update correctly
7. **Remove middle set** -- remove set at index 1 of 3, verify remaining sets preserve their IDs
8. **Validation error anchoring** -- create recipe missing required fields in set 2, verify error references correct panelId
9. **Save payload equivalence** -- build payloads before and after accordion refactor for the same draft data, verify `_buildRecipePayload` produces identical output
10. **Large recipe stress** -- 10 ingredient sets with 3 groups each, verify context builds without error

### Backward Compatibility

- `_buildRecipePayload` output format is unchanged -- downstream consumers see no difference
- `_buildDraft` input normalization is unchanged -- existing recipes load correctly
- The `_assignSystemItem` method's drop-target handling is updated to use `data-set-index` instead of assuming the active index, but drop target names (`ingredient-new`, `catalyst-new`, etc.) remain the same

### Acceptance Criteria Mapping

| AC | How addressed |
|----|---------------|
| AC1: No forced carousel pagination | Accordion renders all sets/groups simultaneously |
| AC2: Collapsible/reorderable with stable IDs | `collapsedPanels` Set + move up/down actions; panel IDs from group `id` field |
| AC3: Core workflows equivalent | All existing action handlers preserved with updated index resolution |
| AC4: Validation errors anchor to section | Error objects carry `panelId`, template renders as clickable anchors |
| AC5: Keyboard/screen-reader labels | ARIA roles, expanded state, labels on all new interactive elements |
| AC6: Regression tests | `tests/recipe-editor-accordion.test.js` with 10 test cases covering mapped/tiered |

### Constraints

- Only modify `src/ui/RecipeEditorApp.js`, `templates/recipe-editor-v2.hbs`, and create `tests/recipe-editor-accordion.test.js`
- Do NOT edit `src/systems/`, `src/ui/CraftingApp.js`, or `docs/` files
- Do NOT change `_buildRecipePayload` output shape
- Do NOT change `_buildDraft` normalization logic
