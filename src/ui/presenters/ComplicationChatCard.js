/**
 * The GM-only complication card (issue 1286): the HTML the elected GM whispers after a committed
 * award when a complication fired or failed to deliver its macro. It is a presenter, so the
 * runtime in `../../systems/complicationRuntime.js` stays HTML-free; the row model it renders is
 * projected there by `gmComplicationCardEntries`. Shares the crafting card's BEM block and `esc`,
 * and every authored string is escaped, because an imported system can carry markup.
 */

import { untrimmedStringOrEmpty } from '../../utils/scalars.js';

import { esc } from './htmlEscape.js';

/** The visibility token a player-visible complication carries; mirrors the runtime's token. */
const VISIBLE = 'visible';

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
  const key = untrimmedStringOrEmpty(token);
  return Object.hasOwn(map, key) ? map[key] : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
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
  const label = esc(
    untrimmedStringOrEmpty(entry?.effectLabel).trim() || loc(GM_CARD_KEYS.effectRoll)
  );
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
 *  complication-only class; it and the `--gm` modifier are written whole, so a View Lab
 *  selector naming them finds them in source. */
function gmComplicationSection(section, headingKey, facts, loc) {
  if (facts.length === 0) return '';
  const fault = section === 'attention' ? ' fabricate-craft-chat__complication-fault' : '';
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
    '<div class="fabricate-craft-chat fabricate-craft-chat--gm">',
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
