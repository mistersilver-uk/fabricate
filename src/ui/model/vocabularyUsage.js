/** Reference counting for the Tags & Categories screen (issue 689). */

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
  // Multi-step recipes carry their ingredient sets per step rather than at the top level, so a tag
  // placeholder on a step still counts.
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

/** Increment `tagUsage` once per tag named by every tag-placeholder ingredient in a recipe. */
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
 * Roll {@link countRecipeTagPlaceholders} up over a whole recipe cohort into a plain record, so the
 * count can be computed ONCE where the recipes are cheap to walk and read everywhere else as data
 * (issue 1081).
 */
export function countRecipeTagPlaceholderUsage(recipes) {
  const tagUsage = new Map();
  for (const recipe of recipes || []) countRecipeTagPlaceholders(recipe, tagUsage);
  return Object.fromEntries(tagUsage);
}

/** Build the usage maps and roll-up totals for all three vocabularies. */
export function buildVocabularyUsage(recipes, components, options = {}) {
  const categoryUsage = new Map();
  const componentCategoryUsage = new Map();
  const tagUsage = new Map();
  const precountedRecipeTags = options?.recipeTagPlaceholderCounts ?? null;
  const hasPrecountedRecipeTags = precountedRecipeTags !== null;

  if (hasPrecountedRecipeTags) {
    for (const [tag, count] of Object.entries(precountedRecipeTags)) {
      const key = vocabularyKey(tag);
      if (key) tagUsage.set(key, (tagUsage.get(key) || 0) + (Number(count) || 0));
    }
  }

  for (const recipe of recipes || []) {
    increment(categoryUsage, vocabularyKey(recipe?.category));
    if (!hasPrecountedRecipeTags) countRecipeTagPlaceholders(recipe, tagUsage);
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
