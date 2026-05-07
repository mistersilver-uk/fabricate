# Specification 009: Gathering and Harvesting

## Purpose

Define Fabricate's environment-based gathering workflow and clarify the domain boundary for harvesting.
This spec introduces environmental resource acquisition without introducing a separate harvesting subsystem.

Related specifications:

- `003-ui-integration.md` for UI surfaces and workflows
- `004-resolution-modes.md` for shared routed/progressive concepts
- `005-recipes-and-steps.md` for recipe and salvage lifecycle
- `007-destructive-changes-and-migrations.md` for clean-up and destructive-change principles

## Terminology

This spec uses the following terms exactly:

- **Gathering**: acquiring resources from the environment.
- **Harvesting**: breaking down a monster, corpse, plant, or other component into smaller parts. Harvesting is not its own feature; it is expressed through recipes or salvage for that specific component.
- **Environment**: a location where gathering occurs. An environment defines what can be gathered there and how gathering attempts are resolved.

To avoid collision with `CraftingSystem.resolutionMode` from `004-resolution-modes.md`, this spec uses:

- **Environment selection mode** for `targeted` vs `blind`
- **Task resolution mode** for `progressive` vs `routed`

## Scope

This spec governs:

- environment records and gathering-task structure
- targeted vs blind gathering selection
- scene, pause, visibility, and permission gating
- gathering time requirements and active-run behavior
- routed and progressive gathering-task resolution
- failure outcomes and special failure feedback
- persistence for active and historical gathering runs
- the boundary between gathering and harvesting

This spec does not introduce:

- a standalone harvesting subsystem
- ingredient-set-based gathering
- map authoring, travel simulation, or encounter generation
- hardcoded system-specific skill logic in core

## Domain Boundary

### Gathering

All gathering occurs within an environment.
An actor does not gather from an abstract global pool; they gather from a specific configured environment.

### Harvesting

Harvesting a specific thing already in hand or already defeated is not modeled as environment gathering.
Examples:

- carving a basilisk corpse into eyes, glands, and hide
- stripping bark from a felled treant branch
- breaking down a monster trophy into alchemical parts

These workflows must be expressed as one of the following:

1. A recipe whose ingredient is the harvested component.
2. A salvage definition on the harvested component.

UI copy or GM-provided description/name may still use the verb "harvest" for flavor, but the underlying model remains recipe or salvage data, not a separate harvesting feature.

## Data Model References

This spec reuses the following structures from `002-data-models.md`:

- `CraftingSystem`
- `Component`
- `Catalyst`
- `ResultGroup`
- `Result`

Gathering tasks have no `IngredientSet` objects. Gathering resolves from environment/task configuration only.

All settings keys in this specification use the literal `fabricate.*` namespace.

## GatheringEnvironment

### Purpose

Represent one configured place where gathering can occur for one crafting system.

### Properties

```js
GatheringEnvironment = {
  id: string,
  craftingSystemId: string,
  name: string,
  description?: string,
  enabled: boolean,
  selectionMode: "targeted" | "blind",
  sceneUuid?: string | null,
  region?: string,
  biomes?: string[],
  dangerTags?: string[],
  hazardSelectionMode?: "highestRankedDrop" | "allDrops",
  hazardPolicy?: "successWithHazard" | "failureWithHazard",
  enabledTaskIds?: string[],
  disabledTaskIds?: string[],
  enabledHazardIds?: string[],
  disabledHazardIds?: string[],
  tasks: GatheringTask[],
}
```

### Requirements

1. `craftingSystemId` must reference an existing `CraftingSystem`.
2. `selectionMode` must be either `"targeted"` or `"blind"`.
3. If `selectionMode === "targeted"`, the environment must define at least one task.
4. If `selectionMode === "blind"`, the environment must define exactly one task.
5. If `sceneUuid` is present, it references the scene where player self-service gathering is allowed.
6. Disabled environments are never attemptable by non-GM users and are hidden from normal player gathering flows.
7. `region` is single-select; `biomes` and `dangerTags` are multi-select tag lists.
8. Weather and time of day are not environment fields. They are global gathering conditions used when matching reusable tasks and hazards.
9. `enabledTaskIds`, `disabledTaskIds`, `enabledHazardIds`, and `disabledHazardIds` store environment-level composition toggles for reusable library records without rewriting the library definitions.

## Global Gathering Conditions

### Purpose

Represent the current weather/time-of-day state used by gathering listing, matching, and attempts.

### Properties

