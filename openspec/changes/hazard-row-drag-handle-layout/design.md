# Design: Hazard Row Drag Handle Layout

## Wiring

`CraftingSystemManagerRoot.svelte` already derives `selectedGatheringRules` from the selected system gathering config. Pass `selectedGatheringRules.hazardSelectionMode` into `EnvironmentEditView`, then through `EnvironmentHazardsTab` to `CompositionList`.

`CompositionList` adds a prop defaulting to `allDrops` and derives:

```js
const showHazardRankControls = $derived(
  kind === 'hazard' && hazardSelectionMode === 'highestRankedDrop'
);
```

## Rendering

Only the Included section uses rank controls, and only when `showHazardRankControls` is true:

- Included header and rows get the handle-grid class.
- Included rows render the visible grip/rank control.
- Included rows set `draggable` and drag/drop handlers.
- Included row overflow menus include Move up/down.

Available-to-add, excluded, and non-matching sections never render a blank handle placeholder, because those rows are not reorderable.

## CSS

The default composition grid remains the no-handle layout. A row/header class switches included ranked hazard rows to the handle grid. Task blind mode keeps its weight-column grid unchanged.

The handle control gets a small top offset so the grip icon, not whitespace above the rank, becomes the visual focus.
