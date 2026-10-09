/**
 * The hooks the result rows carried before they became `PickerRow` (issue 1516), by row face: the
 * recipe and gathering task rows at `3342471700b0`, and the salvage rows at `74502ace8`. Every
 * selector must still match the row or a node inside it on each surface that renders that face.
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
  salvageFlat: Object.freeze([
    '[data-salvage-result]',
    '[data-salvage-result-component]',
    '[data-salvage-result-quantity]',
    '[data-remove-salvage-result]',
  ]),
  salvageStage: Object.freeze([
    '[data-salvage-result][data-salvage-stage]',
    '[data-salvage-result-component]',
    '[data-salvage-result-difficulty]',
    '[data-salvage-result-edit]',
    '[data-remove-salvage-result]',
  ]),
});

/** The census selectors `row` no longer answers to, itself or through a descendant. */
export function missingCensusHooks(row, face) {
  return RESULT_ROW_CENSUS[face].filter(
    (selector) => !row.matches(selector) && !row.querySelector(selector)
  );
}
