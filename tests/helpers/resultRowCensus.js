/**
 * The hooks the result rows carried at `3342471700b0` (issue 1516), the last commit before they
 * became `PickerRow`, by row face. Every selector must still match the row or a node inside it on
 * each surface that renders `RecipeResultGroupCard`.
 */
export const RESULT_ROW_CENSUS = Object.freeze({
  flat: Object.freeze([
    '[data-recipe-option]',
    '[data-recipe-result-item]',
    '[data-recipe-option-quantity]',
    '[data-recipe-remove="result-item"][data-keyboard-focus="true"]',
  ]),
  stage: Object.freeze([
    '[data-recipe-option]',
    '[data-recipe-result-item]',
    '.manager-recipe-stage-dc[data-recipe-result-difficulty]',
    '.manager-recipe-stage-edit[data-recipe-result-edit][data-keyboard-focus="true"]',
  ]),
});

/** The census selectors `row` no longer answers to, itself or through a descendant. */
export function missingCensusHooks(row, face) {
  return RESULT_ROW_CENSUS[face].filter(
    (selector) => !row.matches(selector) && !row.querySelector(selector)
  );
}
