# Specification 003: UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate v2.

A key UI rule: **If a crafting system feature is disabled, the crafting UI must not show controls for that feature** (not even disabled controls or helper text).

This specification includes UI requirements for **recipe visibility** and **learning**, as configured per crafting system. Behaviour is defined in **006-recipe-visibility.md**.

## Integration Points

### Items Directory

Add an “Item Directory” header button:

- **Craft Item** — visible to any user; opens the Player Crafting App.
- **Crafting Admin** — visible only to GMs; opens GM Crafting Admin.

### Compendium Directory (Optional)

Allow “Add to Managed Items” from compendium entries for GMs.

## GM Crafting Admin

GM Crafting Admin is a multi-tab application:

- **Systems**
- **Items**
- **Essences** (only shown if enabled)
- **Recipes**
- **Rules**

### Systems Tab

The Systems Tab displays a list of crafting systems and a detail view.

#### Base fields

- Name
- Description
- Resolution Mode (simple / mapped / tiered / progressive)
    - Changing resolution mode is destructive:
        - Must confirm
        - Deletes all recipes in the system
        - Clears in-progress runs that reference deleted recipes (if runs are persisted)

#### Feature cards

- Item Categories (enable/disable + define list)
- Item Tags (enable/disable + define list)
- Essences (enable/disable)
- Property Macros (enable/disable)
- Effect Transfer (enable/disable)
- Requirements: Time (enable/disable)
- Requirements: Currency (enable/disable, configure provider)
- Multi-step recipes (enable/disable)

#### Crafting Checks Card

Fields shown depend on `resolutionMode`:

- Universal:
    - Enable checks
    - Check Macro (macro drag and drop)
    - Success Macro (macro drag and drop; optional)
    - Failure Macro (macro drag and drop; optional)
    - On Failure Consumption:
        - Consume ingredients on fail (default true)
        - Consume catalysts on fail (default false)

- Tiered-only:
    - Outcomes list editor (unique strings)

- Progressive-only:
    - Award Mode (partial / equal / exceed)
    - Allow player reorder (boolean)

#### Requirements Card

- Time:
    - Enable or disable time requirements
    - Time uses the foundry game world time
- Currency:
    - Enable currency requirements
    - Provider selection: system / macro
    - Provider config UI:
        - system: adapter
          - If game system == `dnd5e` the default is fixed to the dnd5e adapter
          - If game system == `pf2e` the default is fixed to the pf2e adapter
          - If no supported adapter is found, show macro picker
        - macro: macro pickers for checkCurrency(actor, required) / decrementCurrency(actor, amount) / optional formatCurrency(amount)

#### Recipe Visibility Card

Configures how recipes are **listed** and how recipes are **made craftable** (knowledge gating).

- Listing mode (`recipeVisibility.listMode`):
    - **player** — recipes are visible based on per-recipe allowed players, default is all if not restricted
    - **knowledge** — recipes are visible based on the selected crafting actor’s knowledge/item state

- Knowledge mode (`recipeVisibility.knowledge.mode`):
    - **item** — craftable only if the crafting actor possesses the recipe item (optional limited uses)
    - **learned** — craftable only if the crafting actor has learned the recipe using a recipe item
    - **itemOrLearned** — craftable if the actor either has the item (with remaining uses) or has learned the recipe

Item options (shown when mode includes `item`):

- Limit uses (`limitUses`)
- Max uses (`maxUses`) (required if limitUses is true)

Learning options (shown when mode includes `learned`):

- Consume on learn (`consumeOnLearn`) (default true)

Notes:

- In item/learned/itemOrLearned modes, recipes should be configured with a `linkedRecipeItemUuid` to be craftable by players.
- Full behaviour is defined in **006-recipe-visibility.md**.

### Rules Tab

The rules tab allows editing settings that apply to all recipes in a crafting system.
These include:

- Crafting Check (enable/disable, macro drag and drop)
    - Required for progressive and tiered resolution modes
    - Success and Failure macros are configured in the Crafting Checks Card
- Recipe Visibility (enable/configure)

### Essences Tab

Essences Tab shows essences for the selected crafting system.
GMs can add new essences, modify existing ones, and delete them.
The tab is only shown if essences are enabled.

Capabilities:

- Create a new essence, with a unique ID, name, and description
- Select an icon for the essence
- Associate an item with the essence (drag and drop), or remove it
- Edit the essence name and description
- Delete the essence (remove it from all recipe ingredients)

### Items Tab

Items Tab shows managed items for the selected crafting system.

Capabilities:

- Add managed items via drag/drop from world items/compendium
- Remove managed items
- Edit item (opens item editor)
    - If tags enabled: tag editor
    - If essences enabled: essence editor (essence name + amount)
    - If progressive resolution mode: difficulty editor (numeric, minimum 1)
    - Drag and drop to change the associated game item
    - Remove the associated game item (makes the item invalid)

