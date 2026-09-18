// Proof that a dice expression can be ROLLED, not merely parsed. `Roll.validate` skips every
// non-deterministic node — a parse oracle in an evaluation's clothes, and it passed 25 of 355
// shipped formulas that then threw — so the proof is a real `maximize: true` roll whose total must
// be finite, which also closes the `max(, 2)` empty-head trap. `Roll` is a PARAMETER used as a
// constructor, never a detached static; `globalThis` is read once, at `diceEngine`. `formulaRolls`
// FAILS OPEN with no dice engine — headless evaluates nothing either, and "unrollable" would paint
// an error over every formula. `maximisedTotal` answers that total rather than a verdict,
// neutralising every `@path` to `0` so an actor-free surface can judge a path-free one.

const ROLL_DATA_PATH = /@[\w.]+/g;

export const diceEngine = () => globalThis.Roll;

export function hasRollDataPath(formula) {
  const text = String(formula ?? '');
  return neutralised(text) !== text;
}

const neutralised = (text) => text.replaceAll(ROLL_DATA_PATH, '0');

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
    const roll = new Roll(neutralised(String(formula ?? '')));
    if (typeof roll?.evaluateSync !== 'function') return null;
    roll.evaluateSync({ maximize: true });
    return Number.isFinite(roll.total) ? roll.total : null;
  } catch {
    return null;
  }
}
