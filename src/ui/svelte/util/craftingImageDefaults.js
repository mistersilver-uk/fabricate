/**
 * Default fallback image for the player Crafting tab's thumbnails (recipe rows,
 * detail header, IO/output tiles, shopping list, run summary). Standalone — like
 * {@link module:gatheringImageDefaults} — so the Svelte component tree does not
 * import the full `models/Recipe.js` graph just to resolve one path string.
 *
 * It mirrors `DEFAULT_RECIPE_IMAGE` (`src/models/Recipe.js`); the guard test
 * `tests/crafting-image-defaults.test.js` fails if the two drift apart.
 */
export const DEFAULT_CRAFTING_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

/**
 * Foundry's generic default Item image. Treated as "no image" for a recipe so a
 * recipe that never had a real icon falls back to the blueprint rather than showing
 * the bag SVG. Single-sourced here so the player builder
 * (`InventoryListingBuilder`) and the GM UI share ONE bag-path literal.
 */
export const GENERIC_ITEM_IMAGE = 'icons/svg/item-bag.svg';

/**
 * Resolve a recipe's thumbnail image, mirroring `InventoryListingBuilder._resolveRecipeImg`
 * EXACTLY so the GM recipe-item UI and the player Inventory app never drift: an empty
 * image OR Foundry's generic item-bag both fall back to the alchemical blueprint; any
 * other authored path passes through unchanged.
 *
 * @param {{ img?: string }} [recipe]
 * @returns {string}
 */
export function resolveRecipeImage(recipe) {
  const img = typeof recipe?.img === 'string' ? recipe.img.trim() : '';
  return !img || img === GENERIC_ITEM_IMAGE ? DEFAULT_CRAFTING_IMAGE : img;
}
