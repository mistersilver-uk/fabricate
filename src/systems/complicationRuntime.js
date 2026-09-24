/**
 * The effectful half of progressive component complications (issue 1286): settle the condition
 * rolls a plan could not, roll the player-visible effect rolls, and build the addressing-only
 * requests the GM side executes from. The pure decision and the player-facing projections live
 * in `../utils/complicationPlan.js`, so a player view-model never drags in this module's
 * `checkRoll.js` import closure; the GM-facing projection lives here, out of a view-model's reach.
 * Never throws, through three nested guards (per complication, per effect, whole call), because a
 * complication is strictly downstream of a committed award. It runs no macro and creates no chat
 * message: the `script` gate, `fromUuid` and `ChatMessage.create` belong to the elected GM's
 * edge, and the caller owns the emit so bulk salvage can batch per addressed pair. Both audiences'
 * effect rollers live here so each looks up only its own `EFFECT_ROLL_MODE` token.
 */

import { esc } from '../ui/presenters/CraftingChatCard.js';

import { compareNumbersByOperatorId } from './characterPrerequisites.js';
import { evaluateCheckRoll, evaluateSideRoll, resolveCheckFormulaDisplay } from './checkRoll.js';

/** The visibility token whose effect roll the ACTING client rolls and posts publicly. */
const VISIBLE = 'visible';

/**
 * The explicit chat token each audience's effect roll posts under, never the client-scoped
 * `core.rollMode`/`core.messageMode` fallback on either side, which would let the writing GM's
 * own selector hide a `visible` roll or publish a `gmOnly` one.
 */
const EFFECT_ROLL_MODE = Object.freeze({ visible: 'publicroll', gmOnly: 'gmroll' });

/** A frozen map, not an interpolated key, so an out-of-vocabulary token finds nothing. */
const SEVERITY_KEYS = Object.freeze({
  minor: 'FABRICATE.Admin.Manager.Component.Complications.Severity.minor',
  major: 'FABRICATE.Admin.Manager.Component.Complications.Severity.major',
  severe: 'FABRICATE.Admin.Manager.Component.Complications.Severity.severe',
});

/**
 * The GM card's "why it fired" sentences, read through `lookup`. The four stage sentences are
 * worded as reports, because the bucket is the acting client's unverifiable claim; the two clause
 * sentences are stated flat, because the GM authored those conditions. There is no `skipped`
 * sentence: a skipped stage fires nothing, so a relayed `skipped` reaches `unknown`.
 */
const REASON_KEYS = Object.freeze({
  full: 'FABRICATE.Chat.GmComplication.Reason.full',
  partial: 'FABRICATE.Chat.GmComplication.Reason.partial',
  halted: 'FABRICATE.Chat.GmComplication.Reason.halted',
  unreached: 'FABRICATE.Chat.GmComplication.Reason.unreached',
  checkTrigger: 'FABRICATE.Chat.GmComplication.Reason.checkTrigger',
  rollCondition: 'FABRICATE.Chat.GmComplication.Reason.rollCondition',
  unknown: 'FABRICATE.Chat.GmComplication.Reason.unknown',
});

/** A presentation mirror of `complicationPlan.js`'s private `BUCKETS_BY_STAGE_CONDITION`, held
 *  to it by the oracle test in `tests/component-complications-fire.test.js`. */
const STAGE_CLAUSE_BUCKETS = Object.freeze({
  stageAwarded: Object.freeze(['full']),
  stagePartial: Object.freeze(['partial']),
  stageMissed: Object.freeze(['halted', 'unreached']),
});

/** The borrowed BEM block; its unstyled `--gm` modifier needs no new CSS. */
const GM_CARD_BLOCK = 'fabricate-craft-chat';

const GM_CARD_KEYS = Object.freeze({
  title: 'FABRICATE.Chat.GmComplication.Title',
  actor: 'FABRICATE.Chat.GmComplication.Actor',
  reportedBy: 'FABRICATE.Chat.GmComplication.ReportedBy',
  whyItFired: 'FABRICATE.Chat.GmComplication.WhyItFired',
  whatHappens: 'FABRICATE.Chat.GmComplication.WhatHappens',
  needsAttention: 'FABRICATE.Chat.GmComplication.NeedsAttention',
  effectRoll: 'FABRICATE.Chat.GmComplication.EffectRoll',
  effectRollClaimed: 'FABRICATE.Chat.GmComplication.EffectRollClaimed',
  effectRollUnrollable: 'FABRICATE.Chat.GmComplication.EffectRollUnrollable',
  playerVisible: 'FABRICATE.Chat.GmComplication.PlayerVisible',
});

