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
 *
 * The rendering core is factored into {@link buildResultCard}, a generic result
 * card parameterised by a label-key map. Salvage reuses it verbatim (via
 * {@link module:src/systems/SalvageChatCard}) so a salvage card is the SAME card
 * — same markup, same `fabricate-craft-chat` styles — reading only as a salvage
 * analogue rather than a second, unrelated format (issue 675). Sharing the core
 * this way also keeps the two callers from duplicating the renderer.
 */

const ITEM_FALLBACK_IMG = 'icons/svg/item-bag.svg';

/**
 * The crafting label-key map for {@link buildResultCard}: the subject is the
 * recipe, and the state titles read "Crafting Successful/Failed".
 */
export const CRAFTING_CHAT_KEYS = Object.freeze({
  success: 'FABRICATE.Chat.CraftSuccess',
  failure: 'FABRICATE.Chat.CraftFailure',
  actor: 'FABRICATE.Chat.Actor',
  subject: 'FABRICATE.Chat.Recipe',
  results: 'FABRICATE.Chat.Results',
  consumed: 'FABRICATE.Chat.Consumed',
  tools: 'FABRICATE.Chat.Tools',
  roll: 'FABRICATE.Chat.Roll',
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

/**
 * Render the rolled check total as a header row, or '' when no check ran (a
 * non-finite value). A guaranteed no-check craft/salvage rolls nothing, so — like
 * the salvage summary's "with a roll of" phrase — the row is omitted rather than
 * printing "0"/"null". The number is set apart from its label so it reads as the
 * roll result, not more subtitle metadata.
 */
function renderRollTotal(value, label) {
  if (!Number.isFinite(value)) return '';
  return [
    '<div class="fabricate-craft-chat__roll">',
    `<span class="fabricate-craft-chat__roll-label">${esc(label)}</span>`,
    `<span class="fabricate-craft-chat__roll-value">${esc(value)}</span>`,
    '</div>',
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
 * Build the HTML content for a result chat card (crafting or salvage), keyed by a
 * label-key map so the SAME markup and `fabricate-craft-chat` styles back both.
 *
 * On success the card lists the created/recovered results, the consumed source,
 * and tools as separate sections. On failure it shows the failure reason as a
 * notice and merges any consumed + tools into a single "Consumed on Failure"
 * section (mirroring the prior plain-text card's failure branch).
 *
 * @param {object} model
 * @param {'succeeded'|'failed'} model.status
 * @param {string}  model.actorName
 * @param {string}  [model.subjectName] - The recipe (crafting) or source component (salvage).
 * @param {Array<{name:string,img:string,quantity:number}>} [model.results]
 * @param {Array<{name:string,img:string,quantity:number}>} [model.consumed]
 * @param {Array<{name:string,img:string}>}                 [model.tools]
 * @param {number}  [model.rollValue] - The rolled check total; rendered only when
 *   finite (a no-check "Guaranteed" craft/salvage omits it).
 * @param {string}  [model.checkNote] - Optional one-line check annotation rendered
 *   under the roll row (e.g. the nat-20/nat-1 "quality stepped up/down" notice).
 * @param {string}  [model.failureReason]
 * @param {object}  keys - The label-key map (e.g. {@link CRAFTING_CHAT_KEYS}).
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildResultCard(model = {}, keys, localize = (key) => key) {
  const loc = (key) => localize(key) ?? key;
  const succeeded = model.status === 'succeeded';
  const stateModifier = succeeded ? 'success' : 'failure';
  const title = loc(succeeded ? keys.success : keys.failure);

  const subtitleParts = [`${esc(loc(keys.actor))}: ${esc(model.actorName)}`];
  if (model.subjectName) {
    subtitleParts.push(`${esc(loc(keys.subject))}: ${esc(model.subjectName)}`);
  }

  const rollTotal = renderRollTotal(model.rollValue, loc(keys.roll));

  // Optional check annotation (e.g. nat-20/nat-1 tier stepping): a one-line note
  // under the roll row, omitted when absent.
  const checkNote = model.checkNote
    ? `<div class="fabricate-craft-chat__note">${esc(model.checkNote)}</div>`
    : '';

  const notice =
    !succeeded && model.failureReason
      ? `<div class="fabricate-craft-chat__notice">${esc(loc(keys.failureReason))}: ${esc(model.failureReason)}</div>`
      : '';

  let sections;
  if (succeeded) {
    sections = [
      renderSection({
        heading: loc(keys.results),
        entries: model.results,
        modifier: 'results',
      }),
      renderSection({
        heading: loc(keys.consumed),
        entries: model.consumed,
        modifier: 'consumed',
      }),
      renderSection({ heading: loc(keys.tools), entries: model.tools, modifier: 'tools' }),
    ].filter(Boolean);
  } else {
    // Failure: consumed source + tools were forfeited together — one section.
    const forfeited = [...(model.consumed || []), ...(model.tools || [])];
    sections = [
      renderSection({
        heading: loc(keys.consumedOnFailure),
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
    rollTotal,
    checkNote,
    notice,
    ...sections,
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}

/**
 * Build the HTML content for a crafting result chat card.
 *
 * A thin wrapper over {@link buildResultCard} that maps the crafting model
 * (`recipeName` → subject) onto the shared renderer with {@link CRAFTING_CHAT_KEYS}.
 *
 * @param {object} model - See {@link buildResultCard}; the subject is `recipeName`.
 * @param {(key:string)=>string} [localize] - Localization lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildCraftingChatContent(model = {}, localize = (key) => key) {
  return buildResultCard(
    {
      status: model.status,
      actorName: model.actorName,
      subjectName: model.recipeName,
      results: model.results,
      consumed: model.consumed,
      tools: model.tools,
      rollValue: model.rollValue,
      checkNote: model.checkNote,
      failureReason: model.failureReason,
    },
    CRAFTING_CHAT_KEYS,
    localize
  );
}
