/**
 * What deleting a set of recipes reaches — and the leaves that BOTH the statement and the
 * write count through (issue 1132).
 *
 * **The contract here is structural, not asserted.** `CraftingSystemManager.deleteRecipes`
 * and `adminStore.describeRecipeDelete` both execute through
 * {@link planRecipeItemMembershipPrune} and {@link buildLearnedRecipeActorIndex}, so the
 * panel cannot promise "2 books & scrolls will lose them" before an operation that reaches
 * a different set. A describer whose only consumer is the store would, by construction,
 * make those numbers a parallel MODEL of the write, defended by one cross-check fixture;
 * this file exists so that drift is unrepresentable instead.
 *
 * **Two recipe-item numbers, not one, and they legitimately differ.**
 *
 *   - `affectedIds` — the recipe items that will no longer CONTAIN these recipes. It is
 *     basis-aware and true in both bases, and it is the figure the GM is shown.
 *   - `prunes` — the definitions whose `recipeIds[]` array the write actually rewrites.
 *
 * Under the legacy basis (`system.membershipResolvesByRecipeIds` unset) membership is
 * stored on the RECIPE and dies with it: nothing dangles, nothing is rewritten, and the
 * sentence is still true. `prunes` is empty there as a THEOREM of `_normalizeSystem`'s
 * marker inference — a system whose marker is unset is by construction one where every
 * `recipeIds` array is empty — and NOT because anything below branches on the basis to
 * skip work. Do not add such a branch and call it basis awareness.
 *
 * **This module is a leaf on purpose.** It is imported by a store the mounted Svelte
 * suites pull in, so its own imports are held to `config/flags.js`,
 * `systems/writableActors.js` (zero imports) and `systems/recipeKeyedFlagEntries.js`
 * (whose sole import is `config/flags.js`, already here); anything heavier would land in
 * every mounted component's dependency closure. It reads no Foundry global and mutates
 * nothing it is handed — the caller applies the plan.
 */
import { getFabricateFlag } from '../config/flags.js';
import { readLearnedRecipeEntries } from '../systems/recipeKeyedFlagEntries.js';
import { selectWritableActors } from '../systems/writableActors.js';

const ZERO_IMPACT = Object.freeze({
  deletable: 0,
  deletableIds: [],
  recipeItemsAffected: 0,
  recipeItemIds: [],
  learnersAffected: 0,
  learnerIds: [],
});

