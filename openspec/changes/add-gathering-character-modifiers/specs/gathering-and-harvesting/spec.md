## ADDED Requirements

### Requirement: Global Gathering Character Modifiers Library

Fabricate SHALL maintain a world-global library of reusable gathering character modifiers stored in gathering configuration.

Character modifiers SHALL have this shape:

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

The library is world-scoped (not per crafting system) because a single actor-derived value such as `@abilities.str.mod` is meaningful across every crafting system the world has installed, and per-row `providerOverride` already lets rows targeting a system-specific provider differ when needed.

#### Scenario: GM defines a reusable character modifier

- **GIVEN** a GM opens gathering configuration
- **WHEN** the GM creates a character modifier with label `Strength`, icon `fa-solid fa-dumbbell`, provider `dnd5e`, and expression `@abilities.str.mod`
- **THEN** Fabricate SHALL persist the modifier in the world-global character modifier library
- **AND** the modifier SHALL be available for reference from any d100 drop row or hazard row in any crafting system.

#### Scenario: Row references use the latest library definition

- **GIVEN** a drop row references character modifier `strength` by id
- **WHEN** the GM edits the `strength` modifier's expression, icon, or label
- **THEN** future gathering attempts SHALL resolve the row using the updated definition
- **AND** any in-flight timed gathering runs that have already started SHALL continue using their start-time snapshot.

#### Scenario: Missing referenced modifier blocks resolution

- **GIVEN** a drop row or matched hazard references a character modifier id
- **WHEN** that modifier no longer exists in the library
- **AND** the row does not provide a complete per-row override
- **THEN** Fabricate SHALL treat the gathering attempt as misconfigured
- **AND** SHALL NOT create gathered results
- **AND** SHALL NOT apply hazard outcomes
- **AND** SHALL surface a GM-facing diagnostic naming the missing id and the referencing row.

#### Scenario: Stale references are preserved during authoring

- **WHEN** a GM views a task or hazard whose row references a missing character modifier
- **THEN** the row SHALL display the stale reference (label `Unknown modifier` plus the stored id)
- **AND** the GM SHALL be able to repoint the reference, delete the reference, or supply a per-row override.

### Requirement: Character Modifier Presets

Fabricate SHALL provide opt-in preset seeding for known Foundry game systems.

#### Scenario: GM seeds presets for a known system

- **GIVEN** the current Foundry game system is recognized as `dnd5e` or `pf2e`
- **WHEN** the GM invokes "Seed character modifier presets"
- **THEN** Fabricate SHALL add preset ability and skill modifiers for that system to the world-global library
- **AND** SHALL skip any preset whose id already exists in the library.

#### Scenario: Preset seeding is not automatic

- **WHEN** gathering configuration loads
- **THEN** Fabricate SHALL NOT mutate the character modifier library
- **AND** SHALL NOT add system presets without explicit GM action.

#### Scenario: Presets remain editable

- **WHEN** preset modifiers have been seeded
- **THEN** the GM SHALL be able to rename, change icons, change provider, change expression, or delete them
- **AND** edited presets SHALL NOT be reverted on subsequent loads.

#### Scenario: Unknown system seeding is a no-op

- **GIVEN** the current Foundry game system is not recognized
- **WHEN** the GM invokes preset seeding
- **THEN** Fabricate SHALL add no presets
- **AND** SHALL surface a GM-facing message identifying the unsupported system.

### Requirement: Drop Row Character Modifier References

D100 Gathering Task drop rows SHALL support optional row-scoped character modifier references.

Row shape extension:

```js
dropRows: [{
  id: string,
  componentId?: string,
  itemUuid?: string,
  quantity: number,
  dropRate: number,
  enabled: boolean,
  conditionModifiers?: {
    timeOfDay?: Array<{
      id: string, 
      conditionId: string, 
      value: number,
      operator: "+" | "-"
    }>,
    weather?: Array<{ 
      id: string, 
      conditionId: string, 
      value: number,
      operator: "+" | "-",
    }>,
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
}]
```

Operators are restricted to `+` and `-`. Character modifier contributions are additive percentage-point adjustments to the row threshold. There is no multiplicative operator.

#### Scenario: Character modifier increases drop chance

- **GIVEN** a drop row has `dropRate: 25`
- **AND** the row references `strength` with operator `"+"`
- **AND** the selected actor's `@abilities.str.mod` resolves to `5`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL set the row's character-modifier contribution to `+5`
- **AND** SHALL combine it with any condition modifiers
- **AND** SHALL clamp the final threshold to `0..100`.

#### Scenario: Row override replaces the library expression

- **GIVEN** a drop row references `dexterity`
- **AND** the row sets `expressionOverride: "1d6 + @abilities.dex.mod"`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL evaluate the override expression using the library modifier's provider unless `providerOverride` is also set
- **AND** SHALL ignore the library modifier's `expression` for that row
- **AND** SHALL use the library modifier's `label` and `icon` for GM-facing evidence unless the UI provides explicit override display text.

#### Scenario: Partial override inherits unset fields

- **GIVEN** a row override sets only `expressionOverride`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL use the library modifier's `provider` and `macroUuid`
- **AND** Fabricate SHALL evaluate the override expression with that inherited provider.