```js
GatheringConditionConfig = {
  conditions: {
    weather: string,
    timeOfDay: string,
  },
  vocabularies: {
    regions: string[],
    biomes: string[],
    danger: string[],
    weather: string[],
    timeOfDay: string[],
  },
}
```

### Requirements

1. Default weather is `"clear"` and default time of day is `"day"`.
2. Default regions are empty. Default biomes are `forest`, `grassland`, `mountain`, `cave`, `coastal`, `swamp`, `desert`, `urban`, `ruins`, and `wasteland`.
3. Default danger tags are `safe`, `hazardous`, `dangerous`, and `deadly`.
4. Default weather tags are `clear`, `cloudy`, `rain`, `storm`, `snow`, `fog`, and `wind`.
5. Default time-of-day tags are `dawn`, `day`, `dusk`, and `night`.
6. GM-customized vocabularies are preserved. Defaults are seeded only when a custom list is absent or empty.
7. `game.fabricate.gathering.getConditions()` returns current conditions and available tag vocabularies for GM and player-facing callers.
8. `game.fabricate.gathering.setWeather(weatherTag)`, `setTimeOfDay(timeOfDayTag)`, and `setConditions({ weather, timeOfDay })` require a GM user, validate tags against the configured vocabularies, persist the setting, dispatch `fabricate.gathering.conditionsUpdated`, and refresh gathering listings.
9. Player-facing callers may read conditions but may not mutate them.

## Reusable Gathering Task Library

### Purpose

Represent GM-authored gathering tasks that can be composed into multiple environments for a crafting system.

### Properties

```js
GatheringTaskDefinition = {
  id: string,
  name: string,
  description?: string,
  img?: string,
  enabled: boolean,
  region?: string,
  biomes?: string[],
  weather?: string[],
  timeOfDay?: string[],
  dropRows: Array<{
    id: string,
    componentId?: string,
    itemUuid?: string,
    quantity: number,
    dropRate: number,
    enabled: boolean,
  }>,
  itemSelectionMode: "highestRankedDrop" | "allDrops",
  staminaCost?: number,
  gatheringModifier?: ModifierProvider,
}
```

### Requirements

1. Definitions are scoped to one crafting system.
2. Disabled definitions never match for player gathering.
3. Empty match tags mean "matches any" for that dimension.
4. Region matches when omitted or equal to the environment region.
5. Biomes match when omitted or at least one task biome is present on the environment.
6. Weather and time of day match against the current global gathering conditions.
7. Drop rows require a `dropRate` integer from 1 to 100, a positive quantity, and either a component reference or item UUID.
8. Row order is authoritative for `highestRankedDrop`.

## Reusable Gathering Hazard Library

### Purpose

Represent GM-authored hazard outcomes that can be composed into environments by tag matching.

### Properties

```js
GatheringHazardDefinition = {
  id: string,
  name: string,
  description?: string,
  img?: string,
  enabled: boolean,
  dangerTags?: string[],
  region?: string,
  biomes?: string[],
  weather?: string[],
  timeOfDay?: string[],
  dropRate: number,
  hazardModifier?: ModifierProvider,
}
```

### Requirements

1. Definitions are scoped to one crafting system.
2. Disabled definitions never match for player gathering.
3. Empty match tags mean "matches any" for that dimension.
4. Danger matches when omitted or at least one hazard danger tag is present on the environment.
5. Region, biome, weather, and time-of-day matching use the same rules as reusable task definitions.
6. `dropRate` must be an integer from 1 to 100.

## GatheringTask

### Purpose

Represent one attemptable gathering activity within an environment.

### Properties

```js
GatheringTask = {
  id: string,
  name: string,
  description?: string,
  img?: string,  // default is 'icons/svg/item-bag.svg'
  enabled: boolean,

  resolutionMode: "progressive" | "routed" | "d100",

  catalysts: Catalyst[],
  visibility?: GatheringVisibilityGate,
  timeRequirement?: {
    minutes?: number,
    hours?: number,
    days?: number,
    months?: number,
    years?: number,
  },
  check?: GatheringCheck,

  // Used by both routed and progressive modes.
  resultGroups: ResultGroup[],

  // Present only when resolutionMode === "routed".
  resultSelection?: {
    provider: "macroOutcome" | "rollTableOutcome",
    macroUuid?: string,
    rollTableUuid?: string,
  },

  // Present only when resolutionMode === "progressive".
  progressive?: {
    awardMode: "partial" | "equal" | "exceed",
  },

  failureOutcome?: SpecialOutcome,
}
```

### Requirements

