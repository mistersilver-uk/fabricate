/**
 * Pure builder for the GM's pre-conversion consent prompt, entity-neutral (issues 1211, 1212).
 *
 * `data-models/spec.md` § Storage Conversion Crash Recovery carries a shipped MUST: *"The
 * conversion is downgrade-lossy and MUST say so before it runs."* A settings HINT states the
 * loss at the point of SELECTION, which is a disclosure of the choice and not of the action:
 * nothing enforces that a GM read it, and it does not run. This module is the point-of-action
 * half, for every extracted entity class.
 *
 * Foundry-free on purpose, exactly as `src/migration/migrationRecoveryPrompt.js` is, so the
 * sentence and the pre-selected choice are unit-testable with no Foundry runtime. The thin
 * edge in `src/main.js` feeds this config to `foundry.applications.api.DialogV2`.
 *
 * ## Two DialogV2 contract facts this module exists to make un-forgettable
 *
 * Verified on 13.351 and 14.365:
 *
 * 1. **`DialogV2.wait` defaults `rejectClose = false`,** so a DISMISSAL resolves `null`
 *    rather than rejecting. A decline therefore arrives as `false` (the button's own value
 *    when `confirm` is used) OR `null` (dismissal) OR `undefined`. `if (result === false)`
 *    silently drops the dismissal and CONVERTS — which is why
 *    {@link isDefinitionStorageConversionConsented} is a positive test for the affirmative
 *    action and not a negative test for the decline.
 * 2. **`DialogV2.confirm`'s built-in labels differ by build** — literal `"Yes"`/`"No"` on
 *    V13, `"COMMON.Yes"`/`"COMMON.No"` on V14 — and neither names the action. So this builder
 *    emits two explicit buttons with their own action verbs, and the DECLINE button carries
 *    `default: true` explicitly, because `wait` with custom buttons gives nothing for free.
 *
 * ## Why the prompt binds every forward conversion, not only a GM-initiated one
 *
 * Every storage TARGET is `config: true` at `scope: 'world'`, so the real gate on writing it
 * is `SETTINGS_MODIFY` at `defaultRole: ASSISTANT` — an ASSISTANT GM can set it. The
 * mid-session handler that reacts to the change returns early unless the client IS the
 * primary GM, so with no full GM connected the hook fires and returns early everywhere, no
 * prompt is shown to anyone, and the later boot converts having obtained no consent at all.
 * Prompting on the client that will perform the conversion closes that without a consent
 * ledger and without a new setting key: it is once per world, and where the conversion cannot
 * run yet the deferral notice covers it. An unanswered prompt declines, which is safe.
 *
 * ## Why a DESCRIPTOR rather than a second copy
 *
 * Issue 1212 needed the identical DialogV2 contract for components, and two of its facts are
 * the reason this module exists at all: a copy re-acquires the `result === false` trap the
 * moment someone edits one of the two. What genuinely differs between two entity classes is
 * the SENTENCES — six key/fallback pairs — so those move into a descriptor and the contract
 * stays singular. `buildRecipeStorageConversionConsentPrompt` is a binding over this.
 */

/**
 * Stable action keys for the two prompt buttons. `CANCEL` is the default choice, because it
 * is the non-destructive one — the conversion is a one-way door for any build older than
 * this one.
 *
 * @type {Readonly<{CANCEL: string, CONVERT: string}>}
 */
export const DEFINITION_STORAGE_CONSENT_ACTIONS = Object.freeze({
  CANCEL: 'cancel',
  CONVERT: 'convert',
});

/**
 * @typedef {object} DefinitionStorageConsentSentence
 * @property {string} key localization key
 * @property {string} fallback complete English sentence, used when the key does not resolve
 */

