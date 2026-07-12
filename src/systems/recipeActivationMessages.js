/**
 * Localize recipe ACTIVATION (enable) validation errors for the UI (issue 550).
 *
 * The model layer produces validation issues that carry a stable `code` plus
 * human-readable `params` (recipe/component NAMES, ingredient-set positions —
 * never internal ids) and a default English `message` for headless callers. This
 * module maps a `code` to a localized `lang/en.json` key and interpolates the
 * params, following the same issue-code pattern the system Validation overview
 * uses (`SystemOverviewView.svelte` `ISSUE_LABELS`).
 *
 * It is a PURE leaf module: no Foundry globals, no store reads. The caller passes
 * a `localizeFn(key, data)` (Foundry's `game.i18n.format`-style substitution) so
 * this stays unit-testable with a plain function.
 */

const LANG_PREFIX = 'FABRICATE.Admin.Manager.RecipeActivation';

/**
 * `code → [langKeySuffix, defaultEnglishTemplate]`. The default template is used
 * when the localize fn returns the key unchanged (Foundry's behavior for an
 * absent key), so a missing translation never surfaces a raw key to the user. New
 * coded activation issues are registered here.
 *
 * @type {Readonly<Record<string, [string, string]>>}
 */
export const RECIPE_ACTIVATION_ISSUE_LABELS = Object.freeze({
  signatureCollision: [
    'IssueSignatureCollision',
    'Recipe "{recipeA}" (ingredient set {setA}) and recipe "{recipeB}" (ingredient set {setB}) can both be crafted from the same components ({components}), so alchemy cannot tell which one you are making.',
  ],
});

/**
 * Substitute `{placeholder}` tokens in a template from `params`, leaving unknown
 * tokens untouched. Mirrors Foundry's `game.i18n.format` substitution so the
 * built-in fallback reads identically to a translated string.
 *
 * @param {string} template
 * @param {object} [params]
 * @returns {string}
 */
function interpolate(template, params = {}) {
  return String(template).replaceAll(/\{(\w+)\}/g, (match, key) =>
    params?.[key] == null ? match : String(params[key])
  );
}

/**
 * Localize a single activation issue. A CODED issue is resolved to its lang key
 * (params interpolated); when the key is absent the built-in English template is
 * used. An UNCODED issue (a pre-existing structural validation string that has no
 * code yet) passes its already-English `message` through unchanged.
 *
 * @param {{ code?: string|null, params?: object, message?: string }} issue
 * @param {(key: string, data?: object) => string} [localizeFn]
 * @returns {string}
 */
export function localizeActivationIssue(issue, localizeFn) {
  const meta = issue?.code ? RECIPE_ACTIVATION_ISSUE_LABELS[issue.code] : null;
  if (!meta) return issue?.message || '';

  const [suffix, fallbackTemplate] = meta;
  const key = `${LANG_PREFIX}.${suffix}`;
  const params = issue?.params || {};
  const localized = localizeFn?.(key, params);
  if (localized && localized !== key) return localized;
  return interpolate(fallbackTemplate, params);
}

/**
 * Build the localized, id-free toast string for a
 * {@link module:systems/RecipeActivationError.RecipeActivationError}. Returns
 * `null` for any error that is not an activation error (no `activationIssues`), so
 * the caller can fall back to the error's own message.
 *
 * @param {unknown} error
 * @param {(key: string, data?: object) => string} [localizeFn]
 * @returns {string|null}
 */
export function localizeRecipeActivationError(error, localizeFn) {
  const issues = Array.isArray(error?.activationIssues) ? error.activationIssues : null;
  if (!issues) return null;

  const detail = issues
    .map((issue) => localizeActivationIssue(issue, localizeFn))
    .filter(Boolean)
    .join(' ');
  const params = { name: error?.recipeName || '', errors: detail };
  const key = `${LANG_PREFIX}.CannotEnable`;
  const localized = localizeFn?.(key, params);
  if (localized && localized !== key) return localized;
  return interpolate('Cannot enable recipe "{name}": {errors}', params);
}
