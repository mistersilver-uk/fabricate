# Lock Active Gathering Navigation

## Summary

Manager V2's Gathering left-nav parent currently always routes to the Environments child and its chevron can collapse the submenu even while a Gathering child page is active.
This change locks the submenu open for active Gathering child routes and prevents parent clicks from moving users away from the selected child page.

## Goals

- Keep the Gathering submenu expanded while any Gathering child page or edit subroute is active.
- Preserve the current child route when the Gathering parent is clicked from inside Gathering.
- Keep the parent row visually neutral and leave selected styling on the active child item.
- Cover the behavior with focused mounted component tests.

## Out of Scope

- Changing Gathering runtime behavior, persistence, schemas, or public APIs.
- Adding new navigation destinations or restoring an in-page Gathering tab strip.
- Changing Manager V2 visual styling beyond any state/ARIA attributes required by the behavior.
