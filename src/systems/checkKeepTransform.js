/**
 * The keep transform (issue 2007): on the CONSTRUCTED Roll, the authored first dice group `nDS`
 * rolls `extraDice` more dice and keeps `n`, the best in the check's direction, never by string
 * rewriting. `Die` is core's `foundry.dice.terms.Die`; without it nothing is transformed.
 */
import { findKeepGroup } from '../utils/craftingCheckExpression.js';

import { offeredDecision, resolveAdvantageOffer } from './checkAdvantage.js';
import { normalizeCheckAdvantage } from './normalize/checkAdvantage.js';

/** Keeping the lowest dice is the advantage when a sum must come in under its target. */
const KEEP_MODIFIERS = Object.freeze({
  over: Object.freeze({ advantage: 'kh', disadvantage: 'kl' }),
  under: Object.freeze({ advantage: 'kl', disadvantage: 'kh' }),
});

/** The keep modifier a choice takes in a direction, `kh`/`kl`, or null for any other choice. */
export function keepModifierFor(choice, direction) {
  const table = direction === 'under' ? KEEP_MODIFIERS.under : KEEP_MODIFIERS.over;
  return Object.hasOwn(table, choice) ? table[choice] : null;
}

/**
 * The keep a check's decision asks for under its advantage rule, or null: the check's one
 * advantage offer is a keep offer and includes the chosen button.
 */
export function planKeepTransform({ choice, evaluation, advantage, authoredFormula }) {
  const offer = resolveAdvantageOffer({ advantage, evaluation, authoredFormula });
  if (offer.kind !== 'keep' || offeredDecision(offer, choice) === null) return null;
  return {
    group: findKeepGroup(authoredFormula),
    keep: keepModifierFor(choice, evaluation?.direction),
    extraDice: normalizeCheckAdvantage(advantage).extraDice,
  };
}

const isOperator = (term, operator) => term?.operator === operator;

/** A `NumericTerm` above zero: a number that is neither a die nor an operator. */
const isPositiveNumeric = (term) =>
  typeof term?.number === 'number' && term.number > 0 && !('faces' in term) && !term.operator;

/** The term the proof names, or null when the constructed roll disagrees with it. */
export function locateKeepTerm(terms, index, group, Die) {
  const term = terms?.[index];
  if (!(term instanceof Die)) return null;
  const modifiers = term.constructor.MODIFIERS ?? {};
  if (!('kh' in modifiers) || !('kl' in modifiers)) return null;
  if (!Number.isInteger(term._number) || term._number < 1 || term._number !== group.number) {
    return null;
  }
  if (!Number.isInteger(term._faces) || term._faces < 2 || term._faces !== group.faces) return null;
  if (!Array.isArray(term.modifiers) || term.modifiers.length > 0) return null;
  if (index === 0) return term;
  const [before, operator] = [terms[index - 2], terms[index - 1]];
  return isOperator(operator, '+') || (isOperator(operator, '*') && isPositiveNumeric(before))
    ? term
    : null;
}

/** Where the group sits on the roll: 0, or past the prefix's own terms and the connecting operator. */
function keepTermIndex(prefix, Roll, rollData) {
  if (prefix === '') return 0;
  try {
    return new Roll(prefix, rollData).terms.length + 1;
  } catch {
    return -1;
  }
}

/** Keep on `roll` in place and re-cache its formula; false, with a warning, on any disagreement. */
export function applyKeepTransform(roll, plan, index, Die = globalThis.foundry?.dice?.terms?.Die) {
  if (typeof Die !== 'function') return false;
  const term = locateKeepTerm(roll?.terms, index, plan.group, Die);
  if (!term) {
    console.warn('Fabricate | Advantage left the roll unchanged: its first dice group disagrees', {
      formula: roll?.formula,
      index,
    });
    return false;
  }
  const { number } = plan.group;
  term.number = number + plan.extraDice;
  term.modifiers.push(`${plan.keep}${number}`);
  // Chat, `toJSON`, `Roll.fromData` and `clone` all read the cached `_formula`.
  roll.resetFormula();
  return true;
}

/**
 * Construct the check's main roll, keep-transform it when `plan` asks, then evaluate it without a
 * manual-fulfilment dialog. `kept` says whether the transform applied.
 */
export async function evaluateKeptRoll(formula, rollData, plan, Roll = globalThis.Roll) {
  const index = plan ? keepTermIndex(plan.group.prefix, Roll, rollData) : null;
  const constructed = new Roll(formula, rollData);
  const kept = plan ? applyKeepTransform(constructed, plan, index) : false;
  const roll = await constructed.evaluate({ allowInteractive: false });
  return { roll, kept };
}
