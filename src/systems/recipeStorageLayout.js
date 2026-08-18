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
 * Issue 1212 made the reader itself entity-neutral (`./definitionStorageLayout.js`) when
 * components acquired their own layout key, for exactly that argument at a second scale.
 * This module survives as the recipe BINDING: it keeps the recipe-named export every shipped
 * caller and test uses, and it keeps that binding in a leaf rather than exporting it from
 * `RecipeManager.js`, so a consumer that needs only the layout does not pull a six-thousand
 * line manager and its whole model graph into every test that imports it.
 *
 * @see readDefinitionStorageLayout for the fail direction and why it is the opposite of the
 *   target reader's.
 */

import { getSetting as defaultGetSetting, SETTING_KEYS } from '../config/settings.js';

import { readDefinitionStorageLayout } from './definitionStorageLayout.js';

/**
 * The **Definition Storage Layout** for recipes, read defensively (issue 1224).
 *
 * @param {(key: string) => *} [getSetting] The settings accessor; defaults to the module's
 *   own, so every existing caller keeps calling this with no arguments.
 * @returns {string|null} a member of `DEFINITION_STORAGE_LAYOUTS`, or `null` when the
 *   setting could not be read at all.
 */
export function readRecipeStorageLayout(getSetting = defaultGetSetting) {
  return readDefinitionStorageLayout(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, getSetting);
}
