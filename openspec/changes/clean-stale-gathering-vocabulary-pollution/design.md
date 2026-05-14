# Design: Clean Stale Gathering Vocabulary Pollution

## Diagnosis

`gatheringConfig.vocabularies.regions` is a free-form, user-managed vocabulary — there are no canonical defaults for it (unlike `biomes`, `weather`, and `timeOfDay` which have curated default lists in `DEFAULT_VOCABULARIES`). No production code path seeds it. The only writer in the repo is `scripts/foundry-test-run.mjs:2208–2253`, which calls `game.settings.set('fabricate', 'gatheringConfig', { vocabularies: { regions: ['northreach'], ... }, ... })` against the live game to set up Playwright fixtures.

`normalizeSystemVocabularies` (`src/systems/GatheringRichStateService.js:927–938`) falls back to the top-level `fallbackVocabularies[kind]` when a system has no per-system override, so any contamination at the top level propagates into every system on read.

## Why "clear regions entirely" rather than "surgically remove 'northreach'"

`regions` has no canonical default; the production default is `[]`. Anything persisted at the top level is either harness pollution or a manual user edit through a setting flagged `config: false` (vanishingly rare). The legitimate place for user-curated regions is a per-system or per-environment vocabulary, not the global top level. A blanket reset is therefore safer and less guess-prone than a surgical removal of one known string.

If a future feature legitimately persists user-edited top-level regions, this migration won't re-fire (it's gated on `migrationVersion`), so there is no recurring data loss risk.

## MigrationRunner generalisation

The current `MigrationRunner.run()` loads `recipes` and `craftingSystems`, runs each pending migration with `data = { recipes, systems }`, and replaces `data` with whatever the migration returns. To support `gatheringConfig` without breaking the 0.1.0 contract (which returns only `{ recipes, systems }`), the runner switches the per-migration update line from:

```
data = result;
```

to:

```
if (result && typeof result === 'object') data = { ...data, ...result };
```

A migration that only touches recipes/systems returns `{ recipes, systems }`; the spread merge preserves `data.gatheringConfig` untouched. A migration that only touches `gatheringConfig` returns `{ gatheringConfig }` and leaves the rest alone.

Three independent JSON diff-check + persist blocks then run, mirroring the existing pattern. Unchanged settings are not re-written. `migrationVersion` is always written to record progress.

## migrateGatheringConfig

A pure function in `src/migration/migrateGatheringConfig.js` that:

- Returns the input unchanged-by-value if it's not a plain object (e.g., `null`, array, primitive — handled defensively).
- Deep-clones the input via `JSON.parse(JSON.stringify(...))` (matches `migrateComponentId.js` style).
- Reads `cloned.vocabularies` (if it exists and is a plain object) and sets `vocabularies.regions = []`.
- Returns the cloned config.

Idempotent: input with `vocabularies.regions === []` (or missing) yields output JSON-equivalent to the input, so the runner's diff-check suppresses the write.

## Harness relocation

`scripts/foundry-test-run.mjs:2208–2253` writes a single top-level `gatheringConfig` payload. We split it:

- Top-level: keep `conditions` (the harness genuinely needs the global current weather/timeOfDay). Drop the `vocabularies` block entirely — the runtime auto-fills defaults from `DEFAULT_VOCABULARIES`. The harness has no need for a custom top-level vocabulary.
- Under `systems[systemId]`: keep `tasks` and `hazards` (already there). Add `vocabularies: { regions: { values: ['northreach'] } }` so the smoke tests retain a `northreach` region for their UI assertions, but only system-scoped.

Per-task and per-hazard `region: 'northreach'` references inside `systems[systemId]` (lines 2225, 2245) are already scoped under that system and need no relocation. Line 2004's `region: 'northreach'` is on a `GatheringEnvironment` object owned by the env store and scoped to the test system; it does not pollute `gatheringConfig` and needs no relocation.

A search confirmed no Playwright assertions read top-level `vocabularies.regions`, so the relocation has no test-side fallout.

## Testing

Extend `tests/migration-runner.test.js` with cases reusing the existing `makeSettings` helper (which accepts an `initial` map of setting keys; we add `gatheringConfig` defaulting to `{}`):

1. 0.2.0 clears stale top-level regions when `gatheringConfig.vocabularies.regions` is non-empty.
2. 0.2.0 is a no-op (no `setSetting('gatheringConfig', ...)`) when regions are already empty.
3. 0.2.0 preserves `vocabularies.biomes`, `weather`, `timeOfDay`, `conditions`, and `systems` untouched.
4. 0.1.0 backward-compat: from `'0.0.0'` with a non-trivial `gatheringConfig`, the 0.1.0 migration completes and `gatheringConfig` is unchanged across the spread-merge refactor.

Add a standalone `tests/migrate-gathering-config.test.js` with three unit cases (present non-empty, already-empty, missing/non-object input) — these mirror the unit coverage style of other migration helpers.

## Risks

- **Runner refactor regression.** The 0.1.0 migration currently returns `{ recipes, systems }`. The new spread-merge preserves `gatheringConfig` from the input snapshot, so the 0.1.0 step continues to work identically. Test 4 above pins this.
- **Players hitting migration on first load.** `MigrationRunner.run()` is not gated by GM. If a player loads first, they hit `setSetting` on a world-scope key and Foundry rejects with a permission error which the runner does not catch around the persist calls. This is a pre-existing condition, unchanged by this work, and out of scope.
- **Harness assertion drift.** Pre-verified via grep: no Playwright assertion reads `vocabularies.regions` at top level. Future harness tests that need a `northreach` region must read from `gatheringConfig.systems[testSystemId].vocabularies.regions.values`.
