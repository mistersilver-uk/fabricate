# Design: Immediate Selected-System View State

## Approach

`adminStore.refresh()` already resolves the selected crafting system before its first `viewState` update. Move all synchronous selected-system view-model construction ahead of that first update:

- managed item options
- essence definitions/cards
- selected-system details
- recipe browser data
- script macro, scene, and roll-table picker options

Keep asynchronous data after the first update:

- item cards, because source UUID missing-state checks can await `fromUuid`
- gathering environments, because environment store listing is async
- graph data, because it is route-specific and heavier

## Behavior

When systems exist, the first refresh publication includes `viewState.selectedSystem`, `selectedSystemName`, system row selection state, essence cards, and recipe list data. Manager V2 can render the selected-system rail and inspector immediately. Item cards and gathering environments may still update in the second phase.

When no systems exist, `selectedSystem` remains `null`, selected-system navigation stays hidden, and the setup empty state remains unchanged.
