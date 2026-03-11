# Specification 003: UI Integration

## Purpose

Define Foundry UI integration points and user workflows for Fabricate.
This file is UI-only. Domain behaviour is defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`
- `009-gathering-and-harvesting.md`

Global rule: if a system feature is disabled, controls for that feature are hidden.

## Integration Points

### Items Directory

Add header actions:

- `Crafting` for all users.
- `Gathering` for all users, but only when at least one crafting system has `features.gathering === true`.
- `Manage Crafting Systems` for GMs only.

`Gathering` opens a dedicated gathering app. It must not reuse the crafting app shell or route.

The `Gathering` button is hidden when no crafting system exposes gathering.

### Compendium Directory

Provide GM action to import all items from a compendium into a crafting system.
Items with the same UUID or sourceUuid are de-duplicated on import.

## GM Crafting Admin

Tabs:

- Systems
- Items
- Essences (only when enabled)
- Recipes
- Environments (only when the selected system has `features.gathering === true`)

### Systems Tab

Display list + detail editor for crafting systems.

#### Base Fields

- Name
- Description
- Resolution mode (`simple`, `routed`, `progressive`, `alchemy`)

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
- Gathering toggle (`features.gathering`)

#### Crafting Check Controls

- Enable checks
- Check macro
- Success macro
- Failure macro
- Failure consumption policy
- Optional routed outcomes reference list (for GM guidance only; not a routing map)
- Progressive settings (`awardMode`, `allowPlayerReorder`) (progressive only)

Mode semantics are defined in `004`.

#### Requirements Controls

- Time toggle
- Currency toggle
- Currency provider (`system` or `macro`)
- Provider-specific fields

If `features.gathering === false`:

- the `Environments` tab is hidden
- the player-facing `Gathering` directory button is hidden when no other system enables gathering
- gathering environments for that system are not shown in runtime player flows

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

### Environments Tab

Only shown when `features.gathering === true` for the selected crafting system.

Capabilities:

- Create, edit, duplicate, enable/disable, and delete environments for the selected system
- Reorder environments in the GM list view
- Configure environment-level fields:
  - name
  - description
  - `selectionMode` (`targeted` or `blind`)
  - optional `sceneUuid`
- Configure task list per environment:
  - add/remove tasks
  - enable/disable tasks
  - edit task name, description, and image
  - edit visibility gate
  - edit catalysts
  - edit `timeRequirement`
  - edit resolution-specific fields (`resultSelection`, `progressive`, `resultGroups`, `failureOutcome`)

Validation rules from `009-gathering-and-harvesting.md` must be enforced before save.

The environments editor must block save when:

- `selectionMode === "blind"` and the environment has anything other than exactly one task
- `selectionMode === "targeted"` and the environment has zero tasks
- a task is missing required routed or progressive fields
- a task's result groups violate reserved failure keyword rules

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

### Routed UI

- Result selection provider selector:
  - `ingredientSet`
  - `macroOutcome`
  - `rollTableOutcome`
- `ingredientSet` provider UI:
  - Ingredient sets map to result groups via `resultGroupId`.
  - Validation enforces deterministic mapping for all satisfiable sets.
- `macroOutcome` provider UI:
  - Optional per-recipe macro override field.
  - Helper text states macro returns `{ outcome, description? }`.
  - Outcome routes by normalized match to `ResultGroup.name` (not by explicit mapping table).
- `rollTableOutcome` provider UI:
  - Roll table picker (`rollTableUuid`).
  - Helper text states drawn result name routes by normalized match to `ResultGroup.name`.
- Validation and helper copy must reserve failure keywords, including compatibility aliases such as former miss/hazard terms, and forbid them as result-group names.

### Alchemy Recipe UI (GM Editor)

- Uses the same provider selector as routed mode.
- Shows alchemy-only signature collision diagnostics spanning all recipes in the system.
- Save remains blocked until all collisions are resolved.

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

When system mode is `alchemy`, this list is replaced by the alchemy attempt panel for non-GM users.

### Recipe Detail

- Show blocking reasons when not craftable.
- Show learn action when applicable.
- Show consume-on-learn warning text when applicable.

### Alchemy Panel (Player)

- Shown when `CraftingSystem.resolutionMode === "alchemy"`.
- Replaces recipe browse-to-craft flow for non-GM users.
- Provides:
  - ingredient selection area
  - submit attempt action
  - specific attempt feedback message
- Must not leak hidden recipe metadata on invalid combinations or failed attempts.
- No-signature attempts are shown as failed attempts with specific feedback and ingredient consumption.
- If a matched attempt cannot route to a valid result group, show a misconfiguration error state (GM fix required) rather than a normal player-failure outcome.

### Learn Flow

- Confirmation dialogue when learn consumes item.
- Success/failure notifications with actionable reasons.
- Refresh list/detail state after completion.
- The same learning flow must be invocable from the item sheet header learn control when drag-and-drop learning is disabled.

### Run Guardrails

Before start/resume and before each step action, UI must invoke guard checks defined in `006`.

## Gathering App (Player)

This is a dedicated app distinct from the Crafting App.

It is opened from the `Gathering` header action in the Items directory and must not be combined into the crafting browse-to-craft workflow.

### App Availability

- The app is available only when at least one crafting system has `features.gathering === true`.
- If no crafting system exposes gathering, the Items directory must not show the `Gathering` action.

### Actor Selection

- Select the gathering actor.
- Persist the last selected actor in `fabricate.lastGatheringActor`.
- Only actors the user owns are selectable for non-GM users.

### Environment List

- Show only environments whose owning crafting system has `features.gathering === true`.
- Hide disabled environments for non-GM users.
- If an environment is scene-gated, show whether the selected actor currently meets the scene/token requirements.
- Display environment name, description, and selection-mode summary.

### Task Selection

If the environment is `targeted`:

- show one row/card per visible enabled task
- each task shows:
  - image
  - name
  - time requirement summary if present
  - catalyst summary
  - availability state

If the environment is `blind`:

- show one generic gather action for the single task
- do not expose alternate per-task choices to the player
- still show task-derived time requirement and requirement summaries where useful

### Start Gathering Flow

Before creating a run, the UI must check:

- game is not paused 
- the actor does not already have an active gathering run for the same `taskId`
- selected environment and task are enabled
- scene/token access rules pass when `sceneUuid` is configured
- task visibility gate passes for the selected actor
- required catalysts are available

If `task.timeRequirement` is absent:

- execute the gathering attempt immediately
- show the terminal result in the same interaction flow
- refresh task and run state

If `task.timeRequirement` is present:

- create the run
- show it immediately in the app's active-runs area with `waitingTime` status
- show the expected completion time derived from the world-time target
- notify the user that gathering has started rather than completed

### Active Runs

The Gathering App must include a dedicated active-runs section.

Each active run entry shows:

- environment name
- task name
- actor name
- status (`inProgress` or `waitingTime`)
- started time
- remaining or completion time when `timeGate` exists

The app must not allow starting a second active run for the same actor and `taskId`.
Instead it should show the existing run and an actionable blocking reason.

### Completion and Refresh

When a timed gathering run completes after world-time advancement:

- remove it from the active-runs section
- prepend it to gathering history
- surface the terminal result to the user when possible through notification, refreshed app state, or both

If the completion result is:

- `succeeded`: show created results
- `failed`: show failure feedback and any special-outcome text or macro result summary
- `cancelled`: show that the run became invalid due to missing references or destructive change

### History

The Gathering App should expose recent gathering history for the selected actor.

Each history row shows:

- environment
- task
- terminal status
- completion time
- summary of results or failure outcome

## Data Storage (UI-relevant)

All keys below use the literal `fabricate.*` namespace.

World settings:

- `fabricate.craftingSystems`
- `fabricate.recipes`
- `fabricate.gatheringEnvironments`

Client settings:

- `fabricate.lastCraftingActor`
- `fabricate.lastGatheringActor`
- `fabricate.lastComponentSources`
- `fabricate.lastManagedCraftingSystem`
- optional progressive order preferences

Flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`
- `flags.fabricate.gatheringRuns`

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
