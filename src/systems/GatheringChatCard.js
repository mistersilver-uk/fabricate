/**
 * Pure presentation helper for the gathering result chat card.
 *
 * `buildGatheringChatContent` takes an already-resolved, plain data model (no
 * Foundry documents, no globals) and returns the HTML string posted via
 * `ChatMessage.create`. Keeping it pure makes the card markup trivially
 * unit-testable without stubbing `game`/`ChatMessage`, mirroring the engine's
 * "resolve to plain models, then render" split. All image/name resolution
 * happens in the caller (GatheringEngine); this module only formats.
 */

import { DEFAULT_GATHERING_EVENT_IMG } from '../gatheringImageDefaults.js';

const COMPONENT_FALLBACK_IMG = 'icons/svg/item-bag.svg';
const EVENT_FALLBACK_IMG = DEFAULT_GATHERING_EVENT_IMG;

const CHAT_KEYS = Object.freeze({
  success: 'FABRICATE.Chat.GatherSuccess',
  failure: 'FABRICATE.Chat.GatherFailure',
  actor: 'FABRICATE.Chat.GatherActor',
  task: 'FABRICATE.Chat.GatherTask',
  components: 'FABRICATE.Chat.GatherComponents',
  events: 'FABRICATE.Chat.GatherEvents',
  toolsBroken: 'FABRICATE.Chat.GatherToolsBroken',
  stamina: 'FABRICATE.Chat.GatherStamina',
  nodes: 'FABRICATE.Chat.GatherNodes',
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
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildGatheringChatContent(model = {}, localize = (key) => key) {
  const loc = (key) => localize(key) ?? key;
  const succeeded = model.status === 'succeeded';
  const stateModifier = succeeded ? 'success' : 'failure';
  const title = loc(succeeded ? CHAT_KEYS.success : CHAT_KEYS.failure);

  const subtitleParts = [`${esc(loc(CHAT_KEYS.actor))}: ${esc(model.actorName)}`];
  if (model.taskName) {
    subtitleParts.push(`${esc(loc(CHAT_KEYS.task))}: ${esc(model.taskName)}`);
  }

  const sections = [
    renderSection({
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

  return [
    `<div class="fabricate-gather-chat fabricate-gather-chat--${stateModifier}">`,
    '<header class="fabricate-gather-chat__header">',
    `<div class="fabricate-gather-chat__title">${esc(title)}</div>`,
    `<div class="fabricate-gather-chat__subtitle">${subtitleParts.join(' · ')}</div>`,
    '</header>',
    ...sections,
    footer,
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
