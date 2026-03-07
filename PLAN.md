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
