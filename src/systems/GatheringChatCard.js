/**
 * Pure presentation helper for the gathering result chat card.
 *
 * `buildGatheringChatContent` takes an already-resolved, plain data model (no
 * Foundry documents, no globals) and returns the HTML string posted via
 * `ChatMessage.create`. Keeping it pure makes the card markup trivially
 * unit-testable without stubbing `game`/`ChatMessage`, mirroring the engine's
 * "resolve to plain models, then render" split. All image/name resolution
 * happens in the caller (GatheringEngine); this module only formats.
 *
 * The fired-complications block is the ONE thing this module takes from
 * {@link module:src/systems/CraftingChatCard} (issue 1286). A complication row is the
 * same row on all four cards, so a local copy here would be a fourth spelling of one
 * `<li>` — the duplication the crafting card's exported atoms exist to prevent. The
 * shared renderer is parameterised by BEM block, so it emits this card's own
 * `fabricate-gather-chat` classes and needs no new CSS.
 */

import { DEFAULT_GATHERING_EVENT_IMG } from '../gatheringImageDefaults.js';

import { renderComplications } from './CraftingChatCard.js';

const COMPONENT_FALLBACK_IMG = 'icons/svg/item-bag.svg';
const EVENT_FALLBACK_IMG = DEFAULT_GATHERING_EVENT_IMG;

const CHAT_KEYS = Object.freeze({
  success: 'FABRICATE.Chat.GatherSuccess',
  failure: 'FABRICATE.Chat.GatherFailure',
  actor: 'FABRICATE.Chat.GatherActor',
  task: 'FABRICATE.Chat.GatherTask',
  components: 'FABRICATE.Chat.GatherComponents',
  nothing: 'FABRICATE.Chat.GatherNothing',
  events: 'FABRICATE.Chat.GatherEvents',
  toolsBroken: 'FABRICATE.Chat.GatherToolsBroken',
  stamina: 'FABRICATE.Chat.GatherStamina',
  nodes: 'FABRICATE.Chat.GatherNodes',
  // Deliberately NOT `Gather`-prefixed: a complication is the same object on every card
  // and reads one shared heading key, on the `FABRICATE.Chat.Roll` precedent (issue 1286).
  complications: 'FABRICATE.Chat.Complications',
});

// FontAwesome glyphs (Foundry bundles FA6) for the footer stat pills.
const STAT_ICONS = Object.freeze({
  stamina: 'fas fa-bolt',
  nodes: 'fas fa-mountain',
});

/** Escape text destined for HTML so user-authored names cannot inject markup. */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Render one image-backed entry (component, event, or broken tool) as a list
 * item. `quantity` is rendered as a `N×` prefix when present and > 1.
 */
function renderItem({ name, img, quantity }, fallbackImg) {
  const label = Number(quantity) > 1 ? `${Number(quantity)}× ${esc(name)}` : esc(name);
  return [
    '<li class="fabricate-gather-chat__item">',
    `<img class="fabricate-gather-chat__icon" src="${esc(img || fallbackImg)}" alt="" />`,
    `<span class="fabricate-gather-chat__label">${label}</span>`,
    '</li>',
  ].join('');
}

/** Render a titled section with an icon grid; returns '' when there are no entries. */
function renderSection({ heading, entries, fallbackImg, modifier }) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const sectionClass = modifier
    ? `fabricate-gather-chat__section fabricate-gather-chat__section--${modifier}`
    : 'fabricate-gather-chat__section';
  return [
    `<section class="${sectionClass}">`,
    `<div class="fabricate-gather-chat__heading">${esc(heading)}</div>`,
    '<ul class="fabricate-gather-chat__grid">',
    ...entries.map((entry) => renderItem(entry, fallbackImg)),
    '</ul>',
    '</section>',
  ].join('');
}

/**
 * Render the explicit "you found nothing" section.
 *
 * A successful gather that awards nothing is a legitimate outcome — in d100 mode every
 * drop row can miss its threshold, and the attempt still reports success because status
 * is decided by events, not by drops. Rendering NOTHING for that case produced a card
 * with only a "Gathering Successful" banner, which is indistinguishable from the module
 * being broken: the node and stamina were spent and the player was told nothing. Empty
 * events and broken-tool sections stay omitted, because there "absent" correctly reads
 * as "none happened"; only the results section needs to say so out loud.
 */
