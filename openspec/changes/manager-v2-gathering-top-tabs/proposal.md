# Manager V2 Gathering Top Tabs

## Summary

Add a page-local tab strip to the Manager V2 Gathering page with `Environments`, `Tasks`, `Encounters`, and `Settings` tabs.

## Motivation

The left navigation now routes GMs to a broader Gathering area, but the page content still opens directly into environment browsing. A local tab strip gives the Gathering page room for upcoming task, encounter, and settings surfaces without changing the global Manager V2 route model.

## Proposed Change

- Render a horizontal tab list below the Gathering page heading.
- Select `Environments` by default.
- Keep the existing environment browser, filters, table, pagination, and empty states under the `Environments` tab only.
- Add selectable placeholder panels for `Tasks`, `Encounters`, and `Settings`.
- Keep tab selection local to `EnvironmentsBrowserView`; do not persist it or expose it through stores, services, hooks, or routes.
- Reset to `Environments` when the selected crafting system changes or the view remounts.

## Impact

- UI-only Manager V2 change.
- No runtime API, data schema, migration, or Foundry hook changes.
- Adds localized copy for Gathering page tabs and placeholder panels.
