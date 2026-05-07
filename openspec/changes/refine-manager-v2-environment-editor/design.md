# Design: Refine Manager-V2 Environment Editor

## Image Control

The environment image field uses `ImagePathPicker` in a button-only variant: thumbnail preview plus a single button that opens the Foundry FilePicker. The picker callback is the existing `services.pickImagePath`, already routed to `EnvironmentEditView` via the `onPickImagePath` prop. Manual path entry is removed; users with a path already in mind can paste it via the FilePicker's own input.

`ImagePathPicker` accepts a new `showInput` prop (default `true`). When `false`, the text input is omitted and the layout collapses to preview + button.

## Scene Linkage

The scene card body becomes a drop zone. Idle, hover, and drag-over states are visually distinct. The card heading still shows the linked scene's name, image, and status chip (`Linked scene` / `Scene unresolved` / `No scene`). When a scene is linked, an Unlink button appears inside the drop zone.

Drop payload contract follows Foundry V13's sidebar drag format on `text/plain`:

```
{ "type": "Scene", "uuid": "Scene.<id>" }
```

The drop handler:

1. Calls `event.preventDefault()`.
2. Parses `event.dataTransfer.getData('text/plain')` as JSON.
3. Returns silently if the parsed payload is not an object with `type === 'Scene'` or has no `uuid`/`id`.
4. Calls `updateField('sceneUuid', uuid)` on a valid Scene drop.

The `dragover` handler sets `dataTransfer.dropEffect = 'link'` and toggles a `dropActive` state for the visual hover. The dropdown, raw-UUID input, and the `sceneOptions` prop wiring into `EnvironmentEditView` are removed. `services.getSceneOptions` is left in place for non-editor callers.

## Status Toggle

The native checkbox is replaced with the existing `manager-v2-status-toggle` button (track + knob + label). The CSS at `styles/fabricate.css:4874–4952` is reused unchanged. ARIA: `aria-pressed` reflects enabled state; `aria-label` switches between Enable/Disable per state. The duplicated fact grid is removed from this card; it now contains only the toggle and its label.

## Validation Band

A new `manager-v2-environment-validation-band` sits between the details band and the task workspace. It contains a header button that toggles the body open/closed:

- header: icon (alert/check) + `Validation` + a chip showing the issue count (or `All good`).
- body: the existing grouped validation sections plus the linked-scene reference warning, when present.

The band defaults to open whenever `validationErrors.length > 0`; users can collapse it manually. The `focusValidationError` handler is reused so error click-throughs still focus the right field.

## Workspace Grid

The workspace grid drops from three columns to two:

```
/* before */
grid-template-columns: minmax(210px, 0.58fr) minmax(360px, 1.45fr) minmax(250px, 0.72fr);
/* after */
grid-template-columns: minmax(220px, 0.45fr) minmax(420px, 1fr);
```

Responsive rules referencing the third column are removed. The evidence column aside is deleted entirely; the selected-task facts card is dropped (same data already lives on the editor's chip row and tab content).

## Behavior Preservation

- Draft callbacks, dirty protection, save flow, and validation logic are unchanged.
- `linkedSceneForDraft()` continues to resolve `environmentDraft.sceneUuid` to a scene preview.
- `selectedSceneMissing` still drives the scene-card warning chip and validation-band warning.
