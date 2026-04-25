# Design

## View Model

The crafting store continues to resolve and persist selections. The prepared view model will include actor image URLs for available crafting actors and owned component source actors so the Svelte header can remain presentational.

## Header Component

Add a dedicated Svelte header component rendered by `CraftingAppRoot.svelte` in place of the existing `ActorSelector` and `SourceActorPicker` controls.

The component owns only transient UI state:

- whether either dropdown is open
- the search text for each dropdown

All durable state remains in `craftingStore.js` through the existing actions:

- `selectActor(actorId)`
- `toggleSourceActor(actorId, checked)`

The store treats the current crafting actor as a required component source. It
normalizes initial saved selections, source toggles, and crafting actor changes
so the current crafting actor is always present. When the crafting actor
changes, the required source moves from the previous actor to the newly selected
actor while preserving any other selected component sources.

## Interaction Details

- Clicking the selected crafting actor button opens a dropdown of available crafting actors.
- The crafting actor dropdown includes a search input and scrollable result list.
- The component source area shows selected sources as avatar buttons with hover-only name labels.
- Right-clicking a selected source avatar removes it by calling `toggleSourceActor(actorId, false)`.
- The selected crafting actor source is locked: it is shown as selected, cannot
  be unchecked in the dropdown, and right-click removal is ignored.
- The edit sources button opens a searchable, scrollable dropdown of owned actors with selected state markers.

## Styling

Use flat app styling with borders, spacing, solid or translucent fills, and restrained shadows. Do not add gradients or new visual dependencies.
