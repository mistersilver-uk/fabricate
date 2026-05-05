# Sync Component Linked Metadata Refresh

## Problem

Fabricate components snapshot the name, image, and description of a linked Foundry item when the component is imported or relinked. If the linked item's name, image, or description later changes, the stored component metadata remains stale, so component browsers, recipe editors, crafting palettes, and salvage views keep showing old labels, artwork, or text.

## Scope

In scope:

- Refresh stored component `name` values when a linked Foundry item update changes the item's name.
- Refresh stored component `img` values when a linked Foundry item update changes the item's image.
- Refresh stored component `description` values when a linked Foundry item update changes the item's description.
- Match components through the existing source-reference chain: `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- Persist changes only when at least one managed component name, image, or description actually changes.
- Notify Fabricate consumers that crafting systems changed after an automatic refresh.
- Add focused automated coverage for direct UUID, canonical source UUID, name sync, description normalization, and no-op behavior.

Out of scope:

- Rewriting component image rendering in Svelte views.
- Adding new dependencies.
- Refreshing missing or unresolved source documents on a timer.

## Acceptance Criteria

- Given a component linked to a world item by UUID, when that item's `name` changes, the component's `name` is updated to the new value.
- Given a component linked to a world item by UUID, when that item's `img` changes, the component's `img` is updated to the new path.
- Given a component linked to a canonical compendium source and a copied item updates, the component's `img` is updated when the item's source metadata matches the component.
- Given a component linked to a world item by UUID, when that item's description changes, the component's `description` is updated to the normalized plain text from the linked item.
- Given a component linked to a canonical compendium source and a copied item clears its description, the component's `description` is cleared.
- Updates that do not include a name, image, or description change do not save crafting systems.
- The automatic refresh path is covered by `node:test`.
