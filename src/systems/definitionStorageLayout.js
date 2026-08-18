/**
 * The **Definition Storage Layout** reader, entity-neutral (issue 1212).
 *
 * The recipe-only reader shipped by issue 1242 argued, in its own header, that a second copy
 * of a defensive reader acquires an independently driftable FAIL DIRECTION — this repository
 * already demonstrates the hazard, because `readRecipeStorageTarget` fails to `singleArray`
 * while the layout reader fails to `null`, deliberately and for opposite reasons. Component
 * extraction is that second consumer arriving, so the reader is parameterised by its setting
 * key here and `readRecipeStorageLayout` becomes a one-line binding over it.
 *
 * @see readDefinitionStorageLayout for the fail direction and why it is the opposite of the
 *   target reader's.
 */

import { getSetting as defaultGetSetting } from '../config/settings.js';

/**
 * One entity class's **Definition Storage Layout**, read defensively (issue 1224).
 *
 * The OPPOSITE fail direction from a target reader, and the contrast is the point. A target
 * reader answers an unreadable setting with today's arrangement so an unreadable target can
 * never promote a world onto the granular backend. This one feeds the Valid Id Basis, where
 * a defaulted value is a claim that the corpus about to be read is whole — so an unreadable
 * layout is `null`, which no basis clause recognises and which therefore refuses to run a
 * destructive pass.
 *
 * @param {string} settingKey The entity class's Definition Storage LAYOUT setting key.
 * @param {(key: string) => *} [getSetting] The settings accessor; defaults to the module's
 *   own, so a caller with no injected accessor keeps working. Injected by the startup
 *   migration seams, which are handed their accessors rather than importing them.
 * @returns {string|null} a member of `DEFINITION_STORAGE_LAYOUTS`, or `null` when the
 *   setting could not be read at all.
 */
export function readDefinitionStorageLayout(settingKey, getSetting = defaultGetSetting) {
  try {
    return getSetting(settingKey) ?? null;
  } catch {
    return null;
  }
}