function renderEmptyResults(heading, message) {
  return [
    '<section class="fabricate-gather-chat__section fabricate-gather-chat__section--empty">',
    `<div class="fabricate-gather-chat__heading">${esc(heading)}</div>`,
    `<p class="fabricate-gather-chat__empty">${esc(message)}</p>`,
    '</section>',
  ].join('');
}

/**
 * Render a single footer stat as a bordered pill with a leading icon; returns
 * '' when the value is null/undefined.
 */
function renderStat(icon, label, value) {
  if (value === null || value === undefined) return '';
  return [
    '<span class="fabricate-gather-chat__stat">',
    `<i class="fabricate-gather-chat__stat-icon ${esc(icon)}" aria-hidden="true"></i>`,
    `<span class="fabricate-gather-chat__stat-text">${esc(label)}: <span class="fabricate-gather-chat__stat-value">${esc(value)}</span></span>`,
    '</span>',
  ].join('');
}

/**
 * Build the HTML content for a gathering result chat card.
 *
 * @param {object} model
 * @param {'succeeded'|'failed'} model.status
 * @param {string}  model.actorName
 * @param {string}  [model.taskName]
 * @param {Array<{name:string,img:string,quantity:number}>} [model.components]
 * @param {Array<{name:string,img:string}>}                 [model.events]
 * @param {Array<{name:string,img:string}>}                 [model.brokenTools]
 * @param {number|null} [model.staminaSpent]
 * @param {number|null} [model.nodesRemaining]
 * @param {Array<{name:string,description:string,severity:string,componentName:string}>}
 *   [model.complications] - Fired component complications, already redacted to the
 *   player-visible set by the caller (issue 1286).
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildGatheringChatContent(model = {}, localize = (key) => key) {
  const loc = (key) => localize(key) ?? key;
  const succeeded = model.status === 'succeeded';
  const awardedNothing =
    succeeded && (!Array.isArray(model.components) || model.components.length === 0);
  // A distinct modifier so a success that awarded nothing can be styled apart from a
  // full success without changing the title — the check DID succeed.
  const stateModifier = succeeded ? (awardedNothing ? 'empty' : 'success') : 'failure';
  const title = loc(succeeded ? CHAT_KEYS.success : CHAT_KEYS.failure);

  const subtitleParts = [`${esc(loc(CHAT_KEYS.actor))}: ${esc(model.actorName)}`];
  if (model.taskName) {
    subtitleParts.push(`${esc(loc(CHAT_KEYS.task))}: ${esc(model.taskName)}`);
  }

  const sections = [
    awardedNothing
      ? renderEmptyResults(loc(CHAT_KEYS.components), loc(CHAT_KEYS.nothing))
      : renderSection({
          heading: loc(CHAT_KEYS.components),
          entries: model.components,
          fallbackImg: COMPONENT_FALLBACK_IMG,
        }),
    renderSection({
      heading: loc(CHAT_KEYS.events),
      entries: model.events,
      fallbackImg: EVENT_FALLBACK_IMG,
      modifier: 'event',
    }),
    renderSection({
      heading: loc(CHAT_KEYS.toolsBroken),
      entries: model.brokenTools,
      fallbackImg: COMPONENT_FALLBACK_IMG,
      modifier: 'tools',
    }),
  ].filter(Boolean);

  const stats = [
    renderStat(STAT_ICONS.stamina, loc(CHAT_KEYS.stamina), model.staminaSpent),
    renderStat(STAT_ICONS.nodes, loc(CHAT_KEYS.nodes), model.nodesRemaining),
  ].filter(Boolean);

  const footer =
    stats.length > 0
      ? `<footer class="fabricate-gather-chat__footer">${stats.join('')}</footer>`
      : '';

  // Above the stat footer and below the sections, matching the crafting and salvage
  // cards' "what the award cost you, then what it did to you" order.
  const complications = renderComplications({
    entries: model.complications,
    heading: loc(CHAT_KEYS.complications),
    card: 'gather',
  });

  return [
    `<div class="fabricate-gather-chat fabricate-gather-chat--${stateModifier}">`,
    '<header class="fabricate-gather-chat__header">',
    `<div class="fabricate-gather-chat__title">${esc(title)}</div>`,
    `<div class="fabricate-gather-chat__subtitle">${subtitleParts.join(' · ')}</div>`,
    '</header>',
    ...sections,
    complications,
    footer,
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
