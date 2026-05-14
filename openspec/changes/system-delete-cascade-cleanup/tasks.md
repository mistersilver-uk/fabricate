# Tasks

- [x] Add `removeSystem(systemId)` to `GatheringRichStateService` that deletes `gatheringConfig.systems[systemId]` and persists; returns `true` when an entry was removed.
- [x] Add `removeRunsForSystem(systemId)` to `CraftingRunManager` mirroring `GatheringRunManager.removeRunsForSystem`; purges active and history entries.
- [x] Add `lastAlchemySystem` clearing to `cleanupStalePreferences` so it is dropped whenever the referenced system is no longer valid.
- [x] Extend `CraftingSystemManager.deleteSystem(systemId)` to cascade: gathering environments, gathering runs (defensive), salvage runs (no cancellation rows), crafting runs, `gatheringConfig.systems[systemId]`, then `_cleanupCraftingPreferences()`.
- [x] Add lazy lookups `_getGatheringEnvironmentStore`, `_getGatheringRunManager`, `_getCraftingRunManager`, `_getGatheringRichStateService` on `CraftingSystemManager` (mirrors existing `_getSalvageRunManager`); each returns `null` when missing so tests stay green.
- [x] Update the confirm-dialog copy in `adminStore.deleteSystem` to disclose that gathering environments, tools, tasks, and run history will also be removed.
- [x] Tests:
  - [x] `tests/gathering-rich-state-remove-system.test.js`: cover `removeSystem` present / absent / idempotent.
  - [x] `tests/crafting-run-manager.test.js`: cover `removeRunsForSystem` over active and history with mixed-system runs.
  - [x] `tests/stale-preferences-cleanup.test.js`: add cases asserting `lastAlchemySystem` is cleared when stale and preserved when valid.
  - [x] `tests/crafting-system-delete-cascade.test.js`: inject fake `game.fabricate` accessors, assert each cleanup method is called with the deleted `systemId`, assert resilience when one cleanup throws, and assert the existing summary notification is preserved.
- [x] `npm test` — 2635/2635 passing.
- [x] `npm run build` — clean.
