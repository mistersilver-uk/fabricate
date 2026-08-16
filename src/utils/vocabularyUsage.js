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
 * Roll {@link countRecipeTagPlaceholders} up over a whole recipe cohort into a plain
 * record, so the count can be computed ONCE where the recipes are cheap to walk and read
 * everywhere else as data (issue 1081).
 *
 * `ingredientSets` and `steps` are DETAIL-tier fields on a projected browser row
 * (`adminRecipeRowProjection.js`), and every detail field shares one memoized producer whose
 * first read deep-clones the whole recipe body. So walking projected rows for their tag
 * placeholders — which the manager's persistent nav rail did on every render, in every view
 * — materialised the detail tier for the entire library before first paint. The recipe
 * MODELS carry `ingredientSets` / `steps` as ordinary fields and cost nothing to walk, which
 * is why the producer of this record is the row projection rather than its consumer.
 *
 * The walk is the same one `countRecipeTagPlaceholders` performs, over the same field names:
 * `Recipe#toJSON` emits `match` verbatim off the `Ingredient` model, and an `IngredientSet`
 * instance exposes `ingredientGroups[].options[].match` under exactly the names the
 * serialized shape uses. `tests/admin-browser-page-scope-guards.test.js` pins that
 * equivalence against a multi-step recipe and a legacy bare-`ingredients[]` set, because a
 * silent divergence here would change tag counts rather than fail.
 *
 * A plain object rather than a `Map`: this crosses the store's `viewState` publish, where
 * every other field is plain, JSON-shaped data.
 *
 * @param {Array<object>} recipes recipe models or plain recipe projections.
 * @returns {Record<string, number>} lowercased tag name to reference count.
 */
export function countRecipeTagPlaceholderUsage(recipes) {
  const tagUsage = new Map();
  for (const recipe of recipes || []) countRecipeTagPlaceholders(recipe, tagUsage);
  return Object.fromEntries(tagUsage);
}

/**
 * Build the usage maps and roll-up totals for all three vocabularies.
 *
 * `recipeTagPlaceholderCounts` is the recipe half of the tag count, already rolled up by
 * {@link countRecipeTagPlaceholderUsage} somewhere the recipes are cheap to walk. Supply it
 * and the per-recipe placeholder walk is skipped entirely; omit it — or pass `undefined` /
 * `null` — and the walk runs here as it always did. The two produce the same counts — this
 * is a choice of WHERE the walk happens, not of what is counted — and only the recipe
 * CATEGORY count is read off the recipes either way, which is a summary-tier field on a
 * projected browser row.
 *
 * The absent test is `== null`, NOT truthiness (issue 1081). An EMPTY record is a legitimate
 * pre-count — it is the right answer for a system with no tag placeholders at all — so `{}`
 * has to be authoritative. But `{}` is also truthy, so a caller that defensively passed
 * `counts || {}` made this fallback unreachable and turned "the counts have not been
 * published" into "there are none", which reads as a tag with no references and offers it
 * for one-click deletion.
 *
 * @param {Array<object>} recipes plain recipe projections.
 * @param {Array<{category?: string, tags?: string[]}>} components plain component projections.
 * @param {{recipeTagPlaceholderCounts?: Record<string, number>}} [options]
 * @returns {{
 *   categoryUsage: Map<string, number>,
 *   componentCategoryUsage: Map<string, number>,
 *   tagUsage: Map<string, number>,
 *   categoryReferenceCount: number,
 *   componentCategoryReferenceCount: number,
 *   tagReferenceCount: number
 * }}
 */
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
