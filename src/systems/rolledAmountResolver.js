/**
 * The one seam turning a result's authored amount into the integer awarded (issue 1645).
 * No `quantityFormula` (or whitespace) awards `quantity` and rolls nothing; otherwise the formula
 * is rolled once per result per award against the crafting character, floored and clamped at
 * zero, and a zero is an empty award: no item is created and the award still states it. `rolled`
 * is `{ formula, total }` only because run records persist it, and `total` is the roll's own
 * total, not the clamped amount; the live `roll` is for the chat message and never persisted.
 * An absent `Roll` throws: awarding the authored fallback without dice is a wrong number.
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
  const total = Number(roll?.total) || 0;
  return { amount: Math.max(0, Math.floor(total)), rolled: { formula, total }, roll };
}

/** A rolled result's award report plus the integer awarded (`0` if empty); never persisted. */
export const rolledAwardRecord = (result, rolled, quantity) => ({
  resultId: result?.id ?? null,
  componentId: result?.componentId ?? result?.systemItemId ?? null,
  formula: rolled.formula,
  total: rolled.total,
  quantity,
});
