/**
 * The roll prompt's additional-dice control (issue 2008): its resource and spend lines, its one
 * message, and the footer actions an unreachable attempt disables, judged live from the public
 * offer and the prompt's own settled pool. Pure; `labels` are the templates `rollPrompt.js` reads.
 */
import {
  additionalDiceRefusalKey,
  resolveAdditionalDiceReach,
} from '../../systems/additionalDiceReach.js';
import { fill } from '../../utils/fillPlaceholders.js';

const PLAIN_TERM = /^(?:(\d*)d(\d+)|(\d+))$/i;
const NO_RANGE = Object.freeze({ least: null, most: null });

/** The least and most dice a rolled contribution adds, read only from a plain sum of dice. */
export function pendingDiceRange(formula) {
  let least = 0;
  let most = 0;
  for (const term of String(formula ?? '').split('+')) {
    const [, count, faces, flat] = PLAIN_TERM.exec(term.trim()) ?? [];
    if (flat !== undefined) {
      least += Number(flat);
      most += Number(flat);
    } else if (Number(faces) >= 1) {
      const dice = count === '' ? 1 : Number(count);
      least += dice;
      most += dice * Number(faces);
    } else {
      return NO_RANGE;
    }
  }
  return { least, most };
}

/** Each offered footer action's own count advantage dice; the single Roll is judged as `normal`. */
export function actionDeltas(actions, advantageOffer) {
  const dice = advantageOffer?.kind === 'count' ? (advantageOffer.detail?.dice ?? 0) : 0;
  const sign = { disadvantage: -1, advantage: 1 };
  return Object.fromEntries(
    (actions ?? []).map(({ action }) => [
      action === 'roll' ? 'normal' : action,
      (sign[action] ?? 0) * dice,
    ])
  );
}

const COPY = Object.freeze([
  ['title', 'FABRICATE.App.RollPrompt.AdditionalDice.Title', 'Additional dice'],
  ['decrease', 'FABRICATE.App.RollPrompt.AdditionalDice.Decrease', 'Decrease additional dice'],
  ['increase', 'FABRICATE.App.RollPrompt.AdditionalDice.Increase', 'Increase additional dice'],
  [
    'available',
    'FABRICATE.App.RollPrompt.AdditionalDice.Available',
    '{resource} {available} available',
  ],
  [
    'availableUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.AvailableUnlabelled',
    '{available} available',
  ],
  ['unavailable', 'FABRICATE.App.RollPrompt.AdditionalDice.Unavailable', '{resource} unavailable'],
  [
    'unavailableUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnavailableUnlabelled',
    'Unavailable',
  ],
  ['spends', 'FABRICATE.App.RollPrompt.AdditionalDice.Spends', 'Spends {n} {resource}'],
  ['spendsUnlabelled', 'FABRICATE.App.RollPrompt.AdditionalDice.SpendsUnlabelled', 'Spends {n}'],
  [
    'unreachable',
    'FABRICATE.App.RollPrompt.AdditionalDice.Unreachable',
    'Cannot reach {needed} successes.',
  ],
  [
    'unreachableOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableOne',
    'Cannot reach 1 success.',
  ],
  [
    'unreachableMax',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableMax',
    '{pool} dice need at least {shortfall} more, and at most {max} can ever be added.',
  ],
  [
    'unreachableMaxOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableMaxOne',
    '1 die needs at least {shortfall} more, and at most {max} can ever be added.',
  ],
  [
    'unreachableAfford',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableAfford',
    '{pool} dice need at least {shortfall} more, and you can afford {limit}.',
  ],
  [
    'unreachableAffordOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableAffordOne',
    '1 die needs at least {shortfall} more, and you can afford {limit}.',
  ],
  [
    'unreachableFaces',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableFaces',
    'Cannot reach {needed} successes with these dice.',
  ],
  [
    'unreachableFacesOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreachableFacesOne',
    'Cannot reach 1 success with these dice.',
  ],
  [
    'enough',
    'FABRICATE.App.RollPrompt.AdditionalDice.Enough',
    'At least {shortfall} additional dice are needed. You have enough.',
  ],
  [
    'enoughOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.EnoughOne',
    'At least 1 additional die is needed. You have enough.',
  ],
  [
    'short',
    'FABRICATE.App.RollPrompt.AdditionalDice.Short',
    'At least {shortfall} additional dice needed to be able to succeed.',
  ],
  [
    'shortOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.ShortOne',
    'At least 1 additional die needed to be able to succeed.',
  ],
  [
    'shortExplode',
    'FABRICATE.App.RollPrompt.AdditionalDice.ShortExplode',
    'At least {shortfall} additional dice needed to succeed without exploding dice.',
  ],
  [
    'shortExplodeOne',
    'FABRICATE.App.RollPrompt.AdditionalDice.ShortExplodeOne',
    'At least 1 additional die needed to succeed without exploding dice.',
  ],
  [
    'unaffordable',
    'FABRICATE.App.RollPrompt.AdditionalDice.Unaffordable',
    'Not enough {resource} to buy a die.',
  ],
  [
    'unaffordableUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnaffordableUnlabelled',
    'Not enough to buy a die.',
  ],
  [
    'blockedAll',
    'FABRICATE.App.RollPrompt.AdditionalDice.BlockedAll',
    'Rolling is disabled: this attempt cannot reach the successes it needs.',
  ],
  [
    'blockedZeroPool',
    'FABRICATE.App.RollPrompt.AdditionalDice.BlockedZeroPool',
    'Rolling is disabled: the pool is reduced to zero, and the dice you can add cannot lift it.',
  ],
  [
    'blockedOnlyAdvantage',
    'FABRICATE.App.RollPrompt.AdditionalDice.BlockedOnlyAdvantage',
    'Only Advantage can reach the successes needed.',
  ],
  [
    'blockedDisadvantage',
    'FABRICATE.App.RollPrompt.AdditionalDice.BlockedDisadvantage',
    'Disadvantage cannot reach the successes needed.',
  ],
]);

