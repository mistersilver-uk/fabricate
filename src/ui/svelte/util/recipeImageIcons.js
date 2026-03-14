/**
 * Recipe image icon definitions for the RecipeImagePicker component.
 *
 * All 46 paths are FoundryVTT document icons from the icons/sundries/documents/ directory.
 */

export const DEFAULT_RECIPE_IMAGE = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';

const BASE_PATH = 'icons/sundries/documents/';

/**
 * Derive a human-readable label from a filename (without extension).
 * e.g. "blueprint-anchor" → "Blueprint Anchor"
 * @param {string} filename
 * @returns {string}
 */
function labelFromFilename(filename) {
  return filename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const RECIPE_IMAGE_FILENAMES = [
  'blueprint-anchor',
  'blueprint-axe',
  'blueprint-helmet',
  'blueprint-magical-brown',
  'blueprint-magical',
  'blueprint-recipe-alchemical',
  'blueprint-recipe-magic',
  'blueprint-shield',
  'document-bound-white-tan',
  'document-bound-white',
  'document-brown',
  'document-gold',
  'document-letter-blue',
  'document-letter-brown',
  'document-letter-formal-tan',
  'document-letter-tan',
  'document-official-brownl',
  'document-official-capital',
  'document-sealed-beige-red',
  'document-sealed-brown-red',
  'document-sealed-red-tan',
  'document-sealed-red-white',
  'document-sealed-red-yellow',
  'document-sealed-signatures-red',
  'document-sealed-white-orange',
  'document-sealed-white-red',
  'document-symbol-circle-brown',
  'document-symbol-circle-gold-red',
  'document-symbol-eye',
  'document-symbol-lightning-brown',
  'document-symbol-person-brown',
  'document-symbol-rune-brown',
  'document-symbol-rune-tan',
  'document-symbol-skull-tan',
  'document-symbol-triangle-pink',
  'document-torn-diagram-tan',
  'document-tree-brown',
  'document-worn-symbol-brown',
  'document-writing-brown',
  'document-writing-pink',
  'envelope-sealed-red-brown',
  'envelope-sealed-red-tan',
  'envelope-sealed-red-white',
  'envelope-stealed-brown',
  'paper-plain-white',
  'parchment-plain-tan'
];

/**
 * Frozen array of 46 recipe image options, each with `path` and `label`.
 * @type {ReadonlyArray<{ path: string, label: string }>}
 */
export const RECIPE_IMAGE_OPTIONS = Object.freeze(
  RECIPE_IMAGE_FILENAMES.map(filename => ({
    path: `${BASE_PATH}${filename}.webp`,
    label: labelFromFilename(filename)
  }))
);

const _pathSet = new Set(RECIPE_IMAGE_OPTIONS.map(o => o.path));

/**
 * Returns the path if it is a recognised recipe image option, otherwise returns DEFAULT_RECIPE_IMAGE.
 * @param {string|null|undefined} path
 * @returns {string}
 */
export function normalizeRecipeImage(path) {
  if (path && _pathSet.has(path)) {
    return path;
  }
  return DEFAULT_RECIPE_IMAGE;
}

/**
 * Filters RECIPE_IMAGE_OPTIONS by a case-insensitive substring match on the label.
 * Returns all options when searchTerm is empty or whitespace.
 * @param {ReadonlyArray<{ path: string, label: string }>} options
 * @param {string} searchTerm
 * @returns {Array<{ path: string, label: string }>}
 */
export function filterRecipeImageOptions(options, searchTerm) {
  const trimmed = (searchTerm || '').trim().toLowerCase();
  if (!trimmed) return Array.from(options);
  return options.filter(o => o.label.toLowerCase().includes(trimmed));
}
