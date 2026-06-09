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
- **Task resolution mode** for `progressive`, `routed`, or `d100`

## Scope

This spec governs:

- environment records, rich place metadata, reusable library composition, and gathering-task structure
- targeted vs blind gathering selection
- scene, pause, visibility, and permission gating
- gathering time requirements and active-run behavior
- optional resource-node availability, respawn, attempt limits, risk, encounters, and stamina
- global gathering conditions and condition-sensitive runtime gates
- routed and progressive gathering-task resolution
- gathering-native d100 drop-row resolution
- failure outcomes and special failure feedback
- gathering hooks, public APIs, and chat message boundaries
- persistence for active and historical gathering runs
- the boundary between gathering and harvesting

This spec does not introduce:

- a standalone harvesting subsystem
- ingredient-set-based gathering
- map authoring or travel simulation
- mandatory encounter automation beyond selecting or reporting configured outcomes
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
- `Tool`
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
  img?: string,
  enabled: boolean,
  selectionMode: "targeted" | "blind",
  compositionMode?: "automatic" | "manual",
  sceneUuid?: string | null,
  region?: string,
  biomes?: string[],
  dangerLevel?: string,
  dangerTags?: string[], // legacy compatibility-read fallback for dangerLevel
  risk?: string, // legacy compatibility-read fallback for dangerLevel / player-facing risk evidence
  hazardSelectionMode?: "highestRankedDrop" | "allDrops", // legacy compatibility-read only
  hazardPolicy?: "successWithHazard" | "failureWithHazard", // legacy compatibility-read only
  enabledTaskIds?: string[],
  disabledTaskIds?: string[],
  enabledHazardIds?: string[],
  disabledHazardIds?: string[],
  forcedTaskIds?: string[],
  forcedHazardIds?: string[],
  taskOrder?: string[],
  hazardOrder?: string[],
  taskDropRateAdjustments?: Record<string, Record<string, number>>, // taskId -> dropRowId -> signed percentage-point delta
  taskDropRateAdjustmentsEnabled?: Record<string, boolean>, // taskId -> false disables applying stored drop-row deltas; absent/true means enabled
  hazardDropRateAdjustments?: Record<string, number>, // hazardId -> signed percentage-point delta
  hazardDropRateAdjustmentsEnabled?: Record<string, boolean>, // hazardId -> false disables applying stored hazard delta; absent/true means enabled
  blindSelection?: {
    weights: Record<string, number>, // keyed by task id
  },
  tasks: GatheringTask[], // Environment Task records in the persisted schema
}
```

### Requirements

1. `craftingSystemId` must reference an existing `CraftingSystem`.
2. `selectionMode` must be either `"targeted"` or `"blind"`.
3. If `selectionMode === "targeted"`, the environment must define at least one Environment Task.
4. If `selectionMode === "blind"`, the environment may define one or more hidden Environment Tasks. Non-GM listings expose a generic gather action unless a configured reveal state makes one or more tasks visible.
5. `img` is an optional player-facing environment image independent of any linked scene.
6. If `sceneUuid` is present, it references the scene where player self-service gathering is allowed.
7. Scene linkage is optional. If `sceneUuid` is absent, the environment is not scene-gated by default and may still be player-visible when other guards pass.
8. Disabled environments are never attemptable by non-GM users and surface no task content to them. Disabled environments are surfaced as **locked identity-only listings to all viewers** in the player listing (players and GMs alike): a **locked identity-only teaser** (`locked: true`, `attemptable: false`, an `ENVIRONMENT_DISABLED` blocked reason, and no `tasks` or composition internals); it must never expose task identity, weights, drop data, or other composition internals. See *Player Environment Listing*.
9. `region` and `dangerLevel` are single-select tag values; `biomes` is a multi-select tag list.
10. `dangerLevel` is the canonical environment danger ceiling used for reusable hazard matching. Legacy `dangerTags` and `risk` values remain compatibility-read fallback inputs when `dangerLevel` is absent; canonical writes should use `dangerLevel`.
10a. `risk` may remain as optional player-facing risk evidence for older data, but new matching behavior must not depend on `risk` when `dangerLevel` is present.
11. Weather and time of day are not environment fields. They are global gathering conditions used as **runtime gates** — a Gathering Task or hazard whose required `weather` / `timeOfDay` values are not satisfied by the current conditions stays in the environment's composition (it still matches by region/biome/danger) but is **inactive** at runtime: tasks become `visible: true` / `attemptable: false` with a `CONDITIONS_BLOCKED` reason, and hazards are skipped during d100 hazard selection. Matching itself is decided by region / biome / danger only.
12. `enabledTaskIds`, `disabledTaskIds`, `enabledHazardIds`, and `disabledHazardIds` store environment-level composition toggles for reusable library records without rewriting the library definitions.
12a. `compositionMode` controls reusable task/hazard composition. In **automatic** mode, every matching, library-enabled record is composed unless listed in `disabledTaskIds` / `disabledHazardIds`; stale `enabled*Ids` and `forced*Ids` are ignored. In **manual** mode, only records in `enabled*Ids` that still match, plus records in `forced*Ids`, are composed; stale `disabledTaskIds` and `disabledHazardIds` are ignored.
12b. `forcedTaskIds` / `forcedHazardIds` are GM "force-add" overrides used in **manual** composition mode: a record listed there is composed into the environment even when it does not match the environment's region/biome/danger context (composition state `forceIncluded`). A forced record remains force-included until removed even if later environment edits make it match normally. Weather and time-of-day remain runtime gates for force-included records, so a force-included record can still be condition-blocked and inactive at runtime. Forces are honored only in manual mode, so a stale forced list never makes a non-matching record available in automatic mode. Removing a forced task or hazard in manual mode clears it from `forced*Ids` without adding it to `disabled*Ids`.
12c. `taskOrder` and `hazardOrder` provide deterministic ordering for composed reusable records. `hazardOrder` applies to every composed/included hazard, including manual `forcedHazardIds`. Records absent from the order list retain library order after ordered records.
12c.1. GM authoring UI exposes hazard reorder controls only when the selected system's hazard selection mode is `highestRankedDrop`. In that mode, every included hazard can occupy any rank, including matching, explicitly included, force-included, and currently condition-blocked included hazards. Other hazard selection modes do not expose reorder handles or move actions.
12d. GM authoring UI for manual task and hazard composition shows only two record groups: **Included in this environment** and **Available to add**. Available to add includes matching addable rows first, then enabled non-matching rows, then library-disabled rows; it does not show a separate Excluded or Non-matching section. Removing an included manual record returns it to Available to add with its normal candidate/not-matching/library-disabled state instead of showing it as Excluded. Automatic composition retains its Excluded and Non-matching sections.
12e. `taskDropRateAdjustments` and `hazardDropRateAdjustments` store environment-local signed percentage-point deltas for reusable library task drop rows and hazards. Task adjustments are keyed first by task id and then by drop-row id. Hazard adjustments are keyed by hazard id. Values must be integers from `-100` to `100`; zero values are omitted. Adjustments affect only this environment and must not rewrite reusable library records.
12f. `taskDropRateAdjustmentsEnabled` stores task-level apply switches for environment-local task drop-row adjustments. Missing task ids and `true` values mean enabled; `false` preserves configured per-drop deltas but prevents them from applying to composed runtime drop rates.
12g. `hazardDropRateAdjustmentsEnabled` stores hazard-level apply switches for environment-local hazard adjustments when the runtime keeps the hazard adjustment toggle. Missing hazard ids and `true` values mean enabled; `false` preserves the configured hazard delta but prevents it from applying to composed runtime hazard rates.
13. Environment metadata exposed to non-GM users must not leak hidden task identity, hidden result details, provider diagnostics, or GM-only notes.
14. Legacy environments without rich metadata remain valid and load with neutral defaults.
15. `hazardSelectionMode` and `hazardPolicy` are legacy compatibility fields. New Manager authoring and d100 runtime behavior use system Gathering Rules once they are authored.
16. `blindSelection` (optional) stores the per-task `weights` map used when a blind environment resolves its generic gather. Selection is always a weighted random draw over the gated candidate pool: `weights[taskId]` defaults to `1`, and a non-positive weight excludes the task. There are no other strategies and no per-environment configuration of the selection algorithm. GM authoring UI for blind environments shows each included task's calculated selection share as `weight / sum(included task weights) * 100`; the displayed percentage is informational and does not change the persisted weight shape.
17. Reveal behaviour is set at the system level only — the system Gathering Rules `revealPolicy` / `revealScope` apply to every environment. Environments do not override them.

## System Gathering Rules

### Purpose

Represent selected-system d100 reward and hazard behavior for all gathering environments in that crafting system.

### Properties

```js
GatheringRules = {
  rewardSelectionMode: "highestRankedDrop" | "allDrops" | "limitedDrops",
  rewardLimit: number,
  hazardSelectionMode: "highestRankedDrop" | "allDrops" | "limitedDrops",
  hazardLimit: number,
  hazardPolicy: "successWithHazard" | "failureWithHazard",
  toolBreakagePolicy: "failureOnBreak" | "successDespiteBreak",
  biomeModifierAggregation: "strongestOfEach" | "cumulative" | "dominant",
  blindCandidateGate: "attemptableOnly" | "allMatching",
  revealPolicy: "never" | "onSuccess" | "onAttempt",
  revealScope: "actor" | "user" | "party" | "global",
}
```

### Requirements

1. Rules are stored under `gatheringConfig.systems[systemId].rules`.
2. Missing rules normalize to reward mode `highestRankedDrop`, reward limit `1`, hazard mode `allDrops`, hazard limit `1`, hazard policy `successWithHazard`, tool breakage policy `failureOnBreak`, biome aggregation `strongestOfEach`, blind candidate gate `attemptableOnly`, reveal policy `never`, and reveal scope `actor`.
3. Unknown selection modes normalize to their defaults.
4. Unknown hazard policies normalize to `successWithHazard`.
5. Unknown tool breakage policies normalize to `failureOnBreak`.
6. Limits normalize to positive integers.
7. These rules are authoritative for d100 reward selection, hazard selection, hazard outcome, and tool breakage outcome once authored.
8. Existing worlds without a system `rules` object may read legacy task/environment selection fields for backwards-compatible d100 behavior.
9. `blindCandidateGate` controls the blind candidate pool: `attemptableOnly` (default) excludes tasks the character cannot currently attempt (unmet tool/resource/visibility gates) so the generic gather never resolves to a doomed task; `allMatching` keeps every matching task in the pool. Unknown values normalize to `attemptableOnly`.
10. `revealPolicy`/`revealScope` control revealing a blind task after an attempt terminates for every environment in the system. Environments do not override them. Unknown values normalize to `never`/`actor`.

## Global Gathering Conditions

### Purpose

Represent the current weather/time-of-day state used by gathering listing context and runtime attempt gates.

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
  systems: {
    [systemId: string]: {
      conditions: {
        weather: { enabled: boolean, current: string, values: ConditionOption[] },
        timeOfDay: { enabled: boolean, current: string, values: ConditionOption[] },
      },
    },
  },
}

ConditionOption = {
  id: string,
  label: string,
  icon: string,
}
```

