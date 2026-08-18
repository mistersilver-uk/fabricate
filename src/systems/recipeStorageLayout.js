/**
 * The **Definition Storage Layout** reader for recipes, in one place (issue 1242).
 *
 * Extracted verbatim from `RecipeManager.js`, where it was module-private, because a second
 * consumer arrived: the startup migration pass now selects its recipe corpus accessor from
 * the same layout the stale-arrangement write guard refuses on
 * (`./definitionStorageArrangement.js`). Duplicating it would create two readers with
 * independently driftable FAIL DIRECTIONS, and this repository already demonstrates that
 * hazard — `readRecipeStorageTarget` fails to `singleArray` while this one fails to `null`,
 * deliberately and for opposite reasons. Two copies of a defensive reader is how one of them
 * silently acquires the other's direction.
 *
 * It lives in a leaf rather than being exported from `RecipeManager.js` so a consumer that
 * needs only the layout does not pull a six-thousand-line manager and its whole model graph
 * into every test that imports it.
 *
 * @see readRecipeStorageLayout for the fail direction and why it is the opposite of the
 *   target reader's.
 */

import { getSetting as defaultGetSetting, SETTING_KEYS } from '../config/settings.js';

/**
 * The **Definition Storage Layout** for recipes, read defensively (issue 1224).
 *
 * The OPPOSITE fail direction from `RecipeManager`'s `readRecipeStorageTarget`, and the
 * contrast is the point. That reader answers an unreadable setting with today's arrangement
 * so an unreadable target can never promote a world onto the granular backend. This one
 * feeds the Valid Id Basis, where a defaulted value is a claim that the corpus about to be
 * read is whole — so an unreadable layout is `null`, which no basis clause recognises and
 * which therefore refuses to run a destructive pass.
 *
 * @param {(key: string) => *} [getSetting] The settings accessor; defaults to the module's
 *   own, so every existing caller keeps calling this with no arguments. Injected by the
 *   startup migration seam, which is handed its accessors rather than importing them.
 * @returns {string|null} a member of `DEFINITION_STORAGE_LAYOUTS`, or `null` when the
 *   setting could not be read at all.
 */
export function readRecipeStorageLayout(getSetting = defaultGetSetting) {
  try {
    return getSetting(SETTING_KEYS.RECIPE_STORAGE_LAYOUT) ?? null;
  } catch {
    return null;
  }
}
