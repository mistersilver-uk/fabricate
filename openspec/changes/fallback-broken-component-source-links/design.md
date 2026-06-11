# Design: Fallback Broken Component Source Links

## Import Source Resolution

`CraftingSystemManager` already owns component import identity through
`_resolveImportedSourceData()`. Keep the behavior there so all import callers
share one source-reference contract.

Resolution order:

1. Resolve the dropped UUID with `fromUuid(itemUuid)`.
2. Collect the live dropped UUID and item source references as today.
3. Read the canonical source with `getSourceUuid(source)`.
4. If a canonical source exists and differs from the live dropped UUID, verify it
   with `fromUuid(canonicalUuid)`.
5. If verification fails, use the live dropped UUID as both `sourceUuid` and
   `sourceItemUuid`, keep the broken canonical UUID in the reference set, and
   return fallback metadata `{ itemName, brokenUuid, fallbackUuid }`.
6. If verification succeeds, keep current canonical-source behavior.

The fallback check is intentionally not added to `getSourceUuid()`: that helper
answers "what source did Foundry record?" and should remain a pure resolver.
Import code decides whether the recorded source is usable for persisted
Fabricate component links.

## Persistence And Matching

When fallback occurs, the normalized component stores:

- `sourceUuid`: the live dropped Item UUID.
- `sourceItemUuid`: the live dropped Item UUID.
- `fallbackItemIds`: includes the broken canonical source UUID, deduped with
  existing fallbacks and previous source fields.

This prevents immediate missing-origin display while preserving the broken UUID
as matching/diagnostic evidence.

Existing components are not migrated automatically. Re-importing or replacing a
source applies the new behavior.

## Notification Behavior

`CraftingSystemManager` should return source-fallback metadata instead of
calling `ui.notifications` directly.

The manager app remains the Foundry UI edge:

- Single item add and replace-source warn once with the affected item name,
  broken source UUID, and live fallback UUID.
- Folder and pack imports emit one summary warning with the fallback count.
- Existing add/update/skipped info notifications remain unchanged.

## Tests And Validation

The main seam is `CraftingSystemManager` with fake `fromUuid()` behavior. Tests
should cover resolvable canonical links, broken canonical fallback, existing
component updates, replace-source, and bulk aggregation. UI callback tests should
cover single and summary notifications without requiring real Foundry windows.