### Recipes Tab

Recipe list filtered by selected crafting system.

List columns:

- Name
- Locked (boolean)
- Visibility (summary badge)
- Category (only if enabled)
- Steps count (only if enabled)
- Last modified time (optional)

Actions:

- Create recipe
- Edit recipe
- Duplicate recipe
- Delete recipe

Visibility summary badge:

- If listMode is **player**:
    - `All Players` (restricted=false)
    - `Restricted (N users)` (restricted=true)
- If listMode is **knowledge**: do not display

## Recipe Editor

Recipe Editor is scoped to one crafting system.

### Structure

- Recipe base fields (name, description)
- Category selector (only if enabled)
- **Visibility & Locking** section (always shown; see below)
- If multi-step recipes enabled:
    - Step list editor:
        - Add step
        - Remove step (must have ≥ 1 step)
        - Reorder steps
        - Edit step (opens Step Editor)
    - Note: Recipe-level ingredient/result editors are NOT shown (steps contain these)
- If multi-step recipes NOT enabled:
    - Recipe has single implicit step
    - Show recipe-level ingredient and catalyst editor
    - Show recipe-level result editor (UI varies by resolution mode; see below)

### Visibility & Locking Section (per recipe)

Fields:

- Locked (`Recipe.locked`) toggle (default false)

If the crafting system `recipeVisibility.listMode === "player"`:

- Restricted visibility (`Recipe.visibility.restricted`, default false)
- Allowed users multi-select (Foundry user list) shown only when restricted=true

If the crafting system knowledge mode is `item`, `learned`, or `itemOrLearned`:

- Linked recipe item (`Recipe.linkedRecipeItemUuid`) UUID picker (world item / compendium item)
- Helper action: **Create Recipe Item** (if none set)
    - Creates a world item with a default scroll/paper icon, and the same name and description as the recipe
    - Stamps it with Fabricate recipe-item flags (craftingSystemId + recipeId)
    - Sets this recipe’s `linkedRecipeItemUuid` to the created item

If knowledge mode requires a linked recipe item and none is set, show a validation warning:

- “Recipe is not craftable for players until a linked recipe item is configured.”

## Step Editor

For each step:

- Step base fields: name, description, optional toggle
- Requirements:
    - Time requirement controls (only if time enabled in system)
    - Currency requirement controls (only if currency enabled in system)
- Ingredient Sets editor:
    - Add/remove ingredient sets
    - For each ingredient set:
        - name (optional)
        - ingredient visual grid (name, image, quantity)
        - per step catalyst visual grid (optional)
- Catalysts editor:
    - catalyst visual grid (name, image, quantity)

Step Results editor UI depends on system resolution mode.

### Simple Mode Step Results UI

- Select a single result group for the step
- Result group editor: results list (systemItemId, qty, propertyMacroUuid, allowEffectTransfer)

### Mapped Mode Step Results UI

- For each ingredient set: select a result group (dropdown)
- Result group editor exists for each referenced result group

### Tiered Mode Step Results UI

- For each declared outcome string: select a result group (dropdown)
- Result group editor exists for each referenced result group
- If outcomes list changes in the system:
    - recipe editor must prompt to remap or clear invalid mappings

### Progressive Mode Step Results UI

- Single result group with ordered results list
- For each result in order:
    - System item selector (dropdown/picker)
    - Item difficulty value (read-only badge, pulled from SystemItem.difficulty)
    - Quantity
- Drag to reorder results (changes crafting priority/order)
- If system `allowPlayerReorder` is enabled:
    - Show indicator that players can reorder during crafting
    - This affects which items they try to "purchase" first with their check value

**Note**: In progressive mode, item difficulty values are set on the SystemItem itself (in Items Tab), not per-result. The recipe editor displays these values read-only for GM reference. GMs should ensure all items used in progressive recipes have difficulty values set.

### Progressive Mode Player Experience

When crafting in progressive mode, the player experience uses a "currency spending" model:

**Before crafting:**
- Recipe shows ordered list of possible results with their difficulty (cost)
- If `allowPlayerReorder` is true, player can drag to reorder priorities
- Total difficulty sum is displayed as reference

**During crafting check:**
- Player performs crafting check (via macro)
- Check returns a numeric "currency" value

**After check (result determination):**
- System "purchases" items in order based on awardMode:
  - **partial**: Get items sequentially; last item granted even with insufficient currency (partial credit)
  - **equal**: Get items sequentially; must have enough remaining currency for each (≥ cost)
  - **exceed**: Get items sequentially; must have MORE than cost (> cost, strictly greater)
