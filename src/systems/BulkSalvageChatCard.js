/**
 * Pure presentation helper for the AGGREGATED bulk-salvage result chat card (issue
 * 859).
 *
 * A bulk run posts ONE card for N subjects instead of N cards.
 * {@link module:src/systems/CraftingChatCard}'s `buildResultCard` cannot express that
 * — it carries one `subjectName`, one `rollValue` and one `status` — so this module
 * composes its own layout out of that module's exported markup ATOMS (`esc`,
 * `renderSection` — which renders each entry through `renderItem` — `renderRollTotal`
 * and `tierStepText`). Every class it emits is an existing `fabricate-craft-chat`
 * class, so the aggregate card inherits the shipped stylesheet verbatim and needs no
 * new CSS.
 *
 * ## This module is a MARKUP BUILDER and nothing else
 *
 * It never touches `game`, `ui` or `ChatMessage`, and it neither applies message
 * visibility nor posts. Probe → translate → apply → create belongs with the
 * `postChatMessage` wiring, which owns the one Foundry-version edge that decides
 * whether a legacy roll-mode token goes to `ChatMessage.applyMode` (V14) or
 * `applyRollMode` (V13). Keeping that OUT of here is what makes the card trivially
 * unit-testable with no Foundry stubs — the same reason `CraftingChatCard.js` is
 * pure — and it also keeps the "which token did the applier receive" assertion in the
 * suite that imports the applier, where it can actually fail.
 *
 * ## Three statuses, two stylesheet modifiers, on purpose
 *
 * `succeeded` and `failed` take the shipped `--success` / `--failure` left-border
 * colours. `mixed` emits `fabricate-craft-chat--mixed`, for which there is
 * deliberately NO rule: the base `.fabricate-craft-chat` already paints
 * `border-left: 3px solid var(--fab-accent-strong)`, so an unstyled modifier lands on
 * the neutral accent — which is exactly what "some worked, some did not" should read
 * as. `partial` was rejected as the token because it already names a progressive
 * award mode.
 *
 * ## Counts are substituted HERE
 *
 * `localize` stays a key-only `(key) => string`, matching every other card module, so
 * the count placeholders in the summary line are filled in-module — the
 * `tierStepText` precedent. Widening the localize contract for one string would
 * ripple through every card module and its tests.
 */

import { esc, renderRollTotal, renderSection, tierStepText } from './CraftingChatCard.js';
import { SALVAGE_CHAT_KEYS } from './SalvageChatCard.js';

const ITEM_FALLBACK_IMG = 'icons/svg/item-bag.svg';

/**
 * The bulk-only label keys.
 *
 * Everything a single salvage card already names — the actor label, the recovered /
 * consumed / broken-tool headings, the roll label and the three tier-step sentences —
 * is read from {@link SALVAGE_CHAT_KEYS} rather than re-spelled here, so the aggregate
 * card cannot drift from the single card's vocabulary.
 *
 * Every key is a FLAT leaf in the `Chat` namespace, matching the prefix convention the
 * crafting, gathering and salvage cards already follow. A `BulkSalvage` CONTAINER
 * object beneath that namespace must never be authored: some locale would sooner or
 * later author it as a string, which silently shadows every child key beneath it.
 * `tests/ui-lang-keys-resolve.test.js` exists because that failure is invisible at
 * runtime — `localize` returns the key verbatim on a non-string result.
 *
 * NEITHER the namespace NOR the container path is spelled out above as a dotted
 * literal, and that is the general rule for prose anywhere in `src`: the guard scans
 * raw source TEXT and does not strip comments, so ANY dotted name in a comment is
 * counted as a real reference. Naming the container makes the gate demand a key whose
 * whole point is that it must not exist; naming the namespace inflates the guard's
 * exact tally of namespace bases with one that no code actually uses.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BULK_SALVAGE_CHAT_KEYS = Object.freeze({
  succeeded: 'FABRICATE.Chat.BulkSalvageSuccess',
  mixed: 'FABRICATE.Chat.BulkSalvageMixed',
  failed: 'FABRICATE.Chat.BulkSalvageFailure',
  summary: 'FABRICATE.Chat.BulkSalvageSummary',
  subjects: 'FABRICATE.Chat.BulkSalvageSubjects',
  outcomeSucceeded: 'FABRICATE.Chat.BulkSalvageOutcomeSucceeded',
  outcomeFailed: 'FABRICATE.Chat.BulkSalvageOutcomeFailed',
  outcomeWaiting: 'FABRICATE.Chat.BulkSalvageOutcomeWaiting',
  outcomeMisconfigured: 'FABRICATE.Chat.BulkSalvageOutcomeMisconfigured',
  outcomeSkipped: 'FABRICATE.Chat.BulkSalvageOutcomeSkipped',
  outcomeCancelled: 'FABRICATE.Chat.BulkSalvageOutcomeCancelled',
  outcomeError: 'FABRICATE.Chat.BulkSalvageOutcomeError',
});

/**
 * Outcome token -> the key naming its one-line row copy.
 *
 * The map is TOTAL over the service's outcome vocabulary even though a `skipped`
 * subject never reaches the card (it never reached the engine, so there is nothing to
 * report to the table): a lookup miss renders the subject's name with no copy rather
 * than the literal token, and a future outcome that forgets its key degrades to a
 * bare name instead of leaking an identifier into chat.
 */
