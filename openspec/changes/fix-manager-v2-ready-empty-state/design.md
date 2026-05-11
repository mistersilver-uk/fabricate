# Design: Fix Manager V2 Ready Empty State

## Readiness Boundary

Foundry globals stay at the app/service edge. `SvelteRecipeManagerApp._buildServices()` exposes `isFabricateReady()` and `onFabricateReady(callback)` to the Svelte admin store. Readiness requires:

- `game.fabricate.ready === true`
- the recipe manager exists and has `initialized === true`
- the crafting system manager exists and has `initialized === true`

`onFabricateReady` invokes immediately when already ready. Otherwise it registers one `Hooks.once('fabricate.ready', callback)` listener and returns a cleanup function when the hook API exposes `off`.

## Store Behavior

`createAdminStore()` adds `systemsLoading` to `viewState`. Initial `refresh()` checks readiness before reading manager data. When services are missing or uninitialized, the store publishes a loading state without replacing the systems list with a true empty result. The store schedules one ready refresh and removes the pending listener in `destroy()`.

Once initialized, the existing phase-1 publication behavior remains in place and `systemsLoading` becomes false.

## Manager V2 Behavior

`CraftingSystemManagerV2Root` passes `systemsLoading` to `SystemsBrowserView` and uses the same flag for the no-systems inspector setup card. `SystemsBrowserView` renders compact loading copy when `systemsLoading` is true and only renders `No crafting systems yet` when loading is false.

Direct `SvelteCraftingSystemManagerV2App.show()` calls before readiness warn the GM and schedule a single deferred open after `fabricate.ready`, preventing duplicate windows during startup.

## Testing

Regression coverage verifies:

- uninitialized managers set `systemsLoading` and do not publish a true empty systems state
- ready callbacks refresh the store and select the first system
- `destroy()` unregisters pending readiness callbacks
- Manager V2 shows loading copy instead of the no-systems empty state
- app wrapper source keeps the deferred-open guard at the Foundry edge
