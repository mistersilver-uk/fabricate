# Polish Manager V2 Empty Browsers

## Summary

Add contextual right-inspector setup guidance for empty Manager V2 Recipes, Components, and Essences browsers.

## Motivation

The empty Recipes, Components, and Essences browsers already explain the empty list in the main pane, but the right inspector still prompts GMs to select a row. That is unhelpful when there are no rows to select and is inconsistent with the existing no-systems and no-environments guidance.

## Scope

- Replace the empty-data inspector prompts for Recipes, Components, and Essences with setup guidance.
- Preserve the existing central browser empty states and row-selection inspectors.
- Preserve filtered-empty behavior when rows exist but search or filters hide them.
- Add localized setup copy and focused Manager V2 tests.

## Out Of Scope

- Changing recipe, component, or essence persistence.
- Changing browser filters, pagination, import, create, edit, or delete behavior.
- Adding new documentation pages or npm dependencies.
