/**
 * A result chat card's dice line (issue 2005, frames 37 and 38): the executed formula with each
 * die's kept faces, then its total, and for a roll-under check that the dice were compared as
 * rolled. Read from the display projection only; '' when the record kept no formula.
 */
import { fill } from '../../utils/fillPlaceholders.js';

const KEYS = Object.freeze({
  line: 'FABRICATE.Check.Evidence.DiceLine',
  under: 'FABRICATE.Check.Evidence.DiceLineUnder',
});

/** A dice term and any modifiers it carries (`2d20kh1`), in formula order. */
const DICE_TERM = /(\d*)d(\d+)((?:[a-z]+\d*)*)/gi;

/** The formula with each dice term followed by its faces, `3d6 (2 + 4 + 3)`, in `roll.dice` order. */
function withFaces(formula, dice) {
  let index = 0;
  return formula.replaceAll(DICE_TERM, (term, count, faces) => {
    const rolled = dice[index];
    index += 1;
    const matches = rolled?.group === `${count || 1}d${faces}` && rolled.results.length > 0;
    return matches ? `${term} (${rolled.results.join(' + ')})` : term;
  });
}

/** `1d20 (14) + 3 + 7 = 24`, or `3d6 (2 + 4 + 3) = 9, compared as rolled` for roll-under. */
export function checkDiceLine(display, localize = (key) => key) {
  const evidence = display?.evidence;
  if (!evidence?.formula || display.evaluation?.product !== 'sum') return '';
  const key = display.evaluation.direction === 'under' ? KEYS.under : KEYS.line;
  return fill(localize(key) ?? key, {
    formula: withFaces(evidence.formula, evidence.dice ?? []),
    total: evidence.total,
  });
}
