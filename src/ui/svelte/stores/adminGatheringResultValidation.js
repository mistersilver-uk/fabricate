/**
 * The gathering task editor's result-set validation (issue 2713), the blocking errors a straight or
 * routed task's Save and Validation tab read. A result id may not repeat within one task, as it may
 * not within a recipe scope, because the editor and the award path address a result by its id.
 */
import { Result } from '../../../models/Result.js';
import { diceEngine } from '../../../utils/rollFormulaRollability.js';

/** The error strings for a task's result groups, `requireResult` demanding one in every group. */
export function validateGatheringResultGroups(groups, label, { requireResult = false } = {}) {
  const list = Array.isArray(groups) ? groups : [];
  const errors = [];
  const seenIds = new Set();
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
      if (result?.id && seenIds.has(result.id)) {
        errors.push(`${resultLabel} repeats the id of an earlier result`);
      }
      seenIds.add(result?.id);
      const candidate = Result.fromJSON({ ...result, quantity: quantityValid ? quantity : 1 });
      for (const error of candidate.validate({ Roll: diceEngine() }).errors) {
        errors.push(`${resultLabel}: ${error}`);
      }
    }
  }
  return errors;
}
