# Design: Remove Environment Inspector Runtime Card

## Inspector UI

`RecordInspector.svelte` remains the task/hazard detail surface for the right inspector. The selected-record hero remains unchanged and continues to show:

- selected task/hazard label
- image
- record name
- composition state pill
- runtime state pill

Remove the standalone task runtime card with `data-record-inspector-section="runtime-state"` and the standalone hazard-only card with `data-record-inspector-section="hazard-runtime"`. The matching evidence card remains the first explanatory inspector card after the header, and the overrides card remains the place where hazard chance drop-rate adjustments are shown and edited.

## State and Localization

Delete inspector-local derived values that only fed the removed card:

- `explanation`
- `layers`
- `waitingForValues`

Remove English catalog keys that are only referenced by the deleted cards: runtime-card title, layer labels/value text, waiting-for copy, generic runtime-card explanation strings, and the hazard-runtime title/scope/explanation strings. Keep keys used by the header pills, composition rows, matching evidence, and override controls, including `Inspector.HazardChance`.

## Tests

Source-contract tests assert the inspector no longer references the runtime-state or hazard-runtime cards, layer rows, or removed localization keys, while preserving the header runtime pill, matching evidence, and override controls. Mounted tests assert both task and hazard inspectors render their selected-record headers, composition/runtime header pills, matching evidence cards with all five rows, no runtime-state/hazard-runtime card, and the hazard override control.
