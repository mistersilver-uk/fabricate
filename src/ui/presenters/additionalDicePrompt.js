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
import { localizeWith } from '../../utils/localizeWithFallback.js';
import { journalRefusalMessage } from '../svelte/util/journalRunReasons.js';

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
  [
    'unreadable',
    'FABRICATE.App.RollPrompt.AdditionalDice.Unreadable',
    '{actor} has no {resource} value',
  ],
  [
    'unreadableUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.UnreadableUnlabelled',
    '{actor} has no value to spend',
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
  [
    'spendsAcross',
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.Spends',
    'Spends {total} {resource} across {rolls} rolls ({n} each)',
  ],
  [
    'spendsAcrossUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.SpendsUnlabelled',
    'Spends {total} across {rolls} rolls ({n} each)',
  ],
  [
    'unaffordableEvery',
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.Unaffordable',
    'Not enough {resource} to buy a die for every roll.',
  ],
  [
    'unaffordableEveryUnlabelled',
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.UnaffordableUnlabelled',
    'Not enough to buy a die for every roll.',
  ],
  [
    'blockedNone',
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.BlockedAll',
    'Rolling is disabled: none of these rolls can reach the successes they need.',
  ],
  ['cannotReach', 'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.CannotReach', 'cannot reach'],
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

function messageOf({ offer, reach, judged, chosen, values, labels, text, rolls }) {
  if (offer.unavailable) return { tone: 'info', text: fill(labels.unavailableMessage, values) };
  if (reach && reach.needed !== null) {
    if (judged.unreachable) {
      return { tone: 'danger', text: unreachableText(reach, judged, values, labels) };
    }
    if (judged.shortfall > 0) return shortfallText(reach, judged.shortfall, chosen, text);
  }
  if (offer.limit !== 0) return null;
  return { tone: 'info', text: text(rolls > 1 ? 'unaffordableEvery' : 'unaffordable') };
}

/** The resource line's key: frame 34's copy for an unreadable value, else the reason-free one. */
function resourceKey({ unavailable }) {
  if (unavailable === 'resourceUnreadable') return 'unreadable';
  return unavailable ? 'unavailable' : 'available';
}

function blockNoteOf(judged, labels, rolls) {
  const actions = Object.keys(judged);
  const disabled = actions.filter((action) => judged[action].blocked);
  if (disabled.length === 0) return '';
  if (disabled.length === actions.length) {
    if (rolls > 1) return labels.blockedNone;
    return disabled.every((action) => judged[action].zeroPool)
      ? labels.blockedZeroPool
      : labels.blockedAll;
  }
  return judged.normal?.blocked ? labels.blockedOnlyAdvantage : labels.blockedDisadvantage;
}

/** A typed batch bonus: the dice a number adds now, and a formula still to roll, else null. */
function typedBonus(bonus) {
  const typed = String(bonus ?? '')
    .replace(/^\s*\+/, '')
    .trim();
  const flat = typed !== '' && Number.isFinite(Number(typed));
  return { flat: flat ? Number(typed) : 0, formula: flat || typed === '' ? null : typed };
}

/** One batch row judged as its own prompt would judge it; null for a row nothing can judge. */
function judgeRow(row, { limit, deltas, bonus }) {
  const { countDice, reach } = row?.additionalDice ?? {};
  if (!countDice || !reach) return null;
  const adds = countDice.destination === 'pool' && row.offerSituationalBonus !== false;
  return resolveAdditionalDiceReach({
    pool: { ...countDice, poolDelta: countDice.poolDelta + (adds ? bonus.flat : 0) },
    reach,
    limit,
    pending: adds && bonus.formula ? [pendingDiceRange(bonus.formula)] : [],
    deltas,
  });
}

/**
 * A batch judged per action across the rows that roll (driver decision D3): an action is disabled
 * only when every such row is disabled under it, and a row no offered action can reach is marked
 * when it has a needed count to state. A row nothing can judge keeps every action enabled.
 */
function judgeBatch(rows, options) {
  const judged = rows.map((row) =>
    row?.need?.kind === 'noCheck' ? undefined : judgeRow(row, options)
  );
  const covered = judged.filter((entry) => entry !== undefined);
  const actions = Object.keys(options.deltas);
  const blocked = (entry, action) => entry?.[action]?.blocked === true;
  const disabled = (action) =>
    covered.length > 0 && covered.every((entry) => blocked(entry, action));
  return {
    actions: Object.fromEntries(
      actions.map((action) => [action, { blocked: disabled(action), zeroPool: false }])
    ),
    unreachable: rows.map(
      (row, index) =>
        Number.isFinite(row?.additionalDice?.reach?.needed) &&
        actions.every((action) => blocked(judged[index], action))
    ),
  };
}

/**
 * `{ resourceLine, spendLine, message, disabled, blocked, blockNote, unreachableRows }` for one
 * prompt: `pool` is the settled pool before bought dice, `deltas` each action's advantage dice,
 * `pending` the formulas still to roll into the pool. Nothing blocks without a pool or a `reach`
 * (ruling R3). A bulk prompt passes its `rows` and typed `bonus` instead, and the `rolls` one
 * choice covers.
 */
export function describeAdditionalDice({
  offer,
  pool = null,
  deltas = { normal: 0 },
  pending = [],
  chosen = 0,
  labels,
  actorName = '',
  rolls = 1,
  rows = null,
  bonus = '',
}) {
  const reach = !rows && pool && offer.reach ? offer.reach : null;
  const unavailable = offer.unavailable !== null;
  const limit = unavailable ? 0 : offer.limit;
  const batch = rows && judgeBatch(rows, { limit, deltas, bonus: typedBonus(bonus) });
  const judgedAll =
    batch?.actions ??
    resolveAdditionalDiceReach({
      pool,
      reach,
      limit,
      pending: pending.map(pendingDiceRange),
      deltas,
    });
  const judged = judgedAll.normal;
  const n = unavailable ? 0 : chosen;
  const values = {
    actor: actorName,
    resource: offer.resourceLabel,
    available: offer.available,
    n,
    total: n * rolls,
    rolls,
    limit: offer.limit,
    max: offer.max,
    needed: reach?.needed,
    pool: pool?.dice,
    shortfall: judged?.shortfall,
  };
  const text = (key) =>
    fill(labels[offer.resourceLabel ? key : `${key}Unlabelled`] ?? labels[key], values);
  return {
    resourceLine: text(resourceKey(offer)),
    spendLine: unavailable
      ? fill(labels.spendsUnlabelled, values)
      : text(rolls > 1 ? 'spendsAcross' : 'spends'),
    message: messageOf({ offer, reach, judged, chosen, values, labels, text, rolls }),
    disabled: unavailable || offer.limit === 0,
    blocked: Object.fromEntries(
      ['disadvantage', 'normal', 'advantage'].map((action) => [
        action,
        judgedAll[action]?.blocked === true,
      ])
    ),
    blockNote: blockNoteOf(judgedAll, labels, rolls),
    unreachableRows: batch?.unreachable ?? [],
  };
}

const SPENT = Object.freeze({
  labelled: [
    'FABRICATE.App.RollPrompt.AdditionalDice.Spent',
    '{n} {resource} spent; the roll could not be completed.',
  ],
  unlabelled: [
    'FABRICATE.App.RollPrompt.AdditionalDice.SpentUnlabelled',
    '{n} spent; the roll could not be completed.',
  ],
});

const EXHAUSTED = Object.freeze({
  labelled: [
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.Exhausted',
    '{resource} ran out after {done} of {rolls} rolls. The rolls already made stand.',
  ],
  unlabelled: [
    'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.ExhaustedUnlabelled',
    'The resource ran out after {done} of {rolls} rolls. The rolls already made stand.',
  ],
});

/**
 * The one warning the surface that started an attempt raises (issue 2008): a refused choice or
 * spend, or a roll that could not complete after its dice were spent; null for neither. Reads the
 * immediate and the Journal reply alike; `additionalDiceNotice` supplies the facts.
 */
export function additionalDiceNoticeText(result, { actorName = '', localize } = {}) {
  const notice = result?.additionalDiceNotice ?? {};
  const label = typeof notice.label === 'string' ? notice.label.trim() : '';
  const bought = result?.data?.boughtDice?.count ?? result?.boughtDice;
  const values = {
    actor: notice.actorName || actorName,
    resource: label,
    n: notice.dice ?? bought ?? 0,
    available: notice.available ?? 0,
    limit: notice.limit ?? 0,
  };
  if (result?.additionalDiceRefusal) {
    const key = additionalDiceRefusalKey(result.additionalDiceRefusal, {
      label,
      source: notice.source,
    });
    return key ? fill(localizeWith(localize, key, undefined, key), values) : null;
  }
  const spent = result?.misconfigured === true || result?.boughtDice > 0;
  if (!spent || !(bought > 0)) return null;
  const [key, fallback] = label ? SPENT.labelled : SPENT.unlabelled;
  return fill(localizeWith(localize, key, undefined, fallback), values);
}

/** A refused command's wording: why the authority refused bought dice, else the refusal chain. */
export function journalCommandRefusal(result, localize, generic) {
  const refused = result?.additionalDiceRefusal && additionalDiceNoticeText(result, { localize });
  return refused || journalRefusalMessage(result, localize, generic);
}

/** The warning for bought dice a check spent before its stage refused or threw: never refunded. */
export function spentDiceNotice(result, localize) {
  if (!(result?.boughtDice > 0)) return '';
  return additionalDiceNoticeText({ ...result, additionalDiceRefusal: null }, { localize }) ?? '';
}

/** The refusals that stop a batch because its resource cannot be spent at all, not ran out. */
const UNSPENDABLE_STOPS = new Set([
  'resourceMacroFailed',
  'resourceOverridden',
  'resourceNotWritable',
  'resourceUnreadable',
]);

/**
 * A bulk run's one warning (issue 2008): a refused batch choice, or the resource running out or
 * becoming unspendable mid-batch, read off the rows the run marked; null for neither.
 */
export function bulkAdditionalDiceNoticeText(result, { actorName = '', localize } = {}) {
  if (result?.additionalDiceRefusal)
    return additionalDiceNoticeText(result, { actorName, localize });
  const items = Array.isArray(result?.items) ? result.items : [];
  const stop = items.find((item) => item?.additionalDiceExhaustion)?.additionalDiceExhaustion;
  if (!stop) return null;
  const stopped = items.find((item) => UNSPENDABLE_STOPS.has(item?.additionalDiceRefusal));
  if (stopped) {
    const additionalDiceNotice = { label: stop.resourceLabel, ...stopped.additionalDiceNotice };
    const refusal = { additionalDiceRefusal: stopped.additionalDiceRefusal, additionalDiceNotice };
    return additionalDiceNoticeText(refusal, { actorName, localize });
  }
  const [key, fallback] = stop.resourceLabel ? EXHAUSTED.labelled : EXHAUSTED.unlabelled;
  return fill(localizeWith(localize, key, undefined, fallback), {
    resource: stop.resourceLabel,
    done: stop.done,
    rolls: stop.rolls,
  });
}

/**
 * Raises the one notice `result` calls for through `notifier.notify`, worded by `describe` with
 * `notifier.localize`; nothing when it calls for none.
 */
export function notifyAdditionalDice(
  result,
  notifier,
  actorName = '',
  describe = additionalDiceNoticeText
) {
  const text = describe(result, { actorName: actorName ?? '', localize: notifier?.localize });
  if (text && typeof notifier?.notify === 'function') notifier.notify(text);
}

/** `notifyAdditionalDice` for a bulk run's result: a refused batch choice or a mid-batch stop. */
export function notifyBulkAdditionalDice(result, notifier, actorName = '') {
  notifyAdditionalDice(result, notifier, actorName, bulkAdditionalDiceNoticeText);
}
