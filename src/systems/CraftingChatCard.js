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
 *
 * ## The complications block lives here and serves all FOUR builders (issue 1286)
 *
 * A fired component complication has to reach the crafting card, the salvage card, the
 * gathering card and the aggregated bulk-salvage card. Four copies of one `<li>` shape
 * is the duplication this module already exists to prevent, so {@link renderComplications}
 * is a single renderer parameterised by the BEM block token its caller's card uses —
 * `craft` for the three that emit `fabricate-craft-chat`, `gather` for the gathering
 * card. The gathering card imports it rather than growing a second copy, which is the
 * first thing that module has ever taken from this one.
 *
 * Two properties of that renderer are load-bearing rather than incidental:
 *
 *  - **It is the escaping boundary.** A complication contributes a GM-authored `name`
 *    and a free-prose `description`, and Fabricate imports third-party crafting systems,
 *    so a hostile definition carrying markup is the threat model — not a typo. EVERY
 *    authored string routes through {@link esc}, and every attribute the block writes is
 *    DOUBLE-quoted, because `esc` deliberately does not escape `'`.
 *  - **It returns `''` for an empty list**, exactly as {@link renderSection} does, so a
 *    component with no complications produces a card byte-identical to the pre-change
 *    build in all four builders. That identity is asserted, not assumed.
 */

const ITEM_FALLBACK_IMG = 'icons/svg/item-bag.svg';

/**
 * The ONE heading key every complications block reads, whichever card draws it.
 *
 * Shared across the four builders on the `FABRICATE.Chat.Roll` precedent — the crafting,
 * salvage and bulk cards already read one key for a label that means the same thing in
 * all of them — rather than authored four times with four family prefixes. A complication
 * is the same object on every card, so four keys would be four chances for a locale to
 * disagree with itself about what to call it.
 *
 * It is a FLAT leaf in the `Chat` namespace, matching every other card key; see
 * `BulkSalvageChatCard.js`'s key-map docblock for why a container object beneath that
 * namespace must never be authored, and why neither the namespace nor a container path is
 * spelled out as a dotted literal in prose anywhere under `src`.
 */
const COMPLICATIONS_HEADING_KEY = 'FABRICATE.Chat.Complications';

/**
 * The card BEM blocks a complications block can be rendered into, by token.
 *
 * A token rather than a free-text prefix, and resolved through `Object.hasOwn` for the
 * reason `BulkSalvageChatCard.js`'s `STATUS_MODIFIERS` lookup already records: a bare
 * index reaches the prototype, and this value is interpolated into a `class` attribute.
 * Making the vocabulary closed means no caller-supplied string can ever reach a class
 * name, which is a stronger guarantee than escaping one would be.
 */
const COMPLICATION_BLOCKS = Object.freeze({
  craft: 'fabricate-craft-chat',
  gather: 'fabricate-gather-chat',
});

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
  complications: COMPLICATIONS_HEADING_KEY,
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
 * Render ONE fired complication as a list item in the shared grid (issue 1286).
 *
 * Three authored strings reach it and all three are hostile-by-assumption: `name` and
 * `description` are GM prose, and `severity` is a vocabulary token that the persisted
 * shape deliberately PRESERVES when malformed, so it is not safe to treat as one of the
 * three known words. Every one of them goes through {@link esc}.
 *
 * `severity` is carried as a double-quoted `data-` attribute rather than interpolated
 * into a class name: it is the block's only attribute that carries authored text, so it
 * is where the double-quoting rule is actually load-bearing (`esc` does not escape `'`,
 * by design and by the shipped contract every other card already relies on). It renders
 * no visible text, so it needs no localization and adds no key.
 *
 * `componentName` is the STAGE OCCURRENCE's component, resolved by the engine. It is on
 * the row because a player reading "you missed the iron ingot" against a card that also
 * GRANTED an iron ingot cannot otherwise reconcile the two.
 *
 * @param {{name?: string, description?: string, severity?: string, componentName?: string}} entry
 * @param {string} block The resolved BEM block, from {@link COMPLICATION_BLOCKS}.
 * @returns {string}
 */
function renderComplication(entry, block) {
  const parts = [`<span class="${block}__complication-name">${esc(entry?.name)}</span>`];
  if (entry?.componentName) {
    parts.push(`<span class="${block}__complication-source">${esc(entry.componentName)}</span>`);
  }
  if (entry?.description) {
    parts.push(`<span class="${block}__complication-description">${esc(entry.description)}</span>`);
  }
  return [
    `<li class="${block}__item ${block}__item--complication" data-fabricate-complication-severity="${esc(entry?.severity)}">`,
    `<span class="${block}__label">${parts.join(' — ')}</span>`,
    '</li>',
  ].join('');
}

/**
 * Render the fired-complications section, or '' when nothing fired (issue 1286).
 *
 * The ONE renderer all four card builders use. It emits only classes the shipped
 * `fabricate-craft-chat` / `fabricate-gather-chat` rules already define, plus a
 * `--complication` element modifier and a `--complications` section modifier for which
 * there is deliberately no rule yet — the same "unstyled modifier lands on the base
 * treatment" move `BulkSalvageChatCard.js`'s `--mixed` makes, so this needs no new CSS
 * and cannot regress a card that has none.
 *
 * ## The caller has already redacted
 *
 * This renders whatever it is given, so the audience filter is NOT here: every caller
 * feeds it the output of `publicComplications`, which is the only projection that may
 * reach a player. Putting a filter here as well would put the disclosure guarantee in two
 * places and make it ambiguous which one is authoritative.
 *
 * @param {object} options
 * @param {Array<object>} [options.entries] Already-redacted complication rows.
 * @param {string} [options.heading] The already-localized section heading.
 * @param {'craft'|'gather'} [options.card] Which card's BEM block to emit.
 * @returns {string} HTML, or '' when there is nothing to render.
 */
export function renderComplications({ entries, heading, card = 'craft' } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const block = Object.hasOwn(COMPLICATION_BLOCKS, card)
    ? COMPLICATION_BLOCKS[card]
    : COMPLICATION_BLOCKS.craft;
  return [
    `<section class="${block}__section ${block}__section--complications">`,
    `<div class="${block}__heading">${esc(heading)}</div>`,
    `<ul class="${block}__grid">`,
    ...entries.map((entry) => renderComplication(entry, block)),
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
 * @param {Array<{name:string,description:string,severity:string,componentName:string}>}
 *   [model.complications] - Component complications this resolution FIRED, already
 *   redacted to the player-visible set by the caller (issue 1286). Absent or empty
 *   renders nothing at all, so a system authoring none is byte-identical.
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

  // LAST, after what the resolution produced and what it cost: a complication is a
  // consequence OF the award, so it reads as one only once the award has been stated.
  const complications = renderComplications({
    entries: model.complications,
    heading: loc(keys.complications),
    card: 'craft',
  });

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
    complications,
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
      complications: model.complications,
    },
    CRAFTING_CHAT_KEYS,
    localize
  );
}
