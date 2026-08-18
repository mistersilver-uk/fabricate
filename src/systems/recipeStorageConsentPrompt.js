/**
 * Pure builder for the GM's pre-conversion consent prompt (issue 1211).
 *
 * `data-models/spec.md` § Storage Conversion Crash Recovery carries a shipped MUST: *"The
 * conversion is downgrade-lossy and MUST say so before it runs."* The shipped
 * `FABRICATE.Settings.RecipeStorageTarget.Hint` states the loss at the point of SELECTION,
 * which is a disclosure of the choice and not of the action: nothing enforces that a GM read
 * it, and it does not run. This module is the point-of-action half.
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
 *    {@link isRecipeStorageConversionConsented} is a positive test for the affirmative
 *    action and not a negative test for the decline.
 * 2. **`DialogV2.confirm`'s built-in labels differ by build** — literal `"Yes"`/`"No"` on
 *    V13, `"COMMON.Yes"`/`"COMMON.No"` on V14 — and neither names the action. So this builder
 *    emits two explicit buttons with their own action verbs, and the DECLINE button carries
 *    `default: true` explicitly, because `wait` with custom buttons gives nothing for free.
 *
 * ## Why the prompt binds every forward conversion, not only a GM-initiated one
 *
 * `recipeStorageTarget` is `config: true` at `scope: 'world'`, so the real gate on writing it
 * is `SETTINGS_MODIFY` at `defaultRole: ASSISTANT` — an ASSISTANT GM can set it. The
 * mid-session handler that reacts to the change returns early unless the client IS the
 * primary GM, so with no full GM connected the hook fires and returns early everywhere, no
 * prompt is shown to anyone, and the later boot converts having obtained no consent at all.
 * Prompting on the client that will perform the conversion closes that without a consent
 * ledger and without a new setting key: it is once per world, and where the conversion cannot
 * run yet the deferral notice covers it. An unanswered prompt declines, which is safe.
 */

/**
 * Stable action keys for the two prompt buttons. `CANCEL` is the default choice, because it
 * is the non-destructive one — the conversion is a one-way door for any build older than
 * this one.
 *
 * @type {Readonly<{CANCEL: string, CONVERT: string}>}
 */
export const RECIPE_STORAGE_CONSENT_ACTIONS = Object.freeze({
  CANCEL: 'cancel',
  CONVERT: 'convert',
});

/**
 * @typedef {object} RecipeStorageConsentButton
 * @property {string} action stable action key (one of {@link RECIPE_STORAGE_CONSENT_ACTIONS})
 * @property {string} label localized button label
 * @property {boolean} default true for the pre-selected button
 */

/**
 * @typedef {object} RecipeStorageConsentPromptConfig
 * @property {string} title localized window title
 * @property {string} content HTML content naming the loss and its mitigation
 * @property {string} default action key of the pre-selected button (always CANCEL)
 * @property {RecipeStorageConsentButton[]} buttons ordered button descriptors
 */

/**
 * Build the GM consent prompt for a forward recipe storage conversion.
 *
 * @param {(key: string, data?: object) => string} [localize] i18n seam; receives a key and
 *   optional interpolation data and returns the localized string. When absent, the English
 *   fallbacks are used so the builder is usable without Foundry.
 * @returns {RecipeStorageConsentPromptConfig} a plain, Foundry-free config object.
 */
export function buildRecipeStorageConversionConsentPrompt(localize) {
  const t = makeLocalizer(localize);

  // One COMPLETE localized sentence per paragraph, and no layout or target token
  // interpolated into any of them. The first names what is lost, the second names the
  // mitigation BY THE CONTROL THE GM WOULD USE, because after a downgrade there is no code
  // left to run the reverse conversion with — so knowing the control exists is only useful
  // while this build is still installed.
  const content = [
    t(
      'FABRICATE.Settings.RecipeStorageTarget.ConsentLoss',
      {},
      'Fabricate is about to move every recipe in this world into its own record. Once it has, an older version of Fabricate cannot read them: it finds no recipes at all, reports no error, and starts writing over them.'
    ),
    t(
      'FABRICATE.Settings.RecipeStorageTarget.ConsentMitigation',
      {},
      'This can be undone, but only from this version. Set Recipe Storage Arrangement back to "One combined record" and reload Foundry, and Fabricate moves them back before you downgrade.'
    ),
    t('FABRICATE.Settings.RecipeStorageTarget.ConsentQuestion', {}, 'Move the recipes now?'),
  ]
    .map((sentence) => `<p>${escapeHtml(sentence)}</p>`)
    .join('');

  return {
    title: t(
      'FABRICATE.Settings.RecipeStorageTarget.ConsentTitle',
      {},
      'Change how Fabricate stores recipes?'
    ),
    content,
    default: RECIPE_STORAGE_CONSENT_ACTIONS.CANCEL,
    // Non-destructive FIRST and pre-selected. The affirmative button names its own action
    // rather than saying "Yes", so a GM reading only the buttons still knows what happens.
    buttons: [
      {
        action: RECIPE_STORAGE_CONSENT_ACTIONS.CANCEL,
        label: t(
          'FABRICATE.Settings.RecipeStorageTarget.ConsentCancelButton',
          {},
          'Keep recipes in one combined record'
        ),
        default: true,
      },
      {
        action: RECIPE_STORAGE_CONSENT_ACTIONS.CONVERT,
        label: t(
          'FABRICATE.Settings.RecipeStorageTarget.ConsentConvertButton',
          {},
          'Move each recipe into its own record'
        ),
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
export function isRecipeStorageConversionConsented(result) {
  return result === RECIPE_STORAGE_CONSENT_ACTIONS.CONVERT;
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