/**
 * Everything about one entity class's consent prompt that is not the DialogV2 contract.
 *
 * @typedef {object} DefinitionStorageConsentDescriptor
 * @property {DefinitionStorageConsentSentence} title window title
 * @property {DefinitionStorageConsentSentence} loss what the conversion costs
 * @property {DefinitionStorageConsentSentence} mitigation how to undo it, by control name
 * @property {DefinitionStorageConsentSentence} question the affirmative question
 * @property {DefinitionStorageConsentSentence} cancelButton non-destructive button label
 * @property {DefinitionStorageConsentSentence} convertButton affirmative button label
 */

/**
 * @typedef {object} DefinitionStorageConsentButton
 * @property {string} action stable action key (one of {@link DEFINITION_STORAGE_CONSENT_ACTIONS})
 * @property {string} label localized button label
 * @property {boolean} default true for the pre-selected button
 */

/**
 * @typedef {object} DefinitionStorageConsentPromptConfig
 * @property {string} title localized window title
 * @property {string} content HTML content naming the loss and its mitigation
 * @property {string} default action key of the pre-selected button (always CANCEL)
 * @property {DefinitionStorageConsentButton[]} buttons ordered button descriptors
 */

/**
 * Build the GM consent prompt for one entity class's forward storage conversion.
 *
 * @param {DefinitionStorageConsentDescriptor} descriptor the class's six sentences.
 * @param {(key: string, data?: object) => string} [localize] i18n seam; receives a key and
 *   optional interpolation data and returns the localized string. When absent, the English
 *   fallbacks are used so the builder is usable without Foundry.
 * @returns {DefinitionStorageConsentPromptConfig} a plain, Foundry-free config object.
 */
export function buildDefinitionStorageConsentPrompt(descriptor, localize) {
  const t = makeLocalizer(localize);
  const say = (sentence) => t(sentence.key, {}, sentence.fallback);

  // One COMPLETE localized sentence per paragraph, and no layout or target token
  // interpolated into any of them. The first names what is lost, the second names the
  // mitigation BY THE CONTROL THE GM WOULD USE, because after a downgrade there is no code
  // left to run the reverse conversion with — so knowing the control exists is only useful
  // while this build is still installed.
  const content = [descriptor.loss, descriptor.mitigation, descriptor.question]
    .map((sentence) => `<p>${escapeHtml(say(sentence))}</p>`)
    .join('');

  return {
    title: say(descriptor.title),
    content,
    default: DEFINITION_STORAGE_CONSENT_ACTIONS.CANCEL,
    // Non-destructive FIRST and pre-selected. The affirmative button names its own action
    // rather than saying "Yes", so a GM reading only the buttons still knows what happens.
    buttons: [
      {
        action: DEFINITION_STORAGE_CONSENT_ACTIONS.CANCEL,
        label: say(descriptor.cancelButton),
        default: true,
      },
      {
        action: DEFINITION_STORAGE_CONSENT_ACTIONS.CONVERT,
        label: say(descriptor.convertButton),
        default: false,
      },
    ],
  };
}

/**
 * Whether a dialog result is CONSENT.
 *
 * A positive test for the affirmative action, never a negative test for the decline. See
 * fact 1 in this module's header: a dismissal resolves `null` under `DialogV2.wait`'s
 * default `rejectClose = false`, and `result === false` would treat it as consent.
 *
 * @param {*} result whatever the dialog resolved with.
 * @returns {boolean}
 */
export function isDefinitionStorageConversionConsented(result) {
  return result === DEFINITION_STORAGE_CONSENT_ACTIONS.CONVERT;
}

/**
 * Wrap an optional Foundry-style localizer into a `(key, data, fallback)` helper.
 *
 * The same shape `migrationRecoveryPrompt.js` uses, including the "a localizer that cannot
 * resolve a key echoes it back" convention.
 *
 * @param {((key: string, data?: object) => string) | undefined} localize
 * @returns {(key: string, data?: object, fallback?: string) => string}
 */
function makeLocalizer(localize) {
  if (typeof localize !== 'function') {
    return (_key, _data, fallback = '') => fallback;
  }
  return (key, data, fallback = '') => {
    const result = localize(key, data);
    if (typeof result !== 'string' || result === key || result.length === 0) {
      return fallback;
    }
    return result;
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
