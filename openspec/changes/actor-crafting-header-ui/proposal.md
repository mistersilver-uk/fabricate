# Actor Crafting Header UI

## Summary

Replace the Actor Crafting App's separate crafting actor and component source controls with a single header that keeps the selected crafting actor prominent and makes component source selection faster to inspect and edit.

## Motivation

The current controls are functional but visually disconnected from the app shell. They also use form controls that hide actor imagery, making it harder to confirm which actor will receive crafted results and which actors will provide components.

## Goals

- Add a well-defined app header above the tab content.
- Show the selected crafting actor image and name on the left.
- Preserve the existing default and last-selection behavior from the crafting store.
- Replace the crafting actor select with a searchable image/name dropdown.
- Replace the component source checkbox list with selected actor avatars, right-click removal, and a searchable image/name dropdown for editing sources.

## Non-Goals

- Changing crafting, alchemy, visibility, or inventory semantics.
- Changing persisted setting keys.
- Adding new dependencies.
