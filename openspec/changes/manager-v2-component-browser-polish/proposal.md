# Manager V2 Component Browser Polish

## Summary

Refine the manager-v2 component browser so rows are scannable at Foundry window widths, component facts appear in purposeful columns, folder drops import complete item folders, and source evidence is visible without leaking raw UUID text into the inspector.

## Motivation

The current component browser shows object-shaped descriptions as `[object Object]`, lets essence chips overflow, and spends table space on generic evidence columns that do not match the user's intended scan path. Progressive difficulty is useful but buried in a generic evidence bucket, source identity is described as a linked/not-linked state instead of the document origin, folder drops only cover direct contents, and the source UUID inspector repeats the UUID text instead of explaining what it is.

No matching GitHub issue exists for this follow-up; this OpenSpec change is the planning record.

## Scope

- Normalize component descriptions to display text in manager-v2 item cards.
- Render component essences compactly as icon plus quantity, with the essence name as tooltip/accessible label.
- Replace the component table source-state column with a searchable Origin column showing Compendium, Items Directory, Missing, or Unknown.
- Remove the component table generic evidence column.
- Add a dedicated progressive difficulty column only when the selected system uses progressive resolution and component difficulty data exists.
- Let component search match tags when item tags are enabled.
- Revise source UUID inspector copy so the UUID lives in the copy button tooltip/title, not as small repeated text, and show a warning callout only when a stored UUID no longer resolves.
- Remove component usage evidence and duplicate inspector actions from the right inspector.
- Import all direct and nested Item documents for folder drops, skip non-item documents, refresh once, and report added/updated/skipped totals.
- Balance drop-zone spacing so it does not touch the toolbar/search container.
- Update manager-v2 tests, layout checks, and localized copy.

## Out of Scope

- Deep component editing. Existing row Edit still opens the existing component editor callback.
- Reworking recipe/gathering evidence models outside the component browser.
