// Crafting thumbnail fallbacks, in a standalone leaf so the Svelte tree does not import the
// `models/Recipe.js` graph for one path string. `DEFAULT_CRAFTING_IMAGE` mirrors
// `DEFAULT_RECIPE_IMAGE`; `tests/crafting-image-defaults.test.js` fails if the two drift.
export const DEFAULT_CRAFTING_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

export const GENERIC_ITEM_IMAGE = 'icons/svg/item-bag.svg';

export const DEFAULT_MATERIAL_GLYPH = 'fas fa-cube';

export function resolveRecipeImage(recipe) {
  const img = typeof recipe?.img === 'string' ? recipe.img.trim() : '';
  return !img || img === GENERIC_ITEM_IMAGE ? DEFAULT_CRAFTING_IMAGE : img;
}
