# Design

## Data Model

### World-Global Library

Stored at `gatheringConfig.characterModifiers`:

```js
characterModifiers: Array<{
  id: string,        // stable kebab-case id
  label: string,
  icon: string,      // Font Awesome class
  provider: "dnd5e" | "pf2e" | "macro",
  expression?: string,
  macroUuid?: string,
}>
```

The library lives **at the gathering-config root**, not under `systems[systemId]`, intentionally. A `@abilities.str.mod` value derived from the selected actor is meaningful to every crafting system the world has installed. Per-row `providerOverride` already covers the rare case where one crafting system needs a different evaluation path than the library default. This is a deliberate divergence from the per-system condition library precedent and is justified by the actor-derived nature of the value.

### Row Reference Shape

Drop rows and hazards each gain:

```js
characterModifiers?: Array<{
  id: string,                  // row-scoped reference id
  modifierId: string,          // foreign key to library
  operator: "+" | "-",
  min?: number,
  max?: number,
  providerOverride?: "dnd5e" | "pf2e" | "macro",
  expressionOverride?: string,
  macroUuidOverride?: string,
}>
```

### Snapshot Extension

`GatheringRunManager` already persists `conditionSnapshot` on terminal runs. Add `characterModifierSnapshot`, normalized at run-creation time with the resolved evidence per reference (modifier id, effective provider, effective expression or macro uuid, resolved numeric value, operator-applied contribution, `min`/`max` clamping).

### Library Expressiveness

Library expressions are not restricted to flat actor references. Any expression valid in the configured provider — including dice terms, multiplicative operators, and actor-derived dice counts — is permitted in a library entry. Examples that belong in the library when reused across many rows:

- `@abilities.str.mod` — flat actor stat. Canonical atom.
- `(@abilities.str.mod)d6` — actor-scaled dice count.
- `1d12 * @abilities.str.mod` — actor-scaled scalar.
- `2d4 + @skills.nat.mod` — boosted skill check.

Recommended naming convention to keep the library scannable:

- Atomic stat references stay unsuffixed: `Strength`, `Dexterity`, `Nature`.
- Derived rolls take a `Roll` / `Dice` suffix that names the shape: `Strength Dice (d6)`, `Mining Strength Roll`, `Nature Boost`.

The library editor SHOULD detect dice terms or non-trivial operators and surface a "this is a roll, not a flat value" tag on the entry so GMs reading attempt evidence understand why the contribution varies between attempts. The per-row `expressionOverride` remains the escape hatch for true one-off variants that do not warrant their own library entry.

## Runtime Semantics

### Resolution Pipeline

1. `composeEnvironment(environment, system)` continues to merge tasks/hazards as today.
2. For each enabled drop row, `rollDropRow()`:
   a. Sums matching `conditionModifiers` (existing behaviour).
   b. Resolves each `characterModifiers[i]`: pick effective provider/expression/macro from override or library; call `evaluateGatheringExpression()` with `{ expression, provider, actor, kind: "characterModifier", environment, task, row }`; apply `min`/`max` clamp; apply operator.
   c. `finalThreshold = clamp(dropRate + conditionTotal + characterModifierTotal, 0, 100)`.
   d. Roll d100, add `gatheringModifier`, compare against `101 - finalThreshold`.
3. For each matched hazard, same as (2) but using `hazardModifier` on the roll side.
4. If any modifier resolution returns non-finite, mark the attempt misconfigured and abort with GM-facing diagnostic.

### Reuse Targets

- `evaluateGatheringExpression()` in `src/gatheringBootstrapAdapters.js` already handles provider dispatch and macro UUID resolution. No changes needed beyond a new `kind` value.
- `GatheringGateAndCheckEvaluator` provides the macro context-shaping pattern; the new evaluator reuses its `_resolveExpression()` injection point.
- `normalizeDropConditionModifiers()` in `GatheringRichStateService.js` is the direct template for a new `normalizeDropCharacterModifiers()` (and `normalizeHazardCharacterModifiers()`).
- `composeEnvironment()` is the right place to enrich rows with their library lookups before they reach `rollDropRow()`, so the resolver does not have to re-walk the config.

### Snapshot Capture

`commitAcceptedAttempt()` already records `conditions` and `risk` into evidence. Add `characterModifierSnapshot` to the evidence written into the terminal run. `GatheringRunManager._normalizeRun()` mirrors the `conditionSnapshot` pattern for the new field.

## UI

### Manager V2: Character Modifier Library Panel

Lives at the gathering settings root, alongside the existing weather and time-of-day editors. Layout:

- List of modifiers with icon, label, provider badge, and "Edit / Delete" controls.
- Add button opens an editor card: label, icon picker (existing icon picker component), provider select (`dnd5e` | `pf2e` | `macro`), expression input (or macro UUID picker when provider is `macro`).
- "Seed presets" button enabled when the world's Foundry system matches a known preset. Shows preview of presets that will be added; existing ids are skipped.

### Manager V2: Row Editor Integration

In the drop row editor and hazard editor:

- New "Character Modifiers" section beneath the existing condition modifiers section.
- Each row reference shows: modifier picker (dropdown of library), operator toggle (`+`/`-`), min/max numeric inputs (collapsible "advanced"), and "Customize for this row" disclosure that exposes provider/expression/macro override fields.
- Customized rows show a small `customized` badge so GMs can spot non-default rows at a glance.

### Manager V2: Attempt Evidence Display

GM-only attempt history detail view gains a "Character Modifiers" sub-section per drop row and hazard, showing the resolved evidence captured in the snapshot. Player-facing views show none of this for blind attempts and only the post-clamp contribution for non-blind attempts.

## Safety

- Deleting a library modifier leaves row references intact (stale evidence). Authoring UI flags the stale reference and offers repoint/delete/override.
- The library has no `enabled` flag. To temporarily silence a modifier, GMs delete it or rename it; existing rows surface the stale-reference state.
- Preset seeding never mutates existing modifiers with matching ids. Unknown-system seeding is a no-op with a GM-facing message.
- `min > max` on a row reference is treated as misconfigured at runtime and surfaced at authoring time as a validation error.

## Tests

- `tests/gathering-character-modifier-library.test.js`: normalization, default empty state, preset seeding (dnd5e and pf2e), no-auto-mutation invariant.
- `tests/gathering-d100-character-modifiers.test.js`: end-to-end resolution on drop rows and hazards, threshold/roll separation, composition with condition modifiers, clamp behaviour, multiple-reference stacking, override paths.
- `tests/gathering-character-modifier-snapshots.test.js`: timed runs capture and replay the snapshot without being perturbed by library edits.
- `tests/gathering-character-modifier-redaction.test.js`: blind non-GM history hides expressions, UUIDs, diagnostics.
- `tests/gathering-character-modifier-misconfiguration.test.js`: missing modifier, non-finite resolution, macro-override-missing-uuid, `min > max` all abort the attempt without side effects.

## Open Questions

- Should the library be exportable/importable as JSON so GMs can share their tuned modifier sets? Deferred to a follow-up unless the team wants it bundled.
- Should attempt history include the rolled value of dice terms (e.g., the actual `1d6` result inside `1d6 + @abilities.str.mod`)? The spec says yes for GM evidence; UI scope confirmed for the same change set.
