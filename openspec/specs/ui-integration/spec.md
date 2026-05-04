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

## Product UI Visual Style

Fabricate's Foundry-facing product UI must use a clean flat visual style.

- Product UI surfaces, headers, buttons, overlays, and selected states must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`.
- Use solid colors or RGBA fills for shells, cards, headers, overlays, and controls.
- Visual hierarchy should come from spacing, typography, borders, and restrained shadows rather than decorative gradients or blur-based glass effects.
- Shared tokens in `styles/fabricate.css` and app-local editor tokens should be the source of truth for reusable surface treatments.
- Generated documentation output and third-party/vendor theme assets are out of scope for this rule unless they are explicitly restyled as Fabricate product UI.

## Responsive Product UI

Foundry ApplicationV2 windows can be resized independently of the browser viewport.
Responsive layout rules for application bodies must therefore be keyed to the app or shell container width, not only to viewport media queries.

- Use CSS container queries for application-specific narrow-window layout changes.
- The GM `Environments` editor responds to the admin main container width: list/editor panes stack, nested task/result/catalyst layouts collapse, independently scrollable regions remain usable, and save actions stay reachable.
- The player `Gathering` app responds to its own app container width: active/history regions collapse to one column, task rows reserve icon width, and row metadata stacks without horizontal overflow.
- These responsive rules are presentation-only. They must not change gathering runtime semantics, validation behavior, task visibility, attemptability, or persistence.

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

### Manager V2 Shell

Manager V2 is an additive GM management shell that reuses existing admin data, persistence, validation, import/export, and destructive-confirmation behavior unless a later spec explicitly changes that boundary.

Header hierarchy:

- The top bar shows breadcrumbs, the current page title, optional concise subtitle, and page actions.
- The top bar must not render redundant eyebrow/kicker labels that merely repeat the current view name, such as `Systems View` above `Crafting Systems`.
- Section headers inside the page may use short contextual labels when they add information, such as selected object state, but they must not duplicate adjacent title text.

Selected-system navigation:

- When no crafting system is selected, selected-system feature tabs are hidden and the systems browser is the active management surface.
- When a crafting system is selected, `System settings` is the first left-nav item and stays in that position regardless of feature gates.
- Feature-scoped left-nav items are visible only when their feature is enabled or otherwise available for the selected system.
- The root `Crafting Systems` breadcrumb returns to the systems browser. The selected-system breadcrumb opens that system's in-manager System settings route.
- The selected-system rail scope is a clear-selection control: activating it clears the real selected-system store state and returns to the unselected systems browser.

Rail and count layout:

- The selected-system rail scope has stable geometry. Long system names are visually prominent but are capped or truncated before they can overflow the rail or move nav buttons below it.
- Count facts in the right inspector use a grid. Enabled facts render as an inline phrase that keeps the value and first label word together when wrapping, for example `3 Gathering` on the first line and `environments` on the next.
- Disabled feature counts are label-first with the disabled value emphasized, for example `Gathering environments Off`, not `Off Gathering environments`.
- Count fact labels wrap at word boundaries and are not clipped or ellipsized except where a fixed navigation/control region explicitly requires truncation.

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

#### Feature Toggles

- Gathering: persists `features.gathering` and makes the selected system's gated `Environments` tab reachable when enabled.

#### Feature Controls

- Category list editor for custom categories only; reserved `General` is always present and not removable
- Item tag list editor
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

#### Recipe Item Definition Controls

The GM admin must expose a recipe-item management surface for the selected crafting system.

Capabilities:

- Add recipe item definitions from world or compendium items by drag/drop or picker
- Remove recipe item definitions
- Show source-linked name and image preview
- Warn when a recipe item definition's source item no longer resolves

Recipe item definitions are distinct from components:

- adding a recipe item definition must not add or require a component entry
- selecting a recipe item for knowledge gating must not require importing that item into the component library

When `listMode === "global"`, no per-recipe player allow-list controls are shown.
Visibility and learning semantics are defined in `006`.

### Item Sheets

For actor-owned items, Fabricate may add item sheet header controls tied to recipe learning.

- When `learn.dragDropEnabled === false` and knowledge mode supports learning, show a header icon/button to manually learn matching recipes from that owned item.
- The manual learn control is shown only when the current user can update the owning actor and at least one matched recipe is learnable.
- When an owned item matches recipes from multiple systems, the header control reflects only the manual-learning subset: matching recipes whose systems have `learn.dragDropEnabled === false`.
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

Current GM editor behavior:

- The tab is hidden when the selected system does not enable gathering.
- The admin shell falls back to a visible tab when system or feature changes make `Environments` unavailable.
- The tab loads the selected system's environment list from the gathering environment store.
- Environment list and draft records are cloned before exposure to the Svelte view.
- The selected draft can edit environment name, description, enabled state, `selectionMode`, and optional `sceneUuid`.
- The selected draft can add, select, duplicate, delete, and reorder tasks.
- The selected task can edit `name`, `description`, `img`, `enabled`, and `resolutionMode`.
- The selected task can add, rename, delete, and reorder result groups.
- The selected task can add, edit, delete, and reorder component-based results within a result group.
- Editable result fields are `componentId` and `quantity`.
- The selected task can add, edit, and delete catalysts.
- Editable catalyst fields are `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`.
- Catalyst `maxUses` is validation- and runtime-relevant only when `degradesOnUse === true`; when degradation is disabled, `maxUses` is ignored.
- The selected task can enable, edit, and clear a visibility gate.
- Visibility-gate authoring supports the canonical `macro`, `dnd5e`, and `pf2e` providers: `macro` uses an available script macro, while `dnd5e` and `pf2e` use `formula` and `threshold`.
- Incomplete visibility provider input is local UI state only and must not be sent to the environment store until the provider-required fields are present. Clearing visibility calls the store only when a committed visibility gate exists.
- The selected routed task can edit `resultSelection.provider` as `macroOutcome` or `rollTableOutcome`.
- Routed `macroOutcome` authoring uses available script macro options for `macroUuid`.
- Routed `rollTableOutcome` authoring uses a UUID text input for `rollTableUuid`.
- The selected progressive task can edit `progressive.awardMode` as `equal`, `partial`, or `exceed`.
- Progressive check authoring supports `macro`, `dnd5e`, and `pf2e` providers: `macro` uses an available script macro, while `dnd5e` and `pf2e` use `formula` and optional `threshold`.
- Progressive difficulty is displayed from the selected managed component difficulty; result-level inline difficulty is not persisted.
- Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups.
- Task, result-group, result, catalyst, visibility, result-selection, progressive, check, time-requirement, and failure-outcome mutations preserve other nested task configuration.
- Dirty state is tracked for the selected draft, and save/cancel affordances are visible.
- Creating a new environment persists a disabled draft shell with one disabled placeholder task for validation compatibility. New draft placeholder result groups receive immediate IDs so they can be edited before save/reload. This shell is not a configured player-visible gathering path until configured and enabled by the GM.
- Duplicate, delete, and reorder actions use gathering environment store methods.
- Delete requires confirmation and cleans referenced active and historical gathering runs through the store.
- Store-owned task/result/catalyst/visibility/result-selection/progressive/check/time-requirement/failure-outcome callbacks are delegated through the admin store and remain inside the environment draft save/cancel flow.
- The selected-task time-requirement editor supports clearing `timeRequirement` for immediate resolution and editing minutes, hours, days, months, and years for timed tasks.
- The selected-task failure-outcome editor supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields.
- Save-blocking validation exposes a localized summary, inline field-addressable errors, `aria-invalid`, `aria-describedby`, keyboard focus to the first invalid field after failed save, and persistent stale-reference warnings.
- Narrow-window layout behavior is implemented with app/container-width rules so list/editor panes and advanced controls remain reachable in resized Foundry windows.

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
- Category (if enabled; always includes reserved `General`)
- Locked toggle

### Visibility Form

If `listMode === "global"`:

- No per-recipe visibility controls shown.
- Restricted visibility toggle and allowed users multiselect are hidden.

If `listMode === "player"`:

- Restricted visibility toggle
- Allowed users multiselect

If knowledge mode includes item matching or learning:

- Recipe item selector / drop zone bound to `recipeItemId`
- Preview of the selected system recipe item definition (name, image, and source status)
- Clear action for removing the current recipe item reference
- Helper text: owned copies match by UUID or resolved source UUID of the selected recipe item definition

If the required linkage is missing, show a validation warning.

The canonical recipe-editor flow must not require manual UUID entry for recipe items.
The selector should follow the same drag/drop-first interaction pattern used elsewhere for component and essence-source selection.

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

- A persistent app header appears above the tab content and replaces separate
  `Craft With` and `Using Components From` form controls.
- The left side of the header shows the currently selected crafting actor's
  image/avatar and name. The default and last-selection resolution order is the
  same as the crafting store selection behavior.
- Clicking the selected crafting actor image or name opens a searchable,
  scrollable dropdown of available crafting actors. Each row shows actor image
  and name.
- The right side of the header shows `Component Sources` and a row of selected
  component source actor images/avatars.
- Component source names are hidden by default and revealed on hover over each
  selected source avatar.
- Right-clicking a selected component source avatar removes that source.
- The selected crafting actor is always included as a component source and
  cannot be removed from component sources.
- Changing the selected crafting actor moves this required component source
  from the previous crafting actor to the newly selected crafting actor.
- An edit control beside the source avatars opens a searchable, scrollable
  dropdown of owned actors for selecting or deselecting component sources. Each
  row shows actor image and name.
- Persist last selections in client settings
- Actor/source selection is shared across both tabs (rendered above tab content)

### Top-Level Tabs

- **Alchemy tab**: shown when >= 1 crafting system has `resolutionMode === "alchemy"`
- **Crafting tab**: shown when >= 1 crafting system has a non-alchemy resolution mode
- If only one tab type exists, show that tab without a tab bar
- If both exist, show tab bar; default to last-used or Crafting

### Crafting Tab

#### Recipe List

- Filter/search controls (category/tags if enabled)
- Row status badges from `006` evaluation, including:
  - Available
  - Locked
  - Unknown or missing knowledge
  - Exhausted recipe item uses
  - Missing materials

#### Recipe Detail

- Show blocking reasons when not craftable.
- Show learn action when applicable.
- Show consume-on-learn warning text when applicable.

#### Shopping List Panel

- Session-scoped aggregation of materials needed for queued recipes.
- Shown only on the Crafting tab.

#### Recents Section

- Recently crafted recipes for quick access.

#### Run Summary

- Active and historical crafting runs.

### Alchemy Tab

#### Alchemy System Selector

- Shown only when multiple alchemy-mode systems exist.
- Auto-selects if exactly one alchemy system is available.
- Persisted in client settings.

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- Shows: image, name, available quantity (inventory minus workbench count).
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench.
- Right-click: remove one from workbench (only if component is in workbench).
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3").
- Each unique component appears once; adding increments the badge count.
- Supports: add from palette, remove (right-click or direct action), clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules in `004`.

#### Discovered Recipes Panel

- Always visible on the right side, with empty state when no recipes have been discovered.
- Shows recipes from selected alchemy system where crafting actor has entry in `learnedRecipes`.
- GM sees all recipes in panel (consistent with GM-sees-all rule).
- Searchable by recipe name.
- "Craftable only" filter: shows only recipes whose requirements can be fully satisfied by palette quantities.
- Auto-fill action per recipe: populates the workbench from the recipe's ingredient requirements (per Auto-Fill algorithm in `006`).
- Visibility and learning semantics defined in `006`.

#### Active Runs and History

- Filtered to alchemy systems only.

#### Excluded from Alchemy Tab

- Shopping list
- Recipe browse list
- Recents
- Favourites

### Alchemy Attempt Feedback

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
- Actor selection is permission-based, not actor-type-based; actor types such as `npc`, `group`, or `character` are valid when the user has the required ownership/permission.

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

- show the terminal `startAttempt` result in the same interaction flow
- present success with created result summary when details are visible
- present failure without implying any gathered result items were created
- refresh task and run state

If `task.timeRequirement` is present:

- create the run
- show it immediately in the app's active-runs area with `waitingTime` status
- show the expected completion time derived from the world-time target
- notify the user that gathering has started rather than completed
- do not show terminal feedback until the timed-completion slice resolves the run

### Active Runs

The Gathering App must include a dedicated active-runs section.

Each active run entry shows:

- environment name
- task name for `targeted` environments, or a localized generic label for `blind` environments
- actor name
- status (`inProgress` or `waitingTime`)
- started time
- remaining or completion time when `timeGate` exists

The app must not allow starting a second active run for the same actor and `taskId`.
Instead it should show the existing run and an actionable blocking reason.
For `blind` environments, duplicate-run blockers, notifications, and terminal feedback must also use localized generic labels instead of the real task name.

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
- task for `targeted` environments, or a localized generic label for `blind` environments
- terminal status
- completion time
- summary of results or failure outcome

In `blind` environments, real task names remain GM-only in player-facing active runs, history rows, duplicate-run blockers, notifications, and terminal feedback.

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
- `fabricate.lastAlchemySystem`
- optional progressive order preferences

Flags:

- `flags.fabricate.learnedRecipes`
- `flags.fabricate.craftingRuns`
- `flags.fabricate.gatheringRuns`

## Compatibility

- Must remain system-agnostic.
- Currency adapters are optional.
- Visibility uses Foundry user IDs, ownership, and Fabricate flags/UUID identity rules.
