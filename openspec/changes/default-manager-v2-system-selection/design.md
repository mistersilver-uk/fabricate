# Default Manager V2 System Selection Design

## Behavior

Manager-v2 treats an existing crafting system as selected by default. `adminStore.refresh()` resolves an empty `selectedSystemId` to the first system returned by `CraftingSystemManager.getSystems()`, matching the existing stale persisted-selection fallback. If no systems exist, the selection remains empty and the empty systems-library state still renders.

The System library is a route, not a cleared-selection state. Returning to it sets the Svelte root `activeView` to `systems` while leaving `viewState.selectedSystem` and the persisted `lastManagedCraftingSystem` untouched.

## UI

The left rail selected-system scope renders:

- static selected-system name text
- an icon-only Return to System Library button with localized `aria-label` and `title`
- no click handler on the selected-system name

Use a compact Font Awesome library/list icon and keep existing rail geometry constraints. The root `Crafting Systems` breadcrumb continues to open the System library while preserving selection.

## Tests

Store tests cover empty persisted selection, missing persisted selection, and no-system behavior. Mounted manager-v2 tests cover the rail control, preserved selection, and no clear-selection calls. Source/localization tests assert the durable contract.
