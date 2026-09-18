/**
 * The ONE seam that turns a result's authored amount into the integer awarded (issue 1645).
 *
 * No `quantityFormula` (or whitespace) awards `quantity` and rolls nothing. Otherwise the
 * expression is rolled ONCE per result per award against the crafting character, floored, and
 * clamped at zero: a zero is an EMPTY AWARD, so no item is created and the award still states it.
 * `rolled` is `{ formula, total }` and nothing more, because run records persist it, and `total` is
 * the roll's own total rather than the clamped amount. The live `roll` comes back for the chat
 * message and is never persisted. `Roll` is injected and absent THROWS: silently awarding the
 * authored fallback where dice are unavailable is a wrong number, not a degraded one.
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

/** What an award reports about a rolled result: the roll as it fell, plus the integer awarded,
 *  which is `0` for an empty award. Carried beside the created items; never persisted. */
export const rolledAwardRecord = (result, rolled, quantity) => ({
  resultId: result?.id ?? null,
  componentId: result?.componentId ?? result?.systemItemId ?? null,
  formula: rolled.formula,
  total: rolled.total,
  quantity,
});