/** Macro outcomes worth reporting, keyed on the report's untrusted `status` via `lookup`. */
const MACRO_FAULT_KEYS = Object.freeze({
  skipped: 'FABRICATE.Chat.GmComplication.MacroSkipped',
  failed: 'FABRICATE.Chat.GmComplication.MacroFailed',
});

/** A token from a frozen map, or `null`. `Object.freeze` keeps `Object.prototype`, so a bare
 *  `MAP[token]` resolves `constructor`; every authored or relayed token reads through here. */
function lookup(map, token) {
  const key = text(token);
  return Object.hasOwn(map, key) ? map[key] : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Reduce a `rollCondition.value` comparand to a number, or `null`. Roll data is substituted,
 * never rolled, so one authored gate means the same thing on every evaluation; a comparand that
 * is still dice after substitution is `null`, and the gate fails closed.
 */
function resolveComparand(value, actor) {
  const authored = text(value).trim();
  if (authored === '') return null;
  const direct = Number(authored);
  if (Number.isFinite(direct)) return direct;
  const substituted = resolveCheckFormulaDisplay(authored, actor);
  if (!substituted?.resolved) return null;
  const resolved = Number(substituted.display);
  return Number.isFinite(resolved) ? resolved : null;
}

/** Roll a condition non-interactively, posting nothing, and fail closed on any uncertainty: no
 *  engine, a non-finite total, an unparseable comparand, or a valueless operator. */
async function conditionMatched(rollCondition, actor) {
  const expr = text(rollCondition?.expr).trim();
  if (expr === '') return false;
  const rolled = await evaluateCheckRoll(expr, actor, {});
  if (!rolled?.engine) return false;
  const total = Number(rolled.total);
  if (!Number.isFinite(total)) return false;
  const comparand = resolveComparand(rollCondition?.value, actor);
  if (comparand === null) return false;
  return compareNumbersByOperatorId(total, rollCondition?.cmp, comparand) === true;
}

/**
 * The effect result when nothing was rolled here. `requested` answers whether the GM authored a
 * roll (it has no production reader but stays distinct); `attempted` answers whether this client
 * rolled it. A `visible` complication with a macro reaches the GM side, which declines the roll by
 * audience, so the card keys on `attempted` or it would report a failed roll.
 */
function unrolledEffect(effectRoll, expr) {
  return {
    requested: effectRoll?.enabled === true && expr !== '',
    attempted: false,
    total: null,
    formula: expr || null,
    posted: false,
  };
}

/** Roll one authored effect under an explicit audience token, never throwing; both audiences
 *  share it, and every return carries `attempted: true`. */
async function rollEffect(complication, actor, { rollMode, speaker }) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  try {
    const rolled = await evaluateSideRoll(expr, actor, {
      rollMode,
      flavor: text(effectRoll?.label) || text(complication?.name),
      speaker,
    });
    return {
      requested: true,
      attempted: true,
      total: rolled.engine ? rolled.total : null,
      formula: rolled.formula ?? expr,
      posted: rolled.posted,
    };
  } catch (error) {
    console.error('Fabricate | Complication effect roll failed', error);
    return {
      requested: true,
      attempted: true,
      total: null,
      formula: expr,
      posted: false,
      error: text(error?.message),
    };
  }
}

/** Roll a `visible` effect on the acting client (guard 2 of 3), where the player's own Dice So
 *  Nice applies; a `gmOnly` one is left to `rollGmComplicationEffect`. */
async function runEffectRoll(firing, actor, context) {
  const complication = firing?.complication;
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility !== VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, {
    rollMode: EFFECT_ROLL_MODE.visible,
    speaker: context?.speaker,
  });
}

/**
 * Roll a `gmOnly` effect on the elected GM's client under `gmroll`, never throwing, and refuse a
 * `visible` one. The disclosure is intended: `ChatMessage#visible` passes any message with rolls
 * before testing whispers, so the player, neither author nor recipient, reads "<GM> rolled
 * privately", where a player-authored `gmroll` would render in that player's own sidebar.
 */
export async function rollGmComplicationEffect({
  complication,
  actor = null,
  speaker = null,
} = {}) {
  const effectRoll = complication?.effectRoll;
  const expr = text(effectRoll?.expr).trim();
  if (effectRoll?.enabled !== true || expr === '' || complication?.visibility === VISIBLE)
    return unrolledEffect(effectRoll, expr);
  return rollEffect(complication, actor, { rollMode: EFFECT_ROLL_MODE.gmOnly, speaker });
}

