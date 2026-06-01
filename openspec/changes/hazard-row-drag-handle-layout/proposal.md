# Hazard Row Drag Handle Layout

## Summary

Adjust the gathering environment hazard composition UI so rank handles only appear when the selected system hazard rule is `highestRankedDrop`. The layout should not reserve handle space for addable, excluded, or non-matching hazards.

## Goals

- Thread the selected system `hazardSelectionMode` from the manager root into the environment hazards composition list.
- Render hazard drag handles, draggable rows, and move actions only for included hazard rows when `hazardSelectionMode === 'highestRankedDrop'`.
- Keep available-to-add, excluded, and non-matching hazard rows on the normal non-handle grid.
- Preserve task composition behavior, including blind-mode weight columns.
- Lower the handle visual slightly so the grip icon and rank number read as a grouped control.

## Out of Scope

- Changing runtime hazard selection or resolution semantics.
- Changing persisted hazard ordering data.
- Adding new hazard selection modes.
