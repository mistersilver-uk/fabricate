/**
 * The one way a read pass builds an inventory snapshot (issue 1228).
 * `matchesRecipeItem` is not a parameter: there is one recipe-item matcher
 * (`itemMatchesRecipeItemSource`), and a snapshot missing it makes `recipeItemCandidates` return
 * every document unfiltered, a silent regression of issue 1077. `resolveComponent` stays injected:
 * its absence fails loud (every recipe unavailable), importing it would pull its matcher graph into
 * `CraftingListingBuilder`, and a default would move fixture answers.
 * Every legacy `linkedRecipeItemUuid` in the pass joins the candidate superset, or an un-migrated
 * recipe's book is filtered out. A pass snapshot is a per-pass value, never cached.
 */

import { itemMatchesRecipeItemSource } from '../utils/sourceUuid.js';

import { buildInventorySnapshot } from './inventorySnapshot.js';

/** Every legacy `linkedRecipeItemUuid` in a pass by system; exported for the superset guard. */
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
 * The pass's shared snapshot, exposing the whole read API so no consumer can misuse a half.
 * Omitting a recipe from `recipes` can hide its book.
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