1. `resolutionMode` must be `"progressive"`, `"routed"`, or gathering-native `"d100"`.
2. Gathering tasks have no ingredients. Any configuration that depends on `IngredientSet` or `ingredientSet` routing is invalid.
3. `failureOutcome` is optional, but task failure must still be supported at runtime by applying default failure feedback when no special outcome is configured.
4. `failureOutcome` applies whenever routed or progressive resolution ends in failure, including when a provider returns compatibility aliases from the former miss-family or hazard-family keyword sets.
5. Invalid `failureOutcome` configuration must abort start-attempt validation before provider resolution, terminal history, result creation, catalyst usage, or failure feedback side effects.
6. GM-facing helper text should document `fail` as the canonical special outcome keyword. Older aliases remain accepted for compatibility but are not the preferred authored form.
7. Disabled tasks are ignored for normal player listing and may not be attempted.

## D100 Gathering Resolution

### Purpose

Resolve gathering-native reusable task drops and matched hazards through ordered d100 rows.

### Runtime Requirements

1. Before any player attempt starts, Fabricate rejects gathering if Foundry is paused.
2. For every enabled item row in the selected reusable task, roll `d100`, add the gathering modifier, and drop the row when `effectiveRoll >= 101 - dropRate`.
3. For every enabled matched hazard in the environment, roll `d100`, add the hazard modifier, and drop the hazard when `effectiveRoll >= 101 - dropRate`.
4. `itemSelectionMode === "allDrops"` awards every dropped item row.
5. `itemSelectionMode === "highestRankedDrop"` awards the first dropped item row in authored row order.
6. Environment `hazardSelectionMode === "allDrops"` keeps every dropped hazard.
7. Environment `hazardSelectionMode === "highestRankedDrop"` keeps the first dropped hazard in matched hazard order.
8. Environment `hazardPolicy === "successWithHazard"` reports a successful gathering outcome with hazard evidence when hazards drop.
9. Environment `hazardPolicy === "failureWithHazard"` reports a failed gathering outcome with hazard evidence when hazards drop.
10. If no hazards are enabled or matched, the environment is mechanically safe even when danger tags are present.
11. Attempt history and player-facing output must redact d100 rows, hazards, provider diagnostics, and task identity when the environment is blind and the viewer is not allowed to inspect the underlying task.

## TimeRequirement

### Purpose

Define the duration a gathering task requires before it completes.

### Properties

```js
TimeRequirement = {
  minutes?: number,
  hours?: number,
  days?: number,
  months?: number,
  years?: number,
}
```

### Requirements

1. `timeRequirement` is a duration declaration, not an absolute timestamp.
2. If present, at least one of `minutes`, `hours`, `days`, `months`, or `years` must be a positive number.
3. Runtime execution normalizes duration fields to a world-time target timestamp for gate evaluation.
4. A gathering task with no `timeRequirement` is an immediate-resolution task. After start guards and selected-task configuration validation pass, Fabricate resolves its routed or progressive terminal outcome during `startAttempt`.
5. Immediate-resolution tasks do not create active runs. Terminal outcomes are written directly to acting-actor history as `succeeded` or `failed`: planned `createdResults`, `usedCatalysts`, and `checkResult` are persisted in terminal history before post-history commits; success then creates result items; failure creates no result items and then applies terminal catalyst behavior plus configured or default failure feedback. If terminal history persistence fails, result creation, catalyst usage, and failure feedback must not commit.
6. A gathering task with `timeRequirement` creates an active `waitingTime` gathering run after start guards pass. Backend terminal completion is processed when the module-private `GatheringEngine.processWorldTime(worldTime)` receives a world time at or after the run's `timeGate.availableAt` through guarded ready/updateWorldTime dispatch; player-facing active-run and history presentation is provided by the dedicated Gathering app.

## GatheringVisibilityGate

### Purpose

Define whether a task is visible to a given actor before an attempt begins.

### Properties

```js
GatheringVisibilityGate = {
  provider: "dnd5e" | "pf2e" | "macro",
  formula?: string,
  threshold?: string,
  macroUuid?: string,
}
```

### Requirements

1. `provider === "macro"` requires `macroUuid`.
2. `provider === "dnd5e"` or `provider === "pf2e"` requires both `formula` and `threshold`.
3. Visibility evaluation resolves to a boolean for the chosen actor.
4. Macro providers may return either:
   - `boolean`
   - `{ visible: boolean, description?: string }`
5. When no `visibility` gate is configured, the task is visible to any actor that can otherwise access the environment.