### Requirements

1. Default weather is `"clear"` and default time of day is `"day"`.
2. Default regions are empty. Default biomes are `forest`, `grassland`, `mountain`, `cave`, `coastal`, `swamp`, `desert`, `urban`, `ruins`, and `wasteland`.
3. Default danger levels are `safe`, `unsafe`, `hazardous`, `dangerous`, `deadly`, and `extreme`.
4. Default weather tags are `clear`, `cloudy`, `rain`, `storm`, `snow`, `fog`, and `wind`.
5. Default time-of-day tags are `dawn`, `day`, `dusk`, and `night`.
6. GM-customized vocabularies are preserved. Defaults are seeded only when a custom list is absent or empty.
7. Each `gatheringConfig.systems[systemId].conditions` entry owns selected-system weather and time-of-day condition settings with `enabled`, `current`, and `values` fields. `current` stores a condition option id.
8. Condition option values store stable normalized ids, GM-facing labels, and Font Awesome icon classes.
9. Missing per-system weather settings default to enabled, current `clear`, and values `clear`, `cloudy`, `rain`, `storm`, `snow`, `fog`, and `wind` as option records.
10. Missing per-system time-of-day settings default to enabled, current `day`, and values `dawn`, `day`, `dusk`, and `night` as option records.
11. Legacy top-level `conditions`, per-system string condition values, and `vocabularies.weather` / `vocabularies.timeOfDay` remain backward-compatible inputs for normalizing missing per-system settings.
12. Deleting a per-system condition value removes it from Gathering Tasks and hazards in that system only.
13. Deleting the last value of an enabled per-system condition dimension must be rejected; GMs may disable that dimension instead.
14. `game.fabricate.gathering.getConditions()` returns current conditions and available tag vocabularies for GM and player-facing callers.
15. `game.fabricate.gathering.setWeather(weatherTag)`, `setTimeOfDay(timeOfDayTag)`, and `setConditions({ weather, timeOfDay })` require a GM user, validate tags against the configured vocabularies, persist the setting, dispatch `fabricate.gathering.conditionsUpdated`, and refresh gathering listings.
16. Player-facing callers may read conditions but may not mutate them.
17. Condition values are authored or selected by the GM unless an approved integration provider supplies them.
18. Weather and time-of-day are runtime gates only; they never affect whether a Gathering Task or hazard matches an environment, and player environment browse filters must not expose weather/time as environment filters.
19. Disabled per-system weather or time-of-day dimensions are ignored at runtime (records with constraints on a disabled dimension are not condition-blocked by it).
20. Condition state may modify task availability, result yield, check difficulty, stamina cost, risk, or encounter chance through declarative or provider-driven configuration.
21. Fabricate core must not hardcode game-system-specific weather, time, skill, or stamina formulas.
22. A gathering attempt should snapshot relevant condition state when the attempt starts so active runs and history can explain what conditions affected the attempt.
23. Player-facing UI may show beneficial or harmful condition notes only when those notes are not hidden by blind task or visibility rules.
24. Changing current global conditions must not retroactively rewrite completed gathering history.

## Gathering Task Library

### Purpose

