/** Localize recipe ACTIVATION (enable) validation errors for the UI (issue 550). */

const LANG_PREFIX = 'FABRICATE.Admin.Manager.RecipeActivation';

/** `code → [langKeySuffix, defaultEnglishTemplate]`. */
export const RECIPE_ACTIVATION_ISSUE_LABELS = Object.freeze({
  signatureCollision: [
    'IssueSignatureCollision',
    'Recipe "{recipeA}" (ingredient set {setA}) and recipe "{recipeB}" (ingredient set {setB}) can both be crafted from the same components ({components}), so alchemy cannot tell which one you are making.',
  ],
  // Structural / resolution-mode validation issues (issue 595).
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
  // Base structural-integrity issues from the recipe MODEL (issue 595).
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
  // Essence-reference issues from RecipeManager (issue 595).
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
  // ACTIVATION-only essence blocker (issue 1036).
  ingredientSetDisabledEssence: [
    'IssueIngredientSetDisabledEssence',
    'Ingredient set "{set}" requires essence "{essence}", which is disabled in this system',
  ],
  // Tag-placeholder issue from RecipeManager (issue 595).
  ingredientGroupUnknownTag: [
    'IssueIngredientGroupUnknownTag',
    'Ingredient group "{group}" references unknown tag "{tag}"',
  ],
});

/**
 * Substitute `{placeholder}` tokens in a template from `params`, leaving unknown tokens untouched.
 */
function interpolate(template, params = {}) {
  return String(template).replaceAll(/\{(\w+)\}/g, (match, key) =>
    params?.[key] == null ? match : String(params[key])
  );
}

/**
 * Build a coded, id-free structured issue for a registered activation/persistence `code` (issue
 * 595).
 */
export function buildRecipeActivationIssue(code, params = {}) {
  const meta = RECIPE_ACTIVATION_ISSUE_LABELS[code];
  const template = meta ? meta[1] : '';
  return { code, params, message: interpolate(template, params) };
}

/** Localize a single activation issue. */
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
 * Build the localized, id-free toast string for a {@link
 * module:systems/RecipeActivationError.RecipeActivationError}.
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

/** The SAME refusal, as the two parts a `<Notice>` draws (issue 1515). */
export function localizeRecipeActivationParts(error, localizeFn) {
  const issues = Array.isArray(error?.activationIssues) ? error.activationIssues : null;
  if (!issues) return null;

  const detail = issues
    .map((issue) => localizeActivationIssue(issue, localizeFn))
    .filter(Boolean)
    .join(' ');
  const params = { name: error?.recipeName || '' };
  const key = `${LANG_PREFIX}.CannotEnableTitle`;
  const localized = localizeFn?.(key, params);
  const title =
    localized && localized !== key
      ? localized
      : interpolate('Cannot enable recipe "{name}"', params);
  return { title, detail };
}

/**
 * Build the localized, id-free toast string for a {@link
 * module:systems/RecipePersistenceError.RecipePersistenceError} — a recipe SAVE (create/update)
 * that failed structural/reference validation (issue 595).
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
