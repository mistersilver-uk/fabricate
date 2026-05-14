# System Delete Cascade Cleanup

## Summary

`CraftingSystemManager.deleteSystem(systemId)` currently cleans up only the system record and its recipes. Other persistent state keyed by `systemId`/`craftingSystemId` survives the delete — most visibly `gatheringConfig.systems[systemId]`, which is why a re-seeded Mythwright system inherits stale gathering tools (including ghost "unlimited use" tools pointing at material components like raw ore). This change extends `deleteSystem` to cascade cleanup across every system-scoped persistent store that has no current delete-time hook.

## Goals

- After `deleteSystem(systemId)` completes, no remaining persistent state references the deleted `systemId`.
- Reuse existing per-system cleanup methods on each store (`GatheringEnvironmentStore.cleanupByCraftingSystem`, `SalvageRunManager.removeRunsForSystem`, `GatheringRunManager.removeRunsForSystem`).
- Add the missing `removeSystem(systemId)` to `GatheringRichStateService` to clear `gatheringConfig.systems[systemId]`.
- Add `removeRunsForSystem(systemId)` to `CraftingRunManager` for parity with the other run managers.
- Clear `lastAlchemySystem` from `cleanupStalePreferences` so it is treated the same as `lastManagedCraftingSystem`, both at startup and on delete.
- Keep `CraftingSystemManager`'s constructor signature unchanged; resolve dependent services lazily via `game.fabricate?.getXxx?.()`, matching the existing salvage-cleanup pattern in this class.

## Out of Scope

- World `Item` documents seeded by the Mythwright bootstrap. These are intentionally not Fabricate-owned and survive system deletion by design.
- Recipe-keyed preferences (`favouriteRecipes`, `recentlyCrafted`, `discoveryProgress`). Recipes are already deleted by `deleteSystem`; recipe-keyed cleanup is a separate concern tracked elsewhere.
- New UI affordances.

## Acceptance Criteria

- After `deleteSystem(systemId)`:
  - `gatheringConfig.systems[systemId]` is absent.
  - No environment in `GatheringEnvironmentStore` has `craftingSystemId === systemId`.
  - No actor flag entry in `gatheringRuns`, `salvageRuns`, or `craftingRuns` has `craftingSystemId === systemId` (active or history).
  - If `lastAlchemySystem` equals `systemId` for any user, it is cleared on next `cleanupStalePreferences` invocation (which is invoked from `deleteSystem`).
- The existing single-summary notification ("Deleted crafting system X and N related entities.") is preserved; no new per-store notifications are emitted.
- `CraftingSystemManager` can still be constructed in tests with only a `recipeManager` argument; missing services are skipped gracefully.
- `npm test` and `npm run build` pass.
