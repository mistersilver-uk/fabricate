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
  // Structural / resolution-mode validation issues (issue 595). Each carries a
  // human-readable STEP / INGREDIENT-SET / RESULT label — the author-given name
  // when present, otherwise a 1-based POSITION — never an internal id. `{mode}` is
  // the canonical resolution-mode token (not translated), matching the pre-fix
  // English strings byte-for-byte for named entities.
  stepIngredientSetCountExact: [
    'IssueStepIngredientSetCountExact',
    'Step "{step}" must have exactly 1 ingredient set in {mode} mode',
  ],
  stepResultGroupCountExact: [
    'IssueStepResultGroupCountExact',
    'Step "{step}" must have exactly 1 result group in {mode} mode',
  ],
  stepIngredientSetCountMin: [
    'IssueStepIngredientSetCountMin',
    'Step "{step}" must have at least 1 ingredient set in {mode} mode',
  ],
  stepResultGroupCountMin: [
    'IssueStepResultGroupCountMin',
    'Step "{step}" must have at least 1 result group in {mode} mode',
  ],
  stepRequiresOrderedResults: [
    'IssueStepRequiresOrderedResults',
    'Step "{step}" requires ordered results in progressive mode',
  ],
  stepResultDifficulty: [
    'IssueStepResultDifficulty',
    'Result {result} references component without valid difficulty',
  ],
  ingredientSetInvalidResultGroup: [
    'IssueIngredientSetInvalidResultGroup',
    'Ingredient set "{set}" maps to a result group that does not exist',
  ],
  routedGroupNameReserved: [
    'IssueRoutedGroupNameReserved',
    'Result group name "{groupName}" conflicts with reserved routing keyword in step "{step}"',
  ],
  routedGroupNameDuplicate: [
    'IssueRoutedGroupNameDuplicate',
    'Duplicate result group name "{groupName}" (case-insensitive) in step "{step}" — routed mode requires unique names',
  ],
  // Base structural-integrity issues from the recipe MODEL (issue 595). These fire
  // on an ordinary save (most are NOT requireComplete-gated) and previously leaked a
  // step / ingredient-set / result-group / result / mapping id. `{location}` is a
  // pre-composed, id-free context phrase (`Recipe` or `Step "<name-or-position>"`);
  // `{group}` / `{result}` / `{set}` / `{step}` are name-or-1-based-position labels.
  stepMissingIngredientSet: [
    'IssueStepMissingIngredientSet',
    'Step "{step}" must include at least one ingredient set',
  ],
  stepMissingResultGroup: [
    'IssueStepMissingResultGroup',
    'Step "{step}" must include at least one result group',
  ],
  timeRequirementInvalid: [
    'IssueTimeRequirementInvalid',
    '{location} has invalid time requirement value for "{unit}"',
  ],
  ingredientSetInvalid: ['IssueIngredientSetInvalid', 'Ingredient set "{set}": {detail}'],
  ingredientSetInvalidResultMapping: [
    'IssueIngredientSetInvalidResultMapping',
    'Ingredient set "{set}" references a result mapping that does not exist',
  ],
  outcomeRoutingInvalidResultGroup: [
    'IssueOutcomeRoutingInvalidResultGroup',
    'Outcome routing "{outcome}" references a result group that does not exist',
  ],
  resultGroupDuplicate: [
    'IssueResultGroupDuplicate',
    '{location} has a duplicate result group "{group}"',
  ],
  resultGroupEmpty: [
    'IssueResultGroupEmpty',
    '{location} result group "{group}" must contain at least one result',
  ],
  resultDuplicate: ['IssueResultDuplicate', '{location} has a duplicate result "{result}"'],
  resultInvalid: ['IssueResultInvalid', '{location} result "{result}": {detail}'],
  // Essence-reference issues from RecipeManager (issue 595). The set is named by
  // name-or-position; the essence is named from the system's essence definitions
  // when resolvable, else a name-free phrasing is used — never the raw essence id.
  ingredientSetUnknownEssence: [
    'IssueIngredientSetUnknownEssence',
    'Ingredient set "{set}" references an essence that is not defined in this system',
  ],
  ingredientSetEssenceQuantityNamed: [
    'IssueIngredientSetEssenceQuantityNamed',
    'Ingredient set "{set}" has an invalid quantity for essence "{essence}"',
  ],
  ingredientSetEssenceQuantity: [
    'IssueIngredientSetEssenceQuantity',
    'Ingredient set "{set}" has an invalid essence quantity',
  ],
  // Tag-placeholder issue from RecipeManager (issue 595). The group is named by
  // name-or-position; the tag is an authored tag name, not an id.
  ingredientGroupUnknownTag: [
    'IssueIngredientGroupUnknownTag',
    'Ingredient group "{group}" references unknown tag "{tag}"',
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
 * Build a coded, id-free structured issue for a registered activation/persistence
 * `code` (issue 595). The headless English `message` is the code's built-in
 * template interpolated with `params`, so it stays the single source of template
 * truth (the UI localizes the same `code` + `params` through
 * {@link localizeActivationIssue}). Callers pass only human-readable params
 * (names or 1-based positions), never internal ids.
 *
 * @param {string} code - a key of {@link RECIPE_ACTIVATION_ISSUE_LABELS}
 * @param {object} [params]
 * @returns {{ code: string, params: object, message: string }}
 */
export function buildRecipeActivationIssue(code, params = {}) {
  const meta = RECIPE_ACTIVATION_ISSUE_LABELS[code];
  const template = meta ? meta[1] : '';
  return { code, params, message: interpolate(template, params) };
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

/**
 * Build the localized, id-free toast string for a
 * {@link module:systems/RecipePersistenceError.RecipePersistenceError} — a recipe
 * SAVE (create/update) that failed structural/reference validation (issue 595).
 * Reuses {@link localizeActivationIssue} per issue so a coded structural failure
 * (e.g. an ingredient set mapping to a missing result group) surfaces localized,
 * id-free copy. Returns `null` for any error that is not a persistence error (no
 * `persistenceIssues`), so the caller can fall back to the error's own message.
 *
 * @param {unknown} error
 * @param {(key: string, data?: object) => string} [localizeFn]
 * @returns {string|null}
 */
export function localizeRecipePersistenceError(error, localizeFn) {
  const issues = Array.isArray(error?.persistenceIssues) ? error.persistenceIssues : null;
  if (!issues) return null;

  const detail = issues
    .map((issue) => localizeActivationIssue(issue, localizeFn))
    .filter(Boolean)
    .join(' ');
  const params = { errors: detail };
  const key = `${LANG_PREFIX}.CannotSave`;
  const localized = localizeFn?.(key, params);
  if (localized && localized !== key) return localized;
  return interpolate('This recipe could not be saved: {errors}', params);
}
