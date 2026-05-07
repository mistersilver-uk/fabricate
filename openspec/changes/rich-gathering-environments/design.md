# Design: Rich Gathering Environments End To End

## Baseline And Direction

Gathering should become a location-first activity backed by reusable GM-authored content.

The current rich slice stores rich data directly on environments and tasks. The end-to-end design keeps that data backward compatible, then adds reusable task and hazard libraries so GMs can author once and compose many times.

Primary visual reference remains:

- [Actor Gathering App](<../fabricate-ui-design-system-manager-v2/references/Actor Gathering App.png>)

Written requirements in this change are authoritative when the image omits edge cases.

## Ownership Boundaries

Structural decision from `javascript-structural-design`:

- Use focused ES module APIs/classes under `src/systems/` for domain behavior, not Svelte stores.
- Keep Foundry globals, hooks, settings, random rolls, world time, ChatMessage creation, and Roll/Table/Macro execution behind injected adapters.
- Keep Svelte stores as view-state composition and action facades only.
- Keep `GatheringEngine` as the runtime orchestrator, but move reusable library lookup, condition resolution, d100 resolution, and hazard resolution behind explicit collaborators.

Expected collaborators:

- `GatheringTaskLibraryStore`: persists reusable task definitions scoped to crafting systems.
- `GatheringHazardLibraryStore`: persists reusable hazard definitions scoped to crafting systems.
- `GatheringConditionState`: resolves global weather/time plus environment overrides into an attempt/listing snapshot.
- `GatheringD100Resolver`: resolves gathering-native d100 drop rows and matched hazard rolls from a configured task instance.
- `GatheringHazardResolver`: resolves reusable hazard triggers and outcomes without duplicating encounter logic in UI code.
- `GatheringRichStateService`: remains the owner for mutable runtime state such as nodes, stamina, attempt counters, reveal evidence, and manual GM adjustments.

Rejected alternative: storing all reusable-task, hazard, condition, and d100 behavior inside `GatheringEnvironmentStore`. That would make one store own persistence, validation, runtime state, resolution, and UI concerns. The split keeps test seams small and makes global condition and d100 resolution independently testable.

## Data Model

### Reusable Gathering Tasks

A reusable task definition is system-scoped and contains the GM-authored default task behavior:

```js
GatheringTaskDefinition = {
  id: string,
  craftingSystemId: string,
  name: string,
  description?: string,
  img?: string,
  enabled: boolean,
  tags?: string[],
  region?: string,
  biomes?: string[],
  weather?: string[],
  timeOfDay?: string[],
  dangerTags?: string[],
  riskLabel?: string,
  defaultEconomy?: {
    staminaCost?: number,
    timeRequirement?: TimeRequirement,
    nodes?: NodeConfig,
    attemptLimit?: AttemptLimitConfig,
  },
  resolutionMode: "d100" | "routed" | "progressive",
  d100?: D100GatheringResolution,
  routed?: existing routed config,
  progressive?: existing progressive config,
  catalysts?: Catalyst[],
  visibility?: GatheringVisibilityGate,
  hazards?: TaskHazardLink[],
  chatMessages?: ChatMessageConfig,
}
```

Environment task entries become task placements:

```js
EnvironmentTaskPlacement = {
  id: string,
  taskDefinitionId?: string,
  inlineTask?: GatheringTask,
  enabled: boolean,
  overrideName?: string,
  overrideDescription?: string,
  overrideImg?: string,
  overrides?: {
    dangerTags?: string[],
    riskLabel?: string,
    conditions?: object,
    staminaCost?: number,
    nodes?: NodeConfig,
    attemptLimit?: AttemptLimitConfig,
    hazards?: TaskHazardLink[],
    d100?: Partial<D100GatheringResolution>,
  }
}
```

Legacy environment-embedded tasks remain valid. Normalization should convert them into inline task placements internally when needed, without rewriting saved data until a GM saves.

### Reusable Hazards

A hazard definition is system-scoped and describes a reusable danger outcome:

```js
GatheringHazardDefinition = {
  id: string,
  craftingSystemId: string,
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
  visibility?: "public" | "blindSafe" | "gmOnly",
  effect?: {
    mode: "text" | "macro" | "rollTable",
    text?: string,
    macroUuid?: string,
    rollTableUuid?: string,
  },
  chatMessages?: ChatMessageConfig,
}
```

Hazards match environments by danger, region, biome, current global weather, and current global time of day. Placement-level links can adjust enabled state, overrides, drop rate, modifier provider, and player-facing copy without rewriting the reusable hazard definition.

### Global Gathering Conditions

