# Refine Manager-V2 Environment Editor

## Summary

Refine the manager-v2 environment editor with four targeted UX improvements: a Foundry FilePicker-backed image control, a drag-drop scene linker, a styled status toggle, and a wider task workspace freed from a duplicated evidence column.

## Motivation

The recent `refactor-gathering-environment-editor` change established the three-pane workspace, but several controls still feel grafted on:

- The environment image is a raw text input that asks GMs to know and type a Foundry data path, while task images in the same editor already use the FilePicker.
- Scene linkage uses a global dropdown of every scene plus a manual UUID input. Foundry users expect to drag a scene from the Scenes sidebar; the current controls are friction without a payoff.
- The enabled checkbox is the only native checkbox in the manager-v2 editor surface; sibling browsers (systems, environments, recipes) all use the styled toggle.
- The right-hand evidence column duplicates the fact-grid summary already shown in the details band and steals horizontal space from the task list and task editor.

## Proposed Change

- Replace the environment image text input with a button-only `ImagePathPicker` that opens Foundry's FilePicker.
- Replace the scene dropdown and raw UUID input with a drag-drop zone that accepts scene drags from the sidebar.
- Replace the status checkbox with the existing `manager-v2-status-toggle` button pattern.
- Remove the right-hand evidence column. Move validation issues into a collapsible band above the task workspace; drop the duplicated summary card and the selected-task facts card.
- Widen the task rail and task editor by collapsing the workspace grid from three columns to two.

## Impact

- UI-only refactor for manager-v2 environment editing.
- No gathering data schema, store, or validation logic changes.
- `services.getSceneOptions` remains in the service layer for other consumers; the editor stops consuming it.
- `ImagePathPicker` gains a `showInput` prop (default `true`) for backward compatibility with task image usage.