For `dnd5e` and `pf2e`, `formula` and `threshold` use the same actor-aware formula/expression syntax those systems already expose to users. Fabricate must not invent a parallel formula language for them.

Evaluation contract for `dnd5e` and `pf2e` providers:

1. Resolve `formula` to a numeric value using the selected actor as context.
2. Resolve `threshold` to a numeric value or boolean comparison using the same system-native syntax and actor context.
3. Convert the gate to a final boolean result.

If `threshold` resolves to a numeric value, visibility is granted when `formula >= threshold`.
If `threshold` resolves to a boolean comparison expression, that boolean result is authoritative.

The exact parsing and execution details remain implementation-defined, but they must stay within the native expression capabilities of `dnd5e` and `pf2e` and must not require user-authored core patches.

## GatheringCheck

### Purpose

Define the actor-based check used by a gathering task when its resolution mode needs one.

### Properties

```js
GatheringCheck = {
  provider: "dnd5e" | "pf2e" | "macro",
  formula?: string,
  threshold?: string,
  macroUuid?: string,
}
```

### Requirements

1. `resolutionMode === "progressive"` requires `check`.
2. `check.provider === "macro"` requires `macroUuid`.
3. `check.provider === "dnd5e"` or `check.provider === "pf2e"` requires `formula`.
4. Progressive checks must resolve to a numeric value and may additionally carry a terminal status (`success` or `failure`).
5. Routed tasks using `macroOutcome` do not require `check`; the macro outcome provider resolves the result directly.
6. Routed tasks using `rollTableOutcome` do not require `check` unless a future implementation adds an extra pre-roll check layer.
7. A check result with a numeric value and no terminal status is neutral. The runtime must use the value for progressive award evaluation and must not treat the result as success or failure by itself.
8. Check evaluator diagnostics for unsupported providers, provider exceptions, missing required fields, or malformed return values are GM-fix-required diagnostics, not terminal player failure outcomes.

For `dnd5e` and `pf2e`, `formula` and optional `threshold` use the same actor-aware formula/expression syntax those systems already expose to users. Fabricate must not invent a parallel formula language for them.

Evaluation contract for `dnd5e` and `pf2e` providers:

1. Resolve `formula` to a numeric value using the selected actor as context.
2. If `threshold` is absent, use the resolved numeric value directly as the gathering check result.
3. If `threshold` is present, resolve it using the same system-native syntax and actor context.
4. If `threshold` resolves to a numeric value, compare `formula` against it and derive check success from `formula >= threshold`, while still retaining the numeric value for progressive award evaluation.
5. If `threshold` resolves to a boolean comparison expression, that boolean determines success while the resolved numeric `formula` value remains the check value for progressive award evaluation.

## SpecialOutcome

### Purpose

Define how a task reports a failure outcome when no gathered results are awarded.

### Properties

```js
SpecialOutcome = {
  mode: "text" | "macro",
  text?: string,
  macroUuid?: string,
}
```

### Requirements

1. `mode === "text"` requires `text`.
2. `mode === "macro"` requires `macroUuid`.
3. If a special outcome is omitted, Fabricate must still produce default user feedback for that outcome state.
4. Failure outcomes never create gathered result items.
5. Invalid special outcome configuration is a GM-fix-required task misconfiguration, not a terminal player failure.

## Selection Semantics

### Targeted Environments

In `targeted` mode:

- the environment exposes one or more gathering tasks
- the player chooses which visible task to attempt
- task visibility gates determine which options appear for the selected actor
- the chosen task determines catalysts, time requirement, and resolution behavior

Targeted gathering is for intentional seeking, such as "forage for mooncap mushrooms" or "search for iron-rich ore".

### Blind Environments

In `blind` mode:

- the environment exposes exactly one gathering task
- the player does not choose between multiple targets
- the single task represents "gather whatever is available here"
- the task may still represent multiple possible outcomes through its configured result groups and provider logic, but the player sees one generic gather action

Blind gathering simulates stumbling upon the first thing the environment yields rather than searching for a named resource.

## Scene and Permission Gating

### Pause Rule

Gathering cannot occur while the game is paused.
If Foundry is paused, Fabricate must reject new gathering attempts before run-start, catalyst, or resolution logic are applied.

### Scene Association

If `environment.sceneUuid` is set:

1. Non-GM users may only attempt gathering while viewing that scene.
2. The selected actor must be player-owned by the acting user.
3. The selected actor must have at least one token present on the associated scene.
4. If any of the above checks fail, the environment is not attemptable by that user.

