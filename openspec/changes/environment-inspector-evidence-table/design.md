# Design: Environment Inspector Evidence Table

## Inspector Evidence

`MatchingEvidenceChips.svelte` already separates compact row evidence (`variant="chips"`) from right-inspector evidence (`variant="checks"`). Keep that split and preserve the current `checks` table markup unless a minimal class/data hook is required for CSS targeting.

The inspector variant renders a semantic table:

- left column: localized evidence dimension label
- right column: one or more pill values for the record-side evidence values
- rows: biome, region, weather, time, danger

Rows retain `data-evidence-field` and `data-evidence-state` attributes so tests and future styling can identify match state. The pill tone continues to use the existing state semantics: match is positive, biome/region/danger mismatch is danger, weather/time mismatch is warning, and unconstrained dimensions are neutral.

## Styling

The table should fit the right inspector width, avoid horizontal scrolling, and allow long value names to wrap within pills. The compact `chips` variant remains unchanged for any row/table surfaces that still use it.

The refined inspector styling is CSS-only:

- the table uses transparent inspector-card background rather than a dark inset panel
- full-width horizontal separators define each row
- rows use compact, even vertical spacing
- the left label column has a fixed width and strong label text
- the right value column aligns inline wrapping pills without stretching or clipping
- value pills remain visible but compact, with subtle positive, danger, warning, and neutral status tones

Visual acceptance checks should cover the first visible task/hazard inspector state, all five rows, two-column alignment, wrapping/clipping at narrow manager widths, no horizontal overflow, and unchanged compact chip evidence outside the inspector.
