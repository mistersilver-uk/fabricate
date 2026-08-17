/**
 * @module passInventorySnapshot
 *
 * The ONE way a read pass builds an inventory snapshot (issue 1228, under the performance
 * programme #1070).
 *
 * ## Why this module exists at all
 *
 * `inventorySnapshot.buildInventorySnapshot` takes its two identity collaborators —
 * `matchesRecipeItem` and `resolveComponent` — independently, and the two production call
 * sites #1077 shipped supplied DISJOINT halves of them:
 *
 * | Call site                          | `matchesRecipeItem` | `resolveComponent` |
 * |------------------------------------|---------------------|--------------------|
 * | `RecipeVisibilityService`          | yes                 | no                 |
 * | `CraftingListingBuilder`           | no                  | yes                |
 *
 * So the two snapshots were not interchangeable, and — this is the part that matters — the
 * two failure directions are ASYMMETRIC:
 *
 * - **A visibility-shaped snapshot handed to the tallies path** makes `componentTallies`
 *   compute `canResolve === false` (`inventorySnapshot.js`), so `quantityByComponentId` comes
 *   back empty and `projectRecipeAvailability` answers `available: false` for EVERY recipe.
 *   That is the one direction its contract forbids, but it is at least LOUD: a listing whose
 *   every row reads "missing materials" is visible on screen and collapses the
 *   `availableRecipes` count every committed baseline records.
 * - **A tallies-shaped snapshot handed to the visibility path** makes `recipeItemCandidates`
 *   return every held document UNFILTERED. The per-recipe matcher still decides each entry, so
 *   **the answer does not change at all** — the #1077 defect is fully reinstated with every
 *   correctness test green. That direction is SILENT, and silence is what let two builders
 *   carry the original defect past #1077 in the first place.
 *
 * ## What this module does about it
 *
 * It removes the silent direction by construction: `matchesRecipeItem` is **not a parameter**.
 * There is exactly one recipe-item matcher in this repository (`itemMatchesRecipeItemSource`),
 * it has no alternative implementation and no test ever substituted one, so making it a
 * parameter only ever bought the opportunity for two call sites to disagree. A pass snapshot
 * built through this factory cannot be missing it.
 *
 * `resolveComponent` stays INJECTED, and that is a considered asymmetry rather than an
 * oversight:
 *
 * - its absence is the loud direction above, and every production site now supplies it
 *   (`main.js` wires the same `findMatchingComponent` into all four), so the production
 *   snapshots are interchangeable in value as well as in shape;
 * - and importing it here would drag its five-module matcher graph
 *   (`essenceResolver` → `componentNameMatch` → `definitionIndex` → …) into
 *   `CraftingListingBuilder`'s transitive closure, which that builder's own constructor
 *   documentation records as the reason the resolver is injected rather than imported;
 * - defaulting it here would also CHANGE ANSWERS for the many fixtures that deliberately omit
 *   it and assert the resulting fail-closed availability, and this change is required to move
 *   no answer at all.
 *
 * ## The legacy book link, uniformly
 *
 * Every `linkedRecipeItemUuid` carried by the recipes of the pass is collected here and handed
 * to the snapshot, because `_recipeItemMatchDefinitions` adds a synthetic definition for one
 * and the candidate superset must contain every definition any recipe's matcher could see.
 * Miss those and an un-migrated recipe's book is filtered out — the one way the prefilter can
 * change an answer. It used to be done in `RecipeVisibilityService` alone, which meant any
 * NEW call site had to rediscover it; doing it here makes it a property of the snapshot rather
 * than of one caller.
 *
 * ## Lifetime is unchanged
 *
 * A pass snapshot is still a per-pass VALUE, discarded when the pass returns, never retained
 * and never cached across a call boundary. See `inventorySnapshot`'s header for why the item
 * half is not keyed on #1076's revision tokens.
 */

import { itemMatchesRecipeItemSource } from '../utils/sourceUuid.js';

import { buildInventorySnapshot } from './inventorySnapshot.js';

/**
 * Every distinct legacy `linkedRecipeItemUuid` in a pass, bucketed by crafting system.
 *
 * Exported for the guard that pins "the superset really is a superset" rather than for
 * production use — a caller should hand {@link buildPassInventorySnapshot} its recipes and let
 * the snapshot own this.
 *
 * @param {Iterable<object|null>} recipes
 * @returns {Map<string, Set<string>>}
 */
export function legacyRecipeItemUuidsBySystem(recipes) {
  const bySystem = new Map();
  for (const recipe of recipes || []) {
    const legacyUuid = String(recipe?.linkedRecipeItemUuid || '').trim();
    if (!legacyUuid) continue;
    const systemId = recipe?.craftingSystemId;
    const bucket = bySystem.get(systemId);
    if (bucket) bucket.add(legacyUuid);
    else bySystem.set(systemId, new Set([legacyUuid]));
  }
  return bySystem;
}

/**
 * Build the one inventory snapshot a read pass shares.
 *
 * The returned facade exposes the WHOLE snapshot read API, not the half its immediate caller
 * happens to need. That is the point: a pass snapshot is a value any consumer in the pass may
 * be handed, so a caller that only asks `recipeItemCandidates` today must not produce
 * something a later caller can silently misuse for `componentTallies`.
 *
 * @param {object} [options]
 * @param {object|null} [options.craftingActor] The acting character.
 * @param {object[]} [options.componentSourceActors] Additional inventory sources.
 * @param {Iterable<object|null>} [options.recipes] Every recipe the pass will evaluate, read
 *   ONLY for its legacy `linkedRecipeItemUuid`. Omitting a recipe that IS in the pass makes
 *   the candidate set a subset rather than a superset and can hide that recipe's book.
 * @param {((item: object, components: object[], systemId: string) => (object|null))|null}
 *   [options.resolveComponent] How an item resolves to a component of a system. Injected —
 *   see the module header for why this one is a parameter and `matchesRecipeItem` is not.
 * @returns {{
 *   heldItems: () => Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>,
 *   actors: object[],
 *   recipeItemCandidates: (system: object) =>
 *     Array<{actor: object, item: object, actorOrder: number, itemOrder: number}>,
 *   componentTallies: (system: object) =>
 *     {quantityByComponentId: Map<string, number>, stacksByComponentId: Map<string, number>,
 *      essenceTotals: Map<string, number>, quantityByTag: Map<string, number>}
 * }}
 */
export function buildPassInventorySnapshot({
  craftingActor = null,
  componentSourceActors = [],
  recipes = [],
  resolveComponent = null,
} = {}) {
  const legacyBySystem = legacyRecipeItemUuidsBySystem(recipes);
  const snapshot = buildInventorySnapshot({
    craftingActor,
    componentSourceActors,
    resolveComponent,
    matchesRecipeItem: itemMatchesRecipeItemSource,
  });

  return {
    heldItems: snapshot.heldItems,
    actors: snapshot.actors,
    recipeItemCandidates: (system) =>
      snapshot.recipeItemCandidates(system, legacyBySystem.get(system?.id) ?? []),
    componentTallies: (system) => snapshot.componentTallies(system),
  };
}