If `environment.sceneUuid` is absent, the environment is not scene-gated by this specification.

### GM Permissions

- GMs may view and configure all environments and tasks.
- GMs may bypass player-facing visibility restrictions for inspection, testing, and administration.
- Non-GM users may gather only with actors they own and only when all scene and visibility guards pass.
- Gathering actor selectability is based on actor resolution and Foundry ownership/permission, not actor document type. Fabricate must not exclude Actor types such as `npc`, `group`, or `character` by type.

## Task Visibility

For a given `viewer`, `actor`, and `environment`:

1. If the environment is disabled, return no player-visible tasks.
2. If the viewer is GM, all enabled tasks are visible.
3. If a task is disabled, it is not visible.
4. If a task has no `visibility` gate, it is visible.
5. If a task has a `visibility` gate, evaluate it for the selected actor.
6. If the gate evaluates truthy, the task is visible.
7. If the gate evaluates falsy, the task is hidden from normal player selection.
8. Listing output separates visibility from attemptability so scene/token, duplicate active run, and catalyst blockers can keep otherwise visible entries listable with localized blocked reasons.

In `blind` environments, if the sole task is hidden for an actor, that actor cannot gather from the environment.
For non-GM users, a visible blind task must remain opaque in listing output: generic localized labels replace task identity, images, visibility diagnostics, resolution metadata, and catalyst details. GMs may inspect the real blind task metadata.

## Catalyst Semantics

- Gathering catalysts use the same structural shape as crafting catalysts.
- A task may define zero or more required catalysts.
- A catalyst is considered "used" only for a terminal attempt (`succeeded` or `failed`).
- Blocked or misconfiguration-aborted attempts do not degrade or destroy catalysts.
- Catalyst degradation and exhaustion follow the configured `degradesOnUse`, `destroyWhenExhausted`, and `maxUses` semantics.
- Gathering tasks do not draw catalysts from component source actors; catalyst availability and terminal catalyst usage are both evaluated against the selected acting actor.
- Terminal catalyst usage is applied only after the gathering outcome has resolved to `succeeded` or `failed`.

## Routed Task Resolution

### Purpose

Resolve exactly one result group, or a special outcome, without ingredients.

### Supported Providers

- `macroOutcome`
- `rollTableOutcome`

### Semantics

- A routed task may define one or more `resultGroups`.
- Exactly one terminal state is chosen per attempt:
  - success with one selected result group
  - failure
- `ingredientSet` routing is invalid for gathering.

### Provider: `macroOutcome`

