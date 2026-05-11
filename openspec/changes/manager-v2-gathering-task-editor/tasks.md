## 1. Planning

- [x] Create OpenSpec proposal, design, tasks, and spec deltas.
- [x] Clarify that the existing `encounters` tab id remains unchanged.

## 2. Data And Runtime

- [x] Normalize drop chance, quantity, and condition modifiers in admin store.
- [x] Normalize condition modifiers in rich gathering runtime.
- [x] Apply matching weather and time modifiers during drop resolution.

## 3. UI

- [x] Replace the task editor placeholder with a reusable Svelte edit view.
- [x] Add identity, availability, drop table, row selection, duplicate, delete, and drop import controls.
- [x] Add selected-drop inspector controls and final chance preview.
- [x] Add repeated-component reward-rule notice.

## 4. Validation

- [x] Add focused store, runtime, mounted UI, and contract tests.
- [x] Run targeted tests.
- [x] Run `npm test`.
- [x] Run `npm run build`.

## 5. Refinement Pass

- [x] Refactor the central editor into task identity, task availability, drop rules, and calculation help areas that fit the Manager V2 shell.
- [x] Preserve the immediate-save library editing convention and keep inline chance/quantity edits as fast table controls.
- [x] Let Add Drop Rule create an unresolved selected row, and make unresolved rows support drop/import plus component selection in the inspector.
- [x] Improve drop table scanability, modifier chips, row actions, search, pagination count, and duplicate component support.
- [x] Refine the selected-drop inspector with component summary, component selection, signed time/weather modifier rows, and a clamped final chance breakdown.
- [x] Remove the task identity heading and internal id display from the gathering task editor while keeping editable identity fields.
- [x] Remove the duplicate central back action and reflow the task image, identity fields, and On/Off status toggle.
- [x] Replace single-value task availability selects with icon multi-select menus and removable selected-condition pills.
- [x] Add or update focused mounted/layout/contract tests.
- [ ] Capture normal and narrow rendered evidence for the task editor when live Foundry/Vite validation is available.
- [x] Run targeted tests, `npm test`, and `npm run build`.

## 6. Drop Rules Row Expansion

- [x] Expand the central drop rules card height and keep its table in a bounded vertical scroll region.
- [x] Rework drop rule rows into single-line desktop grid rows with compact component, chance, quantity, modifiers, and duplicate/delete action cells.
- [x] Add empty component copy for `No Component` and `Create or assign`.
- [x] Update mounted/layout/contract tests for the expanded row layout and removed edit quick action.
- [x] Run targeted tests, `npm test`, and `npm run build`.