#### Scenario: Macro override missing UUID is misconfigured

- **GIVEN** a row override sets `providerOverride: "macro"`
- **AND** the override does not set `macroUuidOverride`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL treat the attempt as misconfigured
- **AND** SHALL NOT create gathered results
- **AND** SHALL surface a GM-facing diagnostic naming the row and missing field.

#### Scenario: Row overrides do not mutate the library modifier

- **WHEN** a GM authors a row override
- **THEN** Fabricate SHALL store the override fields on the row only
- **AND** SHALL NOT modify the global character modifier definition
- **AND** other rows referencing the same modifier id SHALL keep using the library definition.

#### Scenario: Row caps clamp the modifier contribution

- **GIVEN** a row character modifier reference has `min: 0` and `max: 5`
- **AND** the resolved modifier value is `8`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL clamp the contribution to `5` before applying the row operator
- **AND** the clamped contribution SHALL feed into the threshold sum.

#### Scenario: Caps with `min > max` are misconfigured

- **GIVEN** a row character modifier reference has `min: 5` and `max: 0`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL treat the attempt as misconfigured
- **AND** SHALL surface a GM-facing diagnostic.

#### Scenario: Multiple references on one row stack

- **GIVEN** a row references both `strength` and `athletics`
- **WHEN** the row resolves
- **THEN** Fabricate SHALL evaluate each reference independently
- **AND** SHALL sum each reference's signed contribution into the row threshold
- **AND** SHALL allow the same modifier id to be referenced twice on a single row, with each reference resolving and contributing independently.

#### Scenario: Character modifiers compose with condition modifiers

- **GIVEN** a drop row has a base `dropRate`
- **AND** matching weather or time-of-day condition modifiers
- **AND** character modifier references
- **WHEN** the row resolves
- **THEN** Fabricate SHALL compute:
  `finalDropRate = clamp(dropRate + matchingConditionModifiers + resolvedCharacterModifiers, 0, 100)`.

### Requirement: Hazard Character Modifier References

D100 gathering hazards SHALL support optional row-scoped character modifier references using the same shape and semantics as drop rows.

Hazards retain the existing `hazardModifier?: ModifierProvider` field. `hazardModifier` adjusts the d100 roll itself. `characterModifiers` adjust the hazard threshold. Both surfaces SHALL be evaluated independently on the same hazard.

```js
hazards: [{
  id: string,
  dropRate: number,
  hazardModifier?: ModifierProvider,
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
}]
```

#### Scenario: Character modifier reduces hazard chance

- **GIVEN** a matched hazard has `dropRate: 30`
- **AND** the hazard references `stealth` with operator `"-"`
- **AND** the selected actor's `@skills.ste.mod` resolves to `4`
- **WHEN** the hazard resolves
- **THEN** Fabricate SHALL set the hazard's character-modifier contribution to `-4`
- **AND** SHALL clamp the final threshold to `0..100`.

#### Scenario: Hazard `hazardModifier` and `characterModifiers` are independent

- **GIVEN** a hazard has both `hazardModifier` and `characterModifiers`
- **WHEN** the hazard resolves
- **THEN** Fabricate SHALL apply `hazardModifier` to the d100 roll
- **AND** SHALL apply `characterModifiers` to the threshold
- **AND** SHALL NOT treat one as a replacement for the other.

### Requirement: Character Modifier Evaluation

Character modifiers SHALL be evaluated against the selected gathering actor using the configured provider's native expression behaviour.

#### Scenario: Expression uses the selected actor

- **WHEN** Fabricate evaluates a character modifier or row override
- **THEN** evaluation SHALL use the selected gathering actor as the primary expression context
- **AND** SHALL use the effective provider (override if present, else library definition).

#### Scenario: Dice terms re-roll per attempt

- **GIVEN** an effective expression contains a dice term such as `1d6 + @abilities.str.mod`
- **WHEN** an attempt resolves
- **THEN** Fabricate SHALL roll dice terms fresh for that attempt
- **AND** SHALL record the rolled total in GM-facing attempt evidence.

#### Scenario: Library entries may hold roll expressions

- **GIVEN** a library modifier defines `expression: "(@abilities.str.mod)d6"`
- **WHEN** a drop row references that modifier
- **THEN** Fabricate SHALL evaluate the dice and actor terms together each attempt
- **AND** SHALL record the rolled total in GM-facing attempt evidence
- **AND** the threshold contribution SHALL be the rolled total before any `min`/`max` row clamp.

#### Scenario: Macro modifier returns a numeric value

- **WHEN** a macro provider modifier is evaluated
- **THEN** the macro SHALL receive `{ actor, environment, task, row | hazard, conditions, modifier }` context
- **AND** SHALL return a finite numeric value
- **AND** non-finite returns SHALL be treated as a misconfigured attempt.

#### Scenario: Invalid resolution blocks unsafe side effects

- **WHEN** any referenced modifier or row override cannot resolve to a finite number
- **THEN** Fabricate SHALL treat the gathering attempt as misconfigured
- **AND** SHALL NOT create gathered results
- **AND** SHALL NOT apply hazard outcomes
- **AND** SHALL surface GM-facing diagnostics naming the row, the modifier id, and the failure reason.

