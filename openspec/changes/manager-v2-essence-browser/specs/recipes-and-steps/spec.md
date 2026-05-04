# Recipes And Steps Delta

## MODIFIED Requirements

### Requirement: Essence effect-transfer source resolution

Effect transfer through essences MUST resolve source effects through the essence source component when source component identity exists.

1. When an essence definition has `sourceComponentId`, effect-transfer resolution SHOULD resolve that managed component first.
2. If the source component exposes `sourceItemUuid` or compatible source evidence, effect transfer SHOULD collect effects from that resolved item UUID.
3. If the source component is stale, missing, or has no resolvable source item, effect transfer MUST skip that essence source without throwing.
4. Legacy `EssenceDefinition.sourceItemUuid` values remain compatibility input for existing systems and imports.