- `resultSelection.macroUuid` is required.
- The macro returns `{ success, outcome, description? }`.
- `outcome` is trim-normalized and case-insensitive.
- Resolution rules:
  1. If `outcome` is a reserved failure keyword, take failure path.
  2. Otherwise `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  3. If no match exists, abort with a gathering-task misconfiguration error.

### Provider: `rollTableOutcome`

- `resultSelection.rollTableUuid` is required.
- The table is drawn exactly once per attempt.
- The drawn result name is trim-normalized and case-insensitive.
- Resolution uses the same reserved failure keyword and `ResultGroup.name` matching rules as `macroOutcome`.
- If no result-group match exists and no special keyword applies, abort with a gathering-task misconfiguration error.

### Reserved Keywords

Reserved failure keywords:

- `f`
- `fail`
- `failed`
- `failure`
- `miss`
- `missed`
- `m`
- `none`
- `nothing`
- `whiff`
- `whiffed`
- `hazard`
- `danger`
- `complication`
- `trap`
- `oops`

### Validation

1. `resultSelection.provider` must be `"macroOutcome"` or `"rollTableOutcome"`.
2. Provider-specific required fields must be present.
3. `resultGroups` must contain at least one entry.
4. `ResultGroup.name` values must be unique under trim-normalized, case-insensitive comparison.
5. `ResultGroup.name` may not collide with any reserved failure keyword.

## Progressive Task Resolution

### Purpose

Resolve ordered gathering results from a numeric check value.

### Semantics

- A progressive task has exactly one `resultGroup` whose ordered `results` are evaluated by the referenced `Component.difficulty`.
- Result rows do not carry their own progressive difficulty; inline result-level difficulty is invalid drift from the component-canonical validation model.
- The task must have a `check` capable of returning a numeric `value`.
- The task may optionally return a terminal `status` of `success` or `failure`.
- If `status === "failure"`, no gathered results are created and the failure path is taken immediately.
- If no results are awarded and no explicit success path is taken, the attempt is treated as a failure.

### Award Modes

Progressive gathering reuses the award semantics from `004-resolution-modes.md`:

- `equal`
- `exceed`
- `partial`

There is no player-reorder step in gathering. Task-defined result order is authoritative.

### Check Contract

Macro-based progressive checks return:

```js
{
  status?: "success" | "failure",
  value: number,
  description?: string,
}
```

Adapter-based progressive checks must resolve to an equivalent numeric result, with optional terminal status if the adapter supports it.
Value-only check results are neutral and remain eligible for progressive award evaluation. They do not force a terminal success or failure status.
Provider diagnostics from the check evaluator abort resolution as misconfiguration/provider errors; they do not create failed gathering history, failure feedback, catalyst usage, or result items.

### Validation

1. `check` must be present.
2. `progressive` config must be present.
3. `resultGroups` must contain exactly one group.
4. The single result group must contain at least one ordered result.
5. Every referenced `Component` must have `difficulty >= 1`.
6. If a check resolves to `failure`, progressive awarding is skipped.

## Execution Lifecycle

Gathering is a single-attempt, single-step workflow.
There is no multi-step gathering state in this phase.

### Start Flow

1. Resolve the environment, task, crafting system, and actor.
2. Reject if the game is paused.
3. Reject if the environment or task is disabled.
4. Enforce scene access rules when `sceneUuid` is present.
5. Evaluate task visibility for the selected actor.
6. Reject if the actor already has an active gathering run for the same `taskId`.
7. Validate required catalysts against the selected acting actor.
8. Validate the selected task's configuration for the chosen resolution mode, including `failureOutcome`, before invoking providers or writing terminal side effects.
9. If `task.timeRequirement` is absent:
   - return `accepted: true`,
   - return `started: true`,
   - resolve the routed or progressive terminal outcome,
   - do not create an active run,
   - plan `createdResults`, `usedCatalysts`, and `checkResult` before post-history commits,
   - write exactly one terminal history entry for `succeeded` or `failed` outcomes with those planned refs,
   - abort without result creation, catalyst usage, or failure feedback if terminal history persistence fails,
   - create gathered result items on the selected actor only when the outcome is `succeeded` after terminal history persists,
   - do not create gathered result items when the outcome is `failed`,
   - apply catalyst degradation or destruction for the terminal attempt after the outcome is known, terminal history persists, and only against the selected actor,
   - apply configured or default failure feedback on failed outcomes after terminal history persists,
   - for non-GM blind attempts, redact task identity, result details, catalyst details, provider diagnostics, and check internals from player-facing responses and persisted terminal history.
10. If `task.timeRequirement` is present after all start guards and task validation pass:
   - create exactly one active gathering run,
   - set run status to `waitingTime`,
   - persist a time gate derived from the declared duration,
   - return the in-progress run state to the UI,
   - do not pass `usedCatalysts` or `createdResults` into waiting-run creation,
   - do not write terminal history,
   - do not consume, degrade, or destroy catalysts,
   - do not create result items.

Immediate terminal outcome resolution is current `startAttempt` behavior for non-timed tasks. Timed backend completion/resolution, timed result creation, timed catalyst side effects, timed terminal history writes, timed cancellation for missing references, and misconfiguration cleanup are current module-private `GatheringEngine.processWorldTime(worldTime)` behavior. Module bootstrap constructs and loads the gathering runtime internally after systems load, wires environment-store cleanup callbacks to `GatheringRunManager`, exposes the store/run/evaluator getters plus narrow viewer-enforcing `listGatheringForActor(options)` and `startGatheringAttempt(options)` methods, and dispatches ready/updateWorldTime processing to `processWorldTime(worldTime)` with error isolation. The raw engine instance is not public. The current GM admin `Environments` editor is gated by the selected system's `features.gathering`, lists cloned environment records from the store, exposes a cloned selected draft, edits name, description, enabled state, selection mode, and scene UUID, tracks selected-draft dirty state, provides visible save/cancel actions, and falls back to a valid active tab when the environment tab is no longer visible. Creating an environment persists a disabled draft shell with one disabled placeholder task for validation compatibility; that shell is not a configured player-visible gathering path until configured and enabled by the GM. Duplicate, delete, and reorder use environment-store methods, and delete requires confirmation before the store cleans referenced gathering runs. Store-owned task/result/catalyst/visibility/result-selection/progressive/check/time/failure callbacks are wired from the root into the tab, and the tab delegates those mutations to the admin store. The selected draft supports task-list CRUD (add, select, duplicate, delete, and reorder), base task field edits for `name`, `description`, `img`, `enabled`, and `resolutionMode`, selected-task result-group authoring, selected-task catalyst authoring, selected-task visibility-gate authoring, routed result-selection provider authoring, progressive check/award-mode authoring, selected-task time-requirement authoring, and selected-task failure-outcome authoring. Result-group authoring includes group add/rename/delete/reorder plus component-based result add/edit/delete/reorder for `componentId` and `quantity`. Catalyst authoring includes catalyst add/delete plus editing `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and nullable `maxUses`; the environment-store validation boundary rejects blank catalyst components and rejects non-positive or fractional `maxUses` when degradation is enabled. Visibility authoring supports enable/clear plus `macro`, `dnd5e`, and `pf2e` provider fields, with incomplete provider input kept local until required fields are available for a valid draft mutation. Routed result-selection authoring supports `macroOutcome.macroUuid` from available script macro options and `rollTableOutcome.rollTableUuid` as UUID text input. Progressive authoring supports `progressive.awardMode` values `equal`, `partial`, and `exceed`, plus `macro`, `dnd5e`, and `pf2e` checks with optional thresholds for dnd5e/pf2e. Time-requirement authoring supports immediate tasks by clearing `timeRequirement` and timed tasks by editing minutes, hours, days, months, and years. Failure-outcome authoring supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields. Task/result/catalyst/visibility/result-selection/progressive/check/time/failure edits preserve nested task configuration outside the edited collection and continue to save through the environment-store validation boundary. New draft placeholder result groups receive immediate IDs so they can be edited before save/reload. Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups. Progressive difficulty is displayed from selected managed component difficulty and is not persisted inline on result rows because canonical store validation uses managed component difficulty. Dirty environment draft confirmation, save-blocking validation/accessibility presentation, the player-facing gathering app, the Items Directory `Gathering` action, dedicated gathering app registration, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage are implemented. Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.