#### Scenario: GM-facing evidence surfaces resolution details

- **WHEN** an attempt resolves successfully
- **THEN** Fabricate SHALL record per-row character-modifier evidence containing the referenced modifier id, the effective provider, the effective expression or macro uuid, the raw resolved numeric value, the operator-applied contribution, and any `min`/`max` clamping
- **AND** SHALL include this evidence in attempt history visible to GMs.

### Requirement: Attempt Gates Remain Separate

Character modifiers SHALL NOT replace task-level visibility gates, pass/fail attempt gates, or progressive gathering checks.

#### Scenario: Attempt gates resolve before character modifiers

- **GIVEN** a Gathering Task has an attempt gate check
- **WHEN** an actor starts a gathering attempt
- **THEN** Fabricate SHALL resolve the attempt gate before drop-row and hazard character modifiers
- **AND** a failed gate SHALL prevent d100 drop and hazard resolution unless the task explicitly configures failure-side behaviour.

#### Scenario: Character modifiers do not grant task availability

- **GIVEN** a task is unavailable because visibility, scene, catalyst, weather, time, stamina, node, or attempt-limit gates block it
- **WHEN** a drop row or hazard on that task references character modifiers
- **THEN** those modifiers SHALL NOT be evaluated
- **AND** SHALL NOT make the task available.

### Requirement: Timed Gathering Snapshots Character Modifier Evidence

Timed d100 gathering runs SHALL include a start-time snapshot of resolved character modifier evidence alongside the existing condition snapshot.

#### Scenario: Timed start snapshot captures modifier evidence

- **WHEN** a timed d100 gathering attempt starts
- **THEN** Fabricate SHALL snapshot the start-time drop rows, hazard rows, condition state, character modifier library entries referenced by those rows, and the per-reference resolved evidence
- **AND** later edits to the library SHALL NOT change that run's completion behaviour.

### Requirement: Blind Gathering Redacts Character Modifier Internals

Non-GM viewers of blind gathering history SHALL NOT see character modifier internals.

#### Scenario: Blind non-GM history hides expressions

- **WHEN** a non-GM resolves or views history for an unrevealed blind gathering attempt
- **THEN** Fabricate SHALL redact effective expression strings, macro UUIDs, provider diagnostics, hidden row identities, and hidden hazard identities
- **AND** MAY show only generic success, failure, or blocked feedback.

## MODIFIED Requirements

### Requirement: Reusable d100 Drop Rows

Reusable d100 drop rows SHALL support optional character modifier references in addition to weather and time-of-day condition modifiers. Character modifier references are row-scoped: they adjust only the drop row on which they are configured.

The full row shape is specified in **Drop Row Character Modifier References**.

### Requirement: Reusable Gathering Hazards

Reusable gathering hazards SHALL support optional character modifier references in addition to the existing `hazardModifier`. Character modifier references are row-scoped: they adjust only the hazard on which they are configured. `hazardModifier` continues to affect the d100 roll; character modifiers affect the threshold.

The full hazard shape is specified in **Hazard Character Modifier References**.

### Requirement: D100 Resolution

D100 resolution SHALL apply modifiers in this order, for both drop rows and matched hazards:

1. Resolve the row's character modifier references (and any per-row overrides) into signed numeric contributions, applying `min`/`max` row caps before the row operator.
2. Compute `finalThreshold = clamp(dropRate + matchingConditionModifiers + resolvedCharacterModifiers, 0, 100)`. For hazards, `matchingConditionModifiers` is `0` unless hazards gain condition modifiers in a future change.
3. Roll d100.
4. Add the relevant roll-side modifier: for drop rows the resolved `task.gatheringModifier`; for hazards the resolved `hazard.hazardModifier`. Both default to `0` when absent.
5. The row drops when `effectiveRoll >= 101 - finalThreshold`.
6. Apply system reward selection or hazard policy to the set of dropped rows.

Character modifiers adjust the threshold side of the comparison. `gatheringModifier` and `hazardModifier` adjust the roll side. The two surfaces SHALL NOT be conflated.

#### Scenario: Worked example with both modifier surfaces

- **GIVEN** a drop row with `dropRate: 25`, a matching weather modifier of `+5`, a character modifier `strength` resolving to `+3`, and a task-level `gatheringModifier` resolving to `+10`
- **WHEN** the row resolves
- **THEN** `finalThreshold = clamp(25 + 5 + 3, 0, 100) = 33`
- **AND** `effectiveRoll = d100 + 10`
- **AND** the row drops when `effectiveRoll >= 68`.

### Requirement: Natural Gathering Expressions and Macros

Natural gathering expressions SHALL apply to reusable character modifiers and per-row character modifier overrides in addition to gathering checks, visibility gates, stamina formulas, and attempt-limit formulas.

Fabricate core SHALL NOT hardcode game-system-specific actor paths into runtime behaviour. Known `dnd5e` and `pf2e` actor paths MAY be shipped as editable opt-in preset data via the character modifier preset library.