/** The addressing-only payload for one firing (`openspec/specs/recipes-and-steps/spec.md`
 *  § The relay payload carries ADDRESSING ONLY); the socket writer stamps `action`. */
function gmRequestFor(firing, effect, context, actor) {
  return {
    craftingSystemId: context?.craftingSystemId ?? null,
    componentId: firing.componentId,
    complicationId: firing.complicationId,
    resultId: firing.resultId,
    activity: firing.activity,
    bucket: firing.bucket,
    actorUuid: context?.actorUuid ?? actor?.uuid ?? null,
    resolutionId: firing.resolutionId ?? null,
    effectRollTotal: effect?.total ?? null,
  };
}

/** A `gmOnly` card can only be authored by a GM (a player's whispered message renders in their
 *  own sidebar), and every complication macro runs on a GM client. */
function needsGmClient(firing) {
  const complication = firing?.complication;
  return complication?.visibility !== VISIBLE || Boolean(text(complication?.macroUuid).trim());
}

/**
 * Fire what a plan decided: settle pending condition rolls, roll visible effects, and return the
 * fired list and the GM requests. Resolves, never rejects. `fired` is in result-entry order, so a
 * component staged twice appears twice with independent rolls.
 */
export async function fireComplications({ plan, actor = null, context = {} } = {}) {
  const result = {
    activity: plan?.activity ?? null,
    resolutionId: plan?.resolutionId ?? null,
    fired: [],
    gmRequests: [],
  };
  try {
    for (const firing of list(plan?.firings)) {
      // A non-object firing is dropped: no record means nothing to do.
      if (!firing || typeof firing !== 'object') continue;
      // Guard 1 of 3: one bad complication must not cost the resolution its others.
      try {
        if (
          firing.needsDice === true &&
          !(await conditionMatched(firing.complication?.rollCondition, actor))
        )
          continue;
        const effect = await runEffectRoll(firing, actor, context);
        const fired = {
          ...firing,
          needsDice: false,
          matchedConditions: firing.needsDice
            ? [...list(firing.matchedConditions), 'rollCondition']
            : [...list(firing.matchedConditions)],
          effectRoll: effect,
        };
        result.fired.push(fired);
        if (needsGmClient(fired))
          result.gmRequests.push(gmRequestFor(fired, effect, context, actor));
      } catch (error) {
        console.error('Fabricate | Complication failed to fire', error);
      }
    }
  } catch (error) {
    // Guard 3 of 3: the partial result still returns, because the award is committed.
    console.error('Fabricate | Complication firing aborted', error);
  }
  return result;
}

/**
 * The GM-facing projection for the GM-only card, named by audience opposite
 * `publicComplications` so a salvage run record (a player-readable actor flag) cannot receive
 * it. The macro uuid is never projected; `effectLabel` is authored GM text, so it is attested
 * even when the total beside it is a claim.
 */
export function gmComplications(fired) {
  return list(fired).map((entry) => ({
    resultId: entry?.resultId ?? null,
    componentId: entry?.componentId ?? null,
    componentName: text(entry?.componentName),
    complicationId: entry?.complicationId ?? null,
    name: text(entry?.complication?.name),
    description: text(entry?.complication?.description),
    severity: text(entry?.complication?.severity),
    visibility: text(entry?.complication?.visibility),
    bucket: entry?.bucket ?? null,
    buckets: [...list(entry?.buckets)],
    matchedConditions: [...list(entry?.matchedConditions)],
    effectRoll: entry?.effectRoll ?? null,
    effectLabel: text(entry?.complication?.effectRoll?.label),
  }));
}

/**
 * Why one complication fired, re-derived GM-side from the authored record plus the claimed
 * bucket rather than relayed, since a reason list would be one more client claim on the payload.
 * Sound, not complete: every token did contribute, and a firing whose deciding clause cannot be
 * named here is `unknown`. Under `match: 'all'` every enabled clause is named; under `'any'` a
 * matched stage clause settles it and the trigger is not named. Never empty.
 */
