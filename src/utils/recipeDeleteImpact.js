/**
 * What deleting a set of recipes reaches, counted once for both the statement and the write. Two
 * recipe-item numbers differ by design: `affectedIds` is what stops containing these recipes, and
 * `prunes` is the `recipeIds[]` arrays the write rewrites. A leaf: its imports stay zero-cost.
 */
import { getFabricateFlag } from '../config/flags.js';
import { readLearnedRecipeEntries } from '../systems/recipeKeyedFlagEntries.js';
import { selectWritableActors } from '../systems/writableActors.js';

import { recipeItemDefinitionsContaining } from './recipeItemMembership.js';
import { stringOrEmpty as trimmed } from './scalars.js';

const ZERO_IMPACT = Object.freeze({
  deletable: 0,
  deletableIds: [],
  recipeItemsAffected: 0,
  recipeItemIds: [],
  learnersAffected: 0,
  learnerIds: [],
});

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Plan the recipe-item membership prune for a set of recipes about to be deleted. */
export function planRecipeItemMembershipPrune(definitions, recipes, membershipResolvesByRecipeIds) {
  const defs = toArray(definitions).filter(
    (definition) => definition && typeof definition === 'object'
  );
  const rows = toArray(recipes);
  if (defs.length === 0 || rows.length === 0) return { affectedIds: [], prunes: [] };

  const doomed = new Set();
  const affected = new Set();
  for (const recipe of rows) {
    const recipeId = trimmed(recipe?.id);
    if (!recipeId) continue;
    doomed.add(recipeId);
    for (const definition of recipeItemDefinitionsContaining(
      defs,
      recipe,
      membershipResolvesByRecipeIds
    )) {
      affected.add(trimmed(definition.id));
    }
  }
  if (doomed.size === 0) return { affectedIds: [], prunes: [] };

  const prunes = [];
  for (const definition of defs) {
    const current = toArray(definition.recipeIds);
    const next = current.filter((id) => !doomed.has(trimmed(id)));
    if (next.length === current.length) continue;
    prunes.push({ id: trimmed(definition.id), definition, recipeIds: next });
  }

  return { affectedIds: [...affected], prunes };
}

/** The `recipeId -> Set(actorId)` learned-knowledge index, over the actors this client may write. */
export function buildLearnedRecipeActorIndex(actors) {
  const index = new Map();
  const raw = Array.isArray(actors?.contents) ? actors.contents : actors;
  const iterable =
    Array.isArray(raw) || typeof raw?.[Symbol.iterator] === 'function' ? [...raw] : [];

  for (const actor of selectWritableActors(iterable)) {
    const learned = getFabricateFlag(actor, 'learnedRecipes', null);
    if (!learned || typeof learned !== 'object') continue;
    const actorId = trimmed(actor.id || actor._id);
    for (const recipeId of readLearnedRecipeEntries(learned).keys()) {
      if (!index.has(recipeId)) index.set(recipeId, new Set());
      index.get(recipeId).add(actorId);
    }
  }
  return index;
}

/** The DISTINCT actors who will lose at least one of these recipes. */
export function selectLearnerActorIds(learnerIndex, recipeIds) {
  if (!(learnerIndex instanceof Map)) return [];
  const union = new Set();
  for (const recipeId of recipeIds || []) {
    for (const actorId of learnerIndex.get(trimmed(recipeId)) || []) union.add(actorId);
  }
  return [...union];
}

/** What a delete would do: the impact the bulk panel states before the arm, and the dialog's own. */
export function describeRecipeDeleteImpact(recipeIds, context = {}) {
  const requested = new Set([...(recipeIds || [])].map((id) => trimmed(id)).filter(Boolean));
  if (requested.size === 0)
    return { ...ZERO_IMPACT, deletableIds: [], recipeItemIds: [], learnerIds: [] };

  const { recipes, recipeItemDefinitions, membershipResolvesByRecipeIds, learnerIndex } =
    context || {};
  const deletable = toArray(recipes).filter((recipe) => requested.has(trimmed(recipe?.id)));
  if (deletable.length === 0)
    return { ...ZERO_IMPACT, deletableIds: [], recipeItemIds: [], learnerIds: [] };

  const deletableIds = deletable.map((recipe) => trimmed(recipe.id));
  const { affectedIds } = planRecipeItemMembershipPrune(
    recipeItemDefinitions,
    deletable,
    membershipResolvesByRecipeIds === true
  );
  const learnerIds = selectLearnerActorIds(learnerIndex, deletableIds);

  return {
    deletable: deletableIds.length,
    deletableIds,
    recipeItemsAffected: affectedIds.length,
    recipeItemIds: affectedIds,
    learnersAffected: learnerIds.length,
    learnerIds,
  };
}
