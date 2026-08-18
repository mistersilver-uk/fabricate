/**
 * The COMPONENT binding over the entity-neutral consent prompt builder (issue 1212).
 *
 * Only the six sentences live here. The DialogV2 contract — the dismissal that resolves
 * `null`, the build-dependent built-in labels, and why the prompt binds every forward
 * conversion rather than only a GM-initiated one — lives once, in
 * `./definitionStorageConsentPrompt.js`, because a second copy re-acquires the
 * `result === false` trap the moment someone edits one of the two.
 *
 * **The sentences are not the recipe ones with a noun swapped**, and that is deliberate. The
 * recipe loss is "it finds no recipes at all"; the component loss is quieter and has to be
 * described as what the GM will actually see — every crafting system showing an EMPTY
 * component library, with no error, indistinguishable from a world whose GM authored none.
 * And the mitigation names this class's own control and its own combined-option label, which
 * is "Nested inside each crafting system" rather than "One combined record": a GM reading the
 * recipe wording against the component dropdown could not tell WHICH record was meant.
 */

import { buildDefinitionStorageConsentPrompt } from './definitionStorageConsentPrompt.js';

/**
 * The component class's six consent sentences.
 *
 * @type {import('./definitionStorageConsentPrompt.js').DefinitionStorageConsentDescriptor}
 */
export const COMPONENT_STORAGE_CONSENT_DESCRIPTOR = Object.freeze({
  title: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentTitle',
    fallback: 'Change how Fabricate stores components?',
  }),
  loss: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentLoss',
    fallback:
      'Fabricate is about to move every crafting component in this world into its own record. Once it has, an older version of Fabricate cannot read them: every crafting system shows an empty component library, it reports no error, and it starts writing over them.',
  }),
  mitigation: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentMitigation',
    fallback:
      'This can be undone, but only from this version. Set Component Storage Arrangement back to "Nested inside each crafting system" and reload Foundry, and Fabricate moves them back before you downgrade.',
  }),
  question: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentQuestion',
    fallback: 'Move the components now?',
  }),
  cancelButton: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentCancelButton',
    fallback: 'Keep components nested inside each crafting system',
  }),
  convertButton: Object.freeze({
    key: 'FABRICATE.Settings.ComponentStorageTarget.ConsentConvertButton',
    fallback: 'Move each component into its own record',
  }),
});

/**
 * Build the GM consent prompt for a forward component storage conversion.
 *
 * @param {(key: string, data?: object) => string} [localize] i18n seam.
 * @returns {import('./definitionStorageConsentPrompt.js').DefinitionStorageConsentPromptConfig}
 */
export function buildComponentStorageConversionConsentPrompt(localize) {
  return buildDefinitionStorageConsentPrompt(COMPONENT_STORAGE_CONSENT_DESCRIPTOR, localize);
}