export function complicationReasons(complication, bucket) {
  const claimed = text(bucket);
  // The bucket sets are disjoint, so the reason token is the bucket itself.
  const stageMatched = Object.entries(STAGE_CLAUSE_BUCKETS).some(
    ([clause, buckets]) => complication?.when?.[clause] === true && buckets.includes(claimed)
  );
  const trigger = text(complication?.when?.checkTrigger).trim() !== '';
  const dice = complication?.rollCondition?.enabled === true;
  if (complication?.match === 'all') {
    const reasons = [
      stageMatched ? claimed : '',
      trigger ? 'checkTrigger' : '',
      dice ? 'rollCondition' : '',
    ];
    const named = reasons.filter(Boolean);
    return named.length > 0 ? named : ['unknown'];
  }
  if (stageMatched) return [claimed];
  // No stage clause matched: exactly one of trigger and dice authored names it; both is unknown.
  if (trigger !== dice) return [trigger ? 'checkTrigger' : 'rollCondition'];
  return ['unknown'];
}

/**
 * The GM card's row model: each applied row projected on its own (never zipped back by index),
 * plus `reasons`, the acting client's `claimed` bucket and total kept apart so the card labels
 * them as reported, and the macro report. Kept out of `main.js` so tests can drive rows
 * that disagree.
 */
export function gmComplicationCardEntries(applied) {
  return list(applied).map((row) => {
    const [projected] = gmComplications([
      {
        resultId: row?.entry?.resultId ?? null,
        componentId: row?.component?.id ?? row?.entry?.componentId ?? null,
        componentName: row?.component?.name ?? '',
        complicationId: row?.complication?.id ?? null,
        complication: row?.complication,
        bucket: row?.entry?.bucket ?? null,
        effectRoll: row?.report?.effect ?? null,
      },
    ]);
    return {
      ...projected,
      reasons: complicationReasons(row?.complication, row?.entry?.bucket ?? null),
      claimed: {
        bucket: row?.entry?.bucket ?? null,
        effectRollTotal: row?.entry?.effectRollTotal ?? null,
      },
      macro: row?.report?.macro ?? null,
    };
  });
}

/** Type before finiteness, so an absent total never reads as a rolled `0`. */
function isReportableTotal(total) {
  return typeof total === 'number' && Number.isFinite(total);
}

/** The severity eyebrow on the head line, read through `lookup`; '' outside the vocabulary. */
function gmComplicationSeverity(entry, loc) {
  const severityKey = lookup(SEVERITY_KEYS, entry?.severity);
  if (!severityKey) return '';
  return `<span class="${GM_CARD_BLOCK}__complication-severity">${esc(loc(severityKey))}</span>`;
}

/** The muted line: the component name and the player-visible note as separately styled spans. */
function gmComplicationMeta(entry, loc) {
  const runs = [
    entry?.componentName
      ? `<span class="${GM_CARD_BLOCK}__complication-source">${esc(entry.componentName)}</span>`
      : '',
    entry?.visibility === VISIBLE
      ? `<span class="${GM_CARD_BLOCK}__complication-audience">${esc(loc(GM_CARD_KEYS.playerVisible))}</span>`
      : '',
  ].filter(Boolean);
  if (runs.length === 0) return '';
  return `<span class="${GM_CARD_BLOCK}__complication-meta">${runs.join(' · ')}</span>`;
}

/** One line per reason, so several `match: 'all'` clauses stay distinguishable. */
function gmComplicationReasonFacts(entry, loc) {
  return list(entry?.reasons)
    .map((reason) => lookup(REASON_KEYS, reason))
    .filter(Boolean)
    .map((key) => esc(loc(key)));
}

/**
 * The consequence roll as `Label: total (formula)`, never phrased as a test. A GM-side roll shows
 * its formula; the acting client's claimed total shows its provenance instead, and both render
 * when present. Keyed on `attempted`, never `requested` (see `unrolledEffect`).
 */
function gmComplicationEffectFacts(entry, loc) {
  const label = esc(text(entry?.effectLabel).trim() || loc(GM_CARD_KEYS.effectRoll));
  const facts = [];
  const effect = entry?.effectRoll;
  if (effect?.attempted === true) {
    facts.push(
      isReportableTotal(effect.total)
        ? `${label}: ${esc(effect.total)} (${esc(effect.formula)})`
        : `${label}: ${esc(loc(GM_CARD_KEYS.effectRollUnrollable))} (${esc(effect.formula)})`
    );
  }
  const claimed = entry?.claimed?.effectRollTotal;
  if (isReportableTotal(claimed))
    facts.push(`${label}: ${esc(claimed)} (${esc(loc(GM_CARD_KEYS.effectRollClaimed))})`);
  return facts;
}

/** A macro link only the GM can repair (spec § The `script` gate is a call-site check), read
 *  through `lookup` because a `constructor` status would otherwise resolve truthy. */
