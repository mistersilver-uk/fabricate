// Rollability, not parsability: `Roll.validate` skips every non-deterministic node, so the proof is
// a real `maximize: true` roll with a finite total, which also closes the `max(, 2)` empty-head
// trap. `Roll` is a parameter used as a constructor, read from `globalThis` once at `diceEngine`;
// `formulaRolls` fails open without one, and `maximisedTotal` rolls the formula verbatim, because
// `Roll.parse` already substitutes every reference core recognises with `0`.
// `evaluateSync` ignores dice modifiers (`4d6kh3` maximises to 24), so the total floors the `> 0`
// test rather than stating a maximum to anyone.

const ROLL_DATA_PATH = /@\{[-.\w]+\}|@[-.\w]+/g;

export const diceEngine = () => globalThis.Roll;

export function hasRollDataPath(formula) {
  // `match`, never `test`: the `g` flag makes `test` stateful in `lastIndex`.
  return String(formula ?? '').match(ROLL_DATA_PATH) !== null;
}

export function formulaRolls(formula, Roll = diceEngine()) {
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

export function maximisedTotal(formula, Roll = diceEngine()) {
  if (typeof Roll !== 'function') return null;
  try {
    const roll = new Roll(String(formula ?? ''));
    if (typeof roll?.evaluateSync !== 'function') return null;
    roll.evaluateSync({ maximize: true });
    return Number.isFinite(roll.total) ? roll.total : null;
  } catch {
    return null;
  }
}
