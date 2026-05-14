# Design

## Mythwright Bootstrap

`scripts/foundry/create-mythwright-dnd5e.js` will continue creating/updating Mythwright world folders, items, and the check macro. Once the item UUID-backed component list is built, it will collect all Mythwright recipe payloads, build a Fabricate export-shaped import payload, and call `game.fabricate.importFromPack(packData, { overwriteExisting: true })`.

The bootstrap summary remains script-facing and maps the import summary back to the existing `summary.system` and `summary.recipes` fields.

## Admin Refresh

`CraftingSystemManager` already emits `fabricate.craftingSystemsChanged`. `RecipeManager` will emit a matching `fabricate.recipesChanged` hook after create, update, delete, and import mutations. The GM Admin Svelte app will expose a service that subscribes to both hooks and returns an unsubscribe function.

`adminStore` will subscribe during creation, debounce external updates to a microtask, and call `refresh()`. Store destruction will unregister both ready and external-change listeners.

Dirty local drafts remain store-owned; external refresh must not silently discard unsaved environment or tools draft data.

## Compatibility

The change uses existing Foundry hook APIs and existing Fabricate import infrastructure. If the import API is unavailable, the script fails clearly instead of falling back to the old direct write path.
