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