Represent GM-authored Gathering Tasks that can be composed into multiple environments for a crafting system. The persisted schema currently uses `GatheringTaskDefinition`.

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
    conditionModifiers?: {
      timeOfDay?: Array<{ id: string, conditionId: string, value: number }>,
      weather?: Array<{ id: string, conditionId: string, value: number }>,
    },
    characterModifiers?: Array<{
      id: string,
      modifierId: string,
      operator: "+" | "-",
      min?: number,
      max?: number,
      providerOverride?: "dnd5e" | "pf2e" | "macro",
      expressionOverride?: string,
      macroUuidOverride?: string,
    }>,
    enabled: boolean,
  }>,
  itemSelectionMode: "highestRankedDrop" | "allDrops", // legacy compatibility-read only
  staminaCost?: number,
  gatheringModifier?: ModifierProvider,
}
```

### Requirements

1. Gathering Tasks are scoped to one crafting system.
2. Disabled Gathering Tasks never match for player gathering.
3. Empty match tags mean "matches any" for that dimension.
4. Region matches when omitted or equal to the environment region.
5. Biomes match when omitted or at least one task biome is present on the environment.
6. Weather and time of day are runtime availability gates, not environment composition match criteria. A task whose required `weather` or `timeOfDay` values are not satisfied by the current enabled condition dimensions remains composed by region/biome/danger, but is not attemptable until the condition gate passes.
7. Persisted, imported, or seeded drop rows require a `dropRate` integer from 0 to 100, a positive quantity, and a reward target that resolves at the data boundary. `componentId` targets must match a component in the owning crafting system. `itemUuid` targets must resolve through Foundry UUID lookup to an Item document. Unresolved editor rows may omit component references while a GM is still authoring the row, but they must not be saved or imported until assigned a valid component or item reference.
8. Drop row condition modifier values are signed integer percentage-point adjustments. Matching time-of-day and weather modifiers are summed into final drop chance; gathering modifiers affect the d100 roll instead.
9. `itemSelectionMode` is a legacy compatibility field. New Manager authoring and d100 runtime behavior use system Gathering Rules once they are authored.
10. Row order is authoritative for `highestRankedDrop` and `limitedDrops`.
11. Drop rows may reference per-system character modifiers. Character modifiers adjust the threshold side of d100 resolution and do not replace task visibility, pass/fail gates, stamina gates, node gates, tool gates, or attempt limits.
12. A Gathering Task may declare stamina cost, node availability, attempt limits, risk overrides, encounter hooks, and condition or roll modifier providers where the selected gathering economy uses them.
13. Per-environment overrides remain associated with the environment and must not rewrite the Gathering Task.
14. Legacy Environment Tasks remain valid as inline compatibility tasks.

## Gathering Tools Library

### Purpose

Represent reusable Tools authored once per crafting system and referenced by gathering tasks through `toolIds`. Tools are **system-owned** (`system.tools`): this is the single canonical Tool library shared with crafting (recipe/step/ingredient-set/salvage `toolIds`), not a gathering-scoped store. It uses the unified `Tool` data model defined in `openspec/specs/data-models/spec.md`.

### Properties

```js
GatheringToolLibraryEntry = {
  id: string,                                  // client-generated, stable
  label: string,                               // optional display label; "" falls back to the component name
  enabled: boolean,                            // disabled tools cannot be referenced by tasks
  componentId: string | null,
  requirement: null | {
    provider: "dnd5e" | "pf2e" | "macro",
    formula?: string,
    macroUuid?: string,
  },
  breakage: {
    mode: "limitedUses" | "breakageChance" | "diceExpression",
    maxUses?: number | null,                   // limitedUses; null is unlimited
    breakageChance?: number,                   // breakageChance; integer 0..100
    formula?: string,                          // diceExpression
    threshold?: number,                        // diceExpression
  },
  onBreak: {
    mode: "destroy" | "flagBroken" | "replaceWith",
    replacementComponentId?: string,           // replaceWith; must !== componentId
  },
}
```

### Requirements

1. Tools are **SYSTEM-OWNED**: the single canonical library is `system.tools` (the `craftingSystems` setting, normalized by `CraftingSystemManager._normalizeSystem`). There is **no** gathering-scoped tools store; the 0.7.0 migration (`migrateToolsToSystem.js`) reconciled any legacy UI-authored `gatheringConfig.systems[id].tools` onto the matching `system.tools` (dedupe by id, the system tool wins) and cleared the gathering-config copy.
2. Library tools follow the existing `Tool` validation contract (`src/models/Tool.js`); persistence layer normalisation never rejects, but Save in the editor blocks until every tool passes `Tool.validate()`.
3. Crafting systems without a `tools` array normalize to `tools: []` on load.
4. The Manager authors tools into the system-owned library; the same library backs the recipe/step/ingredient-set/salvage tool gate, the canvas interactable browser, and gathering.
5. The runtime `composeEnvironment` (`GatheringRichStateService`) sources the library from `system.tools` and exposes it as a non-enumerable `__libraryTools` Map keyed by tool id on the composed environment, alongside `__libraryCharacterModifiers`. Gathering runtime consumers resolve task `toolIds` through this map before actor inventory checks, terminal breakage planning, terminal breakage application, and `usedTools` evidence.
6. The library is per crafting system. Tools are not shared across crafting systems.

## Gathering Character Modifiers

### Purpose

Represent reusable actor-driven modifiers that a GM can apply to d100 drop rows and hazards for one crafting system.

### Properties

```js
GatheringCharacterModifier = {
  id: string,
  label: string,
  icon: string,
  provider: "dnd5e" | "pf2e" | "macro",
  expression?: string,
  macroUuid?: string,
}
```

Character modifier row references use this shape:

```js
GatheringCharacterModifierReference = {
  id: string,
  modifierId: string,
  operator: "+" | "-",
  min?: number,
  max?: number,
  providerOverride?: "dnd5e" | "pf2e" | "macro",
  expressionOverride?: string,
  macroUuidOverride?: string,
}
```

### Requirements

1. Character modifier libraries are scoped to one crafting system at `gatheringConfig.systems[systemId].characterModifiers`.
2. New system gathering shells initialize `characterModifiers` to an empty array. Presets are never seeded automatically.
3. Fabricate may provide opt-in preset seeding for recognized Foundry systems such as `dnd5e` and `pf2e`; seeding skips existing ids and leaves seeded entries editable.
4. Drop row and hazard references resolve against the selected gathering actor using the effective provider, expression, and macro UUID from the row override when present, otherwise from the library entry.
5. Operators are restricted to `+` and `-`; contributions are signed percentage-point threshold adjustments, not multiplicative adjustments.
6. Row `min` and `max` bounds clamp the resolved numeric contribution before the operator is applied. `min > max` is misconfigured.
7. Missing referenced library entries, macro-provider overrides without a macro UUID, non-finite resolution results, and invalid bounds are misconfigured attempts. They must abort before result creation, hazard application, history side effects that imply success, or player-visible reward output.
8. Multiple character modifier references on the same row or hazard are evaluated independently and summed.
9. Timed d100 runs snapshot referenced library entries and resolved evidence at start time so later library edits do not alter completion behavior.
10. GM-facing evidence records the modifier id, effective provider, effective expression or macro UUID, raw resolved value, signed contribution, and clamp information.
11. Non-GM blind gathering history redacts expressions, macro UUIDs, provider diagnostics, hidden row identities, and hidden hazard identities.

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
  characterModifiers?: GatheringCharacterModifierReference[],
}
```

### Requirements

1. Definitions are scoped to one crafting system.
2. Disabled definitions never match for player gathering.
3. Empty match tags mean "matches any" for that dimension.
4. Danger matches when omitted or when the hazard's danger tags are within the environment's canonical `dangerLevel` ceiling.
5. Region and biome matching use the same rules as Gathering Tasks.
5a. Hazard `dangerTags` match against the environment's canonical `dangerLevel` ceiling, with environment `dangerTags` / `risk` used only as legacy fallback when `dangerLevel` is absent.
5b. Weather and time-of-day are runtime hazard gates, not environment composition match criteria. A composed hazard whose required `weather` or `timeOfDay` values are not satisfied by the current enabled condition dimensions is skipped during d100 hazard selection.
6. `dropRate` must be an integer from 1 to 100.
7. Hazards may reference per-system character modifiers. `hazardModifier` adjusts the d100 roll; `characterModifiers` adjust the threshold. The two surfaces are evaluated independently.
8. Hazard output must respect blind task and GM-only redaction rules.

## EnvironmentTask

### Purpose

Represent one legacy inline attemptable gathering activity within an environment. The persisted schema currently uses `GatheringTask`.

### Properties

