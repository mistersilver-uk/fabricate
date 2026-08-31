/**
 * Whether an authored dice expression can actually be ROLLED, proven by rolling it.
 *
 * ## `Roll.validate` IS NOT THIS TEST
 *
 * `validate` is `evaluateSync({ strict: false })`, and `Roll#_evaluateASTSync` SKIPS every
 * non-deterministic node — so on a formula that rolls dice, which is every formula a GM authors
 * here, the dice-bearing subtree is never evaluated and no evaluate-time error class is exercised
 * at all. It is a PARSE oracle wearing an evaluation's clothes. Measured against the shipped
 * 14.365 stack over 355 emitted formulas, 25 validated `true` and then threw:
 *
 * | authored            | what `evaluate()` says                                            |
 * |---------------------|-------------------------------------------------------------------|
 * | `MAX(1d4, 2)`       | `The function "MAX" is not registered in CONFIG.Dice.functions`    |
 * | `1000d6`            | `You may not evaluate a DiceTerm with more than 999 results`       |
 * | `1d4 + .5`          | `Unresolved StringTerm .5` (`Constant` needs a leading digit)      |
 *
 * `maximize: true` is what makes the proof total: it renders every term deterministic, so
 * `_evaluateASTSync` skips NOTHING and every node is really evaluated. The finite test on the
 * total is required rather than decorative — `Roll#total` is `Number(this._total) || 0`, which
 * passes `-Infinity` through as a number, and `max(, 2)` is exactly that shape. So this predicate
 * closes the empty-head trap BY CONSTRUCTION rather than by argument.
 *
 * ## The class is a PARAMETER, and it is never detached
 *
 * `Roll` arrives as an argument (defaulting to the global) and is used as a CONSTRUCTOR, so no
 * static is ever pulled off the class and called unbound — a detached `Roll.validate` answers
 * `false` for every formula, because it loses the `this` its own parser walk needs.
 *
 * ## It FAILS OPEN when there is no dice engine
 *
 * Headless — unit tests, the View Lab, a manager mounted with no Foundry — has no `Roll` at all.
 * Nothing there evaluates the formula either, so answering "unrollable" would paint an authoring
 * error over every formula a GM has ever written. This matches `stripRetiredModifierPlaceholder`
 * and `checkModifierResolver`'s own rolling-fragment guard.
 *
 * Measured at 0.03-0.5 ms per formula on the real stack, exploding and reroll pools included.
 *
 * @param {unknown} formula The authored expression.
 * @param {typeof globalThis.Roll} [Roll] The dice class; defaults to the global.
 * @returns {boolean}
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
