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

  resolutionMode: "progressive" | "routed",

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

1. `resolutionMode` must be either `"progressive"` or `"routed"`.
2. Gathering tasks have no ingredients. Any configuration that depends on `IngredientSet` or `ingredientSet` routing is invalid.
3. `failureOutcome` is optional, but task failure must still be supported at runtime even when default feedback is used.
4. `failureOutcome` applies whenever routed or progressive resolution ends in failure, including when a provider returns compatibility aliases from the former miss-family or hazard-family keyword sets.
5. GM-facing helper text should document `fail` as the canonical special outcome keyword. Older aliases remain accepted for compatibility but are not the preferred authored form.
6. Disabled tasks are ignored for normal player listing and may not be attempted.

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
4. A gathering task with no `timeRequirement` resolves immediately.
5. A gathering task with `timeRequirement` creates an in-progress gathering run and resolves when the world-time target is reached.

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

## Task Visibility

For a given `viewer`, `actor`, and `environment`:

1. If the environment is disabled, return no player-visible tasks.
2. If the viewer is GM, all enabled tasks are visible.
3. If a task is disabled, it is not visible.
4. If a task has no `visibility` gate, it is visible.
5. If a task has a `visibility` gate, evaluate it for the selected actor.
6. If the gate evaluates truthy, the task is visible.
7. If the gate evaluates falsy, the task is hidden from normal player selection.

In `blind` environments, if the sole task is hidden for an actor, that actor cannot gather from the environment.

## Catalyst Semantics

- Gathering catalysts use the same structural shape as crafting catalysts.
- A task may define zero or more required catalysts.
- A catalyst is considered "used" only for a terminal attempt (`succeeded` or `failed`).
- Blocked or misconfiguration-aborted attempts do not degrade or destroy catalysts.
- Catalyst degradation and exhaustion follow the configured `degradesOnUse`, `destroyWhenExhausted`, and `maxUses` semantics.
- Gathering tasks do not draw catalysts from component source actors; catalysts are validated against the acting actor.

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

- A progressive task has exactly one `resultGroup` whose ordered `results` are evaluated by increasing difficulty.
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
7. Validate required catalysts.
8. Validate task configuration for the chosen resolution mode.
9. If `task.timeRequirement` is absent:
   - resolve the terminal outcome immediately,
   - write the terminal run entry directly to history,
   - return the resolved result to the UI.
10. If `task.timeRequirement` is present:
   - create an active gathering run,
   - set run status to `waitingTime`,
   - persist a time gate derived from the declared duration,
   - return the in-progress run state to the UI.

### Completion Flow

When world time advances past the run's `timeGate.availableAt`, Fabricate must resume the run:

1. Re-resolve the environment, task, crafting system, and actor.
2. If required references are missing, cancel the run and move it to history with a terminal status.
3. Resolve the terminal outcome:
   - routed result group
   - progressive awarded results
   - failure
4. If the outcome is `succeeded`, create the resolved result items on the actor.
5. If the outcome is `failed`, do not create gathered items.
6. Execute configured special-outcome text or macros for failure paths.
7. Degrade or destroy used catalysts for the terminal attempt.
8. Remove the run from `active`, prepend it to `history`, and return the terminal result.

### Misconfiguration Errors

The following are GM-fix-required errors, not player-facing failure outcomes:

- invalid provider configuration
- unresolved result-group name routing
- invalid component references
- invalid progressive difficulty configuration

Misconfiguration-aborted attempts:

- do not create or advance active runs
- do not degrade catalysts
- do not create history entries as terminal player attempts

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

### Delete Task

When a task is deleted from an environment:

1. Remove actor active runs and history entries referencing the deleted `taskId`.

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
- Unit tests for immediate gathering when `timeRequirement` is absent
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
- Unit tests for cleanup of active gathering runs when tasks or environments are deleted
- Unit tests for actor history ordering and 50-entry retention
- Integration tests for player gathering from a scene-linked environment
- Integration tests for blind gathering showing one generic action and targeted gathering showing multiple visible tasks
- Regression tests confirming harvesting remains modeled as recipe or salvage data rather than a separate runtime path