const OUTCOME_COPY_KEYS = Object.freeze({
  succeeded: BULK_SALVAGE_CHAT_KEYS.outcomeSucceeded,
  failed: BULK_SALVAGE_CHAT_KEYS.outcomeFailed,
  waiting: BULK_SALVAGE_CHAT_KEYS.outcomeWaiting,
  misconfigured: BULK_SALVAGE_CHAT_KEYS.outcomeMisconfigured,
  skipped: BULK_SALVAGE_CHAT_KEYS.outcomeSkipped,
  cancelled: BULK_SALVAGE_CHAT_KEYS.outcomeCancelled,
  error: BULK_SALVAGE_CHAT_KEYS.outcomeError,
});

/** The stylesheet state modifier for each roll-up status. */
const STATUS_MODIFIERS = Object.freeze({
  succeeded: 'success',
  mixed: 'mixed',
  failed: 'failure',
});

/**
 * Substitute `{count}` placeholders into an already-localized sentence.
 *
 * EVERY key of `counts` is offered as a placeholder, so the locale author picks the
 * sentence and this module does not have to be edited to add a number to it. A
 * placeholder the sentence does not use is simply not replaced.
 *
 * @param {string} text An already-localized sentence.
 * @param {Record<string, number>} counts
 * @returns {string}
 */
function substituteCounts(text, counts) {
  let output = String(text ?? '');
  for (const [name, value] of Object.entries(counts || {})) {
    output = output.replaceAll(`{${name}}`, String(value ?? 0));
  }
  return output;
}

/**
 * Render one subject row: the salvaged source, what became of it, and — when a check
 * actually rolled — its own total.
 *
 * The row is a `fabricate-craft-chat__item`, the same leaf `renderItem` produces, so
 * it sits in the same grid under the same rules. The roll is `renderRollTotal`'s
 * shipped label/value pair rather than a bare number, so an aggregate row reads
 * exactly like the single card's roll line.
 *
 * @param {object} subject
 * @param {(key:string)=>string} loc Key-only lookup that never returns nullish.
 * @returns {string}
 */
function renderSubject(subject, loc) {
  const copyKey = OUTCOME_COPY_KEYS[subject?.outcome];
  const parts = [esc(subject?.name)];
  if (copyKey) parts.push(esc(loc(copyKey)));
  const step = tierStepText(subject?.tierStep, SALVAGE_CHAT_KEYS, loc);
  if (step !== null) parts.push(esc(step));
  // The engine's own message is the only place a subject can say WHY — "Not enough
  // Iron Ore to salvage. Need 2, have 1". A success has already said everything it
  // has to say in its outcome copy and its recovered items, so the message would only
  // repeat them.
  if (subject?.outcome !== 'succeeded' && subject?.message) parts.push(esc(subject.message));

  return [
    '<li class="fabricate-craft-chat__item">',
    `<img class="fabricate-craft-chat__icon" src="${esc(subject?.img || ITEM_FALLBACK_IMG)}" alt="" />`,
    `<span class="fabricate-craft-chat__label">${parts.join(' — ')}</span>`,
    renderRollTotal(subject?.rollValue, loc(SALVAGE_CHAT_KEYS.roll)),
    '</li>',
  ]
    .filter(Boolean)
    .join('');
}

