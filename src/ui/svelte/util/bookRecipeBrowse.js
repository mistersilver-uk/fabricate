/**
 * The arithmetic behind a recipe book's recipe list — page sizes, search match, paging, and whether
 * its whole contents are learnable at once — so `InventoryBookDetail.svelte` holds only the state.
 */

/** The page sizes the book inspector offers; the first is also the search threshold. */
export const RECIPE_PAGE_SIZES = Object.freeze([6, 9, 12]);

/** `<Select>` rows for {@link RECIPE_PAGE_SIZES}, whose values stay numbers. */
export const recipePageSizeOptions = () =>
  RECIPE_PAGE_SIZES.map((size) => ({ value: size, label: String(size) }));

const contains = (value, query) =>
  String(value ?? '')
    .toLowerCase()
    .includes(query);

/** The recipes matching a search by name or description; all of them for an empty one. */
export function matchRecipes(recipes, search) {
  const list = Array.isArray(recipes) ? recipes : [];
  const query = String(search ?? '')
    .trim()
    .toLowerCase();
  if (query.length === 0) return list;
  return list.filter(
    (recipe) => contains(recipe?.name, query) || contains(recipe?.description, query)
  );
}

/** The page count for a matched total, never below one, so an empty list still has a page. */
export function countRecipePages(total, pageSize) {
  return Math.max(1, Math.ceil(Number(total) / (pageSize > 0 ? pageSize : 1)));
}

/** The recipes on one page; `page` is clamped into range here rather than by the caller. */
export function recipePageSlice(recipes, page, pageSize, pageCount) {
  const list = Array.isArray(recipes) ? recipes : [];
  const size = pageSize > 0 ? pageSize : list.length || 1;
  const clamped = Math.min(Math.max(0, page), pageCount - 1);
  return list.slice(clamped * size, clamped * size + size);
}

/**
 * The ids a reader could still learn. Gate-blocked recipes are excluded (issue 544) so a
 * "Learn all" never sends one the runtime will refuse, which would halt the batch mid-way.
 */
export function unlearnedRecipeIds(recipes) {
  return (Array.isArray(recipes) ? recipes : [])
    .filter((recipe) => !recipe?.learned && !recipe?.learnBlocked)
    .map((recipe) => recipe.id);
}

/** Whether a book's `caps.learn` admits the whole book, which is what the learn-all CTA offers. */
export function learnCapAdmitsWholeBook(learnCaps, recipeTotal) {
  if (learnCaps?.limitLearning !== true) return true;
  const allowed = learnCaps?.learnsAllowed;
  return Number.isFinite(allowed) && allowed > 0 && allowed >= recipeTotal;
}
