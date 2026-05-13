# Design

## Conditional column

`GatheringTaskEditView.svelte` already receives the `rewardRules` prop (used to gate the existing repeated-component notice). A new derived flag `rankedMode = rewardRules?.rewardSelectionMode === 'highestRankedDrop'` toggles:

- the `is-ranked-mode` class on `.manager-v2-gathering-task-drops-table`;
- a leading `#` `columnheader` cell in the table head;
- a leading `.manager-v2-drop-rank-cell` in each row.

The rank label is `dropRows.indexOf(row) + 1`, not the paginated/filtered index — rank is a property of the canonical array, and `paginatedRows` only changes what the user sees.

## Reorder handler

A new `moveGatheringTaskDrop(rowId, direction)` lives next to the existing drop CRUD helpers in `CraftingSystemManagerV2Root.svelte`. It looks up the row in `gatheringTaskDropRows(editingGatheringTask)`, swaps it with the neighbor when in range, and calls `updateSelectedGatheringTask({ dropRows: next })`. It is passed to `GatheringTaskEditView` as `onMoveDrop`.

Up/down icon buttons in the rank cell call `onMoveDrop(row.id, 'up' | 'down')` and stop event propagation so reorder does not change the selected drop. The buttons are disabled at array boundaries.

## Grid layout

`styles/fabricate.css` defines the table grid via the `--fab-mv2-task-drop-grid` custom property. The base value (`minmax(0, 1.05fr) minmax(220px, 1.35fr) 56px minmax(180px, 1.65fr)`) is preserved for the default and non-ranked modes.

When `.is-ranked-mode` is present, the property is redefined to prepend a `56px` rank column and reduce the component column's `fr` value so the new column's width comes from the component column. The drop-chance `minmax(220px, 1.35fr)` and the quantity `56px` are unchanged. The intermediate task-edit-width override mirrors the same shape with the narrower intermediate values.

The rank cell uses an inline two-column layout: the `#N` label sits left, a tight 2-row stack of small icon buttons sits right. The buttons reuse the existing `manager-v2-icon-button` theme (including its `:disabled` state) and are sized down to 22×22 px so two stack vertically inside the row.

## Localization

Three new keys land under `FABRICATE.Admin.ManagerV2.Environment.Tasks`:

- `DropRank` — accessible name for the rank column header.
- `MoveDropUp` / `MoveDropDown` — labels/titles for the row reorder buttons.