/**
 * Build the HTML content for the aggregated bulk-salvage result chat card.
 *
 * The model is already filtered and aggregated by the caller — in particular, the
 * per-system `features.chatOutput` gate is applied BEFORE this function sees a
 * subject, because only the caller holds the crafting systems. Nothing is posted at
 * all when no subject qualifies, which is the caller's decision for the same reason.
 *
 * @param {object} model
 * @param {'succeeded'|'mixed'|'failed'} model.status Run roll-up. `mixed` — never
 *   `partial`, which already names a progressive award mode.
 * @param {string[]} [model.actorNames] Distinct acting actors, in run order.
 * @param {Record<string, number>} [model.counts] Offered to the summary sentence as
 *   `{name}` placeholders; `total`, `succeeded` and `failed` are always present.
 * @param {Array<{name:string,img:string,outcome:string,rollValue:number|null,
 *   tierStep:object|null,message:string}>} [model.subjects] One row per salvaged
 *   source, in execution order.
 * @param {Array<{name:string,img:string,quantity:number}>} [model.results] Everything
 *   recovered across the run, summed per component.
 * @param {Array<{name:string,img:string,quantity:number}>} [model.consumed] Every
 *   source broken down, summed per component.
 * @param {Array<{name:string,img:string}>} [model.tools] Tools that broke, deduped.
 * @param {(key:string)=>string} [localize] Key-only lookup; defaults to identity.
 * @returns {string} HTML string suitable for ChatMessage content.
 */
export function buildBulkSalvageChatContent(model = {}, localize = (key) => key) {
  const loc = (key) => localize(key) ?? key;
  const status = STATUS_MODIFIERS[model.status] ? model.status : 'mixed';
  const title = loc(BULK_SALVAGE_CHAT_KEYS[status]);

  const actorNames = (model.actorNames || []).filter(Boolean);
  const subtitle = `${esc(loc(SALVAGE_CHAT_KEYS.actor))}: ${esc(actorNames.join(', '))}`;

  const summaryText = substituteCounts(loc(BULK_SALVAGE_CHAT_KEYS.summary), model.counts);
  const summary = summaryText
    ? `<div class="fabricate-craft-chat__notice">${esc(summaryText)}</div>`
    : '';

  const subjects = model.subjects || [];
  const subjectSection =
    subjects.length > 0
      ? [
          '<section class="fabricate-craft-chat__section fabricate-craft-chat__section--subjects">',
          `<div class="fabricate-craft-chat__heading">${esc(loc(BULK_SALVAGE_CHAT_KEYS.subjects))}</div>`,
          '<ul class="fabricate-craft-chat__grid">',
          ...subjects.map((subject) => renderSubject(subject, loc)),
          '</ul>',
          '</section>',
        ].join('')
      : '';

  // The aggregate sections are the SINGLE card's sections, so a bulk card's lower half
  // reads exactly like a salvage card's — `renderSection` returns '' for an empty list,
  // so a run that recovered nothing simply has no Recovered heading.
  const sections = [
    renderSection({
      heading: loc(SALVAGE_CHAT_KEYS.results),
      entries: model.results,
      modifier: 'results',
    }),
    renderSection({
      heading: loc(SALVAGE_CHAT_KEYS.consumed),
      entries: model.consumed,
      modifier: 'consumed',
    }),
    renderSection({
      heading: loc(SALVAGE_CHAT_KEYS.tools),
      entries: model.tools,
      modifier: 'tools',
    }),
  ].filter(Boolean);

  return [
    `<div class="fabricate-craft-chat fabricate-craft-chat--${STATUS_MODIFIERS[status]}">`,
    '<header class="fabricate-craft-chat__header">',
    `<div class="fabricate-craft-chat__title">${esc(title)}</div>`,
    `<div class="fabricate-craft-chat__subtitle">${subtitle}</div>`,
    '</header>',
    summary,
    subjectSection,
    ...sections,
    '</div>',
  ]
    .filter(Boolean)
    .join('');
}

/**
 * Sum image-backed entries by `name` + `img`, ordered by name.
 *
 * Exported because the SERVICE aggregates and the CARD renders, and both would
 * otherwise need this: two rows can recover the same component from different sources,
 * and a card that listed "Iron Ingot ×1" three times reads as a bug. `localeCompare`
 * is passed explicitly — an uncompared `Array#sort()` is a SonarCloud finding and, on
 * a list of names, genuinely wrong.
 *
 * @param {Array<{name?:string,img?:string,quantity?:number}>} entries
 * @returns {Array<{name:string,img:string,quantity:number}>}
 */
export function sumChatEntriesByName(entries) {
  const byKey = new Map();
  for (const entry of entries || []) {
    if (!entry) continue;
    const name = entry.name || '';
    const img = entry.img || '';
    // A newline can appear in neither half, so it is the one separator under which
    // "Ore" + "/x.png" cannot collide with a differently-split pair the way a space or
    // a dot would.
    const key = [name, img].join('\n');
    const quantity = Number(entry.quantity);
    const total = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    const existing = byKey.get(key);
    if (existing) existing.quantity += total;
    else byKey.set(key, { name, img, quantity: total });
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}
