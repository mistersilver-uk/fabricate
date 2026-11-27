/**
 * The words a refused Iterative Attempt reads (issue 3011, D-14). The reply's own `message` wins,
 * then a line interpolated from its `detail` and the pressed card, then C4's mapped sentence. A
 * counter this viewer may not see is never named, so such a refusal falls back to the mapped line.
 */
import { journalRefusalMessage } from '../../svelte/util/journalRunReasons.js';
import { journalCommandRefusal, spentDiceNotice } from '../additionalDicePrompt.js';

const K = Object.freeze({
  unknownCounter: 'FABRICATE.App.Journal.Iterative.Refusal.UnknownCounter',
  expressionInvalid: 'FABRICATE.App.Journal.Iterative.Refusal.ExpressionInvalid',
  costUnaffordable: 'FABRICATE.App.Journal.Iterative.Refusal.CostUnaffordable',
  actionUnavailable: 'FABRICATE.App.Journal.Iterative.Refusal.ActionUnavailable',
  effectDice: 'FABRICATE.App.Journal.Iterative.Refusal.EffectDice',
  unspent: 'FABRICATE.App.Journal.Iterative.Refusal.Unspent',
});

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** A counter's name when the viewer may see it, else `null`. */
const nameOf = (counters, id) => (typeof id === 'string' ? (counters?.[id] ?? null) : null);

/** The line each interpolated reason reads, or `null` when its facts are hidden or missing. */
const LINES = Object.freeze({
  'unknown-counter': ({ detail, counters, localize }) => {
    const counter = nameOf(counters, detail.counterId);
    return counter && localize(K.unknownCounter, { counter });
  },
  'expression-invalid': ({ detail, card, counters, localize }) => {
    if (!card || card.effectIds?.includes(detail.entryId)) return null;
    const counter = nameOf(counters, card.costEntries?.[detail.entryId]);
    return counter && localize(K.expressionInvalid, { counter });
  },
  'cost-unaffordable': ({ detail, counters, localize }) => {
    const counter = nameOf(counters, detail.counterId);
    if (!counter || !Number.isFinite(detail.amount) || !Number.isFinite(detail.value)) return null;
    return localize(K.costUnaffordable, { amount: detail.amount, counter, value: detail.value });
  },
  'action-unavailable': ({ card, localize }) =>
    clean(card?.requirements) && localize(K.actionUnavailable, { requirements: card.requirements }),
  'roll-unavailable': ({ detail, localize }) =>
    typeof detail.entryId === 'string' && detail.entryId !== '' ? localize(K.effectDice) : null,
});

function lineFor(result, context) {
  const make = LINES[result?.reason];
  return make ? make({ ...context, detail: result.detail ?? {} }) || null : null;
}

/** `sentence` without the trailing "Nothing was spent and the session wasn’t counted." */
function withoutUnspent(sentence, localize) {
  const clause = clean(localize(K.unspent));
  return clause && sentence.endsWith(clause) ? sentence.slice(0, -clause.length).trim() : sentence;
}

/**
 * The one sentence a refused `takeAction` reply reads. `card` is the pressed card (its
 * `requirements`, `costEntries` and `effectIds`), `counters` the viewer's `{ counterId: label }`,
 * and `generic` the caller's fallback. Bought dice are never refunded, so a refusal after a buy
 * drops the unspent clause and states the spend instead.
 */
export function iterativeRefusalCopy(result, { card = null, counters = {}, localize, generic }) {
  if (result?.secret === true) {
    return journalRefusalMessage({ reason: 'operation-failed' }, localize, generic);
  }
  const bought = result?.boughtDice > 0;
  let sentence;
  if (result?.additionalDiceRefusal) {
    sentence = journalCommandRefusal(result, localize, generic);
  } else if (clean(result?.message)) {
    sentence = clean(result.message);
  } else {
    const line = lineFor(result, { card, counters, localize });
    sentence = line
      ? [line, bought ? '' : clean(localize(K.unspent))].filter(Boolean).join(' ')
      : journalRefusalMessage(result, localize, generic);
  }
  if (!bought) return sentence;
  return [withoutUnspent(sentence, localize), spentDiceNotice(result, localize)]
    .filter(Boolean)
    .join(' ');
}
