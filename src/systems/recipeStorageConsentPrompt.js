/**
 * The RECIPE binding over the entity-neutral consent prompt builder (issues 1211, 1212).
 *
 * Issue 1211 shipped this module whole. Issue 1212 needed the identical DialogV2 contract for
 * components and moved that contract — every clause of it, including the two platform facts
 * a copy would re-acquire — into `./definitionStorageConsentPrompt.js`. What stayed here is
 * the part that is genuinely about recipes: the six sentences, and the recipe-named exports
 * every shipped caller and test already uses.
 *
 * @see ./definitionStorageConsentPrompt.js for the DialogV2 contract, the dismissal trap, and
 *   why the prompt binds every forward conversion rather than only a GM-initiated one.
 */

import {
  buildDefinitionStorageConsentPrompt,
  isDefinitionStorageConversionConsented,
} from './definitionStorageConsentPrompt.js';

export {
  /**
   * Stable action keys for the two prompt buttons, re-exported under the recipe name every
   * shipped caller and test already uses.
   */
  DEFINITION_STORAGE_CONSENT_ACTIONS as RECIPE_STORAGE_CONSENT_ACTIONS,
} from './definitionStorageConsentPrompt.js';

/**
 * The recipe class's six consent sentences.
 *
 * @type {import('./definitionStorageConsentPrompt.js').DefinitionStorageConsentDescriptor}
 */
export const RECIPE_STORAGE_CONSENT_DESCRIPTOR = Object.freeze({
  title: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentTitle',
    fallback: 'Change how Fabricate stores recipes?',
  }),
  loss: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentLoss',
    fallback:
      'Fabricate is about to move every recipe in this world into its own record. Once it has, an older version of Fabricate cannot read them: it finds no recipes at all, reports no error, and starts writing over them.',
  }),
  mitigation: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentMitigation',
    fallback:
      'This can be undone, but only from this version. Set Recipe Storage Arrangement back to "One combined record" and reload Foundry, and Fabricate moves them back before you downgrade.',
  }),
  question: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentQuestion',
    fallback: 'Move the recipes now?',
  }),
  cancelButton: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentCancelButton',
    fallback: 'Keep recipes in one combined record',
  }),
  convertButton: Object.freeze({
    key: 'FABRICATE.Settings.RecipeStorageTarget.ConsentConvertButton',
    fallback: 'Move each recipe into its own record',
  }),
});

/**
 * Build the GM consent prompt for a forward recipe storage conversion.
 *
 * @param {(key: string, data?: object) => string} [localize] i18n seam.
 * @returns {import('./definitionStorageConsentPrompt.js').DefinitionStorageConsentPromptConfig}
 */
export function buildRecipeStorageConversionConsentPrompt(localize) {
  return buildDefinitionStorageConsentPrompt(RECIPE_STORAGE_CONSENT_DESCRIPTOR, localize);
}

/**
 * Whether a dialog result is CONSENT.
 *
 * @param {*} result whatever the dialog resolved with.
 * @returns {boolean}
 */
export function isRecipeStorageConversionConsented(result) {
  return isDefinitionStorageConversionConsented(result);
}
