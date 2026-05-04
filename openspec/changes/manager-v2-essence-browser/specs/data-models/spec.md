# Data Models Delta

## MODIFIED Requirements

### Requirement: Essence definition source identity

Essence definition source identity MUST distinguish the managed source component selected by the GM from any Foundry item UUID resolved through that component.

1. `EssenceDefinition.sourceComponentId` is the preferred new-write field for the in-system managed component that represents an essence source.
2. `EssenceDefinition.associatedSystemItemId` is a legacy alias for `sourceComponentId`.
3. Legacy `EssenceDefinition.sourceItemUuid` values that match a managed component id MUST be treated as component identity during normalization/display.
4. `EssenceDefinition.sourceItemUuid` MAY be retained as resolved or stale Foundry item/template evidence for compatibility with existing effect-transfer behavior.
5. Normalization and display seams MUST retain stale source evidence rather than collapsing unresolved references to null when the GM needs to inspect or clear the broken link.
6. Manager V2 display data SHOULD expose derived source states: `linked`, `missing`, `stale`, and `none`.
7. New add/update paths SHOULD keep `sourceComponentId`, `associatedSystemItemId`, and compatible source evidence coherent without creating a second persistence model.
