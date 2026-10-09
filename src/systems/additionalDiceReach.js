/**
 * The pure half of additional dice (issue 2008): the stored-resource read, the per-roll limit, the
 * reach facts and per-action judgement, the public offer and the refusal vocabulary. It runs no
 * macro and writes nothing, so the roll prompt imports it without the spend.
 */
import { countFacePredicates, settledPoolDice } from './countEvaluation.js';
import { countTriggerRescues } from './countTriggerReach.js';

/** Every reason a choice or spend of additional dice refuses; the first six make them unavailable. */
export const ADDITIONAL_DICE_REFUSALS = Object.freeze([
  'sourceMissing',
  'resourceUnreadable',
  'resourceOverridden',
  'resourceNotWritable',
  'resourceMacroFailed',
  'broadcastCallSite',
  'notOffered',
  'choiceInvalid',
  'choiceAboveLimit',
  'resourceChanged',
  'spendRefused',
  'spendUnconfirmed',
]);

export const ADDITIONAL_DICE_UNAVAILABLE = Object.freeze(ADDITIONAL_DICE_REFUSALS.slice(0, 6));

function keys(labelled, unlabelled = labelled) {
  return Object.freeze({ labelled, unlabelled });
}

/** Each refusal's message keys: `labelled` when the check names its resource. */
export const ADDITIONAL_DICE_REFUSAL_KEYS = Object.freeze({
  sourceMissing: keys('FABRICATE.Check.AdditionalDiceRefusal.SourceMissing'),
  resourceUnreadable: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceUnreadable',
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceUnreadableUnlabelled'
  ),
  resourceOverridden: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceOverridden',
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceOverriddenUnlabelled'
  ),
  resourceNotWritable: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceNotWritable',
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceNotWritableUnlabelled'
  ),
  resourceMacroFailed: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceMacroFailed',
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceMacroFailedUnlabelled'
  ),
  broadcastCallSite: keys('FABRICATE.Check.AdditionalDiceRefusal.BroadcastCallSite'),
  notOffered: keys('FABRICATE.Check.AdditionalDiceRefusal.NotOffered'),
  choiceInvalid: keys('FABRICATE.Check.AdditionalDiceRefusal.ChoiceInvalid'),
  choiceAboveLimit: keys('FABRICATE.Check.AdditionalDiceRefusal.ChoiceAboveLimit'),
  resourceChanged: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceChanged',
    'FABRICATE.Check.AdditionalDiceRefusal.ResourceChangedUnlabelled'
  ),
  spendRefused: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.SpendRefused',
    'FABRICATE.Check.AdditionalDiceRefusal.SpendRefusedUnlabelled'
  ),
  spendUnconfirmed: keys(
    'FABRICATE.Check.AdditionalDiceRefusal.SpendUnconfirmed',
    'FABRICATE.Check.AdditionalDiceRefusal.SpendUnconfirmedUnlabelled'
  ),
});

const MACRO_SPEND_REFUSED = keys(
  'FABRICATE.Check.AdditionalDiceRefusal.SpendRefusedMacro',
  'FABRICATE.Check.AdditionalDiceRefusal.SpendRefusedMacroUnlabelled'
);

/** The message key for `reason`, by whether the resource is named and which source pays. */
export function additionalDiceRefusalKey(reason, { label = '', source = 'path' } = {}) {
  const entry =
    reason === 'spendRefused' && source === 'macro'
      ? MACRO_SPEND_REFUSED
      : Object.hasOwn(ADDITIONAL_DICE_REFUSAL_KEYS, reason) && ADDITIONAL_DICE_REFUSAL_KEYS[reason];
  if (!entry) return null;
  return typeof label === 'string' && label.trim() ? entry.labelled : entry.unlabelled;
}

/** A read amount: a finite number of 0 or more, floored, else null (a numeric string included). */
export function spendableAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** The stored value at `path` on `actor`, never prepared data, and whether an effect overrides it. */
export function readStoredResource(actor, path) {
  const key = typeof path === 'string' ? path.trim() : '';
  if (!actor || !key) return { value: undefined, overridden: false };
  return {
    value: foundry.utils.getProperty(actor._source ?? {}, key),
    overridden: foundry.utils.hasProperty(actor.overrides ?? {}, key),
  };
}

/** The most dice each of `rolls` rolls may buy: `min(max, floor(available / rolls))`. */
export function boundAdditionalDice({ max, available, rolls = 1 }) {
  const each = Number.isInteger(rolls) && rolls >= 1 ? rolls : 1;
  const most = Number.isInteger(max) && max > 0 ? max : 0;
  const amount = spendableAmount(available) ?? 0;
  return Math.min(most, Math.floor(amount / each));
}

/**
 * The most one original die can contribute (`perDieMost`, null when unbounded) and how it explodes:
 * 0 when no face qualifies without cancelling, 2 when an exploding face also does once.
 */
