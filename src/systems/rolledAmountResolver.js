import { diceEngine } from '../utils/rollFormulaRollability.js';

/**
 * The one seam turning a result's authored amount into the integer awarded (issue 1645).
 * No `quantityFormula` (or whitespace) awards `quantity` and rolls nothing; otherwise the formula
 * is rolled once per result per award against the crafting character, floored and clamped at
 * zero, and a zero is an empty award: no item is created and the award still states it. `rolled`
 * is `{ formula, total }` only because run records persist it, and `total` is the roll's own
 * total, not the clamped amount; the live `roll` is for the chat message and never persisted.
 * An absent `Roll`, or a total that is not finite (a path resolving to a string, a division by a
 * zero-valued path), throws: the award is refused rather than given a wrong number.
 */
export async function resolveRolledAmount(
  { quantity, quantityFormula } = {},
  actor,
  { Roll } = {}
) {
  const formula = typeof quantityFormula === 'string' ? quantityFormula.trim() : '';
  if (formula === '') return { amount: quantity, rolled: null, roll: null };
  if (typeof Roll !== 'function') {
    throw new TypeError('Fabricate | A rolled result amount needs a Roll implementation');
  }
  const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate({
    allowInteractive: false,
  });
  const total = Number(roll?.total);
  if (!Number.isFinite(total)) {
    throw new RangeError(`Fabricate | The rolled amount "${formula}" totalled ${roll?.total}`);
  }
  return { amount: Math.max(0, Math.floor(total)), rolled: { formula, total }, roll };
}

/** Whether `formula` totals finitely against `rollData` with every die at its maximum and at its
 *  minimum; a throw (a path resolving to text) is not finite. */
function totalsFinitely(formula, Roll, rollData) {
  try {
    return [{ maximize: true }, { minimize: true }].every((extreme) =>
      Number.isFinite(Number(new Roll(formula, rollData).evaluateSync(extreme)?.total))
    );
  } catch {
    return false;
  }
}

/**
 * One refusal per result in `resultGroups` whose formula, read against the crafting character's
 * `rollData`, cannot total finitely, so a craft refuses before it consumes anything rather than
 * after (issue 1516). A divisor that crosses zero only inside its range still passes. No `Roll`
 * reports nothing, as `Result.validate` does.
 */
export function rolledAmountRefusals(resultGroups, Roll, rollData) {
  if (typeof Roll !== 'function') return [];
  const refusals = [];
  for (const result of (resultGroups ?? []).flatMap((group) => group?.results ?? [])) {
    const formula =
      typeof result?.quantityFormula === 'string' ? result.quantityFormula.trim() : '';
    if (formula !== '' && !totalsFinitely(formula, Roll, rollData)) {
      refusals.push(`Result amount "${formula}" cannot be rolled for this character`);
    }
  }
  return refusals;
}

/**
 * `recipe.validate({ Roll })`, then `rolledAmountRefusals` over every result group the recipe and
 * its steps author, against `actor`. A progressive award drops every formula
 * (`ResolutionModeService`), so neither reads one there.
 */
export function validateCraft(recipe, actor, modeService) {
  const Roll = diceEngine();
  const modes = modeService ?? globalThis.game?.fabricate?.getResolutionModeService?.();
  const progressive = modes?.getMode?.(recipe) === 'progressive';
  const validation = recipe.validate?.({ Roll, progressive }) ?? { valid: true, errors: [] };
  if (!validation.valid || progressive) return validation;
  const groups = new Set([
    ...(recipe.resultGroups ?? []),
    ...(recipe.steps ?? []).flatMap((step) => step?.resultGroups ?? []),
  ]);
  const errors = rolledAmountRefusals([...groups], Roll, actor?.getRollData?.() ?? {});
  return { valid: errors.length === 0, errors };
}

/** A rolled result's award report plus the integer awarded (`0` if empty); never persisted. */
export const rolledAwardRecord = (result, rolled, quantity) => ({
  resultId: result?.id ?? null,
  componentId: result?.componentId ?? result?.systemItemId ?? null,
  formula: rolled.formula,
  total: rolled.total,
  quantity,
});
