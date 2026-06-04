# Data Models Spec Delta

## Added Requirements

### Component Source Reference Matching

Fabricate matches an owned inventory item to a managed `Component` (and to anything that
reuses the component source-reference matcher, including gathering tools and crafting
catalysts) through a shared **source-reference chain**, not by name alone.

An owned item's source-reference set is the union of:

1. `item.uuid` — the item instance's own UUID.
2. The item's **compendium source** UUID, resolved as `_stats.compendiumSource` (Foundry
   v12+) then `flags.core.sourceId` (legacy fallback). This is the existing compendium-source
   resolver and its semantics are unchanged.
3. The item's **world-duplicate source** UUID: `_stats.duplicateSource`. Foundry records this
   when a world Item is duplicated (for example dragged) into an actor; in that case
   `_stats.compendiumSource` is typically `null` and there is no `flags.core.sourceId`.

A component's source-reference set is the union of `sourceUuid`, `sourceItemUuid`, and any
`fallbackItemIds`.

Requirements:

1. An owned item MUST be considered a match for a component when the two source-reference
   sets intersect on any reference.
2. The matcher MUST honor `_stats.duplicateSource` as an item identity reference, so an item
   that was duplicated from a component's source world item is recognized even when
   `_stats.compendiumSource` is absent and there is no `flags.core.sourceId`.
3. The compendium-source resolver (the helper that answers "which compendium document was
   this copied from?") MUST retain compendium-source semantics and MUST NOT be redefined to
   read `_stats.duplicateSource`. World-duplicate source is contributed as an additional
   item identity reference in the item-reference list, not folded into the compendium-source
   resolver.
4. Item identity for matching MUST remain the source-UUID chain (live UUID, compendium
   source, world-duplicate source) and the component's declared source references. Matching
   MUST NOT depend on importer/pack bookkeeping ids such as `flags.fabricate.mythwrightId`.
5. The duplicate-source reference MUST flow through the single shared source-reference matcher
   so every consumer — gathering tool presence, crafting catalysts, and ingredient/component
   recognition — benefits without per-call-site changes.

## Testing Requirements

- Unit test: an item carrying only `_stats.duplicateSource` (with `_stats.compendiumSource`
  null and no `flags.core.sourceId`) matches a component whose `sourceUuid` / `sourceItemUuid`
  equals that duplicate-source UUID.
- Unit test: the compendium-source resolver returns `null` for a duplicate-source-only item
  (its semantics stay compendium-only).
- Unit test: matching does not occur on `flags.fabricate.mythwrightId` alone.