function perDieReach(policy) {
  const { qualifies, explodes, cancels } = countFacePredicates(policy);
  const faces = Array.from({ length: Math.max(0, policy.die) }, (_, index) => index + 1);
  const scoring = faces.filter((face) => qualifies(face) && !cancels(face));
  const exploding = faces.filter((face) => explodes(face));
  if (exploding.length === 0) return { perDieMost: scoring.length > 0 ? 1 : 0, explode: 'off' };
  const explode = policy.explode.once ? 'once' : 'recursive';
  if (scoring.length === 0) return { perDieMost: 0, explode };
  if (exploding.every((face) => !scoring.includes(face))) return { perDieMost: 1, explode };
  return { perDieMost: explode === 'once' ? 2 : null, explode };
}

/**
 * An offer's `reach` from the settled `policy`: the `needed` count (null when the prompt may not
 * judge it), the per-die most and whether a trigger can rescue an unreachable attempt.
 */
export function buildAdditionalDiceReach({ policy, needed = null, triggers, evaluation, routed }) {
  return {
    needed: Number.isFinite(needed) && needed >= 0 ? needed : null,
    ...perDieReach(policy),
    rescued: countTriggerRescues({ triggers, evaluation, routed }),
  };
}

const NOT_JUDGED = Object.freeze({
  shortfall: null,
  unreachable: false,
  zeroPool: false,
  blocked: false,
});

function pendingTotal(pending, bound) {
  let total = 0;
  for (const entry of pending) {
    if (!Number.isFinite(entry?.[bound])) return null;
    total += entry[bound];
  }
  return total;
}

function neededOutOfReach({ needed, perDieMost, explode }, dice) {
  if (!Number.isFinite(needed) || needed <= 0 || explode === 'recursive') return false;
  return Number.isFinite(perDieMost) && dice * perDieMost < needed;
}

/** The fewest bought dice whose settled pool is no zero pool and holds `needed` dice, else null. */
function shortfallOf({ needed, perDieMost }, settleWith) {
  if (!Number.isFinite(needed) || (needed > 0 && perDieMost === 0)) return null;
  const meets = (bought) => {
    const settled = settleWith(bought);
    return !settled.zeroPool && settled.dice >= needed;
  };
  const { floored } = settleWith(0);
  if (!Number.isFinite(floored)) return null;
  let high = Math.max(0, Math.max(needed, 1) - floored);
  while (!meets(high)) high += 1;
  let low = 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (meets(middle)) high = middle;
    else low = middle + 1;
  }
  return high;
}

function judgeAttempt({ base, poolDelta = 0, zeroPoolFails }, reach, { delta, limit, pending }) {
  const settleWith = (extra) =>
    settledPoolDice(base, poolDelta + delta + extra, zeroPoolFails !== false);
  const most = pendingTotal(pending, 'most');
  const least = pendingTotal(pending, 'least');
  const best = most === null ? null : settleWith(most + limit);
  const zeroPool = best?.zeroPool === true;
  const unreachable = best !== null && (zeroPool || neededOutOfReach(reach, best.dice));
  return {
    shortfall: least === null ? null : shortfallOf(reach, (bought) => settleWith(least + bought)),
    unreachable,
    zeroPool,
    blocked: unreachable && (zeroPool || reach.rescued !== true),
  };
}

/**
 * Judges each footer action as its own attempt (rulings R1, R3, R4). `pool` is `{ base, poolDelta,
 * zeroPoolFails }` before bought dice, `deltas` maps an action to the dice it adds, and `pending`
 * lists rolled contributions as `{ least, most }` pool dice. A null `reach` judges nothing.
 */
export function resolveAdditionalDiceReach({
  pool,
  reach,
  limit = 0,
  pending = [],
  deltas = { normal: 0 },
}) {
  const judged = {};
  for (const [action, delta] of Object.entries(deltas)) {
    judged[action] = reach ? judgeAttempt(pool, reach, { delta, limit, pending }) : NOT_JUDGED;
  }
  return judged;
}

const EXPLODE_MODES = new Set(['off', 'once', 'recursive']);
const wholeCount = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);

function publicReach(reach) {
  if (!reach || typeof reach !== 'object') return null;
  return {
    needed: Number.isFinite(reach.needed) && reach.needed >= 0 ? reach.needed : null,
    perDieMost: [0, 1, 2].includes(reach.perDieMost) ? reach.perDieMost : null,
    explode: EXPLODE_MODES.has(reach.explode) ? reach.explode : 'off',
    rescued: reach.rescued === true,
  };
}

/** The offer a prompt may carry, allowlisted: never a path or macro UUID; null without an offer. */
export function publicAdditionalDiceOffer(offer) {
  if (!offer || typeof offer !== 'object') return null;
  return {
    available: wholeCount(offer.available),
    limit: wholeCount(offer.limit),
    max: wholeCount(offer.max),
    resourceLabel: typeof offer.resourceLabel === 'string' ? offer.resourceLabel.trim() : '',
    unavailable: ADDITIONAL_DICE_UNAVAILABLE.includes(offer.unavailable) ? offer.unavailable : null,
    reach: publicReach(offer.reach),
  };
}
