/**
 * @module craftingBrowseStatus
 *
 * The browse-status vocabulary a crafting row is labelled with, and the ONE precedence
 * rule that derives it (issue 1091, under the performance programme #1070).
 *
 * ## Why this is a leaf module of its own
 *
 * The vocabulary was declared inside `CraftingListingBuilder` (1,058 lines, a dozen
 * transitive imports), so every consumer that wanted the token set but not the builder
 * kept a private copy instead — `craftingStore.svelte.js` says so in as many words:
 * "a local copy keeps the store free of the builder import". A vocabulary with copies is
 * a vocabulary that drifts, and #1091 exists precisely to stop the player and GM surfaces
 * evolving separate answers to the same question.
 *
 * So the vocabulary and its precedence rule live here, in an import-free leaf any surface
 * can take without dragging a builder behind it. `CraftingListingBuilder` re-exports
 * {@link CRAFTING_BROWSE_STATUS} unchanged, so nothing that imported it from there has to
 * move.
 */

/**
 * The browse-status vocabulary a crafting row is keyed on.
 *
 * `incomplete` is intentionally absent — a recipe is either visible (and thus projected)
 * or filtered out upstream by the visibility service.
 */
export const CRAFTING_BROWSE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LOCKED: 'locked',
  UNKNOWN: 'unknown',
  EXHAUSTED: 'exhausted',
  MISSING_MATERIALS: 'missingMaterials',
  DISCOVERY: 'discovery',
});

/**
 * Browse-status precedence, highest first:
 *
 *   teaser → discovery, locked → locked, knowledge → unknown,
 *   recipe-item exhausted → exhausted, materials missing → missingMaterials,
 *   otherwise available.
 *
 * `materialsAvailable` is deliberately a TRISTATE read: `false` means a material check ran
 * and came back short, while `null`/`undefined` means no check ran at all. Only the first
 * yields `missingMaterials`. A surface with no inventory in hand — the GM browser, which
 * projects definitions rather than one actor's view of them — must not therefore paint
 * every row as short of materials, which is what a plain falsy test would do.
 *
 * The optimism of the cheap availability projection is carried, not laundered: an
 * `available` derived from it means "nothing rules this out", never "this will craft".
 * See `projectRecipeAvailability`'s contract in `inventorySnapshot.js`.
 *
 * @param {object} input
 * @param {string} [input.reason] The visibility service's `access.reason`.
 * @param {boolean|null} [input.materialsAvailable] Whether a material check passed, or
 *   `null` when none ran.
 * @param {boolean} [input.exhausted] Whether every owned copy of the recipe's book has
 *   reached its cap.
 * @returns {string} A {@link CRAFTING_BROWSE_STATUS} value.
 */
export function deriveBrowseStatus({
  reason = '',
  materialsAvailable = null,
  exhausted = false,
} = {}) {
  if (reason === 'teaser') return CRAFTING_BROWSE_STATUS.DISCOVERY;
  if (reason === 'locked') return CRAFTING_BROWSE_STATUS.LOCKED;
  if (reason === 'knowledge') return CRAFTING_BROWSE_STATUS.UNKNOWN;
  if (exhausted === true) return CRAFTING_BROWSE_STATUS.EXHAUSTED;
  if (materialsAvailable === false) return CRAFTING_BROWSE_STATUS.MISSING_MATERIALS;
  return CRAFTING_BROWSE_STATUS.AVAILABLE;
}
