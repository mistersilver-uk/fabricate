# Recipes And Steps Spec Delta

## Removed Requirements

### Recipe Catalyst Prerequisites

Catalyst prerequisites on recipes, steps, ingredient sets, and salvage definitions are
removed. References to `catalysts`, `catalystStates`, `missing.catalysts`,
`getCatalystsForSet`, `_validateCatalysts`, `_degradeCatalysts`, and
`consumeCatalystsOnFail` no longer describe crafting behaviour.

## Modified Requirements

### Recipe Tool Prerequisites

Crafting prerequisites that are required-but-not-always-consumed (and may break) are
expressed as Tools referenced by `toolIds`, replacing recipe-side catalysts.

1. A recipe declares applicable Tools at recipe, step, and ingredient-set granularity via
   `toolIds: string[]`; the applicable set for an ingredient set is the union resolved
   against the per-system Tools library (`RecipeManager.getToolsForSet`).
2. `RecipeManager.evaluateCraftability` returns `toolStates` and `missing.tools`: every
   applicable Tool must be present (matched via the shared tool matcher) and pass its
   optional `requirement` before the recipe is craftable.
3. `CraftingEngine` validates Tools (`_validateTools`), and on a committed craft applies
   tool usage/breakage through the shared breakage runtime (`src/toolBreakageRuntime.js`),
   recording `usedTools` evidence.
4. A virtual-present Tool injected by a canvas Tool station (keyed by `componentId`)
   satisfies a Tool prerequisite without the actor owning the item and is excluded from
   usage and breakage.
