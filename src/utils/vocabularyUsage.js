/**
 * Reference counting for the Tags & Categories screen (issue 689).
 *
 * The screen reports how many records reference each vocabulary entry. Recipe and
 * component categories are counted off the records' `category` field; item tags
 * are counted off BOTH the components carrying them AND the recipe
 * tag-placeholder ingredients that match on them (a `match.type === 'tags'`
 * ingredient names the tags it accepts). Omitting the recipe placeholders
 * undercounts a tag that is only ever used as an ingredient filter, which is the
 * bug this counting corrects.
 *
 * Pure module: it walks plain recipe/component projections and returns Maps keyed
 * by the lowercased vocabulary name plus roll-up totals.
 */

function vocabularyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function ingredientSetsFor(recipe) {
  const sets = [];
  if (Array.isArray(recipe?.ingredientSets)) sets.push(...recipe.ingredientSets);
  // Multi-step recipes carry their ingredient sets per step rather than at the top
  // level, so a tag placeholder on a step still counts.
  for (const step of Array.isArray(recipe?.steps) ? recipe.steps : []) {
    if (Array.isArray(step?.ingredientSets)) sets.push(...step.ingredientSets);
  }
  return sets;
}

function matchesOf(ingredientSet) {
  const matches = [];
  const groups = Array.isArray(ingredientSet?.ingredientGroups)
    ? ingredientSet.ingredientGroups
    : [];
  if (groups.length > 0) {
    for (const group of groups) {
      for (const option of Array.isArray(group?.options) ? group.options : []) {
        if (option?.match) matches.push(option.match);
      }
    }
    return matches;
  }
  // Legacy shape: bare `ingredients` list, each with its own `match`.
  for (const ingredient of Array.isArray(ingredientSet?.ingredients)
    ? ingredientSet.ingredients
    : []) {
    if (ingredient?.match) matches.push(ingredient.match);
  }
  return matches;
}

/**
 * Increment `tagUsage` once per tag named by every tag-placeholder ingredient in a
 * recipe. A placeholder that accepts `['herb', 'moon']` counts once for each of
 * `herb` and `moon`.
 *
 * @param {object} recipe a plain recipe projection with `ingredientSets` / `steps`.
 * @param {Map<string, number>} tagUsage the tag-usage accumulator to mutate.
 */
export function countRecipeTagPlaceholders(recipe, tagUsage) {
  for (const ingredientSet of ingredientSetsFor(recipe)) {
    for (const match of matchesOf(ingredientSet)) {
      if (match?.type !== 'tags') continue;
      for (const tag of Array.isArray(match.tags) ? match.tags : []) {
        const key = vocabularyKey(tag);
        if (key) increment(tagUsage, key);
      }
    }
  }
}

/**
 * Build the usage maps and roll-up totals for all three vocabularies.
 *
 * @param {Array<object>} recipes plain recipe projections.
 * @param {Array<{category?: string, tags?: string[]}>} components plain component projections.
 * @returns {{
 *   categoryUsage: Map<string, number>,
 *   componentCategoryUsage: Map<string, number>,
 *   tagUsage: Map<string, number>,
 *   categoryReferenceCount: number,
 *   componentCategoryReferenceCount: number,
 *   tagReferenceCount: number
 * }}
 */
export function buildVocabularyUsage(recipes, components) {
  const categoryUsage = new Map();
  const componentCategoryUsage = new Map();
  const tagUsage = new Map();

  for (const recipe of recipes || []) {
    increment(categoryUsage, vocabularyKey(recipe?.category));
    countRecipeTagPlaceholders(recipe, tagUsage);
  }

  for (const component of components || []) {
    increment(componentCategoryUsage, vocabularyKey(component?.category));
    for (const tag of Array.isArray(component?.tags) ? component.tags : []) {
      const key = vocabularyKey(tag);
      if (key) increment(tagUsage, key);
    }
  }

  return {
    categoryUsage,
    componentCategoryUsage,
    tagUsage,
    categoryReferenceCount: sumValues(categoryUsage),
    componentCategoryReferenceCount: sumValues(componentCategoryUsage),
    tagReferenceCount: sumValues(tagUsage),
  };
}

function sumValues(map) {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}
