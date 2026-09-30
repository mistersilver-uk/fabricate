/**
 * The advantage offer (issue 2007): which of Advantage and Disadvantage a check offers, derived
 * once from its advantage rule, its evaluation and its post-shim authored formula. Every prompt
 * producer, every descriptor transport and the engine read this one derivation.
 */
import {
  findKeepGroup,
  stripRetiredModifierPlaceholder,
} from '../utils/craftingCheckExpression.js';
import { diceEngine, formulaRolls } from '../utils/rollFormulaRollability.js';

import { normalizeCheckAdvantage } from './normalize/checkAdvantage.js';

/** The prototype's bonus-die grammar: dice and numbers joined by ASCII `+` or `-`. */
const BONUS_GRAMMAR = /^[+-]?\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*$/i;
const KINDS = Object.freeze(['keep', 'bonus', 'count', 'mixed']);
const CHOICES = Object.freeze(['advantage', 'disadvantage']);

const noOffer = () => ({ advantage: false, disadvantage: false, kind: null, detail: null });

/** Whether `expression` is a bonus die the prompt can offer; empty text is not. */
export function isBonusExpression(expression) {
  return BONUS_GRAMMAR.test(String(expression ?? '').trim());
}

function bonusOffer(rule, evaluation, Roll) {
  if (!isBonusExpression(rule.bonusExpression)) return noOffer();
  const expression = rule.bonusExpression.trim().replace(/^\+\s*/, '');
  if (typeof Roll === 'function' && !formulaRolls(expression, Roll)) return noOffer();
  const destination = evaluation?.direction === 'under' ? 'target' : 'total';
  return {
    advantage: true,
    disadvantage: rule.offerDisadvantage,
    kind: 'bonus',
    detail: { expression, destination },
  };
}

/**
 * `{ advantage, disadvantage, kind, detail }` for a check: a count check offers `countDice` both
 * ways unless disabled, whatever its formula; a summed check offers by its mode, keep only when
 * `findKeepGroup` proves the first dice group. `Roll`, when injected, also proves a bonus rollable.
 */
export function resolveAdvantageOffer({ advantage, evaluation, authoredFormula, Roll } = {}) {
  const rule = normalizeCheckAdvantage(advantage);
  if (evaluation?.product === 'count') {
    if (!rule.countEnabled) return noOffer();
    return { advantage: true, disadvantage: true, kind: 'count', detail: { dice: rule.countDice } };
  }
  if (rule.mode === 'bonus') return bonusOffer(rule, evaluation, Roll);
  if (rule.mode !== 'keep' || !findKeepGroup(String(authoredFormula ?? '').trim()).ok) {
    return noOffer();
  }
  return { advantage: true, disadvantage: rule.offerDisadvantage, kind: 'keep', detail: null };
}

function sameDetail(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One offer for a batch: each button only when every offer includes it, and the shared `kind`
 * and `detail` only when every offer agrees on both, else `kind: 'mixed'` with no detail.
 */
export function intersectAdvantageOffers(offers) {
  const list = (Array.isArray(offers) ? offers : []).map(publicAdvantageOffer);
  if (list.length === 0 || list.some((offer) => !offer.advantage)) return noOffer();
  const [first] = list;
  const agreed = list.every(
    (offer) => offer.kind === first.kind && sameDetail(offer.detail, first.detail)
  );
  return {
    advantage: true,
    disadvantage: list.every((offer) => offer.disadvantage),
    kind: agreed ? first.kind : 'mixed',
    detail: agreed ? first.detail : null,
  };
}

function publicDetail(kind, detail) {
  if (kind === 'count' && Number.isInteger(detail?.dice)) return { dice: detail.dice };
  if (kind === 'bonus' && typeof detail?.expression === 'string') {
    const destination = detail.destination === 'target' ? 'target' : 'total';
    return { expression: detail.expression, destination };
  }
  return null;
}

/** The allowlisted copy every descriptor, prompt and prepared policy carries, never the rule. */
export function publicAdvantageOffer(offer) {
  if (offer?.advantage !== true) return noOffer();
  const kind = KINDS.includes(offer.kind) ? offer.kind : null;
  return {
    advantage: true,
    disadvantage: offer.disadvantage === true,
    kind,
    detail: publicDetail(kind, offer.detail),
  };
}

/** `choice` when `offer` includes it, else null, so an unoffered button rolls normally. */
export function offeredDecision(offer, choice) {
  return CHOICES.includes(choice) && offer?.[choice] === true ? choice : null;
}

/**
 * A descriptor's offer fields from a check sub-object: the boolean `allowAdvantage` every shape
 * keeps, and the offer, derived after the retirement shim with the dice engine injected.
 */
export function advantageOfferFields(config, evaluation, formula, Roll = diceEngine()) {
  const advantageOffer = resolveAdvantageOffer({
    advantage: config?.advantage,
    evaluation,
    authoredFormula: stripRetiredModifierPlaceholder(String(formula ?? ''), Roll),
    Roll,
  });
  return { allowAdvantage: advantageOffer.advantage, advantageOffer };
}