```js
GatheringTask = {
  id: string,
  name: string,
  description?: string,
  img?: string,  // default is 'icons/svg/item-bag.svg'
  enabled: boolean,

  resolutionMode: "progressive" | "routed" | "d100",

  toolIds: string[],  // references the system-owned Tools library (system.tools[].id, the craftingSystems setting); legacy tasks default to []
  defaultEnvironmentId?: string | null,  // NEW optional field; drop-time env-resolution middle tier (placement hint only; see data-models Canvas Interactables)
  visibility?: GatheringVisibilityGate,
  timeRequirement?: {
    minutes?: number,
    hours?: number,
    days?: number,
    months?: number,
    years?: number,
  },
  check?: GatheringCheck,
  nodes?: GatheringNodeConfig,
  attemptLimit?: GatheringAttemptLimitConfig,
  staminaCost?: number,
  risk?: string,
  encounterHooks?: GatheringEncounterHook[],

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
5. Invalid `failureOutcome` configuration must abort start-attempt validation before provider resolution, terminal history, result creation, tool usage, or failure feedback side effects.
6. GM-facing helper text should document `fail` as the canonical special outcome keyword. Older aliases remain accepted for compatibility but are not the preferred authored form.
7. Disabled tasks are ignored for normal player listing and may not be attempted.
8. Optional node, attempt-limit, stamina, risk, and encounter configuration is applied only when the selected gathering economy and authored task settings enable it.
9. Required-but-reusable, breakable prerequisites for a gathering task are expressed solely through **Tools** referenced by `task.toolIds` (resolved against the **system-owned** Tools library `system.tools`, composed onto the environment as `__libraryTools` by `GatheringRichStateService.composeEnvironment`). There is no gathering-side catalyst concept and no gathering-scoped tools store.
10. `defaultEnvironmentId` is a **new optional field** (`string | null`) and a **placement hint only**. Tasks previously carried no environment reference (they are composed into environments many-to-many via `enabledTaskIds` / `forcedTaskIds`). It normalizes to a trimmed string or `null` (empties dropped) in `adminStore._normalizeGatheringTask` and is preserved by `GatheringEnvironmentStore`. It serves as the middle tier of **drop-time** environment resolution for a canvas Gathering-Task Interactable; a stale id (no matching environment) falls through to the GM dialog rather than throwing. It does **not** participate in environment composition and is unrelated to `environment.sceneUuid` (the runtime gathering gate).

## D100 Gathering Resolution

### Purpose

Resolve gathering-native Gathering Task drops and composed hazards through ordered d100 rows.

### Runtime Requirements

1. Before any player attempt starts, Fabricate rejects gathering if Foundry is paused.
2. For every enabled item row in the selected Gathering Task, resolve row character modifier references, calculate `finalDropRate = clamp(dropRate + environmentDropRateAdjustment + matchingConditionModifiers + resolvedCharacterModifiers, 0, 100)`, roll `d100`, add the gathering modifier, and drop the row when `effectiveRoll >= 101 - finalDropRate`. `environmentDropRateAdjustment` is zero when the selected environment disables task drop-rate adjustments for that task.
3. For every enabled composed hazard in the environment whose runtime condition gates are satisfied, resolve hazard character modifier references, calculate `finalHazardRate = clamp(dropRate + environmentDropRateAdjustment + resolvedCharacterModifiers, 0, 100)`, roll `d100`, add the hazard modifier, and drop the hazard when `effectiveRoll >= 101 - finalHazardRate`.
4. System Gathering Rules select rewards after item rows roll once rules are authored.
5. Reward `highestRankedDrop` awards the first dropped item row in authored row order.
6. Reward `allDrops` awards every dropped item row.
7. Reward `limitedDrops` awards the first `rewardLimit` dropped item rows in authored row order.
8. System Gathering Rules select hazards after hazards roll once rules are authored.
9. Hazard `highestRankedDrop` keeps the first dropped hazard in composed hazard order after applying `hazardOrder`; condition-blocked hazards are skipped before hazard rolling and selection.
10. Hazard `allDrops` keeps every dropped hazard.
11. Hazard `limitedDrops` keeps the first `hazardLimit` dropped hazards in composed hazard order after applying `hazardOrder`; condition-blocked hazards are skipped before hazard rolling and selection.
12. Hazard policy `successWithHazard` reports a successful gathering outcome with hazard evidence when hazards drop.
13. Hazard policy `failureWithHazard` reports a failed gathering outcome with hazard evidence when hazards drop and must not award selected reward rows.
14. Legacy `task.itemSelectionMode`, `environment.hazardSelectionMode`, and `environment.hazardPolicy` fields may be read only when a system has no authored `rules` object; authored system rules override them.
15. If no hazards are enabled or matched, the environment is mechanically safe even when danger tags are present.
16. Attempt history and player-facing output must redact d100 rows, hazards, provider diagnostics, and task identity when the environment is blind and the viewer is not allowed to inspect the underlying task.
17. D100 resolution must write roll, roll-side modifier, threshold-side modifier, selected item rows, selected hazards, condition snapshot, character modifier evidence, and hazard policy evidence where safe to reveal.
18. Timed d100 runs must snapshot the start-time task, hazards, conditions, character modifier library evidence, and rules so later configuration changes do not alter completion.
19. D100 resolution must preserve history-before-side-effects ordering.
20. Existing routed and progressive task resolution modes remain valid compatibility behavior.

## Natural Gathering Expressions and Macros

### Purpose

Allow supported system expressions and macros to configure gathering checks, condition modifiers, stamina formulas, attempt-limit formulas, character modifiers, and per-row character modifier overrides without hardcoding system-specific logic in Fabricate core.

### Requirements

1. `dnd5e` expression fields must allow natural dnd5e roll/formula syntax with actor data references where the selected dnd5e version supports those data paths.
2. `pf2e` expression fields must allow natural pf2e roll/formula syntax with actor data references where the selected pf2e version supports those data paths.
3. Expression evaluation uses the selected gathering actor as the primary actor context.
4. Expression fields support roll terms where the owning provider supports rolls, not only static numeric expressions.
5. Fabricate core must not invent a parallel replacement formula language for dnd5e or pf2e.
6. A GM may choose a custom macro provider instead of a dnd5e or pf2e expression provider where the relevant feature supports provider choice.
7. Macro providers must receive enough context to make equivalent decisions: environment, task, actor, current conditions, stamina state where enabled, node/attempt state where enabled, risk, and triggering lifecycle event.
8. Provider diagnostics from invalid expressions, unsupported data paths, macro exceptions, or malformed macro return values are GM-fix-required diagnostics, not normal player failure outcomes.
9. Player-facing UI must show safe failure/blocking copy for provider diagnostics without exposing macro internals, expression source, or GM-only data to non-GM users.
10. Fabricate core must not hardcode game-system-specific actor paths for character modifiers. Known system paths may be shipped only as editable opt-in preset data.

## Gathering Resource Nodes

### Purpose

Allow gathering tasks to represent resource-node availability independently from result quantity.

### Properties

```js
GatheringNodeConfig = {
  max?: number,
  current?: number,
  depletionTiming?: "onStart" | "onSuccess",
  respawn?: {
    policy: "manual" | "overTime",
    gainMode: "guaranteed" | "chance" | "expression", // when policy is overTime
    intervalUnit: "minutes" | "hours" | "days" | "weeks", // day/week lengths are calendar-derived at runtime
    intervalAmount: number,
    chance?: number,            // 0..1, for gainMode "chance"
    amountExpression?: string,  // dice expression, for gainMode "expression"
    // legacy: nodes authored before the unit/amount schema may carry a raw
    // intervalSeconds instead; the runtime honours it until migrated.
  },
}
```

### Requirements

1. A task may define maximum and current available node counts.
2. Available node count controls whether additional attempts may start; it does not directly define result quantity.
3. Result quantity remains governed by routed, progressive, or d100 task resolution and result/drop-row data.
4. A task with node gating and `availableCount <= 0` is blocked for non-GM start attempts unless a GM override is explicitly used.
5. Node availability is evaluated after environment/task visibility and before terminal resolution.
6. Node depletion occurs only after an attempt is accepted according to the configured depletion timing.
7. Supported depletion timing includes at least `onStart` and `onSuccess`.
8. If a task is blind, node count display to non-GM users uses generic availability copy unless revealing the count is explicitly safe for that environment.
9. GM users can inspect and manually adjust node availability.
10. A respawn policy may be `manual` or `overTime`. `manual` means only a GM restock action changes available node count; `overTime` restores nodes once per elapsed world-time interval. Legacy pre-0.4.0 auto-respawn policies (`elapsedTime`, `probability`, `manualAndElapsedTime`) are mapped to `overTime` at read time (matching the 0.4.0 migration), so a world whose node data was never migrated still respawns instead of silently degrading to `manual`; `none`/unknown remain `manual`.
11. An `overTime` policy selects a `gainMode` per interval: `guaranteed` (+1), `chance` (a configured 0..1 probability of +1, persisted as a roll), or `expression` (roll a dice expression and add the rolled total).
12. The respawn interval is authored as `intervalUnit` (`minutes` | `hours` | `days` | `weeks`) + `intervalAmount`. A unit of `days` or `weeks` resolves its length from the active Foundry world calendar (`game.time.calendar`) at runtime so it tracks custom calendars; `minutes`/`hours` are fixed (60s/3600s); with no calendar the lengths fall back to 86400s/604800s. Nodes authored before this schema may persist a raw `intervalSeconds`, which the runtime honours until a migration rewrites it to unit+amount.
13. `chance`-mode respawn persists the evaluated roll/outcome so repeated listing refreshes do not reroll the same interval.
14. Respawn advances its `lastEvaluatedWorldTime` anchor by exactly the consumed intervals, so a same-tick refresh never re-applies and the fractional remainder accrues toward the next interval.
15. Respawn evaluation is deterministic from persisted state once evaluated.
16. Respawn must not exceed the task's configured maximum node count unless a GM override explicitly changes the maximum or applies an overstock action.
17. Respawn and restock events should be visible in GM logs or audit-style UI where practical.
18. Player-facing UI should show availability and next respawn hints only when those hints do not violate hidden/blind environment rules.
19. A per-environment node runtime entry persists only STATE — the current count, a GM-overridable `max`, and the respawn timers (anchor/roll). The respawn CONFIG (policy, gain mode, interval, depletion timing) is sourced from the current library task at evaluation time and is never frozen at first depletion, so editing a task's respawn config takes effect in every environment, including pools already depleted to zero.

## Gathering Attempt Limits (removed)

> Removed by the gathering-attempt-limitation change. The per-scope attempt-count
> limiter (`GatheringAttemptLimitConfig`, `task.attemptLimit`, and its recharge)
> was scaffolded but never enforced and has been deleted. Pacing is provided by
> the per-system economy mode (`stamina` / `nodes`) instead. The original
> requirements are retained below for historical context only and are no longer
> normative.

### Purpose

Allow gathering tasks to limit accepted attempts separately from node availability.

### Properties

```js
GatheringAttemptLimitConfig = {
  scope: "actor" | "environment" | "task" | "user" | "global",
  maxAttempts: number,
  windowSeconds?: number,
  rechargePolicy?: "manual" | "elapsedTime" | "probability" | "manualAndElapsedTime" | "none",
  rechargeChance?: number,
}
```

### Requirements

1. A task may define a maximum number of accepted attempts per actor, per environment, per task, per user, or globally, as selected by GM configuration.
2. A task may define an attempt-limit time window such as per hour, per day, per rest period, or a custom world-time duration.
3. A task may define probabilistic attempt recharge triggered by elapsed world time.
4. A task may define manual GM recharge of attempts.
5. A task may define both manual and elapsed/probabilistic recharge.
6. Attempt limits are evaluated after visibility and access guards but before stamina spend, node depletion, provider execution, terminal history, or result creation.
7. Probabilistic attempt recharge persists evaluated recharge outcomes so repeated UI refreshes do not reroll the same recharge interval.
8. Attempt-limit counters and recharge state are scoped according to the configured limit scope.
9. GM users can inspect and manually adjust attempt counters and recharge state.
10. Player-facing UI should show remaining attempts or generic exhausted/recharging copy when doing so does not violate blind or hidden-task rules.
11. Attempt limits do not replace node availability. A task may have node limits, attempt limits, both, or neither.

## Gathering Economy and Stamina

### Purpose

Allow crafting systems with gathering enabled to select the primary pacing economy and optionally use actor-scoped stamina.

### Properties

```js
// Stored per crafting system at gatheringConfig.systems[systemId].economy.
GatheringEconomyConfig = {
  mode: "none" | "stamina" | "nodes",
  stamina: {
    regen: {
      policy: "none" | "elapsedTime",
      unit: "minutes" | "hours" | "days" | "weeks", // day/week lengths are calendar-derived at runtime
      amount: number | null,            // fixed amount per unit
      formula: string,                  // provider expression; wins over amount when set
      characterModifiers: ModifierReference[],
      lastRoll: object | null,
    },
  },
}
```

### Requirements

1. The gathering limitation mode is selected per crafting system and is one of `none`, `stamina`, or `nodes`.
2. `none` applies no limitation (legacy behaviour); timed attempts via `timeRequirement` remain available in every mode and are orthogonal to the limitation mode.
3. `nodes` uses task availability/depletion/respawn as the limitation model; node enforcement applies only in this mode.
4. `stamina` uses actor stamina spend/regeneration as the limitation model; stamina enforcement applies only in this mode.
5. A task's stamina cost may be adjusted per actor by character-modifier references resolved against the per-system character modifier library, floored at zero.
6. The selected economy mode controls which GM authoring controls are primary, secondary, or hidden.
7. Existing gathering systems without an economy mode behave as `none`; a 0.3.0 migration removes the legacy per-environment `economyMode` field and the unused per-task `attemptLimit`, mapping a non-`time` legacy value onto the system mode (`hybrid → stamina`).
8. Gathering stamina is optional and actor-scoped.
9. When stamina is enabled, a gathering task may define a stamina cost.
10. A start attempt is blocked if the selected actor lacks the required stamina and no GM override is used.
11. Stamina spend occurs only after start guards pass.
12. Stamina spend, refund, and rollback semantics must be explicit in implementation design before production code changes.
13. A crafting system lets the GM choose whether stamina regenerates over time, regenerates from explicit rest/provider events, is manual-only, or uses a hybrid of manual and automatic regeneration.
14. Manual-only stamina means stamina changes only through explicit GM adjustment, approved API calls, or provider events configured by the GM.
15. Automatic elapsed-time regeneration defines an interval and amount, or a provider expression/macro that calculates amount from actor and world-time context.
15a. The regeneration interval `unit` of `days` or `weeks` resolves its length from the active Foundry world calendar (`game.time.calendar`) so it tracks custom (non-24h-day / non-7-day-week) calendars; `minutes` (60s) and `hours` (3600s) are fixed. With no calendar configured the lengths fall back to 86400s (day) and 604800s (week), reproducing the pre-calendar behaviour. The interval length is resolved per evaluation so a mid-session calendar change is honoured.
16. Rest/provider-event regeneration identifies the provider event or hook contract that grants stamina.
17. GMs can manually set current stamina for an actor when they have permission to manage that actor's gathering state.
18. GMs should be able to manually set or override maximum stamina when the selected stamina provider is Fabricate-owned. External provider maximums may be read-only.
19. System-specific stamina formulas are provider-driven or configured; Fabricate core does not hardcode system-specific resource paths.
20. Actor stamina state may be stored in Fabricate actor flags when no external provider owns stamina.
21. Actor stamina display includes current and maximum values when known.
22. Stamina history should record enough evidence for players and GMs to understand spend, manual adjustment, and regeneration events.

## Gathering Risk and Encounters

### Purpose

Allow environments and tasks to define player-facing risk and optional encounter hooks.

### Requirements

1. An environment may define a default risk level.
2. A task may override the environment risk level.
3. Risk level is player-facing unless hidden by blind/visibility rules.
4. Risk level may modify encounter chance, failure outcome, check difficulty, stamina cost, or result yield through declarative modifiers or providers.
5. A task or environment may define one or more encounter table hooks.
6. Encounter hooks should support attempt, success, failure, critical failure, node depletion, and high-risk event points where those event points are available.
7. Encounter table resolution is optional. A gathering attempt without encounter configuration behaves normally.
8. Encounter outcomes are persisted or reported consistently enough that UI refreshes do not duplicate the same encounter.
9. Encounter automation beyond selecting/reporting an outcome may be delegated to integrations or macros.
10. Non-GM player-facing encounter feedback respects blind-task redaction and visibility rules.

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
- the chosen task determines required tools, time requirement, and resolution behavior

Targeted gathering is for intentional seeking, such as "forage for mooncap mushrooms" or "search for iron-rich ore".

### Blind Environments

In `blind` mode:

- the environment may contain multiple hidden gathering tasks
- the player does not choose between unrevealed hidden targets
- non-GM player listings present a generic gather action or equivalent environment-level action unless progressive discovery has revealed one or more tasks to the selected actor
- on start, the engine builds a candidate pool from the environment's visible, enabled tasks, then applies the system `blindCandidateGate`: under `attemptableOnly` (default) tasks the character cannot currently attempt are excluded so the generic gather never resolves to a task that would immediately fail; under `allMatching` the full matching set remains eligible
- the candidate is selected from that pool by a weighted random draw over the environment's `blindSelection.weights` (per-task value, default `1`, non-positive excludes); this is the only selection algorithm
- if the gated pool is empty, the attempt is blocked with an opaque "nothing you can gather here" reason (`BLIND_NO_CANDIDATE`) and no task identity is leaked
- revealed blind tasks may become visible as named task rows for the configured reveal scope, while unrevealed tasks remain hidden
- blind task active runs, history, chat messages, and duplicate/attempt-limit blockers use generic labels until the task is revealed for that viewer or the viewer is a GM

Blind gathering simulates gathering from a place without player certainty about which hidden resource the environment will yield.

### Blind Gathering Discovery

1. A blind environment may enable progressive task reveal.
2. Reveal is governed by a `revealPolicy` (`never` default | `onSuccess` | `onAttempt`) and `revealScope` (`actor` | `user` | `party` | `global`), set on the system Gathering Rules. Environments do not override these.
3. After a blind attempt terminates (immediate or timed completion), the engine reveals the resolved task when the effective policy is `onSuccess` (success only) or `onAttempt` (success or failure); `never` is a no-op. Reveal is best-effort and never blocks the attempt result. Targeted environments never auto-reveal.
4. Reveal scope determines who learns the task: just the actor, the controlling user, the party/source group, or everyone. Additional triggers (specific result, encounter outcome, GM manual reveal, API call, or macro/provider decision) may also drive reveal.
5. Revealed task history preserves enough evidence to keep the task visible for the configured reveal scope unless the GM clears or resets discovery.
6. GM users can inspect all blind tasks, reveal state, reveal triggers, and reset/revoke reveal state.

## Scene and Permission Gating

### Pause Rule

Gathering cannot occur while the game is paused.
If Foundry is paused, Fabricate must reject new gathering attempts before run-start, tool, or resolution logic are applied.

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
8. Listing output separates visibility from attemptability so scene/token, duplicate active run, and tool blockers can keep otherwise visible entries listable with localized blocked reasons.

In `blind` environments, if no task is visible, revealable, or selectable by configured blind-selection logic for an actor, that actor cannot gather from the environment.
For non-GM users, unrevealed blind tasks remain opaque in listing output: generic localized labels replace task identity, images, visibility diagnostics, resolution metadata, and tool details. GMs may inspect the real blind task metadata.

A disabled environment returns no player-visible tasks (requirement 1 above), but is surfaced as a locked identity-only listing to all viewers (players and GMs alike), carrying zero tasks. See *Player Environment Listing*.

## Player Environment Listing

### Purpose

Define the redaction-safe per-environment fields the player listing API surfaces to a non-GM actor, alongside the existing visibility/attemptability/blocked-reason output.

### Requirements

1. Each environment entry in a non-GM listing carries identity and player-facing metadata (name, description, image, region, biome(s), danger/risk, selection mode, scene linkage) plus `visible`, `attemptable`, and localized `blockedReasons`, in addition to the fields below.
2. `locked` (boolean) marks an entry that is a disabled-environment teaser. Disabled environments are surfaced as locked identity-only listings to all viewers in the player listing (players and GMs alike). A locked entry is `attemptable: false`, carries an `ENVIRONMENT_DISABLED` blocked reason, exposes no `tasks` and no composition internals (weights, drop data, hidden task identity), and is non-interactive for the player.
3. `revealPolicy` is the **effective system-level** reveal policy (`never` | `onSuccess` | `onAttempt`) resolved from the system Gathering Rules. It is system-level only; environments never override it (see *System Gathering Rules* requirement 10).
4. `composedTaskCount` is the size of the environment's total composed task pool — the denominator (`y`) for a blind `(x/y)` discovery display. It is a pool size and is distinct from any GM-runtime "available right now" count, which additionally excludes condition-blocked records. A locked entry reports `0`.
5. `discoveredTaskCount` is the count of tasks the requesting actor has revealed at the effective reveal scope — the numerator (`x`). It is `0` when the entry is locked or when the effective `revealPolicy === 'never'`.
6. `discoveredTasks` is an array of transparent, individually-attemptable task models for the tasks a non-GM viewer has revealed in a `blind` environment, restricted to the intersection of revealed tasks with the entry's currently-visible tasks. Each model carries `discovered: true` and the same player-facing fields and localized `blockedReasons` as a normal targeted task row (real `requiredTimeOfDay` / `requiredWeather` / missing-tool data, not the redacted opaque form). It is always `[]` when the effective `revealPolicy === 'never'`, for targeted environments, for locked entries, and for GM viewers (who already receive the full transparent `tasks` list). It is built only from the already-computed visible-task set intersected with the revealed-id set, never from a fresh visibility pass, so it can never leak the identity of an unrevealed or hidden task. Because the intersection excludes revealed-but-currently-invisible tasks, `discoveredTasks.length` may legitimately be less than `discoveredTaskCount` (which counts all reveals at the effective scope). For a non-GM viewer of a `blind` environment the `tasks` array collapses to a single opaque `blindGather` action entry; the individually-attemptable revealed rows live only in `discoveredTasks`.
7. Each transparent task model carries `successChance`: a `0`–`1` fraction OR `null`. It is a STATIC drop-rate approximation, `1 − ∏(1 − dropRate_i/100)` over the task's enabled drop rows, and is meaningful only for `resolutionMode === 'd100'`. It is `null` for progressive/routed resolution modes and when there are no enabled drop rows (so the UI hides the success-chance bar). It represents "chance at least one drop row rolls" — the chance the attempt finds something — and is NOT whole-attempt success: it ignores the d100 success threshold, condition/character modifiers, attempt/node/stamina/tool gates, and hazard policy. It is absent from the opaque `blindGather` entry, which must not leak any aggregate drop information.
8. `biomeTags` carries resolved biome display metadata (id, label, icon, and color token/custom color) so player biome chips render consistently with GM authoring. The per-system biome vocabulary takes precedence over the global vocabulary, then defaults.
9. These listing fields are additive and redaction-safe: they must not leak hidden task identity, hidden result details, weights, provider diagnostics, or GM-only notes. Computing reveal/biome metadata is best-effort and must degrade to safe defaults (`0` / empty) rather than failing the listing.
10. `hazardChance` is the aggregate static "chance of encountering a hazard", a `0`–`1` fraction computed as `1 − ∏(1 − dropRate_i/100)` over the environment's enabled hazards (ignoring actor/condition/character modifiers and hazard selection-mode/limit). It is `0` when no hazards are enabled. It is always emitted, including for blind environments, so the player UI can show the hazard meter even when individual hazards are redacted.
11. `hazards` is an array of read-only hazard models the player UI lists alongside the tasks and inspects in a detail view. Each model carries player-facing identity (`id`, `name`, `description`, `img`), the hazard's `dangerTags` and a derived `risk` tier (the first danger tag, or `safe`), a static per-hazard `chance` (`dropRate/100`, clamped to `0`–`1`), the hazard's matching criteria (`weather`, `timeOfDay`, `biomes`, `regions` — each a string array where empty means "any"), resolved `biomeTags` display metadata (id/label/icon/colour, like the environment's biome tags) so biome chips render consistently, and an optional `linkedSceneUuid`. Modifier internals (hazard/condition/character modifiers) are NOT surfaced. Only enabled hazards are surfaced. It is `[]` for locked entries and — mirroring how the `tasks` list collapses — `[]` (redacted) for a non-GM viewer of a `blind` environment; targeted environments and GM viewers (including GM viewers of a blind environment) receive the full list. Hazard models are informational only: they carry no attempt action and no provider diagnostics.

## Tool Usage Semantics

Gathering required-but-reusable prerequisites are **Tools** (the retired gathering-catalyst concept is fully removed; the dead/vestigial `task.catalysts` field carried no authored data — see *Destructive Changes and Migrations*). Tool usage/breakage semantics for terminal gathering attempts:

- A task may reference zero or more required Tools via `toolIds`.
- A Tool's usage/breakage is applied only for a **terminal** attempt (`succeeded` or `failed`).
- Blocked or misconfiguration-aborted attempts do not apply tool usage/breakage.
- Usage tracking and breakage follow the Tool `breakage` / `onBreak` semantics (`limitedUses` / `breakageChance` / `diceExpression`).
- Gathering tasks do not draw Tools from component source actors; tool presence and terminal tool usage/breakage are both evaluated against the selected acting actor.
- Terminal tool usage/breakage is applied only after the gathering outcome has resolved to `succeeded` or `failed`.
- A virtual-present Tool injected by a canvas Tool station (`presentTools`, system-scoped) satisfies the gate without an owned item and is excluded from usage/breakage.

## Gathering Task Tools

### Purpose

Tools are the unified required-but-reusable, breakable prerequisite primitive (shared with crafting; the retired Catalyst concept folded into it). Gathering tasks reference **system-owned** library Tools (`system.tools`, the single canonical library) via `toolIds`; there is no separate gathering-scoped tools store (the 0.7.0 migration reconciles any legacy `gatheringConfig.systems[id].tools` onto the system). Composition exposes the library to the engine as the `__libraryTools` map on the composed environment. Tools may break across attempts and may need an actor-side requirement (for example a system-specific proficiency flag). The full `Tool` model and validation matrix are defined once in `openspec/specs/data-models/spec.md`.

### Properties

```js
Tool = {
  componentId: string,
  requirement: null | {
    provider: "dnd5e" | "pf2e" | "macro",
    formula?: string,
    macroUuid?: string,
  },
  breakage: {
    mode: "limitedUses" | "breakageChance" | "diceExpression",
    maxUses?: number | null,         // limitedUses
    breakageChance?: number,         // breakageChance; integer 0..100
    formula?: string,                // diceExpression
    threshold?: number,              // diceExpression; broken when result < threshold
  },
  onBreak: {
    mode: "destroy" | "flagBroken" | "replaceWith",
    replacementComponentId?: string  // replaceWith; must !== componentId
  }
}
```

### Requirements

1. A task may reference zero or more required tools via `toolIds: string[]`. Each id references an entry in the system-owned library `system.tools[]` (the single canonical Tools library); the composed environment's `__libraryTools` Map (sourced from `system.tools` by `GatheringRichStateService.composeEnvironment`) resolves each id to a `Tool` object at runtime. References whose id is no longer in the library, or that resolve to a disabled library tool, block start with `TOOL_BLOCKED` because the task's required equipment is misconfigured. Task authoring UI lets the GM add and remove tool ids; inline `Tool` authoring on tasks is not supported — the per-system library is the single source of truth. All resolved tools are required (catalyst-style); the start-attempt gate blocks the attempt with `TOOL_BLOCKED` when any resolved tool is missing from the actor, broken, or fails its requirement.
2. Owned items with `flags.fabricate.toolBroken === true` do not satisfy tool presence; the gate must treat them as not-present until a GM clears the flag.
3. The optional `requirement` is evaluated against the selected acting actor through the existing system-agnostic expression adapter. A system-provider truthy value (non-zero number, non-empty string, `true`) satisfies the requirement; macro returns may be a bare boolean or `{ allowed: boolean, description?: string }`.
4. Exactly one `breakage.mode` is configured per tool. `limitedUses` uses the `flags.fabricate.toolUsage = { timesUsed }` item flag, incremented on each attempt; the tool breaks when `timesUsed >= maxUses` (after the increment) when `maxUses` is non-null. `breakageChance` breaks when `Math.random() * 100 < breakageChance`. `diceExpression` evaluates `formula` through the expression adapter; the tool breaks when the numeric result is `< threshold`.
5. Exactly one `onBreak.mode` is configured per tool. `destroy` deletes the owned item. `flagBroken` sets `flags.fabricate.toolBroken = true`. `replaceWith` deletes the original and creates the `replacementComponentId` managed component on the actor; the replacement is a normal managed component that recipes can consume to repair the tool.
6. Tool breakage is planned before result creation so the system-level `toolBreakagePolicy` can override the outcome. The `failureOnBreak` policy (default) flips a successful attempt to `failed` and clears `outcome.resultGroups` when any tool breaks. The `successDespiteBreak` policy leaves the outcome untouched. Either way, tool destruction/flagging/replacement always commits.
7. The terminal response includes a `usedTools` array describing each matched tool's breakage decision and on-break action.
8. Legacy tasks without a `tools` field normalize to `tools: []` on load; no migration runner entry is required.
9. Tool authoring is rejected when `componentId` is missing, when a `replaceWith` action uses the same id as the tool's component, or when mode-specific fields are absent or out of range (`maxUses` not a positive integer, `breakageChance` not an integer in `0..100`, `formula` empty, `threshold` non-finite).

## Canvas Gathering-Task Interactables

### Purpose

A Gathering Task may be placed on the Foundry canvas as a **Scene Region** carrying a `fabricate.interactable` Region Behaviour; a linked Tile (or Drawing / existing Token) is a presentation-only marker (region-only is also supported). There is no synthetic actor or proxy token. Activation is **token presence**: a controlled token entering the region offers the controlling player a non-blocking interact prompt; on Interact the gathering app opens scoped to that task and resolved environment, **auto-selecting both**. The behaviour `system` schema, env-resolution precedence, linked-visual model, and session-scoped tool injection are defined in `openspec/specs/data-models/spec.md` (Canvas Interactables). A gathering-task interactable is a pure `(environment, task)` shortcut — the gathering-runtime rules it imposes are:

### Requirements

1. **No per-interactable node pool — the environment owns node state.** A gathering-task interactable carries **no** `behavior.system.node`; it uses the environment's `nodeRuntime[taskId]` as the single source of truth for node counts, depletion, and respawn. Activating it reads/decrements that environment node exactly like opening gathering directly — it does not alter environment node availability beyond a normal gathering attempt. Tool requirements resolve from `task.toolIds` against `system.tools` at attempt time. **Removed (do not reintroduce):** the per-interactable/per-token node snapshot+adapter, the `nodeStateOverride` thread, the per-behaviour/per-marker world-time respawn pass, and any precedence of a behaviour node over the environment node.
2. **GM-routed activation; no node-state writes from the interactable.** Activation routes the request to the active GM, which validates and grants (the interactable performs no node-state write of its own; node depletion/respawn happen in the normal gathering attempt against the environment). When a player interacts and no active GM is connected, surface a graceful "a GM must be online to gather here" message rather than silently failing. A **denied** activation returns a localized reason (`FABRICATE.Canvas.Interactable.Denied.*`) to the requesting player.
3. **Player-facing depleted state comes from the environment node.** Depleted + calendar-aware respawn-ETA state is whatever the environment's `nodeRuntime[taskId]` reports through the normal gathering listing — the interactable adds nothing on top.
4. **Drop-time environment resolution.** The interactable's `environmentId` is resolved at drop by the precedence chain (tagged Scene Region `flags.fabricate.environmentId` → task `defaultEnvironmentId` → GM dialog; Alt forces the dialog). This is a placement-time decision distinct from the runtime `environment.sceneUuid` gate.
5. **Timed/waiting-run maturity decrements the environment node.** For a timed task started from an interactable, nothing decrements at start (correct for `onSuccess`); at maturity the decrement lands on the **environment** node (`environment.nodeRuntime[taskId]`), same as a timed task started from the gathering app directly. There is no behaviour-ref seam.

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
Provider diagnostics from the check evaluator abort resolution as misconfiguration/provider errors; they do not create failed gathering history, failure feedback, tool usage, or result items.

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
6. For blind environments with unrevealed tasks, resolve the selected task through the configured blind-selection logic before task-specific spend, provider, or terminal resolution.
7. Reject if the actor already has an active gathering run for the same `taskId`.
8. Validate required Tools (`task.toolIds`) against the selected acting actor.
9. Evaluate attempt limits and node availability after visibility/access/tool guards and before stamina spend, provider execution, terminal history, or result creation.
10. Resolve condition modifiers before check/provider execution when they affect check difficulty, yield, stamina cost, risk, encounter chance, or availability.
11. Validate and spend stamina only after all earlier start guards pass and before accepted terminal or timed run creation.
12. Validate the selected task's configuration for the chosen resolution mode, including `failureOutcome`, before invoking providers or writing terminal side effects.
13. Snapshot economy-relevant data for the attempt, including current conditions, risk level, stamina cost/spend, node depletion, attempt-limit evidence, and encounter hook state where those features are enabled.
14. If `task.timeRequirement` is absent:
   - return `accepted: true`,
   - return `started: true`,
   - resolve the routed, progressive, or d100 terminal outcome,
   - do not create an active run,
   - plan `createdResults`, `usedTools`, and `checkResult` before post-history commits,
   - write exactly one terminal history entry for `succeeded` or `failed` outcomes with those planned refs,
   - abort without result creation, tool usage, or failure feedback if terminal history persistence fails,
   - create gathered result items on the selected actor only when the outcome is `succeeded` after terminal history persists,
   - do not create gathered result items when the outcome is `failed`,
   - apply tool usage/breakage for the terminal attempt after the outcome is known, terminal history persists, and only against the selected actor,
   - apply configured or default failure feedback on failed outcomes after terminal history persists,
   - apply accepted node depletion and encounter reporting only after the relevant state transition is persisted enough to avoid duplicate or uncommitted output,
   - for non-GM blind attempts, redact task identity, result details, tool details, provider diagnostics, check internals, and sensitive encounter details from player-facing responses and persisted terminal history.
15. If `task.timeRequirement` is present after all start guards and task validation pass:
   - create exactly one active gathering run,
   - set run status to `waitingTime`,
   - persist a time gate derived from the declared duration,
   - persist the condition/economy snapshot needed to resolve or explain the run at completion,
   - return the in-progress run state to the UI,
   - do not pass `usedTools` or `createdResults` into waiting-run creation,
   - do not write terminal history,
   - do not apply tool usage/breakage,
   - do not create result items.

Immediate terminal outcome resolution is current `startAttempt` behavior for non-timed tasks. Timed backend completion/resolution, timed result creation, timed tool side effects, timed terminal history writes, timed cancellation for missing references, and misconfiguration cleanup are current module-private `GatheringEngine.processWorldTime(worldTime)` behavior. Module bootstrap constructs and loads the gathering runtime internally after systems load, wires environment-store cleanup callbacks to `GatheringRunManager`, exposes the store/run/evaluator getters plus narrow viewer-enforcing `listGatheringForActor(options)` and `startGatheringAttempt(options)` methods, and dispatches ready/updateWorldTime processing to `processWorldTime(worldTime)` with error isolation. The raw engine instance is not public. The current GM admin `Environments` editor is gated by the selected system's `features.gathering`, lists cloned environment records from the store, exposes a cloned selected draft, edits name, description, enabled state, selection mode, and scene UUID, tracks selected-draft dirty state, provides visible save/cancel actions, and falls back to a valid active tab when the environment tab is no longer visible. Creating an environment persists a disabled draft shell; automatic composition can use matching library-backed Gathering Tasks without creating or requiring an inline placeholder Environment Task. Legacy inline task drafts may still use disabled placeholders for validation compatibility, and those shells are not configured player-visible gathering paths until configured and enabled by the GM. Duplicate, delete, and reorder use environment-store methods, and delete requires confirmation before the store cleans referenced gathering runs. Store-owned task/result/tool/visibility/result-selection/progressive/check/time/failure callbacks are wired from the root into the tab, and the tab delegates those mutations to the admin store. The selected draft supports task-list CRUD (add, select, duplicate, delete, and reorder), base task field edits for `name`, `description`, `img`, `enabled`, and `resolutionMode`, selected-task result-group authoring, selected-task tool-reference (`toolIds`) authoring, selected-task visibility-gate authoring, routed result-selection provider authoring, progressive check/award-mode authoring, selected-task time-requirement authoring, and selected-task failure-outcome authoring. Result-group authoring includes group add/rename/delete/reorder plus component-based result add/edit/delete/reorder for `componentId` and `quantity`. Tool authoring references existing per-system library Tools by id (`toolIds`); inline Tool authoring on tasks is not supported (the per-system library is the single source of truth). Visibility authoring supports enable/clear plus `macro`, `dnd5e`, and `pf2e` provider fields, with incomplete provider input kept local until required fields are available for a valid draft mutation. Routed result-selection authoring supports `macroOutcome.macroUuid` from available script macro options and `rollTableOutcome.rollTableUuid` as UUID text input. Progressive authoring supports `progressive.awardMode` values `equal`, `partial`, and `exceed`, plus `macro`, `dnd5e`, and `pf2e` checks with optional thresholds for dnd5e/pf2e. Time-requirement authoring supports immediate tasks by clearing `timeRequirement` and timed tasks by editing minutes, hours, days, months, and years. Failure-outcome authoring supports clearing to default failure feedback plus text and macro custom outcomes, with provider switching clearing stale provider fields. Task/result/tool/visibility/result-selection/progressive/check/time/failure edits preserve nested task configuration outside the edited collection and continue to save through the environment-store validation boundary. New draft placeholder result groups receive immediate IDs so they can be edited before save/reload. Managed item options are prepared by the admin store/root and passed into the environments tab; the tab does not perform Foundry lookups. Progressive difficulty is displayed from selected managed component difficulty and is not persisted inline on result rows because canonical store validation uses managed component difficulty. Dirty environment draft confirmation, save-blocking validation/accessibility presentation, the player-facing gathering app, the Items Directory `Gathering` action, dedicated gathering app registration, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage are implemented. Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.

### Completion Flow

When world time advances to or past a run's `timeGate.availableAt`, the backend gathering runtime resumes matured `waitingTime` runs through `GatheringEngine.processWorldTime(worldTime)`:

1. Re-resolve the environment, task, crafting system, and actor.
2. If required references are missing, cancel the run and move it to history with a terminal status, with blind redaction where an opaque blind environment can still be resolved.
3. If the task is misconfigured at resume time, clear the active run without terminal player history, result items, tool usage, or failure feedback, and require a fresh manual start after the task is repaired.
4. Resolve completion-time condition/economy behavior from the persisted run snapshot unless the GM explicitly configured completion-time conditions.
5. Resolve the terminal outcome:
   - routed result group
   - progressive awarded results
   - d100 drop rows and hazards
   - failure
6. Plan terminal `createdResults`, `usedCatalysts`, `checkResult`, stamina/node/attempt-limit evidence, and encounter evidence where enabled.
7. Remove the run from `active`, prepend it to `history`, and return the terminal result by calling `GatheringRunManager.completeRun()`.
8. If `completeRun()` returns `null` or throws, report a completion error and do not create result items, apply catalyst usage, run failure feedback, or emit terminal chat.
9. If the outcome is `succeeded`, create the resolved result items on the actor only after terminal history persists.
10. If the outcome is `failed`, do not create gathered items, and execute configured special-outcome text or macros only after terminal history persists.
11. Degrade or destroy used catalysts for the terminal attempt only after terminal history persists.
12. For non-GM blind timed completions and cancellations, redact real task identity, result details, catalyst details, provider diagnostics, check internals, and sensitive encounter details from player-facing responses and persisted terminal history; persisted terminal history may use a generic blind marker instead of the real `taskId`.

### Rich Lifecycle Evidence

1. Start guards evaluate node availability and stamina after existing environment/task/scene/visibility/catalyst guards pass and before terminal resolution begins.
2. Timed runs preserve the condition/economy snapshot needed to resolve or explain the run at completion.
3. If conditions are intended to affect completion rather than start, that behavior must be configured explicitly and visible to the GM.
4. History entries should include redaction-safe summaries of stamina spent, node availability changes, attempt-limit state, condition modifiers, risk, and encounter outcomes.
5. Blind environments continue to redact real task identity, hidden results, provider diagnostics, and sensitive encounter details for non-GM users.

## Rich Gathering APIs and Hooks

### Requirements

1. Fabricate exposes documented APIs for listing rich gathering environments for an actor, starting a gathering attempt, inspecting GM-only environment state, manually restocking nodes, manually recharging attempt limits, manually setting stamina, and revealing or clearing blind-task discovery where permissions allow.
2. Fabricate exposes `game.fabricate.gathering.getConditions()` for current global conditions and tag vocabularies.
3. Fabricate exposes `game.fabricate.gathering.setWeather(weatherTag)`, `setTimeOfDay(timeOfDayTag)`, and `setConditions({ weather, timeOfDay })` for authorized GM/API callers.
4. Condition mutation APIs reject unauthorized player callers and invalid tags before persistence.
5. Public player APIs enforce the same visibility, scene/access, blind redaction, stamina, node, attempt-limit, and provider-diagnostic secrecy rules as the UI.
6. GM APIs may expose full diagnostic and hidden task state when called by an authorized GM context.
7. Hook points should exist before and after major lifecycle events: environment listing, task visibility evaluation, condition modifier resolution, stamina calculation, stamina spend, attempt-limit evaluation, node availability evaluation, node depletion, attempt start, provider resolution, encounter resolution, result creation, history write, chat message creation, respawn/recharge, manual restock, manual stamina adjustment, and blind reveal.
8. Hooks can observe or modify only the phases explicitly documented as mutable. Read-only phases must not allow mutation.
9. Hook payloads include stable ids and redaction-safe display data for player-facing hooks, plus full GM data only for GM-authorized hooks.
10. Hook and API errors are isolated and reported as diagnostics without corrupting gathering state.
11. APIs that mutate stamina, node counts, attempt limits, condition state, or reveal state validate permissions and write auditable history or GM log evidence where practical.
12. Developer-facing contracts avoid direct dependency on Foundry globals from presentational Svelte components; Foundry access remains in runtime/service boundaries.

## Gathering Chat Messages

### Requirements

1. A crafting system or gathering environment should allow GMs to configure whether gathering attempt chat messages are created.
2. Chat output may be configured for attempt started, immediate success, immediate failure, timed completion, cancellation, encounter outcome, node depletion/restock, stamina spend/regeneration, and blind discovery.
3. Chat messages respect blind task redaction and non-GM information disclosure limits.
4. Chat messages should include actor, environment, task label or blind-safe generic label, condition summary, stamina spend where visible, risk where visible, and result/failure/encounter summary where visible.
5. GM-only diagnostics may be whispered or otherwise restricted to GMs.
6. Chat message creation occurs only after the relevant state transition is accepted or persisted enough to avoid announcing events that later fail to commit.
7. Chat output is customizable by localization and may be customizable by macro/provider where approved.

## Misconfiguration Errors

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

- targeted save must be blocked until at least one task is configured
- blind save must allow one or more tasks and must require valid blind-selection/redaction configuration when more than one task can be selected
- automatic deletion of extra tasks is not allowed by default

### Linked Scene Deletion

If a linked scene is deleted:

- keep `sceneUuid` unchanged
- warn in environment-editing UI
- runtime scene-gated player access fails closed until the link is corrected or removed

## Testing Requirements

- Unit tests for environment validation:
  - `targeted` requires an explicit task source unless automatic library composition can provide matching Gathering Tasks
  - `blind` allows multiple tasks and validates blind-selection/redaction configuration
- Unit tests for default tag seeding and preservation of GM-customized tags
- Unit tests for task/hazard composition matching by region, biome, and danger, plus runtime condition gating by global weather and global time of day
- Unit tests proving weather/time do not appear as player environment browse filters
- API tests for `getConditions`, `setWeather`, `setTimeOfDay`, `setConditions`, permission checks, validation, persistence, and hook dispatch
- Unit tests for visibility-gate evaluation using `dnd5e`, `pf2e`, and macro providers
- Unit tests for pause-state rejection
- Unit tests proving paused player gathering creates no stamina spend, rolls, chat, history, or item awards
- Unit tests for scene gating and actor/token presence checks
- Unit tests for start-attempt guard ordering: rejected starts create no runs, immediate accepted starts write terminal history only after guards pass, terminal history persistence failures prevent post-history side effects, and timed accepted starts create `waitingTime` runs only after guards pass
- Unit tests for immediate terminal gathering resolution when `timeRequirement` is absent, including success result creation, failed terminal history without result creation, terminal catalyst usage, configured/default failure feedback, invalid `failureOutcome` aborts, selected-task result-group validation, and blind non-GM terminal redaction
- Unit tests for d100 item/hazard resolution, modifiers, all-drops mode, highest-ranked mode, and validation
- Unit tests for node availability, depletion timing, manual restock, elapsed/probabilistic respawn persistence, and blind-safe node display
- Unit tests for attempt limits, recharge persistence, manual recharge, and guard ordering before stamina spend or terminal side effects
- Unit tests for stamina spend/blocking/regeneration/manual adjustment and history evidence
- Unit tests for risk and encounter hook redaction and duplicate-prevention evidence
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
- Integration tests for blind gathering showing generic unrevealed actions, progressive reveal state, and targeted gathering showing multiple visible tasks
- Regression tests confirming harvesting remains modeled as recipe or salvage data rather than a separate runtime path