Global condition state belongs to gathering settings, not individual environments. Manager V2 Settings is the primary GM control surface for current weather and time of day:

```js
GatheringConditionSettings = {
  mode: "manual" | "provider",
  weather: "clear",
  timeOfDay: "day",
  vocabularies: {
    regions: string[],
    biomes: string[],
    danger: string[],
    weather: string[],
    timeOfDay: string[],
  },
  visibility?: string,
  providerId?: string,
  updatedAtWorldTime?: number,
}
```

Environment conditions gain inheritance controls and display the inherited global snapshot. Environment editing must not present weather/time as local browse filters:

```js
EnvironmentConditionOverride = {
  inheritGlobal: boolean,
  weather?: string,
  timeOfDay?: string,
  visibility?: string,
  notes?: string,
}
```

Resolution returns a snapshot:

```js
GatheringConditionSnapshot = {
  source: "global" | "environment" | "mixed" | "provider",
  weather?: string,
  timeOfDay?: string,
  visibility?: string,
  modifiers?: object[],
}
```

Attempts persist the snapshot used for listing/start. Completed history must not be retroactively rewritten when conditions change.

### D100 Gathering Resolution

The gathering-native mode owns ordered task item drop rows plus matched hazard drop rolls:

```js
D100GatheringResolution = {
  itemSelectionMode: "highestRankedDrop" | "allDrops",
  itemDrops: Array<{
    id: string,
    itemUuid?: string,
    componentId?: string,
    quantity: number,
    dropRate: number,
    enabled: boolean,
  }>,
  gatheringModifier?: ModifierProvider,
}
```

Validation:

- Drop rows use integer `dropRate` values from 1 to 100.
- Each drop row must reference a component or item UUID.
- Quantity must be positive.
- Row order is authoritative for `highestRankedDrop`.
- Hazard records use the same `dropRate` range and may define a hazard modifier provider.

Runtime:

1. Resolve guards, visibility, catalysts, condition snapshot, node availability, attempt limits, and stamina.
2. Roll d100 independently for each enabled item drop row and matched enabled hazard.
3. Add the relevant gathering or hazard modifier.
4. Drop a row when `effectiveRoll >= 101 - dropRate`.
5. Select dropped item rows by `highestRankedDrop` or `allDrops`.
6. Select dropped hazards by environment hazard selection mode.
7. Apply hazard policy as success-with-hazard or failure-with-hazard.
8. Plan result/catalyst/run/history side effects.
9. Persist terminal history before result creation, catalyst use, chat, hazard side effects, node depletion, stamina spend, or reveal commits.
10. Commit rich state and terminal effects with auditable evidence.

## Runtime Flow Changes

### Listing

`listGatheringForActor` should return:

- global condition snapshot summary
- environment condition source and overrides
- reusable task placement evidence
- hazard risk summary where safe
- d100 drop-row and hazard roll summary where safe
- paused-game blocker when Foundry is paused
- existing scene/token, visibility, catalyst, duplicate-run, node, stamina, and attempt blockers

Paused-game listing should keep visible environments/tasks listable but non-attemptable, matching other blocker behavior.

### Start Attempt

Guard order:

1. resolve actor, system, environment, placement/task definition, and task instance
2. reject paused game
3. reject disabled system/environment/placement/task
4. enforce scene/token access
5. evaluate task visibility and blind redaction
6. enforce duplicate active run
7. validate catalysts
8. resolve condition snapshot and condition availability modifiers
9. evaluate attempt limits
10. evaluate node availability
11. evaluate stamina
12. validate task configuration and d100 drop rows
13. start timed run or resolve immediate attempt

Rich state mutations continue to happen after terminal history persistence for immediate attempts. Timed attempts persist the condition/task/hazard snapshot required for completion.

### Global Conditions

Global conditions are evaluated for listing and attempt start. Provider-backed conditions must be isolated behind an adapter and must not force a new dependency. If a provider fails, listing/start should expose GM-fix diagnostics to GMs and safe blocker copy to players.

### Hazards

Hazard resolution is not encounter automation. Core should select and persist/report hazard outcomes, run text/macro/table hooks where configured, and emit chat/log evidence. Full combat or scene automation remains provider/macro-owned.

## Manager V2 UI Plan

### Route Promotion

For Manager V2 feature routes:

- Remove disabled placeholder data for implemented gathering routes.
- Add feature-gated nav entries when `selectedSystem.features.gathering === true`.
- Normalize routes for `environments`, `gathering-tasks`, and `gathering-settings`.
- Add breadcrumbs and copy for each route.
- Use focused route components rather than one monolithic gathering editor.
- Preserve selected-system inspector state.
- Add localization and CSS with the existing flat Manager V2 style.
- Add mounted and source-contract tests.

