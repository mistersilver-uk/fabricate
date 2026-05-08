# Design: Manager V2 Gathering Top Tabs

## Local Tab State

`EnvironmentsBrowserView` owns an `activeGatheringTab` state initialized to `environments`. The existing selected-system reset effect also resets this state so switching systems returns the Gathering page to the environment browser.

The tab model is a small local array with tab ids, label localization keys, and placeholder copy keys. It does not flow into `CraftingSystemManagerV2Root` or the Manager V2 store.

## Rendering

The tablist sits after the existing page heading and before the environment filters. Each tab is a button with `role="tab"`, `aria-selected`, and `aria-controls`.

The `Environments` panel contains the current toolbar, table, empty states, and pagination unchanged except for being wrapped in a tab panel. The placeholder panels reuse `manager-v2-empty` so visual weight stays consistent with existing Manager V2 empty states.

## Styling

New Manager V2 CSS adds:

- a wrapping horizontal tab strip,
- active and hover states,
- focus-visible outline,
- compact mobile wrapping.

The styles are scoped under `.fabricate-manager-v2`.

## Public Interface

Only English localization keys are added. No store state, public callbacks, routes, settings, or persistence are introduced.
