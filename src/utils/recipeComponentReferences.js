/**
 * The component half of the recipe-reference vocabulary: does a recipe name this component,
 * what does the recipe look like once the component is gone, and is what remains still
 * craftable (issue 1129).
 *
 * Extracted from `CraftingSystemManager` — `_recipeReferencesComponent` and the rewrite
 * that was inlined in `deleteItem` — for the reason `recipeEssenceReferences.js` was
 * extracted before it: the admin store needs the identical walk for the component library's
 * recipe-usage projection, and the store deliberately calls no underscore-private manager
 * method.
 *
 * **The rewrite is extracted, not just the predicate, and that is the point.** The bulk
 * delete states its impact BEFORE the GM arms it — how many recipes will be rewritten, and
 * how many of those will be left uncraftable and clamped to disabled. A second
 * implementation of the cascade would let the panel promise "3 recipes rewritten" before an
 * operation that rewrites 4. Here the impact statement COUNTS through the same functions the
 * delete EXECUTES through, so the numbers are exact by construction rather than by
 * agreement.
 *
 * A pure leaf: no Foundry globals, no store reads, no manager state. Accepts either a
 * `Recipe` instance (via `toJSON()`) or an already-plain recipe object, so the manager can
 * hand it a model and the store can hand it a projection.
 *
 * ── WHY THIS WALKS STEPS, WHEN THE SHIPPED `deleteItem` DID NOT ───────────────────
 * The shipped strip read only the recipe-level `ingredientSets` / `resultGroups` / `results`,
 * and so did its inline "no longer craftable" check. Routing the component deletes through
 * the steps-aware shared `recipeLostItsShape` WITHOUT also walking steps here produced a
 * regression, and the pairing is the whole reason it did:
 *
 *   `handleEnterMultiStep` seeds step 1 by COPYING the recipe-level sets and leaves the
 *   recipe-level fields in place, while `Recipe.getExecutionSteps()` returns `steps` and
 *   IGNORES those recipe-level copies. So every recipe converted from single-step by the
 *   shipped editor holds two copies of the same references, and only `steps` is executable.
 *   Strip the recipe-level copy alone and `recipeLostItsShape` sees the surviving step copy,
 *   declares the recipe still craftable, and leaves it ENABLED — holding an ingredient that
 *   no longer exists, offered to players, permanently unsatisfiable. The pre-change inline
 *   check disabled it correctly.
 *
 * So detection and the rewrite both walk `steps[]`, exactly as the essence pipeline already
 * does (`recipeReferencesEssence` flattens step sets; `_stripEssencesFromRecipes` rewrites
 * them). That makes the shape decision sound, and closes the older gap where a multi-step
 * recipe naming a component ONLY inside a step was never detected at all.
 *
 * ── WHAT THIS WALK STILL DOES NOT COVER ───────────────────────────────────────────
 * Result rows are matched for DETECTION through `getIngredientComponentId` but stripped on
 * the bare `componentId || systemItemId` pair, faithfully to the shipped rewrite. A result
 * carrying a structured `match: {type:'component'}` is therefore detected and counted but not
 * removed. Detection and the write still agree — both under-strip — so the stated number
 * never promises less than the write performs; it is merely generous. `Result` (see
 * `src/models/Result.js`) has no `match` field today, so this is latent rather than live.
 */

import { getIngredientComponentId } from '../models/match/matchTypes.js';

/**
 * Whether a recipe references the given component as an ingredient or a result.
 *
 * Lifted unchanged from `CraftingSystemManager._recipeReferencesComponent`. It matches
 * through `getIngredientComponentId` for first-class ingredient OPTIONS and result rows,
 * which is what makes a structured component match and a legacy `systemItemId` alias resolve
 * to the same id.
 *
 * @param {object} recipe a `Recipe` instance or a plain recipe object.
 * @param {string} componentId
 * @returns {boolean}
 */
