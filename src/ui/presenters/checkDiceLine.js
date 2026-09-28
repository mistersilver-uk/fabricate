/**
 * A result chat card's dice line (issue 2005, frames 37 and 38): the executed formula with each
 * die's kept faces, then its total, and for a roll-under check that the dice were compared as
 * rolled. Read from the display projection only; '' when the record kept no formula.
 */
import { fill } from '../../utils/fillPlaceholders.js';

const KEYS = Object.freeze({
  line: 'FABRICATE.Check.Evidence.DiceLine',
  under: 'FABRICATE.Check.Evidence.DiceLineUnder',
  modifiers: 'FABRICATE.Check.Evidence.DiceModifiers',
});

/** The fixed ASCII flavour every check-modifier term carries (`toolCheckBonus.js`). */
const MODIFIER_FLAVOUR = 'Modifiers';

/** A term's roll flavour, `7[Modifiers]` or `2[Smith's Hammer]`, which the line names in words. */
const FLAVOUR = /\[([^\]]*)\]/g;

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
 * The formula with each top-level dice term followed by its faces, `3d6 (2 + 4 + 3)`, in
 * `roll.dice` order. Flavour text is masked while terms are found, so a die named inside one is
 * never read as a term; a term inside brackets (`min(1d4, 3)`, `(1d4)`) keeps its place in that
 * order but is never annotated, so no face lands inside a fragment.
 */
function withFaces(formula, dice) {
  const masked = formula.replaceAll(FLAVOUR, (flavour) => `[${' '.repeat(flavour.length - 2)}]`);
  let annotated = '';
  let cursor = 0;
  [...masked.matchAll(DICE_TERM)].forEach(({ 0: term, 1: count, 2: faces, index: offset }, i) => {
    const rolled = dice[i];
    const matches = rolled?.group === `${count || 1}d${faces}` && rolled.results.length > 0;
    if (!matches || depthAt(masked, offset) !== 0) return;
    const end = offset + term.length;
    annotated += `${formula.slice(cursor, end)} (${rolled.results.join(' + ')})`;
    cursor = end;
  });
  return annotated + formula.slice(cursor);
}

/** Each flavoured term named in words, as frame 37 names them: `7[Modifiers]` reads `7 modifiers`. */
function withTermNames(formula, localize) {
  const modifiers = localize(KEYS.modifiers) ?? KEYS.modifiers;
  return formula.replaceAll(FLAVOUR, (flavour, label) => {
    const name = label.trim();
    if (!name) return '';
    return ` ${name === MODIFIER_FLAVOUR ? modifiers : name}`;
  });
}

/** `1d20 (14) + 3 + 7 modifiers = 24`, or `3d6 (2 + 4 + 3) = 9, compared as rolled` for roll-under. */
export function checkDiceLine(display, localize = (key) => key) {
  const evidence = display?.evidence;
  if (!evidence?.formula || display.evaluation?.product !== 'sum') return '';
  const key = display.evaluation.direction === 'under' ? KEYS.under : KEYS.line;
  return fill(localize(key) ?? key, {
    formula: withTermNames(withFaces(evidence.formula, evidence.dice ?? []), localize),
    total: evidence.total,
  });
}