function trimmed(value) {
  return String(value ?? '').trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Which recipe item definitions CONTAIN a recipe, under the supplied membership basis.
 *
 * The basis is a PARAMETER rather than an inference (issue 1011): the "any definition has
 * a non-empty `recipeIds`" predicate this replaced flipped in both directions, so the
 * caller threads the system's own marker down.
 *
 * ── THE MEMBERSHIP RULE IS MAINTAINED IN FOUR PLACES, AND THIS IS ONE OF THEM ─────
 * Do not read "mirrors X exactly" below as a statement about two functions. As of issue
 * 1132 the same rule is implemented at four sites, and they are ALREADY unmirrored:
 *
 *   1. this function;
 *   2. `CraftingSystemManager.getRecipeItemDefinitionsContaining`;
 *   3. `CraftingSystemManager._resolveLegacyMembershipDefinition`;
 *   4. `adminRecipeRowProjection._recipeItemDefinitionsContaining` — which has NO
 *      `linkedRecipeItemUuid` → `originItemUuid` leg, while the other three do.
 *
 * Any change to what "this recipe item contains this recipe" means is a change to all four.
 * Routing 2 and 4 through this leaf is the right end state and is a real refactor with its
 * own regression surface, so it is deliberately NOT attempted here; it is recorded as the
 * maintenance obligation it is rather than discovered from a defect later.
 *
 * The legacy leg mirrors `CraftingSystemManager._resolveLegacyMembershipDefinition`
 * exactly, including its deliberate refusal to fall through: a PRESENT `recipeItemId`
 * resolves by definition id and the `linkedRecipeItemUuid` branch is not consulted even
 * when that id names nothing, because falling through on a dangling id would state a
 * membership the legacy basis never resolved.
 *
 * @param {object[]} definitions A system's `recipeItemDefinitions`.
 * @param {object} recipe A recipe object (or its JSON).
 * @param {boolean} membershipResolvesByRecipeIds The system's basis marker.
 * @returns {object[]} The containing definitions; never null.
 */
function definitionsContaining(definitions, recipe, membershipResolvesByRecipeIds) {
  const recipeId = trimmed(recipe?.id);
  if (!recipeId) return [];

  const byMembership = definitions.filter((definition) =>
    toArray(definition?.recipeIds).some((id) => trimmed(id) === recipeId)
  );
  if (byMembership.length > 0) return byMembership;
  if (membershipResolvesByRecipeIds === true) return [];

  const recipeItemId = trimmed(recipe?.recipeItemId);
  if (recipeItemId) {
    const byId = definitions.find((definition) => trimmed(definition?.id) === recipeItemId);
    return byId ? [byId] : [];
  }

  const legacyUuid = trimmed(recipe?.linkedRecipeItemUuid);
  if (!legacyUuid) return [];
  const bySource = definitions.find(
    (definition) => trimmed(definition?.originItemUuid) === legacyUuid
  );
  return bySource ? [bySource] : [];
}

/**
 * Plan the recipe-item membership prune for a set of recipes about to be deleted.
 *
 * PURE: it neither mutates the definitions it is handed nor persists anything. The caller
 * applies `prunes` — `CraftingSystemManager.deleteRecipes` writes each `recipeIds` array
 * through its own `_normalizeMembershipRecipeIds`, because the six membership readers all
 * match by exact string equality and a differently-shaped array silently stops matching.
 *
 * @param {object[]} definitions A system's `recipeItemDefinitions`.
 * @param {object[]} recipes The recipes being deleted, already resolved.
 * @param {boolean} membershipResolvesByRecipeIds The system's basis marker. Neither read
 *   anywhere else here nor written anywhere at all: the prune must not flip a legacy
 *   system's basis as a side effect of a delete the GM authored for another reason.
 * @returns {{affectedIds: string[],
 *   prunes: Array<{id: string, definition: object, recipeIds: string[]}>}}
 *   `affectedIds` are the DISTINCT recipe items that will no longer contain these recipes
 *   — the stated figure. `prunes` are the definitions to rewrite, each with the next
 *   (un-normalized) array; its length is the performed figure.
 */
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
    for (const definition of definitionsContaining(defs, recipe, membershipResolvesByRecipeIds)) {
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

/**
 * Build the `recipeId -> Set(actorId)` learned-knowledge index for the actors THIS client
 * may write (issue 970).
 *
 * **The scope is load-bearing and is the cascade's own.** `cleanupLearnedRecipes` walks
 * `selectWritableActors(game.actors)`, so a count built over an unfiltered `game.actors`
 * would promise the GM a number the write cannot reach. Both sides import the one symbol
 * rather than restating the predicate — the pin is defensive insurance against someone
 * later narrowing the cascade, since `isOwner` is unconditionally true for a GM and the
 * two sets are identical in any real GM session.
 *
 * The learned map MUST be read through `getFabricateFlag` (issue 785): every writer
 * persists it at the doubly-nested `flags.fabricate.fabricate.learnedRecipes` path, so a
 * hand-written single-nested read resolves to `undefined` in a real world.
 *
 * The ids come from the shared ENTRY-BOUNDARY reader and never from `Object.keys` (issue
 * 1143), for the same reason `cleanupLearnedRecipes` does: `Document#update` nests a
 * dotted recipe id into a subtree, so the top level of the persisted map yields the id's
 * FIRST SEGMENT. A count derived from the top level would under-report a learner the
 * cascade — reading through this same function — then goes on to clear. This is the one
 * derivation, so the number stated and the number reached cannot disagree.
 *
 * @param {Iterable<object>|{contents?: object[]}|null|undefined} actors Typically `game.actors`.
 * @returns {Map<string, Set<string>>} Never null; empty in a headless context.
 */
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

/**
 * The DISTINCT actors who will lose at least one of these recipes.
 *
 * A character who learned three of the selected recipes is one character, so this is a
 * union over the selection and never a sum of per-recipe counts.
 *
 * @param {Map<string, Set<string>>|null|undefined} learnerIndex From
 *   {@link buildLearnedRecipeActorIndex}.
 * @param {Iterable<string>} recipeIds
 * @returns {string[]} Actor ids; never null.
 */
export function selectLearnerActorIds(learnerIndex, recipeIds) {
  if (!(learnerIndex instanceof Map)) return [];
  const union = new Set();
  for (const recipeId of recipeIds || []) {
    for (const actorId of learnerIndex.get(trimmed(recipeId)) || []) union.add(actorId);
  }
  return [...union];
}

/**
 * What a delete of the selected recipes would actually do — the impact statement the bulk
 * panel renders BEFORE the GM arms the control, and the same arithmetic the singular
 * confirmation dialog reports.
 *
 * Three numbers, three genuinely different questions, none derived from another:
 *
 *   1. `deletable` — the ids that RESOLVE in the recipe map, not the selection size.
 *      `RecipeManager.deleteRecipe` throws for an id that no longer resolves, and the
 *      browser prunes phantom ids only when the projection republishes — a different
 *      moment from the click — so a stale selection must not inflate the stated count.
 *      A locked recipe still counts: `locked` is a craft gate, not a delete gate.
 *   2. `recipeItemsAffected` — a DISTINCT union of recipe items (two selected recipes in
 *      one book is one book), basis-aware, and therefore possibly larger than the number
 *      of definitions the write rewrites. See the module docblock.
 *   3. `learnersAffected` — a DISTINCT union of the writable actors who lose the knowledge.
 *
 * Deletion is WARNED, never BLOCKED, so there is no blocked partition to report.
 *
 * Returns the zero impact rather than throwing for an absent or stale system: this runs on
 * a render path, on every selection change.
 *
 * @param {Iterable<string>} recipeIds The SELECTED recipe ids.
 * @param {object} [context]
 * @param {object[]} [context.recipes] This system's recipes, as `Recipe` instances or JSON.
 * @param {object[]} [context.recipeItemDefinitions] This system's `recipeItemDefinitions`.
 * @param {boolean} [context.membershipResolvesByRecipeIds] The system's basis marker.
 * @param {Map<string, Set<string>>} [context.learnerIndex] From
 *   {@link buildLearnedRecipeActorIndex}, built ONCE per refresh and cached by the caller —
 *   this function performs no actor iteration of its own.
 * @returns {{deletable: number, deletableIds: string[], recipeItemsAffected: number,
 *   recipeItemIds: string[], learnersAffected: number, learnerIds: string[]}}
 */
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
