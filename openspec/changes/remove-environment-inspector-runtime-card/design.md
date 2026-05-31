# Design: Remove Environment Inspector Runtime Card

## Inspector UI

`RecordInspector.svelte` remains the task/hazard detail surface for the right inspector. The selected-record hero remains unchanged and continues to show:

- selected task/hazard label
- image
- record name
- composition state pill
- runtime state pill

Remove only the standalone card with `data-record-inspector-section="runtime-state"`. The matching evidence card remains the first explanatory inspector card after the header, and the hazard runtime card remains for hazards because it explains hazard-specific drop behavior rather than generic availability.

## State and Localization

Delete inspector-local derived values that only fed the removed card:

- `explanation`
- `layers`
- `waitingForValues`

Remove English catalog keys that are only referenced by that card: runtime-card title, layer labels/value text, waiting-for copy, and runtime-card explanation strings. Keep keys used by the header pills, composition rows, matching evidence, hazard runtime, and override controls.

## Tests

Source-contract tests assert the inspector no longer references the runtime-state card, layer rows, or removed localization keys, while preserving the header runtime pill and matching evidence. Mounted tests assert both task and hazard inspectors render their selected-record headers, composition/runtime header pills, matching evidence cards with all five rows, and no runtime-state card.
