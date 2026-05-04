# Manager V2 Component Browser Polish

## Summary

Refine the manager-v2 component browser so rows are scannable at Foundry window widths, component facts appear in purposeful columns, and the inspector no longer duplicates row actions or low-value evidence.

## Motivation

The current component browser shows object-shaped descriptions as `[object Object]`, lets essence chips overflow, and spends table space on source/evidence columns that do not match the user's intended scan path. Progressive difficulty is useful but buried in a generic evidence bucket, while tag filtering is separate from search and the source UUID inspector repeats the UUID text instead of explaining what it is.

## Scope

- Normalize component descriptions to display text in manager-v2 item cards.
- Render component essences compactly as icon plus quantity, with the essence name as tooltip/accessible label.
- Remove the component table source-state and evidence columns.
- Add a dedicated progressive difficulty column only when the selected system uses progressive resolution and component difficulty data exists.
- Let component search match tags when item tags are enabled.
- Revise source UUID inspector copy so the UUID lives in the copy button tooltip/title, not as small repeated text.
- Remove component usage evidence and duplicate inspector actions from the right inspector.
- Update manager-v2 tests, layout checks, and localized copy.

## Out of Scope

- Deep component editing. Existing row Edit still opens the existing component editor callback.
- Component persistence or item import behavior.
- Reworking recipe/gathering evidence models outside the component browser.
