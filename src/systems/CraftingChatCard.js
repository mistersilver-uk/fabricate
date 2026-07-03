/**
 * Pure presentation helper for the crafting result chat card.
 *
 * `buildCraftingChatContent` takes an already-resolved, plain data model (no
 * Foundry documents, no globals) and returns the HTML string posted via
 * `ChatMessage.create`. Keeping it pure makes the card markup trivially
 * unit-testable without stubbing `game`/`ChatMessage`, mirroring
 * {@link module:src/systems/GatheringChatCard} so the crafting and gathering
 * result cards render as one consistent, Fabricate-namespaced card. All
 * image/name resolution happens in the caller (CraftingEngine); this module
 * only formats.
 */

const ITEM_FALLBACK_IMG = 'icons/svg/item-bag.svg';

const CHAT_KEYS = Object.freeze({
  success: 'FABRICATE.Chat.CraftSuccess',
  failure: 'FABRICATE.Chat.CraftFailure',
  actor: 'FABRICATE.Chat.Actor',
  recipe: 'FABRICATE.Chat.Recipe',
  results: 'FABRICATE.Chat.Results',
  consumed: 'FABRICATE.Chat.Consumed',
  tools: 'FABRICATE.Chat.Tools',
  failureReason: 'FABRICATE.Chat.FailureReason',
  consumedOnFailure: 'FABRICATE.Chat.ConsumedOnFailure',
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
 * Render one image-backed entry (created result, consumed ingredient, or tool)
 * as a list item. `quantity` is rendered as a `N×` prefix when present and > 1.
 */
function renderItem({ name, img, quantity }) {
  const label = Number(quantity) > 1 ? `${Number(quantity)}× ${esc(name)}` : esc(name);
  return [
    '<li class="fabricate-craft-chat__item">',
    `<img class="fabricate-craft-chat__icon" src="${esc(img || ITEM_FALLBACK_IMG)}" alt="" />`,
    `<span class="fabricate-craft-chat__label">${label}</span>`,
    '</li>',
  ].join('');
}

/** Render a titled section with an icon grid; returns '' when there are no entries. */
function renderSection({ heading, entries, modifier }) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const sectionClass = modifier
    ? `fabricate-craft-chat__section fabricate-craft-chat__section--${modifier}`
    : 'fabricate-craft-chat__section';
  return [
    `<section class="${sectionClass}">`,
    `<div class="fabricate-craft-chat__heading">${esc(heading)}</div>`,
    '<ul class="fabricate-craft-chat__grid">',
    ...entries.map((entry) => renderItem(entry)),
    '</ul>',
    '</section>',
  ].join('');
}

/**
 * Build the HTML content for a crafting result chat card.
 *
 * On success the card lists the created results, consumed ingredients, and tools
 * used as separate sections. On failure it shows the failure reason as a notice
 * and merges any consumed ingredients + tools into a single "Consumed on Failure"
 * section (mirroring the prior plain-text card's failure branch).
 *
 * @param {object} model
 * @param {'succeeded'|'failed'} model.status
 * @param {string}  model.actorName
 * @param {string}  [model.recipeName]
 * @param {Array<{name:string,img:string,quantity:number}>} [model.results]
 * @param {Array<{name:string,img:string,quantity:number}>} [model.consumed]
 * @param {Array<{name:string,img:string}>}                 [model.tools]
 * @param {string}  [model.failureReason]
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildCraftingChatContent(model = {}, localize = (key) => key) {
  const loc = (key) => localize(key) ?? key;
  const succeeded = model.status === 'succeeded';
  const stateModifier = succeeded ? 'success' : 'failure';
  const title = loc(succeeded ? CHAT_KEYS.success : CHAT_KEYS.failure);

  const subtitleParts = [`${esc(loc(CHAT_KEYS.actor))}: ${esc(model.actorName)}`];
  if (model.recipeName) {
    subtitleParts.push(`${esc(loc(CHAT_KEYS.recipe))}: ${esc(model.recipeName)}`);
  }

  const notice =
    !succeeded && model.failureReason
      ? `<div class="fabricate-craft-chat__notice">${esc(loc(CHAT_KEYS.failureReason))}: ${esc(model.failureReason)}</div>`
      : '';

  let sections;
  if (succeeded) {
    sections = [
      renderSection({
        heading: loc(CHAT_KEYS.results),
        entries: model.results,
        modifier: 'results',
      }),
      renderSection({
        heading: loc(CHAT_KEYS.consumed),
        entries: model.consumed,
        modifier: 'consumed',
      }),
      renderSection({ heading: loc(CHAT_KEYS.tools), entries: model.tools, modifier: 'tools' }),
    ].filter(Boolean);
  } else {
    // Failure: consumed ingredients + tools were forfeited together — one section.
    const forfeited = [...(model.consumed || []), ...(model.tools || [])];
    sections = [
      renderSection({
        heading: loc(CHAT_KEYS.consumedOnFailure),
        entries: forfeited,
        modifier: 'consumed',
      }),
    ].filter(Boolean);
  }

  return [
    `<div class="fabricate-craft-chat fabricate-craft-chat--${stateModifier}">`,
    '<header class="fabricate-craft-chat__header">',
    `<div class="fabricate-craft-chat__title">${esc(title)}</div>`,
    `<div class="fabricate-craft-chat__subtitle">${subtitleParts.join(' · ')}</div>`,
    '</header>',
    notice,
    ...sections,
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}
