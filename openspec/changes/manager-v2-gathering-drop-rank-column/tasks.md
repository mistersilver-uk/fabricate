## 1. Planning

- [x] Create OpenSpec proposal, design, and tasks.

## 2. UI

- [x] Add `moveGatheringTaskDrop` handler and wire `onMoveDrop` through `<GatheringTaskEditView>`.
- [x] Add `onMoveDrop` prop, `rankedMode` derived, conditional `#` header and rank cell with up/down icon buttons in `GatheringTaskEditView.svelte`.
- [x] Add new localization keys (`DropRank`, `MoveDropUp`, `MoveDropDown`).
- [x] Add `.is-ranked-mode` grid template overrides (desktop + intermediate) and rank-cell styles in `styles/fabricate.css`.

## 3. Validation

- [x] Add layout tests for the `.is-ranked-mode` grid templates and rank-cell sizing.
- [x] Add mounted coverage for rank visibility, labels, boundary-disabled buttons, and swap behavior.
- [x] Run `npm test`.
- [x] Run `npm run build`.
