# Design: Hazard Force-Included Reorder

## Reorder Set

The store reorder action must use the same included-row definition as `CompositionList` for hazards:

- `includedByMatch`
- `explicitlyIncluded`
- `forceIncluded`
- `includedButUnavailable`

Runtime availability is not a ranking precondition. A GM-authored ranking is an authoring order, and `highestRankedDrop` should allow any included hazard to occupy any rank even if current conditions make that hazard inactive at runtime.

Manual `forcedHazardIds` should classify as `forceIncluded` whenever the library hazard is enabled and manual mode is active, regardless of whether the hazard currently matches normally. This keeps the editor aligned with runtime composition after environment edits change region/biome/danger matching.

## UI Behavior

`CompositionList` already gates hazard drag handles, row drag/drop, and Move up/down menu actions on `kind === 'hazard' && hazardSelectionMode === 'highestRankedDrop'`. That gate remains in place.

When hazard selection is not `highestRankedDrop`, the editor continues to hide rank controls. The underlying `hazardOrder` remains deterministic data for runtime compatibility, but the GM does not edit it through drag handles in those modes.

## Runtime Behavior

`GatheringRichStateService.composeEnvironment()` already sorts composed hazards with `hazardOrder` after applying manual force-inclusion rules. Regression coverage should lock that matching and force-included hazards sort together.
