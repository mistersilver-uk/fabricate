/**
 * Whether an authored dice expression can actually be ROLLED, proven by rolling it under
 * `maximize: true` and testing the total for finiteness. `Roll.validate` is NOT this test: it skips
 * every non-deterministic node, so it is a parse oracle wearing an evaluation's clothes and passed
 * 25 of 355 shipped formulas that then threw. `Roll` arrives as a PARAMETER and is used as a
 * constructor, never as a detached static. It FAILS OPEN with no dice engine, because headless
 * evaluates nothing either and answering "unrollable" would paint an error over every formula.
 */
export function formulaRolls(formula, Roll = globalThis.Roll) {
  if (typeof Roll !== 'function') return true;
  try {
    const roll = new Roll(String(formula ?? ''));
    if (typeof roll?.evaluateSync !== 'function') return true;
    roll.evaluateSync({ maximize: true });
    return Number.isFinite(roll.total);
  } catch {
    return false;
  }
}
