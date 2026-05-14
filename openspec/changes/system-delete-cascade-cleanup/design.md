# Design: System Delete Cascade Cleanup

## Cleanup Surface Inventory

System-scoped persistent state and its cleanup status before this change:

| State | Where it lives | Existing per-system cleanup | Called from `deleteSystem`? |
| --- | --- | --- | --- |
| Crafting system record | `craftingSystems` setting | `systems.delete(id)` (inline) | Yes |
| Recipes linked to the system | `recipes` setting | `recipeManager.deleteRecipe` | Yes |
| `gatheringConfig.systems[systemId]` (tools, tasks, rules) | `gatheringConfig` setting | None | No |
| Gathering environments + their runs | `gatheringEnvironments` setting + actor flags | `GatheringEnvironmentStore.cleanupByCraftingSystem(systemId)` | No |
| Gathering runs (defensive direct sweep) | actor `flags.fabricate.gatheringRuns` | `GatheringRunManager.removeRunsForSystem(systemId)` | No |
| Salvage runs | actor `flags.fabricate.salvageRuns` | `SalvageRunManager.removeRunsForSystem(systemId)` | No |
| Crafting runs | actor `flags.fabricate.craftingRuns` | `CraftingRunManager.cleanupInvalidRuns(valid…)` only | No |
| `lastManagedCraftingSystem` per-user setting | client setting | `cleanupStalePreferences` (startup) | Yes (indirectly via `_cleanupCraftingPreferences`, but only if resolution mode changes) |
| `lastAlchemySystem` per-user setting | client setting | None | No |

Recipe-keyed state (`favouriteRecipes`, `recentlyCrafted`, `discoveryProgress`, `progressiveResultOrder`, `learnedRecipes`) is orphaned via recipe deletion and is out of scope.

## Dependency Wiring

`CraftingSystemManager` is constructed with only `recipeManager`. The class already follows a lazy-lookup pattern for cross-service collaborators (e.g., `_getSalvageRunManager()` at `src/systems/CraftingSystemManager.js:1449`, reading from `game.fabricate`). We extend that pattern with `_getGatheringEnvironmentStore`, `_getGatheringRunManager`, `_getCraftingRunManager`, and `_getGatheringRichStateService`. This preserves test ergonomics (existing tests construct the manager with `new CraftingSystemManager(recipeManager)` and bypass `game.fabricate`) and avoids reordering the boot sequence in `main.js`.

Each lookup returns `null` when the service is not registered; the cleanup step skips silently in that case. This matches `_cleanupSalvageRunsForSystem`'s pre-existing behavior.

## New Methods

**`GatheringRichStateService.removeSystem(systemId)`**

Reads the persisted gathering config via the injected `getSetting`, deletes the `systems[systemId]` entry, and writes back through `setSetting`. Returns `true` if the entry existed, `false` otherwise. Mirrors `cleanupByCraftingSystem`'s "no-op when nothing matches" return contract so tests can assert idempotency.

**`CraftingRunManager.removeRunsForSystem(systemId)`**

Iterates every actor, removes active and history entries whose `craftingSystemId` matches, persists with the same `_persist` helper used by the existing cleanup paths. Mirrors `SalvageRunManager.removeRunsForSystem` signature for symmetry but without the `options.cancellationReason` machinery — system deletion means runs are gone, not cancelled in-place; matches `GatheringRunManager.removeRunsForSystem`.

## `deleteSystem` Cascade Order

After recipes are removed and the system is dropped from the in-memory map (existing behavior preserved):

1. `gatheringEnvironmentStore.cleanupByCraftingSystem(systemId)` — removes environments, which internally also calls `_removeRunsForSystem` via the run-cleanup callbacks wired in `main.js:574–578`.
2. `gatheringRunManager.removeRunsForSystem(systemId)` — defensive sweep against orphan gathering runs whose environment was already missing.
3. `salvageRunManager.removeRunsForSystem(systemId, { cancelActive: false, removeHistory: true })` — fully purge; don't append cancellation history rows for a system that no longer exists.
4. `craftingRunManager.removeRunsForSystem(systemId)` — purge active and history.
5. `gatheringRichStateService.removeSystem(systemId)` — drop `gatheringConfig.systems[systemId]`.
6. `_cleanupCraftingPreferences()` — already implemented; will pick up the now-removed system id and clear `lastManagedCraftingSystem` and `lastAlchemySystem` (the latter added by this change).

Ordering matters only between (1) and (2): environment cleanup uses the gathering-run callback wired in `main.js` to drop runs first, but only for runs whose environment matches. Step (2) catches any leftovers.

## Notification Behavior

The existing single-summary toast at the end of `deleteSystem` is preserved verbatim. No per-store notifications are added; cascade cleanup is silent to keep the user-visible behavior unchanged.

## Testing

- Extend `tests/crafting-system-delete-notifications.test.js` (or add a sibling test) with a fixture that injects fake `game.fabricate` accessors for each service, asserts each cleanup method is invoked with the deleted `systemId`, and asserts the single-summary notification still fires.
- Add `GatheringRichStateService.removeSystem` unit coverage: present / absent / idempotent.
- Add `CraftingRunManager.removeRunsForSystem` unit coverage: active + history filtering.
- Extend `cleanupStalePreferences` coverage for `lastAlchemySystem`.

## Risks

- A test that constructs `CraftingSystemManager` directly and calls `deleteSystem` without setting `game.fabricate` services must still pass. The lazy-lookup pattern handles this, but every new service lookup must guard with `?.()` and skip on `null`.
- Cascading delete is irreversible; a confirmation already exists in the admin store (`deleteSystem` confirm dialog at `src/ui/svelte/stores/adminStore.js:2478`). The dialog copy currently mentions only recipes; updating that copy is in scope to avoid surprising users about gathering data loss.
