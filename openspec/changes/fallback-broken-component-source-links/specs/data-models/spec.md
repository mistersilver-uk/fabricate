## Component Source Import

### ADDED Requirements

1. When importing or replacing a component source from a Foundry Item, Fabricate
   must verify a recorded canonical source UUID from `_stats.compendiumSource` or
   `flags.core.sourceId` before storing it as the component's primary source.
2. If the recorded canonical source UUID does not resolve but the live dropped
   Item UUID does resolve, Fabricate must store the live dropped Item UUID as the
   component's primary `sourceUuid` and `sourceItemUuid`.
3. When Fabricate falls back from a broken canonical source UUID to a live
   dropped Item UUID, it must preserve the broken canonical source UUID in
   `fallbackItemIds`.
4. The fallback behavior applies to single item import, folder import,
   compendium pack import, and replace-source.
