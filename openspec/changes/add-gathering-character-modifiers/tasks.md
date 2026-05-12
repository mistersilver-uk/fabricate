# Tasks

## Data & Runtime

- [ ] Add `characterModifiers` to `normalizeGatheringConfig()` (world-global root) with default `[]`.
- [ ] Add `normalizeDropCharacterModifiers()` and `normalizeHazardCharacterModifiers()` to `GatheringRichStateService.js`.
- [ ] Extend `composeEnvironment()` to enrich rows with their library lookups.
- [ ] Implement `resolveCharacterModifierContribution(reference, libraryEntry, context)`: pick effective provider/expression/macro, evaluate via `evaluateGatheringExpression()`, clamp by `min`/`max`, apply operator, return `{ contribution, evidence }`.
- [ ] Update `rollDropRow()` to sum character modifier contributions into `finalThreshold`.
- [ ] Mirror the change in the hazard resolution path.
- [ ] Treat any non-finite resolution, missing library modifier, `min > max`, or macro-override-without-UUID as a misconfigured attempt that aborts without side effects.
- [ ] Capture `characterModifierSnapshot` in `commitAcceptedAttempt()` evidence; preserve it through `GatheringRunManager._normalizeRun()`.

## Presets

- [ ] Define dnd5e preset bundle (abilities + skills) under `src/config/gatheringCharacterModifierPresets.js`.
- [ ] Define pf2e preset bundle.
- [ ] Add `seedCharacterModifierPresets(systemId)` that returns the bundle and a list of skipped ids.
- [ ] Ensure no automatic mutation on config load.

## UI (Manager V2)

- [ ] Library editor panel: list, add, edit, delete, icon picker, provider select, expression / macro UUID input.
- [ ] Preset seeding action with preview-and-confirm dialog.
- [ ] Row editor (drop row and hazard) integration: picker, operator toggle, min/max, "Customize for this row" disclosure with override fields, customized badge.
- [ ] Attempt history GM detail view: character modifier evidence sub-section.
- [ ] Player-facing redaction in blind attempt history.

## Localization

- [ ] Add `lang/en.json` keys for the new UI strings.

## Tests

- [ ] Library normalization and preset seeding.
- [ ] D100 resolution with character modifiers on drop rows.
- [ ] D100 resolution with character modifiers on hazards.
- [ ] Threshold/roll surface separation (verify `hazardModifier` + `characterModifiers` on the same hazard).
- [ ] Override paths: full override, partial override, override-with-no-provider inheriting library provider.
- [ ] Misconfiguration: missing modifier, macro override without UUID, `min > max`, non-finite resolution.
- [ ] Timed snapshot capture and replay invariance.
- [ ] Blind non-GM history redaction.

## Docs

- [ ] Update `docs/quickstart.md` if user-facing guidance changes.
- [ ] Update `DOMAIN.md` with the new vocabulary (if it documents gathering surfaces).
- [ ] JSDoc on new public functions in `GatheringRichStateService.js`, `gatheringBootstrapAdapters.js`.
