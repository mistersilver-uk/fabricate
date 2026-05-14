# Clean Stale Gathering Vocabulary Pollution

## Summary

Worlds upgraded from earlier Fabricate versions, or worlds that the E2E harness has run against, persist a stale `northreach` region under `gatheringConfig.vocabularies.regions`. Because `normalizeSystemVocabularies` falls back to the top-level vocabulary when a system has none of its own, every crafting system — including a freshly created one — inherits that region.

Two further latent bugs surface this for newly created systems even without stale data:

1. The admin store's `_normalizeGatheringConfig` seeds top-level vocabularies as bare string arrays rather than the `{ id, label, icon, colorToken }` records used per-system. The Svelte fallback path (Environments → Settings) reads top-level vocab directly and renders bare strings, so labels appear as lowercase ids (`forest`, `clear`, `dawn`) and biome chips all show the single fallback colour token (`sage`) instead of per-biome tokens.

2. `normalizeVocabularyOption` (both admin store and runtime) used the bare-string input as the label, so an id of `'north'` produced a label of `'north'` instead of `'North'`. The bug existed for non-biome kinds (regions, weather, timeOfDay) where the auto-capitalisation path was short-circuited by a truthy raw string.

This change:

- Adds a one-shot startup migration (0.2.0) that clears stale top-level `vocabularies.regions`, so existing worlds heal on next load.
- Relocates the E2E harness's writes so the pollution can't recur.
- Normalises top-level vocabularies into the same record shape per-system uses, with seeded defaults for biomes/weather/timeOfDay (regions stays empty by design — there is no canonical regions list). New systems now render capitalised labels and per-biome colour tokens immediately.
- Fixes `normalizeVocabularyOption` so bare-string inputs always go through `vocabularyLabelFromId(id)` for the label, generating `'Northreach'` from `'northreach'`. Records with an explicit label still keep it.

## Goals

- Add a versioned `MigrationRunner` step (0.2.0) that clears `gatheringConfig.vocabularies.regions` on next world load, runs once per world, is idempotent, and is suppressed via the existing JSON diff-check when nothing changed.
- Generalise `MigrationRunner` to handle a third tracked setting (`gatheringConfig`) without breaking the existing 0.1.0 migration contract.
- Relocate `scripts/foundry-test-run.mjs` gathering-config writes so test pollution lives under `gatheringConfig.systems[testSystemId]` rather than the top level. This is defence-in-depth: even if the harness is ever pointed at a real world, only system-scoped data is affected (which the prior `system-delete-cascade-cleanup` change will wipe on teardown).
- Provide a console snippet in the proposal for users who already deleted and recreated Mythwright before this migration ships.

## Out of Scope

- Cosmetic rewrite of persisted top-level biomes/weather/timeOfDay into the `{ id, label, icon, colorToken }` shape. The read-time normalisers (`normalizeVocabularyOption`, `normalizeConditionOption`) already produce that shape on every read; a one-time persisted-shape rewrite would cost a settings write on every upgrading world for zero observable benefit.
- Gating `MigrationRunner.run()` behind `game.user.isGM`. The existing runner already runs for all clients and assumes Foundry will reject non-GM world-setting writes; that pre-existing concern is not in scope for this change.
- Cleaning per-system `gatheringConfig.systems[*].vocabularies` residue. The harness has never written into that path, and the `system-delete-cascade-cleanup` change already wipes `gatheringConfig.systems[systemId]` entirely on system delete.
- World `Item` documents seeded by the Mythwright bootstrap.

## Acceptance Criteria

- After upgrading and loading a world once as GM, `gatheringConfig.vocabularies.regions` is `[]` (regardless of its prior contents). `migrationVersion` is `'0.2.0'` or higher.
- Worlds where `gatheringConfig.vocabularies.regions` was already `[]` (or absent) see no write to `gatheringConfig` — only `migrationVersion` is updated.
- The pre-existing 0.1.0 migration continues to work unchanged on worlds whose `migrationVersion` is `'0.0.0'`; `gatheringConfig` is preserved across the 0.1.0 step regardless of its contents.
- `scripts/foundry-test-run.mjs` no longer writes a non-empty `vocabularies.regions` at the top level of `gatheringConfig`. Any `'northreach'` declaration the harness needs lives under `gatheringConfig.systems[testSystemId].vocabularies.regions.values`.
- `npm test` and `npm run build` pass.

## User-Facing Fix Path

- **Existing worlds on upgrade:** GM loads world once → MigrationRunner advances to `0.2.0` → top-level `regions` cleared → Mythwright (and every other system) stops showing "Northreach". No user action.
- **New worlds:** unaffected; defaults are already empty.
- **Users mid-flight** (already deleted+recreated Mythwright before this migration ships):
  ```js
  const cfg = game.settings.get('fabricate', 'gatheringConfig') || {};
  cfg.vocabularies = { ...(cfg.vocabularies || {}), regions: [] };
  await game.settings.set('fabricate', 'gatheringConfig', cfg);
  ```
