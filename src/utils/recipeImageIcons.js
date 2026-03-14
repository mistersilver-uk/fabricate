/**
 * FoundryVTT document icons available for recipe images.
 * All icons are sourced from `icons/sundries/documents/` in the FoundryVTT data path.
 */

export const DEFAULT_RECIPE_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

/**
 * The 46 FoundryVTT document icons available as recipe images.
 */
export const RECIPE_IMAGE_ICONS = Object.freeze([
  'icons/sundries/documents/ancient-text.webp',
  'icons/sundries/documents/arcane-sigil.webp',
  'icons/sundries/documents/blueprint-recipe-alchemical.webp',
  'icons/sundries/documents/blueprint-recipe-bomb.webp',
  'icons/sundries/documents/blueprint-recipe-crossbow.webp',
  'icons/sundries/documents/blueprint-recipe-dagger.webp',
  'icons/sundries/documents/blueprint-recipe-flask.webp',
  'icons/sundries/documents/blueprint-recipe-footwear.webp',
  'icons/sundries/documents/blueprint-recipe-gauntlet.webp',
  'icons/sundries/documents/blueprint-recipe-helm.webp',
  'icons/sundries/documents/blueprint-recipe-key.webp',
  'icons/sundries/documents/blueprint-recipe-lamp.webp',
  'icons/sundries/documents/blueprint-recipe-longbow.webp',
  'icons/sundries/documents/blueprint-recipe-map.webp',
  'icons/sundries/documents/blueprint-recipe-saber.webp',
  'icons/sundries/documents/blueprint-recipe-shield.webp',
  'icons/sundries/documents/blueprint-recipe-shovel.webp',
  'icons/sundries/documents/blueprint-recipe-shortsword.webp',
  'icons/sundries/documents/blueprint-recipe-stone.webp',
  'icons/sundries/documents/blueprint-recipe-staff.webp',
  'icons/sundries/documents/blueprint-recipe-sword.webp',
  'icons/sundries/documents/blueprint-recipe-tome.webp',
  'icons/sundries/documents/blueprint-recipe-tree.webp',
  'icons/sundries/documents/blueprint-recipe-wood-axe.webp',
  'icons/sundries/documents/blood-scroll.webp',
  'icons/sundries/documents/book-blue.webp',
  'icons/sundries/documents/book-grey.webp',
  'icons/sundries/documents/book-red.webp',
  'icons/sundries/documents/book-worn.webp',
  'icons/sundries/documents/bounty-poster.webp',
  'icons/sundries/documents/contract.webp',
  'icons/sundries/documents/crackling-scroll.webp',
  'icons/sundries/documents/deed.webp',
  'icons/sundries/documents/document-journal.webp',
  'icons/sundries/documents/glowing-scroll.webp',
  'icons/sundries/documents/journal.webp',
  'icons/sundries/documents/letter-cursive.webp',
  'icons/sundries/documents/letter-seal.webp',
  'icons/sundries/documents/map.webp',
  'icons/sundries/documents/map-torn.webp',
  'icons/sundries/documents/news-articles.webp',
  'icons/sundries/documents/note.webp',
  'icons/sundries/documents/notice-board.webp',
  'icons/sundries/documents/parchment-0.webp',
  'icons/sundries/documents/parchment-1.webp',
  'icons/sundries/documents/rolled-scroll.webp'
]);

/**
 * Normalizes a recipe image path.
 * Returns the default image if the given path is empty, null, or not in the icon list.
 *
 * @param {string|null|undefined} img - The image path to normalize.
 * @returns {string} A valid recipe image path.
 */
export function normalizeRecipeImage(img) {
  const trimmed = String(img || '').trim();
  if (!trimmed) return DEFAULT_RECIPE_IMAGE;
  return trimmed;
}

/**
 * Returns the label portion of an icon path (the filename without extension).
 * Example: `icons/sundries/documents/blueprint-recipe-alchemical.webp` → `blueprint-recipe-alchemical`
 *
 * @param {string} iconPath - Full icon path.
 * @returns {string} Human-readable label.
 */
export function getRecipeImageLabel(iconPath) {
  const filename = String(iconPath || '').split('/').pop() || '';
  return filename.replace(/\.[^.]+$/, '');
}