### Completion Flow

When world time advances to or past a run's `timeGate.availableAt`, the backend gathering runtime resumes matured `waitingTime` runs through `GatheringEngine.processWorldTime(worldTime)`:

1. Re-resolve the environment, task, crafting system, and actor.
2. If required references are missing, cancel the run and move it to history with a terminal status, with blind redaction where an opaque blind environment can still be resolved.
3. If the task is misconfigured at resume time, clear the active run without terminal player history, result items, catalyst usage, or failure feedback, and require a fresh manual start after the task is repaired.
4. Resolve the terminal outcome:
   - routed result group
   - progressive awarded results
   - failure
5. Plan terminal `createdResults`, `usedCatalysts`, and `checkResult`.
6. Remove the run from `active`, prepend it to `history`, and return the terminal result by calling `GatheringRunManager.completeRun()`.
7. If `completeRun()` returns `null` or throws, report a completion error and do not create result items, apply catalyst usage, or run failure feedback.
8. If the outcome is `succeeded`, create the resolved result items on the actor only after terminal history persists.
9. If the outcome is `failed`, do not create gathered items, and execute configured special-outcome text or macros only after terminal history persists.
10. Degrade or destroy used catalysts for the terminal attempt only after terminal history persists.
11. For non-GM blind timed completions and cancellations, redact real task identity, result details, catalyst details, provider diagnostics, and check internals from player-facing responses and persisted terminal history; persisted terminal history may use a generic blind marker instead of the real `taskId`.

### Misconfiguration Errors

The following are GM-fix-required errors, not player-facing failure outcomes:

- invalid provider configuration
- unresolved result-group name routing
- invalid component references
- invalid progressive difficulty configuration
- invalid `failureOutcome` configuration

Misconfiguration-aborted attempts:

- do not create or advance active runs
- do not degrade catalysts
- do not create history entries as terminal player attempts

Resume-time misconfiguration for an existing waiting run additionally removes the active run so the actor is not permanently blocked by one-active-run-per-task semantics. After the GM repairs the task, the player must start a fresh gathering attempt; the cleared run is not resumed.

## Run Tracking and Persistence

### Actor History

Gathering history is stored on the acting actor:

```js
Actor.flags.fabricate.gatheringRuns = {
  active: {
    [runId: string]: GatheringRun,
  },
  history: GatheringRun[],
}
```

```js
GatheringRun = {
  id: string,
  actorUuid: string,
  userId: string,
  craftingSystemId: string,
  environmentId: string,
  taskId: string,
  status: "inProgress" | "waitingTime" | "succeeded" | "failed" | "cancelled",
  startedAtWorldTime: number,
  updatedAtWorldTime: number,
  completedAtWorldTime?: number,
  timeGate?: {
    requiredSeconds: number,
    availableAt: number,
    initiatedAt: number,
  },
  checkResult?: object,
  usedCatalysts?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
  createdResults?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
}
```

