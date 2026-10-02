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
 * The `)` index closing the innermost bracket around the dice term spanning `start`..`end`, when
 * that bracket's only content besides whitespace IS the term — the shape `(1d6)` the advantage or
 * disadvantage bonus die is appended in (issue 2141). A second operand, a function argument
 * (`min(1d4, 3)`), or flavour carried inside the same brackets (`(1d4[fire])`) makes the group
 * compound, and a compound group cannot be annotated faithfully, so this returns -1 for either.
 */
function loneBracketEnd(masked, start, end) {
  let balance = 0;
  let open = -1;
  for (let i = start - 1; i >= 0; i -= 1) {
    if (masked[i] === ')') balance += 1;
    else if (masked[i] === '(') {
      if (balance === 0) {
        open = i;
        break;
      }
      balance -= 1;
    }
  }
  if (open === -1 || !/^\s*$/.test(masked.slice(open + 1, start))) return -1;
  balance = 0;
  for (let i = end; i < masked.length; i += 1) {
    if (masked[i] === '(') balance += 1;
    else if (masked[i] === ')') {
      if (balance > 0) {
        balance -= 1;
      } else {
        return /^\s*$/.test(masked.slice(end, i)) ? i : -1;
      }
    }
  }
  return -1;
}

/**
 * The formula with each top-level dice term followed by its faces, `3d6 (2 + 4 + 3)`, in
 * `roll.dice` order, and a bracketed term that is the lone content of its brackets annotated the
 * same way after the closing bracket, `(1d6) (2)`. Flavour text is masked while terms are found,
 * so a die named inside one is never read as a term; any other term inside brackets (`min(1d4, 3)`,
 * `(1d4[fire])`) keeps its place in that order but is never annotated, so no face lands inside a
 * compound fragment.
 */
function withFaces(formula, dice) {
  const masked = formula.replaceAll(FLAVOUR, (flavour) => `[${' '.repeat(flavour.length - 2)}]`);
  let annotated = '';
  let cursor = 0;
  for (const [i, match] of [...masked.matchAll(DICE_TERM)].entries()) {
    const [term, count, faces] = match;
    const rolled = dice[i];
    const matches = rolled?.group === `${count || 1}d${faces}` && rolled.results.length > 0;
    if (!matches) continue;
    const termEnd = match.index + term.length;
    let end = termEnd;
    if (depthAt(masked, match.index) !== 0) {
      const close = loneBracketEnd(masked, match.index, termEnd);
      if (close === -1) continue;
      end = close + 1;
    }
    annotated += `${formula.slice(cursor, end)} (${rolled.results.join(' + ')})`;
    cursor = end;
  }
  return annotated + formula.slice(cursor);
}

/**
 * The formula's top-level operands as `{ start, end }` spans: split at a `+` or `-` outside brackets
 * and flavour that follows an operand, so a signed value (`+ -2`) stays one operand.
 */
function operandSpans(formula) {
  const spans = [];
  let depth = 0;
  let start = 0;
  let operand = false;
  // `matchAll` indexes in code units, as `slice` does, whatever a flavour spells.
  for (const { 0: character, index } of formula.matchAll(/./gsu)) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;
    if (depth === 0 && (character === '+' || character === '-') && operand) {
      spans.push({ start, end: index });
      start = index + 1;
      operand = false;
    } else if (!/\s/.test(character)) {
      operand = true;
    }
  }
  spans.push({ start, end: formula.length });
  return spans;
}

/** Whether a formula operand carries a flavour bracket, the mark of a composed modifier/tool term
 *  appended AFTER the typed formula resolves, never a typed operand itself. */
function isFlavouredOperand(operand) {
  return /\[[^\]]*\]/.test(operand);
}

/**
 * The resolved formula with each character value flavoured by its typed path, matched by position
 * (`1d20 + @abilities.int.mod` resolves `1d20 + 3`, which reads `3[@abilities.int.mod]`). Only a
 * typed operand that is exactly one path, resolved to a bare number, is named. Positional matching
 * is trusted only once trailing appended terms (flavoured modifier/tool operands) are set aside and
 * the remaining counts still line up; any other drift between the typed and resolved formulas (a
 * stripped placeholder, a path that resolves to more than one operand) mislabels nothing instead.
 */
function withPathNames(formula, typed) {
  if (!typed) return formula;
  const paths = operandSpans(typed).map(({ start, end }) => typed.slice(start, end).trim());
  const spans = operandSpans(formula);
  let matched = spans.length;
  while (
    matched > 0 &&
    isFlavouredOperand(formula.slice(spans[matched - 1].start, spans[matched - 1].end))
  ) {
    matched -= 1;
  }
  if (matched !== paths.length) return formula;
  let named = '';
  let cursor = 0;
  for (const [index, { start, end }] of spans.entries()) {
    const path = paths[index];
    const operand = formula.slice(start, end);
    if (!/^@[\w.]+$/.test(path ?? '') || !/^\s*-?\d+(?:\.\d+)?\s*$/.test(operand)) continue;
    const valueEnd = start + operand.trimEnd().length;
    named += `${formula.slice(cursor, valueEnd)}[${path}]`;
    cursor = valueEnd;
  }
  return named + formula.slice(cursor);
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

/** `1d20 (14) + 3 @abilities.int.mod + 7 modifiers = 24`, or `3d6 (2 + 4 + 3) = 9, compared as rolled` for roll-under. */
export function checkDiceLine(display, localize = (key) => key) {
  const evidence = display?.evidence;
  if (!evidence?.formula || display.evaluation?.product !== 'sum') return '';
  const key = display.evaluation.direction === 'under' ? KEYS.under : KEYS.line;
  return fill(localize(key) ?? key, {
    formula: withTermNames(
      withFaces(withPathNames(evidence.formula, evidence.rollFormula), evidence.dice ?? []),
      localize
    ),
    total: evidence.total,
  });
}
