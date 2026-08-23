/**
 * `game.fabricate.grantRecipeKnowledge` — the companion contract's GM knowledge grant
 * (issue 1289).
 *
 * A downtime activity's reward is "you learned this by doing the work": no book is involved,
 * no copy is consumed, and no learn budget is spent. Every write path Fabricate already has
 * onto `learnedRecipes` is anchored on a real owned recipe item — a matched copy, a learn
 * budget, a prerequisite, or craft-time auto-learn. This one is UNBOUNDED by design, and
 * that is exactly why it lives here.
 *
 * ## Why a free function, and not a method on `RecipeVisibilityService`
 *
 * `game.fabricate.getRecipeVisibilityService()` hands back the LIVE service through a
 * published accessor with NO GATE OF ANY KIND, and a companion already calls it. An
 * unbounded write placed on that object would make `grantRecipeKnowledge({ recipe, actor:
 * myOwnCharacter })` a fully authorised, self-benefiting write any PLAYER could make from
 * the console. `resetActorKnowledge` is self-harm; a grant is self-benefit, and the
 * asymmetry is the whole point. The rejected alternative — an explicit `authorized: true`
 * argument the facade supplies — is security by convention: a player passes the same
 * argument. So nothing writable is added to the handed-out service, and this module reaches
 * no `_`-prefixed member of it; it takes the four seams below instead.
 *
 * ## The gate order, and the three gates that are NOT here
 *
 * The facade owns the first three preconditions — caller is a GM, the actor resolves and the
 * caller may act as it, and the module is ready — in that order, because the readiness check
 * throws and must therefore run AFTER the never-throwing refusals rather than before them.
 * This function owns the remaining five, in the order they appear below: the recipe
 * resolves, its system resolves, a learned entry on that system is OBSERVABLE, `grantedBy`
 * normalizes, and the recipe is not already known.
 *
 * Four gates the book learn paths enforce are deliberately NOT enforced: book membership, a
 * matched non-exhausted owned copy, Required Knowledge, and the per-book character gate.
 * The first two are the "no owned book required" relaxation this member exists for; the
 * latter two are inert for a recipe with no member book, and where they do bite the skip is
 * the intended GM override — those gates exist for a reader EARNING knowledge from a book,
 * and a GM who wants them can decline to grant.
 *
 * ## Never throws
 *
 * A `stable` contract member is called inside a GM's automation tick, after other side
 * effects have committed, where a throw aborts work mid-flight and surfaces as an unhandled
 * rejection nothing attributes to a caller. Every path here answers a result, including a
 * write the persistence layer rejects (`grantFailed`).
 */

import { LEARNED_RECIPES_FLAG_KEY } from '../config/flags.js';

import {
  COMPANION_OUTCOMES,
  GRANTED_BY_MAX_LENGTH,
  knowledgeGrantResult,
  normalizeGrantedBy,
} from './companionContract.js';
import { readLearnedRecipeEntries } from './recipeKeyedFlagEntries.js';

/**
 * The learned map exactly as `RecipeVisibilityService._getLearnedMap` reads it, through the
 * injected flag seam and the shared key rather than that private member.
 */
function readLearnedMap(actor, readFlag) {
  const learned = readFlag(actor, LEARNED_RECIPES_FLAG_KEY, {});
  return learned && typeof learned === 'object' ? learned : {};
}

function documentLabel(document) {
  return document?.name || document?.id || '';
}

/**
 * Grant a recipe's knowledge to one actor, with no owned book required.
 *
 * ### The write
 *
 * `{ learnedAt, sourceItemUuid: null, granted: true, grantedBy }` — four scalars, spread over
 * the RAW persisted map exactly as `learnRecipeOnCraft` spreads it, so this introduces no
 * second write shape. `granted` is written `true` and NEVER `false`: absence means not
 * granted, so no migration touches the existing corpus. It is the display discriminant, and
 * it exists as a field of its own because "was this granted?" and "what did the caller want
 * recorded about why?" are two questions — keying the display on the presence of a LABEL
 * would leave a label-less grant (the likely common case: a macro with nothing meaningful to
 * say) indistinguishable from a craft-time auto-learn entry, and rendering as "Learned by
 * crafting" is precisely the false provenance this member exists to remove.
 *
 * ### Idempotency
 *
 * Decided through {@link readLearnedRecipeEntries}, NEVER a bare `learnedMap[recipe.id]`
 * index. `Document#update` dot-expands a recipe id containing a `.` into a subtree, so a
 * bare index misses it and a legacy dotted id would be re-granted — and re-written — on
 * every call (issue 1143). An already-known recipe performs NO WRITE and answers
 * `success: true` with `alreadyKnown`, because the caller is an automation tick that may
 * legitimately re-run and `success: false` would make a correct re-run read as a failure;
 * the caller distinguishes GRANTED NOW from ALREADY KNEW by the outcome, never by the
 * boolean.
 *
 * @param {object} request
 * @param {object} request.actor the RESOLVED actor — the facade's ownership gate ran already
 * @param {string} request.recipeId the recipe to grant, by id (never a uuid)
 * @param {*} [request.grantedBy] an optional caller-supplied provenance label; refused,
 *   never coerced or truncated (see `normalizeGrantedBy`)
 * @param {object} seams the four injected seams, supplied by the facade
 * @param {(recipeId: string) => object|null} seams.resolveRecipe
 * @param {(recipe: object) => object|null} seams.resolveSystem
 * @param {(system: object) => boolean} seams.isObservable
 *   `RecipeVisibilityService.isLearnedKnowledgeObservable`
 * @param {(actor: object, key: string, fallback: *) => *} seams.readFlag
 * @param {(actor: object, key: string, value: *) => Promise<*>} seams.writeFlag
 * @returns {Promise<Readonly<{success: boolean, outcome: string, message: string,
 *   messageData?: object}>>}
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
    // The modes are reported AS AUTHORED on the system — the words a GM recognises from the
    // system editor — rather than as the predicate's internally resolved enum, which is that
    // method's own business and is deliberately not re-derived here.
    return knowledgeGrantResult(COMPANION_OUTCOMES.knowledgeNotObservable, {
      ...messageData,
      visibilityMode: system?.visibilityMode ?? null,
      resolutionMode: system?.resolutionMode ?? null,
    });
  }

  const label = normalizeGrantedBy(grantedBy);
  if (!label.ok) {
    // The too-long refusal interpolates the limit rather than restating the number, so the
    // string and the validator cannot drift apart.
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
    // `setFabricateFlag` REJECTS when Foundry refuses the update, so that a caller is never
    // told a flag persisted when it did not. A `stable` member may not rethrow it.
    return knowledgeGrantResult(COMPANION_OUTCOMES.grantFailed);
  }

  return knowledgeGrantResult(COMPANION_OUTCOMES.granted, messageData);
}
