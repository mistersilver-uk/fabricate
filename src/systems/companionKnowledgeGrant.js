/**
 * `game.fabricate.grantRecipeKnowledge`: the companion GM knowledge grant (issue 1289), an
 * unbounded write with no owned book, copy or learn budget.
 * A free function, not a `RecipeVisibilityService` method: that live service is handed out
 * ungated, so any player could grant themselves recipes. It reaches no `_` member of it.
 * The facade gates GM, actor and readiness first; this owns recipe, system, observability,
 * `grantedBy` and already-known, in that order. Book membership, owned copy, Required Knowledge
 * and the per-book character gate are deliberately not enforced (a GM override).
 * Never throws: a `stable` member answers a result, including `grantFailed`.
 */

import { LEARNED_RECIPES_FLAG_KEY } from '../config/flags.js';

import {
  COMPANION_OUTCOMES,
  GRANTED_BY_MAX_LENGTH,
  knowledgeGrantResult,
  normalizeGrantedBy,
} from './companionContract.js';
import { readLearnedRecipeEntries } from './recipeKeyedFlagEntries.js';

/** The learned map as `RecipeVisibilityService._getLearnedMap` reads it, via the flag seam. */
function readLearnedMap(actor, readFlag) {
  const learned = readFlag(actor, LEARNED_RECIPES_FLAG_KEY, {});
  return learned && typeof learned === 'object' ? learned : {};
}

function documentLabel(document) {
  return document?.name || document?.id || '';
}

/**
 * Grant a recipe's knowledge to one actor. Writes `{ learnedAt, sourceItemUuid: null, granted:
 * true, grantedBy }` over the raw map as `learnRecipeOnCraft` does; `granted` is only ever
 * `true` (absent means not granted) and is the display discriminant, so a label-less grant is
 * never shown as learned by crafting. It is unrelated to `evaluateKnowledgeAccess`'s `granted`.
 * Idempotency goes through `readLearnedRecipeEntries`, never `learnedMap[recipe.id]`: a dotted
 * id is dot-expanded (issue 1143). An already-known recipe writes nothing and answers success
 * with `alreadyKnown`.
 * `seams.isObservable` is `RecipeVisibilityService.isLearnedKnowledgeObservable`.
 */
export async function grantRecipeKnowledge(
  { actor, recipeId, grantedBy = null } = {},
  { resolveRecipe, resolveSystem, isObservable, readFlag, writeFlag } = {}
) {
  const recipe = resolveRecipe(recipeId) || null;
  if (!recipe) return knowledgeGrantResult(COMPANION_OUTCOMES.recipeNotFound);

  const messageData = { recipe: documentLabel(recipe), actor: documentLabel(actor) };

  const system = resolveSystem(recipe) || null;
  if (!system) return knowledgeGrantResult(COMPANION_OUTCOMES.systemNotFound, messageData);

  if (isObservable(system) !== true) {
    // Modes are reported as authored on the system, not as the predicate's resolved enum.
    return knowledgeGrantResult(COMPANION_OUTCOMES.knowledgeNotObservable, {
      ...messageData,
      visibilityMode: system?.visibilityMode ?? null,
      resolutionMode: system?.resolutionMode ?? null,
    });
  }

  const label = normalizeGrantedBy(grantedBy);
  if (!label.ok) {
    // Interpolate the limit so the string and the validator cannot drift apart.
    const refusalData =
      label.outcome === COMPANION_OUTCOMES.grantedByTooLong ? { max: GRANTED_BY_MAX_LENGTH } : null;
    return knowledgeGrantResult(label.outcome, refusalData);
  }

  const learnedMap = readLearnedMap(actor, readFlag);
  if (readLearnedRecipeEntries(learnedMap).has(String(recipe.id))) {
    return knowledgeGrantResult(COMPANION_OUTCOMES.alreadyKnown, messageData);
  }

  const next = {
    ...learnedMap,
    [recipe.id]: {
      learnedAt: Date.now(),
      sourceItemUuid: null,
      granted: true,
      grantedBy: label.value,
    },
  };

  try {
    await writeFlag(actor, LEARNED_RECIPES_FLAG_KEY, next);
  } catch {
    // `setFabricateFlag` rejects on a refused update; a `stable` member may not rethrow.
    return knowledgeGrantResult(COMPANION_OUTCOMES.grantFailed);
  }

  return knowledgeGrantResult(COMPANION_OUTCOMES.granted, messageData);
}