- Display which items were awarded and any remaining "currency"

**Visual feedback:**
- Show currency spending calculation step-by-step
- Highlight awarded vs. not-awarded results with visual distinction
- Explain why certain items weren't granted (e.g., "Not enough currency: had 7, needed 10")
- Show final tally: "Spent 15 currency, received 2 items"

## Crafting App (Player)

The Player Crafting App supports selecting the crafting actor, component sources, and executing recipe steps.

### Actor Selection

- Crafting Actor: owned actor
- Component Sources: one or more actors (owned or permitted)
- Persist last selections in user prefs:
    - `fabricate.lastCraftingActor`
    - `fabricate.lastComponentSources`
    - `fabricate.lastManagedCraftingSystem`

### Recipe Selection

Recipe listing must respect the selected crafting system’s recipe visibility configuration.

#### listMode = "player"

- Show only recipes the viewer is allowed to see based on `Recipe.visibility` rules.
- If a visible recipe is not craftable, show a status reason (e.g., Locked by GM, Needs recipe item, Not learned).

#### listMode = "knowledge"

- Require a crafting actor selection before listing recipes (recommended).
- Show recipes based on `knowledge.mode` evaluated against the selected crafting actor:
    - player: show recipes (subject to lock)
    - item: show recipes where actor has the recipe item (and remaining uses if limited)
    - learned: show recipes where actor has learned the recipe
    - itemOrLearned: show recipes where actor has item (with uses) or has learned

If a recipe is shown but not craftable (e.g., locked), show a status reason.

Filters:
- Filter by category/tags if enabled
- Optional search by name

Per recipe row, display:
- Name
- Category/tags (if enabled)
- Status:
    - **Available** (green check icon)
    - **Locked** (padlock icon)
    - **Needs recipe item: [Item Name]** (with item icon) - shows WHICH item is required
    - **Not learned** (with "Learn Now" quick action if item is present)
    - **No remaining uses: X/Y** (shows used count, e.g., "5/5 uses")
    - **Missing materials** (normal requirements; separate from visibility/knowledge)

### Recipe Detail View

If a recipe is not craftable, show concise blocking reason(s) with actionable guidance.

**Knowledge mode indicators:**

If learning is applicable (knowledge mode includes learned):
- Show **Learn Recipe** action when available
- Display clear message:
  - If `consumeOnLearn === true`: "Learning this recipe will consume the recipe item"
  - If `consumeOnLearn === false`: "Learning this recipe will keep the recipe item"
- Show recipe item status:
  - Present: "Recipe item '[Name]' found in inventory" (with icon)
  - Missing: "Recipe item '[Name]' required to learn" (with icon)

If item uses are applicable (knowledge mode includes item with limitUses):
- Show remaining uses badge: "Uses: X / Y remaining"
- If exhausted: "This recipe item has been fully used (X/Y uses)"
- Visual indicator: progress bar or fraction display

### Learn Recipe Flow

When the player clicks **Learn Recipe**:
- If `consumeOnLearn === true`, show confirmation dialog:
  - "Are you sure you want to learn this recipe? The recipe item will be consumed."
  - Include item name and icon in dialog
- Fabricate performs the learn operation defined in **006-recipe-visibility.md**
- On success:
    - Show success notification: "Recipe '[Recipe Name]' learned successfully"
    - If item consumed: "Recipe item '[Item Name]' has been consumed"
    - If item kept: "Recipe item '[Item Name]' can still be used"
    - Refresh the recipe list/detail state
- On failure:
    - Show actionable error message:
      - Missing item: "Recipe item '[Item Name]' not found in inventory"
      - Insufficient permissions: "You don't have permission to learn this recipe"
      - Already learned: "You have already learned this recipe"

### Crafting Run Guardrails

When a player starts/resumes a run, and before each step executes, Fabricate must re-check:
- recipe is still visible to the viewer (under current listMode rules)
- recipe is still craftable (lock/knowledge rules)

If checks fail (e.g., item removed mid-run, GM locks recipe):
- block and show an explanation

## Data Storage (UI-relevant)

World scope:
- `fabricate.craftingSystems`
- `fabricate.recipes`

Client scope:
- `fabricate.lastCraftingActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- Optional: `fabricate.progressiveOrderPreferences`

Actor flags:
- Learned recipes (actor-based): `flags.fabricate.learnedRecipes`
- Optional crafting runs: `flags.fabricate.craftingRuns`

## Compatibility

- The module must not require any specific game system.
- Currency integrations may provide system adapters (dnd5e, pf2e) but must be optional.
- Time requirements should default to Foundry world time if enabled, but must support macro/provider fallback.
- Recipe visibility relies on Foundry user IDs, actor ownership checks, and Fabricate item flags (no name matching).