/** The control's templates, read through `localize(key, fallback)`; filled once, by value. */
export function additionalDiceCopy(offer, localize) {
  const copy = Object.fromEntries(
    COPY.map(([name, key, fallback]) => [name, localize(key, fallback)])
  );
  const refusalKey = offer.unavailable
    ? additionalDiceRefusalKey(offer.unavailable, { label: offer.resourceLabel })
    : null;
  copy.unavailableMessage = refusalKey ? localize(refusalKey, refusalKey) : '';
  return copy;
}

function unreachableText(reach, judged, values, labels) {
  const one = (key, count) => labels[count === 1 ? `${key}One` : key];
  if (reach.perDieMost === 0 || judged.shortfall === null) {
    return fill(one('unreachableFaces', values.needed), values);
  }
  const reason = judged.shortfall > values.max ? 'unreachableMax' : 'unreachableAfford';
  return `${fill(one('unreachable', values.needed), values)} ${fill(one(reason, values.pool), values)}`;
}

function shortfallText(reach, shortfall, chosen, text) {
  const key = (name) => (shortfall === 1 ? `${name}One` : name);
  if (chosen >= shortfall) return { tone: 'success', text: text(key('enough')) };
  return { tone: 'warning', text: text(key(reach.explode === 'off' ? 'short' : 'shortExplode')) };
}

function messageOf({ offer, reach, judged, chosen, values, labels, text }) {
  if (offer.unavailable) return { tone: 'info', text: fill(labels.unavailableMessage, values) };
  if (reach && reach.needed !== null) {
    if (judged.unreachable) {
      return { tone: 'danger', text: unreachableText(reach, judged, values, labels) };
    }
    if (judged.shortfall > 0) return shortfallText(reach, judged.shortfall, chosen, text);
  }
  return offer.limit === 0 ? { tone: 'info', text: text('unaffordable') } : null;
}

function blockNoteOf(judged, labels) {
  const actions = Object.keys(judged);
  const disabled = actions.filter((action) => judged[action].blocked);
  if (disabled.length === 0) return '';
  if (disabled.length === actions.length) {
    return disabled.every((action) => judged[action].zeroPool)
      ? labels.blockedZeroPool
      : labels.blockedAll;
  }
  return judged.normal?.blocked ? labels.blockedOnlyAdvantage : labels.blockedDisadvantage;
}

/**
 * `{ resourceLine, spendLine, message, disabled, blocked, blockNote }` for one prompt: `pool` is the
 * settled pool before bought dice, `deltas` each action's advantage dice, `pending` the formulas
 * still to roll into the pool. Nothing blocks without a pool or a `reach` (ruling R3).
 */
export function describeAdditionalDice({
  offer,
  pool = null,
  deltas = { normal: 0 },
  pending = [],
  chosen = 0,
  labels,
  actorName = '',
}) {
  const reach = pool && offer.reach ? offer.reach : null;
  const unavailable = offer.unavailable !== null;
  const judgedAll = resolveAdditionalDiceReach({
    pool,
    reach,
    limit: unavailable ? 0 : offer.limit,
    pending: pending.map(pendingDiceRange),
    deltas,
  });
  const judged = judgedAll.normal;
  const values = {
    actor: actorName,
    resource: offer.resourceLabel,
    available: offer.available,
    n: unavailable ? 0 : chosen,
    limit: offer.limit,
    max: offer.max,
    needed: reach?.needed,
    pool: pool?.dice,
    shortfall: judged.shortfall,
  };
  const text = (key) =>
    fill(labels[offer.resourceLabel ? key : `${key}Unlabelled`] ?? labels[key], values);
  return {
    resourceLine: text(unavailable ? 'unavailable' : 'available'),
    spendLine: unavailable ? fill(labels.spendsUnlabelled, values) : text('spends'),
    message: messageOf({ offer, reach, judged, chosen, values, labels, text }),
    disabled: unavailable || offer.limit === 0,
    blocked: Object.fromEntries(
      ['disadvantage', 'normal', 'advantage'].map((action) => [
        action,
        judgedAll[action]?.blocked === true,
      ])
    ),
    blockNote: blockNoteOf(judgedAll, labels),
  };
}
