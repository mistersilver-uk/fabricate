/**
 * The copy the Formula card's advantage block reads (issue 2007): the mode note, the disadvantage
 * hint, the bonus expression's help line and the counting hint, each from the normalized
 * `advantage` record, the check's direction and the authored formula. `text(key, fallback)` is the
 * caller's localizer.
 */
import { interpolate } from './checksCopy.js';

const PLAIN_GROUP = /^(\d*)d(\d+)(\[[^\]]*\])?$/i;
const POSITIVE_NUMBER = /^(\d+(\.\d+)?)$/;
const HAS_DIE = /d[\d@(fc]/i;
const OPENERS = '([{';
const CLOSERS = ')]}';

/** The prototype's bonus-die grammar: dice and numbers joined by ASCII `+` or `-`. */
const BONUS_GRAMMAR = /^[+-]?\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*$/i;

/** The formula's top-level terms, each with the operator before it (`null` for the first). */
function topLevelTerms(formula) {
  const terms = [];
  let depth = 0;
  let current = '';
  let operator = null;
  for (const char of formula) {
    if (OPENERS.includes(char)) depth += 1;
    if (CLOSERS.includes(char)) depth -= 1;
    if (depth === 0 && '+-*/'.includes(char)) {
      terms.push({ operator, text: current.trim() });
      operator = char;
      current = '';
    } else {
      current += char;
    }
  }
  terms.push({ operator, text: current.trim() });
  return terms;
}

const isPositiveNumber = (term) =>
  Boolean(term) && POSITIVE_NUMBER.test(term.text) && Number(term.text) > 0;

function additivePosition(terms, index) {
  const { operator } = terms[index];
  const before =
    operator === null ||
    operator === '+' ||
    (operator === '*' &&
      isPositiveNumber(terms[index - 1]) &&
      [null, '+'].includes(terms[index - 1].operator));
  const next = terms[index + 1];
  const after =
    !next ||
    ['+', '-'].includes(next.operator) ||
    (['*', '/'].includes(next.operator) && isPositiveNumber(next));
  return before && after;
}

/**
 * Stand-in for Task 3's `findKeepGroup` (issue 2007) until that predicate lands, then this call is
 * replaced by it: the formula's first top-level dice group as `{ ok, number, faces }`, `ok` only for
 * a plain `NdS` (N ≥ 1, S ≥ 2) in an additive position. A later group is never searched.
 */
export function provisionalKeepGroup(formula) {
  const terms = topLevelTerms(String(formula ?? ''));
  const index = terms.findIndex((term) => !term.text.startsWith('@') && HAS_DIE.test(term.text));
  const match = index === -1 ? null : PLAIN_GROUP.exec(terms[index].text);
  if (!match) return { ok: false };
  const number = match[1] === '' ? 1 : Number(match[1]);
  const faces = Number(match[2]);
  if (number < 1 || faces < 2 || !additivePosition(terms, index)) return { ok: false };
  return { ok: true, number, faces };
}

/** Whether `expression` is a bonus die the prompt can offer; empty text is not. */
export function isBonusExpression(expression) {
  return BONUS_GRAMMAR.test(String(expression ?? '').trim());
}

/** The expression as the notes name it: trimmed, a leading `+` dropped, parenthesised past one term. */
function namedExpression(expression, text) {
  const canonical = String(expression ?? '')
    .trim()
    .replace(/^\+\s*/, '');
  if (canonical === '') {
    return text('FABRICATE.Admin.Manager.Checks.Advantage.ExpressionFallback', 'the expression');
  }
  return topLevelTerms(canonical.replace(/^-/, '')).length > 1 ? `(${canonical})` : canonical;
}

/** `{ total, die, group, count }` for the keep notes and stepper, `count` empty for one die. */
export function keepWords(group, extraDice) {
  return {
    total: group.number + extraDice,
    die: `d${group.faces}`,
    group: `${group.number}d${group.faces}`,
    count: group.number > 1 ? `${group.number} ` : '',
  };
}

const SINGLE_ROLL = [
  'FABRICATE.Admin.Manager.Checks.Advantage.SingleRoll',
  'The prompt has a single Roll button.',
];

function keepNote(group, rule, under, text) {
  if (!group.ok) {
    return text(
      'FABRICATE.Admin.Manager.Checks.Advantage.KeepNoGroup',
      "The formula's first dice group is not a plain die, so the prompt has a single Roll button. Choose Bonus die, or start the formula with a plain die."
    );
  }
  const sentence = under
    ? text(
        'FABRICATE.Admin.Manager.Checks.Advantage.KeepNoteUnder',
        'Advantage rolls {total}{die} and keeps the {count}lowest. Applies to the first dice group, {group}.'
      )
    : text(
        'FABRICATE.Admin.Manager.Checks.Advantage.KeepNoteOver',
        'Advantage rolls {total}{die} and keeps the {count}highest. Applies to the first dice group, {group}.'
      );
  return interpolate(sentence, keepWords(group, rule.extraDice));
}

/** The one-line note under the mode control. */
export function advantageModeNote({ rule, group, under, text }) {
  if (rule.mode === 'off') return text(...SINGLE_ROLL);
  if (rule.mode === 'keep') return keepNote(group, rule, under, text);
  const sentence = under
    ? text(
        'FABRICATE.Admin.Manager.Checks.Advantage.BonusNoteUnder',
        'Advantage raises the target by {expr}. Use this when the formula has several dice groups or the system grants a fixed bonus.'
      )
    : text(
        'FABRICATE.Admin.Manager.Checks.Advantage.BonusNoteOver',
        'Advantage adds to the total by {expr}. Use this when the formula has several dice groups or the system grants a fixed bonus.'
      );
  return interpolate(sentence, { expr: namedExpression(rule.bonusExpression, text) });
}

/** The hint under "Also offer disadvantage". */
export function disadvantageHint({ rule, group, under, text }) {
  if (!rule.offerDisadvantage) {
    return text(
      'FABRICATE.Admin.Manager.Checks.Advantage.DisadvantageOff',
      'The prompt offers advantage only.'
    );
  }
  if (rule.mode === 'keep') {
    const sentence = under
      ? text(
          'FABRICATE.Admin.Manager.Checks.Advantage.DisadvantageKeepUnder',
          'Disadvantage rolls the same dice and keeps the {count}highest.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Advantage.DisadvantageKeepOver',
          'Disadvantage rolls the same dice and keeps the {count}lowest.'
        );
    return interpolate(sentence, { count: group.ok && group.number > 1 ? `${group.number} ` : '' });
  }
  const sentence = under
    ? text(
        'FABRICATE.Admin.Manager.Checks.Advantage.DisadvantageBonusUnder',
        'Disadvantage lowers the target by {expr}.'
      )
    : text(
        'FABRICATE.Admin.Manager.Checks.Advantage.DisadvantageBonusOver',
        'Disadvantage subtracts from the total by {expr}.'
      );
  return interpolate(sentence, { expr: namedExpression(rule.bonusExpression, text) });
}

/** The bonus field's help line as `{ text, invalid }`; empty and malformed text read as danger. */
export function bonusExpressionHelp(expression, text) {
  if (String(expression ?? '').trim() === '') {
    return {
      invalid: true,
      text: text(
        'FABRICATE.Admin.Manager.Checks.Advantage.BonusEmpty',
        'Enter a dice expression, such as 1d6, 2d4 or 1d8 + 1.'
      ),
    };
  }
  if (!isBonusExpression(expression)) {
    return {
      invalid: true,
      text: text(
        'FABRICATE.Admin.Manager.Checks.Advantage.BonusInvalid',
        'Not a dice expression. Use dice and numbers joined by + or −, such as 1d8 + 1.'
      ),
    };
  }
  return {
    invalid: false,
    text: text(
      'FABRICATE.Admin.Manager.Checks.Advantage.BonusHelp',
      'Any dice expression: 1d6, 2d4, 1d8 + 1.'
    ),
  };
}

/** The counting toggle's hint. */
export function countAdvantageHint(rule, text) {
  if (!rule.countEnabled) return text(...SINGLE_ROLL);
  const sentence =
    rule.countDice === 1
      ? text(
          'FABRICATE.Admin.Manager.Checks.Advantage.CountHintOne',
          'Advantage adds {n} die to the pool; disadvantage removes {n}.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Advantage.CountHintMany',
          'Advantage adds {n} dice to the pool; disadvantage removes {n}.'
        );
  return interpolate(sentence, { n: rule.countDice });
}

/** The keep stepper's parser: a typed `4d6` or `4` is the total rolled, returned as extra dice. */
export function parseKeepTotal(input, group) {
  const match = /^\s*(\d+)\s*(?:d\s*(\d+))?\s*$/i.exec(String(input ?? ''));
  if (!match || (match[2] !== undefined && Number(match[2]) !== group.faces)) return NaN;
  return Number(match[1]) - group.number;
}
