# Design

## Essence Resolution

The runtime should treat component definition essences as canonical for component-backed actor items. For compatibility, an actor item with explicit `fabricate.essences` flags continues to use those flags.

Resolution order per item:

1. Use non-empty `fabricate.essences` on the item.
2. Otherwise, find a matching system component and use that component's `essences`.
3. If neither source exists, the item contributes no essences.

Component matching is deterministic:

- source UUID, source item UUID, and fallback references are authoritative;
- name matching is used only as a compatibility fallback;
- when multiple components match within the same tier, current system component order decides the winner.

## Affected Paths

- `CraftingEngine._matchAlchemySignature` needs component essence accumulation for workbench submitted items before deciding `no-match`.
- `RecipeManager.evaluateCraftability` and essence display states need the same logic so the matched recipe can pass `canCraft` after signature matching succeeds.
- `CraftingEngine` crafting-check and effect-transfer essence contexts need the same resolver so component-defined essences remain consistent after a successful match.
- Svelte discovered-recipe craftability needs essence checks so essence-only recipes are not shown as craftable when the actor lacks required essence sources.

## Quantity

Alchemy workbench submissions already expand stack quantities into repeated item references, so signature matching counts one contribution per submitted reference and does not also multiply by stack quantity. Recipe craftability evaluates inventory stacks, so it multiplies an item's resolved essence values by `system.quantity`.