function gmComplicationFaultFacts(entry, loc) {
  const key = lookup(MACRO_FAULT_KEYS, entry?.macro?.status);
  // The uuid on its own line, selectable for pasting into the editor.
  return key ? [esc(loc(key)), esc(entry?.macro?.macroUuid)] : [];
}

/** One labelled section, omitted when empty. `attention` carries its own class because
 *  `tests/crafting-chat-card.test.js` requires each complication rule branch to end on a
 *  complication-only class. */
function gmComplicationSection(section, headingKey, facts, loc) {
  if (facts.length === 0) return '';
  const fault = section === 'attention' ? ` ${GM_CARD_BLOCK}__complication-fault` : '';
  return [
    `<span class="${GM_CARD_BLOCK}__complication-block${fault}" data-fabricate-complication-section="${section}">`,
    `<span class="${GM_CARD_BLOCK}__complication-heading">${esc(loc(headingKey))}</span>`,
    ...facts.map((fact) => `<span class="${GM_CARD_BLOCK}__complication-fact">${fact}</span>`),
    '</span>',
  ].join('');
}

/**
 * One GM card row, stacked inside the single `__label`, since flex siblings of it would shrink
 * to a few characters wide. The `--gm` modifier makes the label a column and no player card
 * emits it, so the player row is unchanged. Order: identity, authored prose, why it fired, what
 * happens, then any repair only the GM can make.
 */
function renderGmComplication(entry, loc) {
  const head = `<span class="${GM_CARD_BLOCK}__complication-name">${esc(entry?.name)}</span>${gmComplicationSeverity(entry, loc)}`;
  const stack = [
    `<span class="${GM_CARD_BLOCK}__complication-head">${head}</span>`,
    gmComplicationMeta(entry, loc),
    entry?.description
      ? `<span class="${GM_CARD_BLOCK}__complication-description">${esc(entry.description)}</span>`
      : '',
    gmComplicationSection(
      'why',
      GM_CARD_KEYS.whyItFired,
      gmComplicationReasonFacts(entry, loc),
      loc
    ),
    gmComplicationSection(
      'effect',
      GM_CARD_KEYS.whatHappens,
      gmComplicationEffectFacts(entry, loc),
      loc
    ),
    gmComplicationSection(
      'attention',
      GM_CARD_KEYS.needsAttention,
      gmComplicationFaultFacts(entry, loc),
      loc
    ),
  ].filter(Boolean);
  return [
    `<li class="${GM_CARD_BLOCK}__item ${GM_CARD_BLOCK}__item--complication" data-fabricate-complication-severity="${esc(entry?.severity)}">`,
    `<span class="${GM_CARD_BLOCK}__label">${stack.join('')}</span>`,
    '</li>',
  ].join('');
}

/**
 * The GM-only complication card's HTML (issue 1286). It is not `renderComplications`, whose
 * contract is pre-redacted player-safe rows, but it shares that renderer's BEM block and `esc`.
 * Every authored string is escaped and every attribute double-quoted, because an imported system
 * can carry markup. Returns `''` for no entries, so the caller creates no message.
 */
export function buildGmComplicationCardContent(
  { entries = [], actorName = '', reporterName = '' } = {},
  localize = (key) => key
) {
  const rows = list(entries);
  if (rows.length === 0) return '';
  const loc = (key) => localize(key) ?? key;
  const subtitle = [
    actorName ? `${esc(loc(GM_CARD_KEYS.actor))}: ${esc(actorName)}` : '',
    reporterName ? `${esc(loc(GM_CARD_KEYS.reportedBy))}: ${esc(reporterName)}` : '',
  ].filter(Boolean);
  return [
    `<div class="${GM_CARD_BLOCK} ${GM_CARD_BLOCK}--gm">`,
    `<header class="${GM_CARD_BLOCK}__header">`,
    `<div class="${GM_CARD_BLOCK}__title">${esc(loc(GM_CARD_KEYS.title))}</div>`,
    subtitle.length > 0
      ? `<div class="${GM_CARD_BLOCK}__subtitle">${subtitle.join(' · ')}</div>`
      : '',
    '</header>',
    `<section class="${GM_CARD_BLOCK}__section ${GM_CARD_BLOCK}__section--complications">`,
    `<ul class="${GM_CARD_BLOCK}__grid">`,
    ...rows.map((entry) => renderGmComplication(entry, loc)),
    '</ul>',
    '</section>',
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
