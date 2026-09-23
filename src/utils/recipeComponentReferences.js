/**
 * The component half of the recipe-reference vocabulary (issue 1129): does a recipe name this
 * component, what does it look like once the component is gone, and is what remains craftable. The
 * bulk-delete impact statement COUNTS through the same functions the delete EXECUTES through, so
 * its promised numbers are exact by construction. Detection and rewrite both walk `steps[]`, because
 * `getExecutionSteps()` ignores the recipe-level copies a converted recipe still holds. A pure leaf
 * accepting either a `Recipe` or an already-plain recipe object.
 */

import { getIngredientComponentId } from '../models/match/matchTypes.js';

/** Whether a recipe references the given component as an ingredient or a result. */
export function recipeReferencesComponent(recipe, componentId) {
  const data = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  const matchesId = (ref) => getIngredientComponentId(ref) === componentId;

  // Recipe-level AND step-level, flattened together — a converted multi-step recipe carries both
  // copies and only the step copy is executable.
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
 * Whether a recipe references ANY component in the set — the selection-wide form of the predicate
 * above, so a set delete walks each recipe once instead of once per component.
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

/** Strip every component in the set from one recipe, in ONE pass. */
export function stripComponentsFromRecipeJson(recipe, componentIds) {
  const ids = componentIds instanceof Set ? componentIds : new Set(componentIds || []);
  const source = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  const json = { ...source };
  if (ids.size === 0) return { json, changed: false };

  const isDeletedOption = (ref) => ids.has(getIngredientComponentId(ref));
  // The legacy flat rows carry a bare id pair rather than a match, and the shipped strip read them
  // directly.
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
    // A set AUTHORED with groups needs no mirror: `IngredientSet` derives `ingredients` from its
    // groups on read, so re-emitting it here would only restore the retired alias.
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

  // Only a group THIS strip emptied is residue. A group that ARRIVED empty is authored data —
  // the reserved `role: 'failure'` group, and a non-terminal step's deliberately empty group
  // (issue 1907) — so pruning it would turn a valid recipe into one missing a step's result group.
  const stripResultGroups = (groups) =>
    (groups || []).flatMap((group) => {
      const authored = (group?.results || []).length;
      const results = (group?.results || []).filter((res) => !isDeletedLegacy(res));
      if (authored > 0 && results.length === 0) return [];
      return [{ ...group, results }];
    });

  json.ingredientSets = stripSets(source?.ingredientSets);
  json.resultGroups = stripResultGroups(source?.resultGroups);
  // The flat top-level `results` alias is NOT re-emitted (issue 1087).

  // The STEP copies, rewritten by the same two helpers.
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
 * What a delete of the selected components would actually do — the impact statement the bulk panel
 * renders BEFORE the GM arms the control.
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
