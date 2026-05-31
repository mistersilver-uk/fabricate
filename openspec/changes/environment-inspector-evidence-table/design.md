# Design: Environment Inspector Evidence Table

## Inspector Evidence

`MatchingEvidenceChips.svelte` already separates compact row evidence (`variant="chips"`) from right-inspector evidence (`variant="checks"`). Keep that split and change only the `checks` variant.

The inspector variant renders a semantic table:

- left column: localized evidence dimension label
- right column: one or more pill values for the record-side evidence values
- rows: biome, region, weather, time, danger

Rows retain `data-evidence-field` and `data-evidence-state` attributes so tests and future styling can identify match state. The pill tone continues to use the existing state semantics: match is positive, biome/region/danger mismatch is danger, weather/time mismatch is warning, and unconstrained dimensions are neutral.

## Styling

The table should fit the right inspector width, avoid horizontal scrolling, and allow long value names to wrap within pills. The compact `chips` variant remains unchanged for any row/table surfaces that still use it.
