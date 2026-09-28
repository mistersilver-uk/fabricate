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

/** How deep in brackets `offset` sits: a function's arguments and a parenthesised fragment count. */
function depthAt(formula, offset) {
  let depth = 0;
  for (const character of formula.slice(0, offset)) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
  }
  return depth;
}

/**
 * The formula, without its `[flavor]` tags, with each top-level dice term followed by its faces,
 * `3d6 (2 + 4 + 3)`, in `roll.dice` order. A term inside brackets (`min(1d4, 3)`, `(1d4)`) keeps
 * its place in that order but is never annotated, so no face lands inside a fragment.
 */
function withFaces(formula, dice) {
  const bare = formula.replaceAll(/\[[^\]]*\]/g, '');
  let index = 0;
  return bare.replaceAll(DICE_TERM, (term, count, faces, _modifiers, offset) => {
    const rolled = dice[index];
    index += 1;
    if (depthAt(bare, offset) !== 0) return term;
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