### Environments Route

Owns environment composition:

- browse/search/filter by name, region, biome, risk, status, availability, condition source
- edit environment identity, image, region, biome, optional scene link, enabled state
- attach reusable task definitions
- configure per-environment task overrides
- configure environment-level hazards and hazard weights
- inspect player-safe preview and validation
- operate manual node restock, attempt recharge, blind reveal/reset, and environment condition overrides

### Tasks Route

Owns reusable task definitions:

- browse/search/filter reusable tasks by name, tags, risk, resolution mode, hazard links, enabled state
- create/edit/duplicate/delete task definitions
- configure ordered d100 drop rows, result references, catalysts, checks, default economy, visibility, chat events, and default hazards
- show environment usage evidence before destructive changes
- block deletion or require confirmation when tasks are used by environments

Hazard authoring may be nested in this route for the first implementation. If nested here, it must still behave as a reusable hazard library with create/edit/duplicate/delete, usage evidence, deletion confirmation, tag filters, and validation. A later dedicated `Gathering Hazards` route may promote the same library without changing the domain model.

### Settings Route

Owns gathering-wide system settings:

- economy mode defaults
- global weather/time condition state and provider mode
- current global weather/time controls, with Environments showing inherited evidence rather than owning the values
- stamina provider/regeneration defaults
- d100 default drop-row templates
- chat message defaults
- developer hook/API notes and stable ids
- GM manual controls for global condition updates

## Player Gathering App Plan

The player app should keep the current three-column direction:

- header: selected actor, selected system, paused-game blocker, stamina summary when enabled
- left: searchable/filterable environment browser with region/biome/risk/availability filters; weather and time of day appear as evidence chips only, not filters
- center: selected environment task list or blind generic actions
- right: environment detail, active task panel, condition/hazard/d100 evidence, start button
- log tab: active runs, history, chat ids, hazard outcomes, stamina/node/condition evidence

Blind environments:

- unrevealed tasks render as generic gather actions
- revealed tasks render only for the relevant viewer scope
- hazards, d100 drop rows, potential results, logs, blockers, and chat links are redacted until safe

Paused game:

- show a visible blocker in the header or action panel
- disable start actions
- keep browsing available
- do not imply catalysts, stamina, attempts, or nodes were consumed

## Screenshot Acceptance Criteria

Required implementation screenshots:

- Manager V2 Environments desktop: environment without scene link, attached reusable tasks, override evidence, global-condition inheritance, node/restock controls, and validation visible.
- Manager V2 Tasks desktop: reusable task browser, ordered d100 drop-row editor, hazard drop-rate authoring, and result evidence visible.
- Manager V2 Settings desktop: global weather/time controls, stamina defaults, d100 defaults, chat settings, and developer/API section visible.
- Player Gathering desktop: first visible state with actor header, environment browser, selected environment detail, task list, conditions, hazard/risk chips, and start controls.
- Player Gathering paused state: paused blocker visible, start controls disabled, environment browsing still readable.
- Player Gathering blind state: generic action and redacted task/hazard/result evidence for a non-GM user.
- Narrow Manager V2 window around 720px wide: route content stacks, controls remain reachable, no horizontal clipping.
- Narrow Player Gathering window around 560px wide: actor/stamina/header, filters, selected environment, task list, and start action remain reachable without horizontal overflow.

Each artifact must prove first visible state, alignment, clipping, image/content fidelity, scroll containment, visible controls, and responsive behavior.

Live browser pointer hit-tests are required where feasible for Manager V2 nav items, task attach rows, d100 drop-row controls, hazard menus, disabled start actions, and manual restock/recharge controls.

## Compatibility

- Legacy environment-embedded tasks continue to load and resolve.
- Legacy blind environments with one task behave as before unless edited into multi-task blind discovery.
- Existing routed/progressive tasks continue to use current validation and resolution.
- New fields are additive and default to neutral behavior.
- Saved data is not eagerly rewritten on load.

## Resolved Plan Decisions

- Reusable task and hazard libraries use a dedicated gathering config world setting keyed by crafting system for this slice.
- Hazards are reusable across a crafting system; first UI may nest hazard CRUD inside Gathering Tasks if it still behaves as a library.
- D100 is a gathering-native `resolutionMode` using ordered item drop rows and matched hazard drop-rate rolls.
- Global condition state lives in the dedicated gathering config world setting with manual GM controls first; provider integration is deferred.
- Chat output is not mandatory in the first core slice; persisted chat ids/evidence remain reserved for the later chat implementation.
