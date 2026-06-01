## Design

`RecordInspector.svelte` already applies `adjustmentValueClass(row.adjustment)` to `.manager-environment-drop-adjustment-row.is-task-drop`. The signed input shell should stop receiving that state class so row color ownership is unambiguous.

CSS will mirror the task-editor modifier row card pattern:

- `.is-task-drop.is-positive` uses the success border and soft success background mixed with the manager surface.
- `.is-task-drop.is-negative` uses the danger border and soft danger background mixed with the manager surface.
- `.is-task-drop.is-zero` keeps the neutral border/background.
- `.is-disabled` continues dimming the whole row.

The control row becomes a content-width grid rather than stretching the Base and Effective columns across the inspector width. Base is right-aligned, the signed percent input uses the shared compact width, Effective is left-aligned, and the icon-only clear button remains immediately after Effective in the same control row.

## Risks

- Mounted tests should guard against the tone class drifting back to the input shell.
- The tighter grid must stay narrow enough for inspector rail widths while still fitting `-99`, `+5`, and `100` plus the percent suffix.