export function recipeReferencesComponent(recipe, componentId) {
  const data = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  const matchesId = (ref) => getIngredientComponentId(ref) === componentId;

  // Recipe-level AND step-level, flattened together — a converted multi-step recipe carries
  // both copies and only the step copy is executable.
  const sets = [
    ...(data?.ingredientSets || []),
    ...(data?.steps || []).flatMap((step) => step?.ingredientSets || []),
  ];
  const resultGroups = [
    ...(data?.resultGroups || []),
    ...(data?.steps || []).flatMap((step) => step?.resultGroups || []),
  ];

  for (const set of sets) {
    for (const group of set?.ingredientGroups || []) {
      if ((group?.options || []).some(matchesId)) return true;
    }
    if ((set?.ingredients || []).some(matchesId)) return true;
  }
  for (const group of resultGroups) {
    if ((group?.results || []).some(matchesId)) return true;
  }
  return (data?.results || []).some(matchesId);
}

/**
 * Whether a recipe references ANY component in the set — the selection-wide form of the
 * predicate above, so a set delete walks each recipe once instead of once per component.
 *
 * @param {object} recipe
 * @param {Set<string>} componentIds
 * @returns {boolean}
 */
export function recipeReferencesAnyComponent(recipe, componentIds) {
  const ids = componentIds instanceof Set ? componentIds : new Set(componentIds || []);
  if (ids.size === 0) return false;
  const data = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  for (const id of ids) {
    if (recipeReferencesComponent(data, id)) return true;
  }
  return false;
}

/**
 * Whether a rewritten recipe has lost its ingredient sets or its results entirely and must
 * therefore be clamped to disabled.
 *
 * This is `CraftingSystemManager._recipeLostItsShape`, and adopting it here is a deliberate
 * behaviour FIX rather than a lift. That method's own doc says it exists so the single and
 * set deletes "cannot disagree about what 'no longer craftable' means" — but only the two
 * ESSENCE deletes were ever routed through it. `deleteItem` kept an inline check that reads
 * only the recipe-level `resultGroups` / `results` / `ingredientSets`, so a MULTI-STEP recipe
 * whose recipe-level sets were emptied got disabled even though its steps still carried both
 * ingredients and results — over-disabling a recipe that is still perfectly craftable.
 *
 * Routing the component deletes through the shared decision makes the three deletes agree.
 * It also makes the bulk panel's stated "will be disabled" count correct: a count computed
 * one way and executed another is worse than no count at all.
 *
 * @param {object} updated a plain recipe JSON, already rewritten.
 * @returns {boolean}
 */
export function recipeLostItsShape(updated) {
  const hasResults =
    (updated?.resultGroups?.length || 0) > 0 ||
    (updated?.results?.length || 0) > 0 ||
    (updated?.steps || []).some((step) => (step?.resultGroups?.length || 0) > 0);
  const hasIngredientSets =
    (updated?.ingredientSets?.length || 0) > 0 ||
    (updated?.steps || []).some((step) => (step?.ingredientSets?.length || 0) > 0);
  return !hasIngredientSets || !hasResults;
}

