/**
 * The gathering task editor's result-set validation (issue 2713), the blocking errors a straight or
 * routed task's Save and Validation tab read. A result id may not repeat within one task, as it may
 * not within a recipe scope, because the editor and the award path address a result by its id.
 */
import { Result } from '../../../models/Result.js';
import { diceEngine } from '../../../utils/rollFormulaRollability.js';

/** One error per result whose id an earlier result in the task already holds. */
function duplicateResultErrors(groups, label) {
  const errors = [];
  const seen = new Set();
  for (const [groupIndex, group] of groups.entries()) {
    const groupLabel = String(group?.name || '').trim() || group?.id || groupIndex + 1;
    const results = Array.isArray(group?.results) ? group.results : [];
    for (const [resultIndex, result] of results.entries()) {
      const id = result?.id;
      if (!id) continue;
      if (seen.has(id)) {
        errors.push(
          `${label} result group "${groupLabel}" has a duplicate result "${resultIndex + 1}"`
        );
      }
      seen.add(id);
    }
  }
  return errors;
}

/** The error strings for a task's result groups, `requireResult` demanding one in every group. */
export function validateGatheringResultGroups(groups, label, { requireResult = false } = {}) {
  const list = Array.isArray(groups) ? groups : [];
  const errors = [];
  for (const [groupIndex, group] of list.entries()) {
    if (!group || typeof group !== 'object') {
      errors.push(`${label} result group ${groupIndex + 1} is invalid`);
      continue;
    }
    const groupLabel = String(group.name || '').trim() || group.id || groupIndex + 1;
    const results = Array.isArray(group.results) ? group.results : [];
    if (requireResult && results.length === 0) {
      errors.push(`${label} result group "${groupLabel}" requires at least one result`);
    }
    for (const [resultIndex, result] of results.entries()) {
      const resultLabel = `${label} result group "${groupLabel}" result ${resultIndex + 1}`;
      const quantity = result?.quantity;
      const quantityValid =
        typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
      if (!quantityValid) {
        errors.push(`${resultLabel} quantity must be a positive finite number`);
      }
      // `Result` owns the remaining field contract, and its legacy quantity default is applied
      // only after the raw check above so zero cannot become one; `Roll` is injected (issue 1645).
      const candidate = Result.fromJSON({ ...result, quantity: quantityValid ? quantity : 1 });
      for (const error of candidate.validate({ Roll: diceEngine() }).errors) {
        errors.push(`${resultLabel}: ${error}`);
      }
    }
  }
  errors.push(
    ...duplicateResultErrors(
      list.filter((group) => group && typeof group === 'object'),
      label
    )
  );
  return errors;
}
