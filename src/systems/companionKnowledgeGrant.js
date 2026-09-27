/**
 * `game.fabricate.grantRecipeKnowledge`: the companion GM knowledge grant (issue 1289), an
 * unbounded write with no owned book, copy or learn budget.
 * A free function, not a `RecipeVisibilityService` method: that live service is handed out
 * ungated, so any player could grant themselves recipes. It reaches no `_` member of it.
 * The facade gates GM, actor and readiness first; this owns recipe, system, observability,
 * `grantedBy` and already-known, in that order. Book membership, owned copy, Required Knowledge
 * and the per-book character gate are deliberately not enforced (a GM override).
 * Never throws: a `stable` member answers a result, including `grantFailed`.
 * `grantRecipeKnowledgeEntry` is the effect-path primitive (issue 1954); it carries no marker.
 */

import { FABRICATE_FLAG_NAMESPACE, LEARNED_RECIPES_FLAG_KEY } from '../config/flags.js';
import { getByPath } from '../utils/objectPath.js';

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

/** Where the learned map lives in a document's `_source`. */
const LEARNED_SOURCE_PATH = `flags.${FABRICATE_FLAG_NAMESPACE}.fabricate.${LEARNED_RECIPES_FLAG_KEY}`;

/** Idempotency by entry, never `learnedMap[id]`: a dotted id is dot-expanded (issue 1143). */
function knownIn(learnedMap, recipeId) {
  return readLearnedRecipeEntries(learnedMap).has(String(recipeId));
}

/** Whether `actor` already knows `recipeId`, through the flag seam. */
export function isRecipeKnown(actor, recipeId, readFlag) {
  return knownIn(readLearnedMap(actor, readFlag), recipeId);
}

function sourceLearnedEntry(document, recipeId) {
  const learned = getByPath(document?._source, LEARNED_SOURCE_PATH);
  if (!learned || typeof learned !== 'object') return null;
  return readLearnedRecipeEntries(learned).get(String(recipeId)) ?? null;
}

/** The granted entry; `granted` is only ever `true` (absent means not granted). */
function grantedEntry(grantedBy) {
  return { learnedAt: Date.now(), sourceItemUuid: null, granted: true, grantedBy };
}

function documentLabel(document) {
  return document?.name || document?.id || '';
}

/**
 * Grant a recipe's knowledge to one actor. Writes `{ learnedAt, sourceItemUuid: null, granted:
 * true, grantedBy }` over the raw map as `learnRecipeOnCraft` does; `granted` is only ever
 * `true` (absent means not granted) and is the display discriminant, so a label-less grant is
 * never shown as learned by crafting. It is unrelated to `evaluateKnowledgeAccess`'s `granted`.
 * An already-known recipe writes nothing and answers success with `alreadyKnown`.
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
  if (knownIn(learnedMap, recipe.id)) {
    return knowledgeGrantResult(COMPANION_OUTCOMES.alreadyKnown, messageData);
  }

  const next = { ...learnedMap, [recipe.id]: grantedEntry(label.value) };

  try {
    await writeFlag(actor, LEARNED_RECIPES_FLAG_KEY, next);
  } catch {
    // `setFabricateFlag` rejects on a refused update; a `stable` member may not rethrow.
    return knowledgeGrantResult(COMPANION_OUTCOMES.grantFailed);
  }

  return knowledgeGrantResult(COMPANION_OUTCOMES.granted, messageData);
}

const settled = (status, intent, receipt, failure) => ({ status, intent, receipt, failure });

/**
 * Grant one validated recipe on the effect path (issue 1954), answering `{ status, intent,
 * receipt, failure }`. Already known is `applied` with no write and a null intent; otherwise
 * `applied` only when the learned entry is in the returned `_source`. `null` or `undefined` wrote
 * nothing; a learned-map read that throws is `knownFailure`, a write throw or a missing entry is
 * `uncertain`; `beforeWrite(intent)` gates the write as in `placeComponentAward` (`notAttempted`
 * unless it answers `true`; its throw propagates).
 */
export async function grantRecipeKnowledgeEntry(
  { actor, recipeId, grantedBy = null, beforeWrite = null },
  { readFlag, writeFlag }
) {
  const id = String(recipeId);
  let learnedMap;
  try {
    learnedMap = readLearnedMap(actor, readFlag);
  } catch (error) {
    const detail = error?.message ?? String(error);
    return settled('knownFailure', null, null, { reason: 'preflightThrew', detail });
  }
  if (knownIn(learnedMap, id)) return settled('applied', null, { result: 'alreadyKnown' }, null);

  const intent = { recipeId: id, grantedBy };
  if (beforeWrite && (await beforeWrite(intent)) !== true) {
    return settled('notAttempted', intent, null, null);
  }
  let written;
  try {
    written = await writeFlag(actor, LEARNED_RECIPES_FLAG_KEY, {
      ...learnedMap,
      [id]: grantedEntry(grantedBy),
    });
  } catch (error) {
    return settled('uncertain', intent, null, {
      reason: 'writeThrew',
      detail: error?.message ?? String(error),
    });
  }
  if (written == null) {
    return settled('knownFailure', intent, null, { reason: 'writeRefused', detail: null });
  }
  if (!sourceLearnedEntry(written, id)) {
    return settled('uncertain', intent, null, { reason: 'receiptMismatch', detail: null });
  }
  return settled('applied', intent, { result: 'granted' }, null);
}

/**
 * Recovery probe: `applied` only when the actor's `_source` entry carries `granted: true` and the
 * intended `grantedBy`, else `uncertain`. A learned map is its own key, so a GM's later matching
 * grant also reads as applied.
 */
export function probeRecipeKnowledgeGrant(actor, { recipeId, grantedBy = null }) {
  const entry = sourceLearnedEntry(actor, recipeId);
  const applied = entry?.granted === true && entry.grantedBy === grantedBy;
  return applied
    ? { status: 'applied', receipt: { result: 'granted' } }
    : { status: 'uncertain', receipt: null };
}