/**
 * Strip every component in the set from one recipe, in ONE pass.
 *
 * The set-wise form matters: a recipe naming two deleted components must be rewritten once,
 * not twice, or the "recipes rewritten" number the GM is shown double-counts it and the
 * write issues redundant updates.
 *
 * The rewrite itself is the one `deleteItem` performed inline, preserved step for step:
 *
 *  1. filter deleted ids out of every ingredient group's `options`, then drop a group left
 *     with no options;
 *  2. filter them out of the LEGACY flat `set.ingredients` too — matched on the raw
 *     `componentId || systemItemId` pair, exactly as shipped, because that legacy row shape
 *     is not an ingredient OPTION and does not go through `getIngredientComponentId`;
 *  3. DROP the flat `ingredients` mirror when the set has groups, and keep the filtered
 *     legacy array when it does not (issue 1135). This step used to RECOMPUTE the mirror
 *     from the surviving groups, which re-created the write-retired alias in the patch this
 *     function returns — the INTERMEDIATE object, not the file. It never reached disk either
 *     way: `RecipeManager.updateRecipe` shallow-spreads the patch, rebuilds through
 *     `Recipe.fromJSON`, and persists `updatedRecipe.toJSON()`, which no longer emits the
 *     alias. What dropping it buys is that the patch, the merged object hydrated from it,
 *     and the in-memory map a `persist: false` batch caller mutates all carry ONE ingredient
 *     authority, so no consumer can read a mirror that disagrees with the groups beside it —
 *     the issue-1036 stale-mirror hazard, whose second defect is that `IngredientSet`
 *     rebuilds its groups FROM that mirror whenever `ingredientGroups` is empty. Dropping it
 *     unconditionally is NOT the fix: for a flat-authored set the array is the set's only
 *     ingredient data, and the retention filter's `set.ingredients?.length` leg is what keeps
 *     that set alive;
 *  4. drop a set left with no groups, no ingredients AND no essences — an essence-only set
 *     survives, which is why the essence check is part of the condition rather than an
 *     afterthought;
 *  5. the same filter-then-drop over `resultGroups[].results` and the legacy flat `results`.
 *
 * Returns a NEW json rather than mutating.
 *
 * **`changed` is `recipeReferencesAnyComponent(recipe, ids)`, not a diff of the two JSONs**,
 * and the distinction is worth stating because the two are not the same predicate. Under the
 * result-`match` gap recorded in the header, a recipe can be DETECTED as referencing a deleted
 * component and come back with an identical body, so `changed` answers "was there anything
 * here to strip", not "did the bytes move". It exists so a caller that has NOT already
 * filtered can skip a recipe rather than re-save it; both production callers filter through
 * the same predicate first ({@link CraftingSystemManager#_stripComponentsFromRecipes} and
 * {@link describeComponentDeleteImpact}), so both discard it. Do not treat a `changed: true`
 * as proof the rewrite altered the recipe.
 *
 * @param {object} recipe a `Recipe` instance or a plain recipe object.
 * @param {Set<string>|Iterable<string>} componentIds
 * @returns {{json: object, changed: boolean}} the rewritten json, and whether the recipe
 *   referenced any of `componentIds` before the rewrite.
 */
