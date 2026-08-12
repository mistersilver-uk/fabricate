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
 *
 * ## The markup ATOMS are exported, not just the card (issue 859)
 *
 * `buildResultCard` has ONE `subjectName`, ONE `rollValue` and ONE `status`, so it
 * cannot express the N subjects a bulk salvage run produces. Rather than let
 * {@link module:src/systems/BulkSalvageChatCard} re-spell the same `<li>`/`<section>`
 * shapes — which would drift from the stylesheet the moment either side is edited —
 * {@link esc}, {@link renderItem}, {@link renderSection}, {@link renderRollTotal} and
 * {@link tierStepText} are exported so the aggregate card composes the SAME atoms
 * against the SAME `fabricate-craft-chat` rules. The promotion is purely additive:
 * every function keeps its body, so the crafting and salvage cards are byte-identical
 * to what `tests/salvage-chat-card.test.js` already pins.
 *
 * {@link tierStepText} is an EXTRACTION rather than a promotion: the bulk card needs
 * the tier-step SENTENCE inline in a subject row, not the block-level notice
 * `renderTierStep` wraps it in, and two derivations of one sentence is exactly the
 * pattern this module exists to avoid. `renderTierStep` now renders what
 * `tierStepText` returns, and the `null` return preserves its "no note at all" branch
 * exactly (see that function's contract).
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
  tierStepUp: 'FABRICATE.Chat.TierStepUp',
  tierStepDown: 'FABRICATE.Chat.TierStepDown',
  tierStepTarget: 'FABRICATE.Chat.TierStepTarget',
  failureReason: 'FABRICATE.Chat.FailureReason',
  consumedOnFailure: 'FABRICATE.Chat.ConsumedOnFailure',
  producedOnFailure: 'FABRICATE.Chat.ProducedOnFailure',
});

/** Escape text destined for HTML so user-authored names cannot inject markup. */
export function esc(value) {
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
export function renderItem({ name, img, quantity }) {
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
export function renderRollTotal(value, label) {
  if (!Number.isFinite(value)) return '';
  return [
    '<div class="fabricate-craft-chat__roll">',
    `<span class="fabricate-craft-chat__roll-label">${esc(label)}</span>`,
    `<span class="fabricate-craft-chat__roll-value">${esc(value)}</span>`,
    '</div>',
  ].join('');
}

/**
 * The localized tier-step SENTENCE (issue 975) for a realized tier change, as a
 * three-way dispatch on the resolved NET `mode`. A `target` step is directionless
 * and countless — "you were placed on Masterwork" has no magnitude — so it reads its
 * own key; a relative `up`/`down` step renders the realized magnitude.
 *
 * The `{steps}` placeholder is substituted HERE rather than by the caller: every card
 * module takes `localize` as a key-only `(key) => string` (its default is identity),
 * so it cannot format, and widening that signature would ripple through the modules,
 * their wrappers and their tests for one string.
 *
 * ## `null` means "no note at all", and is NOT the same as an empty sentence
 *
 * The two are distinguished so {@link renderTierStep} stays byte-identical to the
 * pre-extraction version under ANY `localize`: a `target` step renders its wrapper
 * even when the lookup yields nothing, whereas a malformed relative step renders no
 * wrapper. Collapsing both onto `''` would silently drop the first case.
 *
 * @param {{mode?:'target'|'up'|'down', steps?:number}|null|undefined} tierStep
 * @param {object} keys Label-key map (e.g. {@link CRAFTING_CHAT_KEYS}).
 * @param {(key:string)=>string} [localize] Key-only lookup; defaults to identity.
 * @returns {string|null} The sentence, or `null` when there is no note to render.
 */
export function tierStepText(tierStep, keys, localize = (key) => key) {
  const mode = tierStep?.mode;
  if (mode === 'target') return localize(keys.tierStepTarget);
  if (mode !== 'up' && mode !== 'down') return null;
  // Evidence is present only on a REALIZED move, so a relative step always carries a
  // positive magnitude; anything else is malformed and reads as no note at all rather
  // than a broken "stepped up  tiers" sentence.
  const steps = Number(tierStep.steps);
  if (!Number.isFinite(steps) || steps <= 0) return null;
  const key = mode === 'up' ? keys.tierStepUp : keys.tierStepDown;
  return String(localize(key)).replace('{steps}', String(steps));
}

/** Render {@link tierStepText} as the card's block-level tier-step notice. */
function renderTierStep(tierStep, keys, localize) {
  const text = tierStepText(tierStep, keys, localize);
  if (text === null) return '';
  return `<div class="fabricate-craft-chat__notice fabricate-craft-chat__tier-step">${esc(text)}</div>`;
}

/** Render a titled section with an icon grid; returns '' when there are no entries. */
export function renderSection({ heading, entries, modifier }) {
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
 * @param {{mode:'target'|'up'|'down',steps:number}} [model.tierStep] - Realized routed
 *   tier-step evidence (`data.tierStepApplied`), present only on an actual tier change.
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
  const tierStep = renderTierStep(model.tierStep, keys, loc);

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
      // WHAT A FAILURE PRODUCED (issue 1098). Until the failure-result policy shipped,
      // this branch never read `model.results` at all, so an award threaded to the card
      // rendered as nothing — the seam that made "asserted on the posted chat card"
      // unsatisfiable. It is FIRST, mirroring the success branch's what-you-got-then-what-
      // it-cost order, and `renderSection` returns '' for an empty list, so every failure
      // card that awards nothing is byte-for-byte what it was. Shared with crafting, whose
      // simple/alchemy failure award had the same latent gap.
      renderSection({
        heading: loc(keys.producedOnFailure),
        entries: model.results,
        modifier: 'results',
      }),
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
    tierStep,
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
      tierStep: model.tierStep,
      failureReason: model.failureReason,
    },
    CRAFTING_CHAT_KEYS,
    localize
  );
}