### History Retention

- `gatheringRuns.active` contains only non-terminal runs (`inProgress` or `waitingTime`).
- `gatheringRuns.history` is ordered most-recent-first.
- `gatheringRuns.history` is capped at **50** entries per actor.
- When the 51st terminal entry is written, the oldest entry is discarded immediately.
- For non-GM blind immediate and timed attempts, persisted terminal history must avoid real task identity, result details, catalyst details, provider diagnostics, and check internals. GM-started blind attempts may retain real task/result details for inspection.

### Active Run Constraints

- Within one actor's `gatheringRuns.active`, at most one active run may exist for a given `taskId`.
- Different task IDs may run concurrently unless a future spec adds stricter environment-level concurrency rules.
- A run with `status === "waitingTime"` still counts as active for this constraint.

## Destructive Change and Clean-up Rules

This spec follows the principles of `007-destructive-changes-and-migrations.md`.

### Delete Environment

When an environment is deleted:

1. Remove actor active runs and history entries referencing the deleted `environmentId`.
2. Remove or ignore any stale task references nested under that environment.
3. This environment-store cleanup is destructive record cleanup, not terminal player cancellation history.

### Delete Task

When a task is deleted from an environment:

1. Remove actor active runs and history entries referencing the deleted `taskId`.
2. This task cleanup is destructive record cleanup, not terminal player cancellation history.

### Resume Missing References

If a waiting run reaches its time gate and the backend runtime can no longer resolve the actor, crafting system,
environment, or task needed to complete it, that runtime completion path treats the run as terminal cancellation:

1. Remove the run from `active`.
2. Prepend a `cancelled` history entry.
3. Do not resolve results, apply catalyst usage, or run failure feedback.

This cancellation path is distinct from deliberate environment-store destructive cleanup, which removes records for deleted
systems, environments, or tasks.

### Change Selection Mode

When switching between `targeted` and `blind`:

- save must be blocked until task cardinality satisfies the new mode
- automatic deletion of extra tasks is not allowed by default

### Linked Scene Deletion

If a linked scene is deleted:

- keep `sceneUuid` unchanged
- warn in environment-editing UI
- runtime scene-gated player access fails closed until the link is corrected or removed

## Testing Requirements

- Unit tests for environment validation:
  - `targeted` requires at least one task
  - `blind` requires exactly one task
- Unit tests for visibility-gate evaluation using `dnd5e`, `pf2e`, and macro providers
- Unit tests for pause-state rejection
- Unit tests for scene gating and actor/token presence checks
- Unit tests for start-attempt guard ordering: rejected starts create no runs, immediate accepted starts write terminal history only after guards pass, terminal history persistence failures prevent post-history side effects, and timed accepted starts create `waitingTime` runs only after guards pass
- Unit tests for immediate terminal gathering resolution when `timeRequirement` is absent, including success result creation, failed terminal history without result creation, terminal catalyst usage, configured/default failure feedback, invalid `failureOutcome` aborts, selected-task result-group validation, and blind non-GM terminal redaction
- Unit tests for time-gated gathering run creation when `timeRequirement` is present
- Unit tests for world-time completion of `waitingTime` gathering runs
- Unit tests confirming misconfiguration-aborted attempts do not create active runs or history entries
- Unit tests for one-active-run-per-actor-per-task concurrency enforcement
- Unit tests for routed outcome resolution:
  - result-group name matching
  - failure keyword handling
  - compatibility alias handling for former miss/hazard keywords
  - misconfiguration on unmatched outcomes
- Unit tests for progressive gathering:
  - `equal`, `exceed`, and `partial` award modes
  - explicit failure short-circuit
  - zero-award failure behavior
- Unit tests for catalyst degradation on terminal attempts only
- Unit tests confirming gathering catalyst availability and terminal usage are scoped to the selected acting actor only
- Unit tests for non-GM blind terminal redaction and GM blind terminal inspectability
- Unit tests for cleanup of active gathering runs when tasks or environments are deleted
- Unit tests for actor history ordering and 50-entry retention
- Integration tests for player gathering from a scene-linked environment
- Integration tests for blind gathering showing one generic action and targeted gathering showing multiple visible tasks
- Regression tests confirming harvesting remains modeled as recipe or salvage data rather than a separate runtime path