export function stripComponentsFromRecipeJson(recipe, componentIds) {
  const ids = componentIds instanceof Set ? componentIds : new Set(componentIds || []);
  const source = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  const json = { ...source };
  if (ids.size === 0) return { json, changed: false };

  const isDeletedOption = (ref) => ids.has(getIngredientComponentId(ref));
  // The legacy flat rows carry a bare id pair rather than a match, and the shipped strip
  // read them directly. Keep reading them directly.
  const isDeletedLegacy = (ref) => ids.has(ref?.componentId || ref?.systemItemId);

  // Rewrite ONE set: filter its groups, then resolve the legacy flat alias (see step 3).
  const stripSet = (set) => {
    const ingredientGroups = (set?.ingredientGroups || [])
      .map((group) => ({
        ...group,
        options: (group?.options || []).filter((option) => !isDeletedOption(option)),
      }))
      .filter((group) => (group.options || []).length > 0);
    const next = { ...set, ingredientGroups };
    // A set AUTHORED with groups needs no mirror: `IngredientSet` derives `ingredients`
    // from its groups on read, so re-emitting it here would only restore the retired alias.
    // A set authored FLAT has no groups to derive from, and its own array is the authority.
    const surviving =
      (set?.ingredientGroups?.length || 0) > 0
        ? []
        : (set?.ingredients || []).filter((ing) => !isDeletedLegacy(ing));
    if (surviving.length > 0) next.ingredients = surviving;
    else delete next.ingredients;
    return next;
  };

  const stripSets = (sets) =>
    (sets || [])
      .map(stripSet)
      .filter(
        (set) =>
          (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
          Object.keys(set.essences || {}).length > 0
      );

  const stripResultGroups = (groups) =>
    (groups || [])
      .map((group) => ({
        ...group,
        results: (group?.results || []).filter((res) => !isDeletedLegacy(res)),
      }))
      .filter((group) => (group.results || []).length > 0);

  json.ingredientSets = stripSets(source?.ingredientSets);
  json.resultGroups = stripResultGroups(source?.resultGroups);
  // The flat top-level `results` alias is NOT re-emitted (issue 1087). It was only ever a
  // flatten of `resultGroups` above, so a component stripped from the groups is already gone
  // from any flatten of them — writing the key back would put the retired alias straight into
  // the `updateRecipe` merge payload and undo the retirement one delete at a time. READING it
  // stays permanent, above and in `Recipe._normalizeResultGroups`: a plain legacy object handed
  // to these helpers may still carry it.

  // The STEP copies, rewritten by the same two helpers. `getExecutionSteps()` returns these
  // and ignores the recipe-level fields, so leaving them behind is what would strand a
  // converted recipe enabled-but-uncraftable — see the header.
  if (Array.isArray(source?.steps)) {
    json.steps = source.steps.map((step) => ({
      ...step,
      ingredientSets: stripSets(step?.ingredientSets),
      resultGroups: stripResultGroups(step?.resultGroups),
    }));
  }

  const changed = recipeReferencesAnyComponent(source, ids);
  return { json, changed };
}

/**
 * What a delete of the selected components would actually do — the impact statement the bulk
 * panel renders BEFORE the GM arms the control.
 *
 * **It lives here, not in `componentBulkEditModel.js`, deliberately.** That module is a
 * STATIC import of `ComponentsBrowserView` and `ComponentBulkEditPanel` for its selection
 * helpers, so hosting the describer there dragged this file — and transitively
 * `models/match/matchTypes.js` and `config/flags.js` — into the mounted dependency closure of
 * every component surface, none of which computes an impact. The only consumer is
 * `adminStore.describeComponentDelete`, which already has that chain.
 *
 * Deletion is WARNED, never BLOCKED, exactly as it is for essences: `deleteComponents` strips
 * every selected component from every referencing recipe and deletes all of them, so a
 * component used by twenty recipes deletes exactly like an unused one. Every selected id is
 * therefore deletable and this statement has no blocked partition. Its whole job is to say,
 * in advance, how far the cascade reaches.
 *
 * Three numbers that are genuinely different questions and must not be derived from each
 * other: how many components will be deleted, how many RECIPES will be rewritten, and how
 * many of those rewrites leave a recipe uncraftable and clamp it to disabled. Three
 * components in one recipe is 3 deletions and 1 rewrite; a recipe that loses its last result
 * is 1 rewrite AND 1 disable, counted on both lines because they are different consequences.
 *
 * **`recipesRewritten` is a count of DISTINCT recipes, never a sum of per-component counts.**
 * The operation it describes rewrites each referencing recipe ONCE for the whole selection,
 * so summing would tell the GM "4 recipes" before an operation that rewrites 2.
 *
 * **`recipesDisabled` counts only recipes going from enabled to disabled.** A recipe that was
 * already disabled is not counted: the number exists to warn about craftability the GM is
 * about to lose, not to restate what was already off.
 *
 * **It counts through the same functions the delete executes through** — the three above,
 * which is precisely what `CraftingSystemManager._stripComponentsFromRecipes` runs. A second
 * implementation would let the panel promise one number before an operation that performs
 * another; here the two cannot drift.
 *
 * Pure: it neither mutates the recipes it is handed nor reads any store or Foundry global.
 *
 * @param {Iterable<string>} componentIds the SELECTED component ids, already resolved against
 *   the system by the caller — an id naming no component would inflate `deletable`.
 * @param {object[]} recipes this system's recipes, as `Recipe` instances or plain objects.
 * @returns {{deletable: number, deletableIds: string[], recipesRewritten: number,
 *   recipesDisabled: number}}
 */
export function describeComponentDeleteImpact(componentIds, recipes) {
  const ids = new Set(Array.from(componentIds || [], String).filter(Boolean));
  const rows = Array.isArray(recipes) ? recipes : [];

  let recipesRewritten = 0;
  let recipesDisabled = 0;

  if (ids.size > 0) {
    for (const recipe of rows) {
      if (!recipeReferencesAnyComponent(recipe, ids)) continue;
      recipesRewritten += 1;

      const before = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
      const { json } = stripComponentsFromRecipeJson(recipe, ids);
      if (before?.enabled !== false && recipeLostItsShape(json)) recipesDisabled += 1;
    }
  }

  return {
    deletable: ids.size,
    deletableIds: [...ids],
    recipesRewritten,
    recipesDisabled,
  };
}
