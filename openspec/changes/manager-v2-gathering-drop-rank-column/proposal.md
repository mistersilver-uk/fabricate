# Manager V2 Gathering Drop Rank Column

## Why

When the gathering rules reward selection mode is "Highest ranked successful drop", the gameplay outcome depends on the order of rows in `task.dropRows` (the engine sorts by `rank` assigned from the array index). The drop rules table currently exposes neither the rank nor a way to reorder rows, so users have no way to set drop priority short of deleting and re-adding rows in the desired order.

## What Changes

- Add a leading "#" column to the gathering drop rules table containing the 1-indexed rank for each row and a small inline up/down button stack to move the row in `task.dropRows`.
- Show the rank column only when `rewardSelectionMode === 'highestRankedDrop'`; the other reward modes keep the existing column set.
- Source the new column's horizontal space from the drop-item-identity (component) column; the drop chance bar's minimum width is preserved.
- Add a `moveGatheringTaskDrop(rowId, direction)` handler in the Manager V2 root that swaps the row with its immediate neighbor in the canonical drop rows array.

## Scope Notes

- Manager V2 UI change only. No gathering data model or persistence shape changes — rank continues to be derived from the array index by `GatheringRichStateService.js`.
- Reorder always operates on the canonical `task.dropRows` array regardless of the editor's search filter or pagination state.
