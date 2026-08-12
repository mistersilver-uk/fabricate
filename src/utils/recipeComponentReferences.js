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
 * ── WHAT THIS WALK DELIBERATELY DOES NOT COVER ────────────────────────────────────
 * It does not walk `steps[].ingredientSets`, because the shipped `deleteItem` never did.
 * That is a real gap — a multi-step recipe naming a component only inside a step is neither
 * detected nor rewritten — but it is PRESERVED here rather than fixed, because closing it
 * changes what the delete does to stored recipes and belongs to its own change. Preserving
 * it also keeps the impact statement honest: the panel reports what the cascade actually
 * reaches, not what a wider walk would reach. `recipeLostItsShape` below is the one place
 * this file does look at steps, and the comment there says why.
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

  for (const set of data?.ingredientSets || []) {
    for (const group of set?.ingredientGroups || []) {
      if ((group?.options || []).some(matchesId)) return true;
    }
    if ((set?.ingredients || []).some(matchesId)) return true;
  }
  for (const group of data?.resultGroups || []) {
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
 *  3. recompute the flat `ingredients` mirror from the surviving groups' first options;
 *  4. drop a set left with no groups, no ingredients AND no essences — an essence-only set
 *     survives, which is why the essence check is part of the condition rather than an
 *     afterthought;
 *  5. the same filter-then-drop over `resultGroups[].results` and the legacy flat `results`.
 *
 * Returns a NEW json rather than mutating, and reports whether anything actually changed so
 * the caller can skip an untouched recipe instead of re-saving it.
 *
 * @param {object} recipe a `Recipe` instance or a plain recipe object.
 * @param {Set<string>|Iterable<string>} componentIds
 * @returns {{json: object, changed: boolean}}
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

  json.ingredientSets = (source?.ingredientSets || [])
    .map((set) => ({
      ...set,
      ingredientGroups: (set?.ingredientGroups || [])
        .map((group) => ({
          ...group,
          options: (group?.options || []).filter((option) => !isDeletedOption(option)),
        }))
        .filter((group) => (group.options || []).length > 0),
      ingredients: (set?.ingredients || []).filter((ing) => !isDeletedLegacy(ing)),
    }))
    .map((set) => ({
      ...set,
      ingredients: (set.ingredientGroups || [])
        .map((group) => group.options?.[0] || null)
        .filter(Boolean),
    }))
    .filter(
      (set) =>
        (set.ingredientGroups?.length || set.ingredients?.length || 0) > 0 ||
        Object.keys(set.essences || {}).length > 0
    );

  json.resultGroups = (source?.resultGroups || [])
    .map((group) => ({
      ...group,
      results: (group?.results || []).filter((res) => !isDeletedLegacy(res)),
    }))
    .filter((group) => (group.results || []).length > 0);
  json.results = (source?.results || []).filter((res) => !isDeletedLegacy(res));

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
