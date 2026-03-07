# Specification 003: UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate.
This file is UI-only. Domain behaviour is defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Integration Points

### Items Directory

Add header actions:

- `Crafting` for all users.
- `Manage Crafting Systems` for GMs only.

### Compendium Directory

Provide GM action to import all items from a compendium into a crafting system.
Items with the same UUID or sourceUuid are de-duplicated on import.

## GM Crafting Admin

Tabs:

- Systems
- Items
- Essences (only when enabled)
- Recipes

### Systems Tab

Display list + detail editor for crafting systems.

#### Base Fields

- Name
- Description
- Resolution mode

Changing resolution mode is destructive and must follow `007` confirmation/cleanup rules.

#### Feature Controls

- Recipe categories toggle (`features.recipeCategories`)
- Item tags toggle (`features.itemTags`)
- Essences toggle (`features.essences`)
- Property macros toggle (`features.propertyMacros`)
- Effect transfer toggle (`features.effectTransfer`)
- Time requirements toggle (`requirements.time.enabled`)
- Currency requirements toggle (`requirements.currency.enabled`)
- Multi-step recipes toggle (`features.multiStepRecipes`)

#### Crafting Check Controls

- Enable checks
- Check macro
- Success macro
- Failure macro
- Failure consumption policy
- Tiered outcomes editor (tiered only)
- Progressive settings (`awardMode`, `allowPlayerReorder`) (progressive only)

Mode semantics are defined in `004`.

#### Requirements Controls

- Time toggle
- Currency toggle
- Currency provider (`system` or `macro`)
- Provider-specific fields

#### Recipe Visibility Controls

- `listMode` selector with options: `global`, `player`, `knowledge`
- `knowledge.mode` selector (only shown when `listMode === "knowledge"`)
- `item.limitUses` and `item.maxUses` (only shown when `listMode === "knowledge"` and item mode is active)
- `learn.consumeOnLearn` (only shown when `listMode === "knowledge"` and learned mode is active)
- `learn.dragDropEnabled` (only shown when `listMode === "knowledge"` and learned mode is active)

When `listMode === "global"`, no per-recipe player allow-list controls are shown.
Visibility and learning semantics are defined in `006`.

### Item Sheets

For actor-owned items, Fabricate may add item sheet header controls tied to recipe learning.

- When `learn.dragDropEnabled === false` and knowledge mode supports learning, show a header icon/button to manually learn matching recipes from that owned item.
- The manual learn control is shown only when the current user can update the owning actor and at least one matched recipe is learnable.
- Clicking the control opens a confirmation prompt before learning.
- On confirmation, run the learning flow from `006`, including `consumeOnLearn` behavior and item removal when required.
- If `learn.dragDropEnabled === true`, the manual header learn control is hidden by default.

### Items Tab

Capabilities:

- Add managed items from world or compendium.
- Remove managed items.
- Edit managed item tags (if enabled).
- Edit managed item essences (if enabled).
- Edit managed item difficulty (progressive mode).
- Replace associated source item by drag/drop.

### Essences Tab

Only shown when essences are enabled.

Capabilities:

- Create, edit, delete essence definitions.
- Set a FontAwesome icon for an essence (or fall-back to the default, `fas fa-mortar-pestle`)
- Set optional `sourceItemUuid` by picker/drag-drop.

### Recipes Tab

List recipes for the selected crafting system.

Columns:

- Name
- Locked
- Visibility summary (player and knowledge list modes only; hidden in global mode)
- Category (if enabled)
- Step count (if multistep enabled)
- Last modified (optional)

Actions:

- Create
- Edit
- Duplicate
- Delete

## Recipe Editor

Scoped to a single crafting system.

### Base Form

- Name
- Description
- Category (if enabled)
- Locked toggle

### Visibility Form

If `listMode === "global"`:

- No per-recipe visibility controls shown.
- Restricted visibility toggle and allowed users multiselect are hidden.

If `listMode === "player"`:

- Restricted visibility toggle
- Allowed users multiselect

If knowledge mode includes item matching or learning:

- Linked recipe item UUID picker (`linkedRecipeItemUuid`)
- Helper text: owned copies match by UUID or `flags.core.sourceId`
- `Create Recipe Item` helper action when unset

If the required linkage is missing, show a validation warning.

### Step Structure UI

If multistep is enabled:

- Step list with add/remove/reorder (drag and drop)
- One-step editor per step

If multistep is disabled:

- Show implicit single-step editors at the recipe level

## Step Editor

Per step controls:

- Step name and description
- Time requirement (when enabled)
- Currency requirement (when enabled)
- Ingredient set editor

Ingredient set editor supports:

- Add/remove ingredient sets
- Ingredient group editor per set:
  - Add/remove groups
  - Add/remove OR options within a group
  - Item placeholder options that match one or more configured system tags
- Catalysts grid per set
- Essences per set (when enabled)

Result editor changes by mode.
The UI must expose required data fields from `004`, but mode logic itself is defined in `004`.

### Simple UI

- One ingredient set
- Ingredient-group editor within that set (including OR options)
- One result group editor

### Mapped UI

- Ingredient sets can map to result groups via `resultGroupId`
- Result group editors for referenced groups

### Tiered UI

- Outcome-to-result-group routing editor
- Warn and require remap when outcomes list changes

### Progressive UI

- Ordered results editor
- Read-only difficulty badge per result item
- Drag reorder controls
- Reorder indicator if `allowPlayerReorder` is true

## Crafting App (Player)

### Actor and Sources

- Select crafting actor
- Select component source actors
- Persist last selections in client settings

### Recipe List

- Filter/search controls (category/tags if enabled)
- Row status badges from `006` evaluation, including:
  - Available
  - Locked
  - Unknown or missing knowledge
  - Exhausted recipe item uses
  - Missing materials

### Recipe Detail

- Show blocking reasons when not craftable.
- Show learn action when applicable.
- Show consume-on-learn warning text when applicable.

### Learn Flow

- Confirmation dialogue when learn consumes item.
- Success/failure notifications with actionable reasons.
- Refresh list/detail state after completion.
- The same learning flow must be invocable from the item sheet header learn control when drag-and-drop learning is disabled.

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `006`.

## Data Storage (UI-relevant)

All keys below use the literal `fabricate.*` namespace.

World settings:

- `fabricate.craftingSystems`
- `fabricate.recipes`

Client settings:

- `fabricate.lastCraftingActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- optional progressive order preferences

Flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
