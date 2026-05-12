# Tasks

## Data & Runtime

- [ ] Add `characterModifiers: []` to the per-system gathering shell in `normalizeSystemGathering()` (under `gatheringConfig.systems[systemId]`, alongside `conditions`).
- [ ] Add `normalizeDropCharacterModifiers()` and `normalizeHazardCharacterModifiers()` to `GatheringRichStateService.js`.
- [ ] Extend `composeEnvironment()` to enrich rows with their library lookups from the selected system's `characterModifiers`.
- [ ] Implement `resolveCharacterModifierContribution(reference, libraryEntry, context)`: pick effective provider/expression/macro, evaluate via `evaluateGatheringExpression()`, clamp by `min`/`max`, apply operator, return `{ contribution, evidence }`.
- [ ] Update `rollDropRow()` to sum character modifier contributions into `finalThreshold`.
- [ ] Mirror the change in the hazard resolution path.
- [ ] Treat any non-finite resolution, missing library modifier, `min > max`, or macro-override-without-UUID as a misconfigured attempt that aborts without side effects.
- [ ] Capture `characterModifierSnapshot` in `commitAcceptedAttempt()` evidence; preserve it through `GatheringRunManager._normalizeRun()`.
- [ ] Ensure per-system cleanup paths remove a system's `characterModifiers` library when that system is deleted.

## Presets

- [ ] Define dnd5e preset bundle (abilities + skills) under `src/config/gatheringCharacterModifierPresets.js`.
- [ ] Define pf2e preset bundle.
- [ ] Add `seedCharacterModifierPresets(craftingSystemId)` that seeds the recognized Foundry system's bundle into the selected crafting system's library and returns a list of skipped ids.
- [ ] Ensure the per-system library initializes empty on system creation; no preset mutation without explicit GM action.

## UI (Manager V2)

- [ ] Add a character-modifier card to the system inspector in `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte`, immediately beneath the existing system-conditions card (`data-systems-gathering-conditions`). Card contents: list (icon, label, provider badge, edit/delete), add button with editor (label, icon picker, provider select, expression input or macro UUID picker), and a "Seed presets" button at the bottom.
- [ ] Make the system inspector container scrollable (`overflow-y: auto` + `max-height`) in `styles/fabricate.css` so the new card does not push other UI off-screen.
- [ ] Row editor (drop row and hazard) integration: picker (filtered to the selected system's library), operator toggle, min/max, "Customize for this row" disclosure with override fields, customized badge.
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
