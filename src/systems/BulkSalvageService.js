/**
 * Runs a BULK salvage: one player gesture, N salvage attempts, one aggregated chat
 * card (issue 859).
 *
 * ## Every collaborator is injected, and nothing here reaches a Foundry global
 *
 * `game`, `ui` and `ChatMessage` do not appear in this module. The engine call, the
 * crafting-system lookup, the roll prompt, the chat post and the localization lookup
 * all arrive as seams, so the whole outcome vocabulary — the part of this feature that
 * is engine semantics rather than presentation — is unit-testable against plain
 * objects. That is also why the service lives neither in `src/main.js` (unimportable
 * under `node --test`) nor in the runes store.
 *
 * ## Execution is STRICTLY SEQUENTIAL, and that is a correctness requirement
 *
 * `Promise.all` would be wrong three separate ways, so the `for…of`/`await` below must
 * not be "optimised":
 *
 * 1. Tool breakage at item *k* must be visible at item *k+1*. A batch that broke the
 *    same hammer concurrently would salvage every row against a hammer that was
 *    already gone.
 * 2. Stack depletion is shared. Two rows resolving to the same owned stack must see
 *    each other's consumption.
 * 3. Each salvage run record is a read-modify-write actor `setFlag`. There is no
 *    compare-and-set anywhere in the run store, so concurrent writers lose entries.
 *
 * ## Duplicate targets cannot double-consume
 *
 * Safety comes from that sequencing plus each `salvage()` call's own availability
 * check — which re-derives the owned documents from `actor.items` at call time — NOT
 * from the caller handing over a disjoint set. The defensive dedupe below is retained
 * anyway, because a duplicated row is a UI defect worth reporting rather than
 * silently executing twice.
 */

import { hasPlainD20 } from '../utils/craftingCheckExpression.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';

import { buildBulkSalvageChatContent, sumChatEntriesByName } from './BulkSalvageChatCard.js';
import { awardedQuantityOf } from './componentStacking.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';

/**
 * The maximum number of targets one bulk gesture may carry.
 *
 * The bound is enforced at SELECTION time so bulk salvage and bulk destroy inherit one
 * limit — a cap applied only here would let a 40-row selection salvage 25 and destroy
 * all 40, which puts the unbounded behaviour on the destructive path. It is re-checked
 * here as a defensive backstop, which is why {@link BulkSalvageService} takes it as a
 * `maxItems` seam: the `bulkLimit` branch is unreachable through the UI and would
 * otherwise be untestable.
 */
export const BULK_MAX_ITEMS = 25;

/**
 * The reasons a target is refused BEFORE the engine is called. Advisory only — the
 * engine stays authoritative, and a target that passes pre-flight can still fail for a
 * reason only the engine can see (not enough units, tools unavailable, a time gate).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BULK_SALVAGE_SKIP_REASONS = Object.freeze({
  unknownSystem: 'unknownSystem',
  featureDisabled: 'featureDisabled',
  unknownComponent: 'unknownComponent',
  salvageDisabled: 'salvageDisabled',
  duplicate: 'duplicate',
  bulkLimit: 'bulkLimit',
});

/**
 * Classify what one `salvage()` return means, in the ONE order that is total.
 *
 * The order is load-bearing rather than stylistic, because two of the discriminators
 * travel alongside a `success` value that contradicts them:
 *
 * - the time gate returns `waiting: true` WITH `success: true` (the run started; it
 *   awarded nothing), so `waiting` must be read before `success === true` or every
 *   time-gated row reports as recovered;
 * - a misconfigured check returns `misconfigured: true` WITH `success: false`, so it
 *   must be read before `success === false` or a GM-side config gap reports to the
 *   player as a failed roll that never happened.
 *
 * The table is total GIVEN a salvage run manager. Without one the time gate never
 * arms, so a runless salvage carrying a `timeRequirement` simply never returns
 * `waiting` — stated because the mapping otherwise reads as unconditional.
 *
 * @param {object|null} result A `CraftingEngine#salvage` return.
 * @returns {'cancelled'|'misconfigured'|'waiting'|'succeeded'|'failed'}
 */
export function classifySalvageOutcome(result) {
  if (result?.cancelled === true) return 'cancelled';
  if (result?.misconfigured === true) return 'misconfigured';
  if (result?.waiting === true) return 'waiting';
  if (result?.success === true) return 'succeeded';
  return 'failed';
}

/** The first finite number in `values`, or `null` when there is none. */
function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

/**
 * The tools that BROKE during one salvage, as plain `{ name, img }` chat entries.
 *
 * Mirrors `CraftingEngine._resolveBrokenToolChatEntries`, against the run record
 * rather than the live breakage evidence, because that evidence never leaves the
 * engine: `salvage()` returns tool information only through `salvageRun.usedTools`.
 * On the RUNLESS path (`salvageRun === null`) there is therefore no tool evidence at
 * all and this correctly yields nothing — a stated limit of the aggregate card, not a
 * silent one.
 *
 * This ran once per bulk ROW and built its own whole-library `Map` before looking at the
 * run record at all, so an N-row run over an M-component library paid `N x M` to answer a
 * question that is almost always "no tools broke" (issue 1202). The retained index is
 * built once for the array and only consulted when there IS a broken record.
 *
 * The lookup is also now FIRST-wins on a duplicated component id rather than last-wins,
 * because that is what `findById` reproduces and what every other component lookup in the
 * codebase does; the previous `new Map(...)` was uniquely last-wins by accident of
 * construction, not by design.
 */
function brokenToolEntries(salvageRun, system) {
  const broken = (salvageRun?.usedTools || []).filter((record) => record?.broken === true);
  if (broken.length === 0) return [];
  const index = getDefinitionIndex(system?.components);
  return broken.map((record) => {
    const component = record.componentId ? findById(index, record.componentId) : null;
    return { name: component?.name || '', img: component?.img || '' };
  });
}

/**
 * How many units of the source this call actually broke down.
 *
 * The run record is preferred because it is what was really consumed; the authored
 * `ingredientQuantity` is the fallback for the runless path, where a success is known
 * to have consumed exactly that much.
 */
function consumedUnits(result, component, outcome) {
  const recorded = salvageRunConsumed(result?.salvageRun);
  if (recorded !== null) return recorded;
  if (outcome !== 'succeeded') return 0;
  return Number(component?.salvage?.ingredientQuantity) || 1;
}

/**
 * Tell an optional listener that one more target has resolved — and NEVER let that
 * listener cost the player the rest of the batch.
 *
 * A bulk run is mid-flight document mutation: sources have been consumed, results
 * created and tools broken by the time the first tick fires. So a throw out of a
 * consumer's callback must not propagate, for the same reason `_runOne` turns a thrown
 * `salvage()` into an `error` row rather than an abort — reporting is strictly less
 * important than the twenty-four rows that have not run yet. Notification is FIRE AND
 * FORGET: the return value is ignored and never awaited, so a listener that returns a
 * promise cannot pace the loop either.
 *
 * @param {Function|null} onProgress The caller's listener, or anything that is not a
 *   function (including the `null` default), which reports nothing at all.
 * @param {number} completed Targets resolved so far, 1-based and monotonic.
 * @param {number} total Targets this run was given.
 */
function reportBulkProgress(onProgress, completed, total) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(completed, total);
  } catch (error) {
    console.error('Fabricate | A bulk salvage progress listener threw; the run continues:', error);
  }
}

/** Sum a run record's `consumedComponents`, or `null` when there is no record. */
function salvageRunConsumed(salvageRun) {
  if (!Array.isArray(salvageRun?.consumedComponents)) return null;
  return salvageRun.consumedComponents.reduce(
    (sum, entry) => sum + (Number(entry?.quantity) || 0),
    0
  );
}

export class BulkSalvageService {
  /**
   * @param {object} options
   * @param {Function} options.salvage The engine's `salvage(actorUuid, systemId,
   *   componentId, options)`, already bound.
   * @param {Function} options.getCraftingSystem `(systemId) => system|null`.
   * @param {Function} [options.promptRollDecision] Opens the ONE bulk roll prompt and
   *   resolves `{ confirmed, bonus, rollMode, advantage }`. Omitted (or absent) means
   *   no prompt is possible, so every roll uses its base formula.
   * @param {Function} [options.postChatMessage] Posts the aggregated card. It — not
   *   this service and not the card builder — owns speaker, visibility and creation.
   * @param {Function} [options.localize] Key-only localization lookup.
   * @param {number} [options.maxItems] Defensive selection bound; see
   *   {@link BULK_MAX_ITEMS}.
   */
  constructor({
    salvage,
    getCraftingSystem,
    promptRollDecision = null,
    postChatMessage = null,
    localize = (key) => key,
    maxItems = BULK_MAX_ITEMS,
  } = {}) {
    this.salvage = salvage;
    this.getCraftingSystem = getCraftingSystem;
    this.promptRollDecision = promptRollDecision;
    this.postChatMessage = postChatMessage;
    this.localize = typeof localize === 'function' ? localize : (key) => key;
    this.maxItems = Number.isFinite(maxItems) && maxItems > 0 ? maxItems : BULK_MAX_ITEMS;
  }

  /**
   * Salvage every target in order.
   *
   * ## THIS METHOD PERFORMS NO OWNERSHIP CHECK
   *
   * It receives a FACADE-DERIVED `actorUuid` per target and hands it straight to
   * `CraftingEngine#salvage`, which — as its own docblock records — resolves the uuid
   * through `fromUuid` and mutates that actor's Items with no ownership gate of its
   * own. The only gate is at the facade, where `salvageComponents` takes an ACTOR ID
   * per target and resolves it through `_resolveCraftingActor`. **No UI may plumb a
   * uuid through to `targets[].actorUuid`**; the supported entry point is the facade,
   * and this service is deliberately not exported onto `game.fabricate`.
   *
   * @param {object} params
   * @param {Array<{actorUuid: string, actorId: string, actorName: string,
   *   systemId: string, componentId: string}>} params.targets Targets in the order the
   *   player sees them. Order is preserved end to end, so a report row and a card row
   *   line up with the queue the player committed.
   * @param {boolean} [params.interactive=true] When true the run opens ONE roll prompt
   *   and applies the player's answer to every roll.
   * @param {Function} [params.onProgress] Called `(completed, total)` after each target
   *   resolves — see {@link reportBulkProgress}. OPTIONAL by design: every caller that
   *   wants no progress simply omits it, and a run without one behaves identically.
   *   Nothing downstream of the callback is awaited, so a listener can neither pace nor
   *   stall a loop that is mutating documents.
   * @returns {Promise<{cancelled: boolean, items: object[], counts: object,
   *   posted: boolean}>} Plain models only — NEVER Item documents. A consumed source's
   *   document is already deleted by the time this returns, so handing one back would
   *   hand back a document that no longer exists.
   */
  async run({ targets = [], interactive = true, onProgress = null } = {}) {
    const entries = this._preflight(targets);
    const runnable = entries.filter((entry) => entry.outcome === null);

    const decision = await this._resolveRollDecision(runnable, interactive);
    if (decision.cancelled)
      return { cancelled: true, items: [], counts: countBy([]), posted: false };

    // Progress is reported over EVERY entry, pre-flight skips included, rather than over
    // `runnable`. The panel marks the rows the player queued, in this same order, so a
    // counter that silently omitted the skipped ones would mark the wrong rows done and
    // would stop short of its own total on any run carrying a skip.
    let completed = 0;
    for (const entry of entries) {
      // SEQUENTIAL BY CONTRACT — see the module docblock. Never `Promise.all`. A
      // pre-flight-classified row never reaches the engine, but it is still one of the
      // rows being worked through, so it advances the count like any other.
      if (entry.outcome === null) {
        await this._runOne(entry, { interactive, rollDecision: decision.rollDecision });
      }
      completed += 1;
      reportBulkProgress(onProgress, completed, entries.length);
    }

    const items = entries.map((entry) => entry.item);
    const posted = await this._postAggregateCard(entries, decision.rollDecision);
    return { cancelled: false, items, counts: countBy(items), posted };
  }

  /**
   * Classify each target WITHOUT calling the engine, preserving input order.
   *
   * The selection bound is applied first and by POSITION, because "the 26th selected
   * item" is refused regardless of whether it would otherwise have been runnable.
   *
   * @private
   */
  _preflight(targets) {
    const seen = new Set();
    return (targets || []).map((target, index) => {
      const system = this.getCraftingSystem?.(target?.systemId) ?? null;
      const component = findComponent(system, target?.componentId);
      const key = `${target?.actorId}\n${target?.systemId}\n${target?.componentId}`;
      const skipReason = this._skipReasonFor({ index, system, component, key, seen });
      seen.add(key);
      return {
        target,
        system,
        component,
        outcome: skipReason ? 'skipped' : null,
        item: buildItem(target, component, skipReason),
      };
    });
  }

  /** First-match skip classification for one target, or `null` when it is runnable. */
  _skipReasonFor({ index, system, component, key, seen }) {
    const reasons = BULK_SALVAGE_SKIP_REASONS;
    if (index >= this.maxItems) return reasons.bulkLimit;
    if (!system) return reasons.unknownSystem;
    if (system.features?.salvage !== true) return reasons.featureDisabled;
    if (!component) return reasons.unknownComponent;
    if (component.salvage?.enabled !== true) return reasons.salvageDisabled;
    if (seen.has(key)) return reasons.duplicate;
    return null;
  }

  /**
   * Open the ONE roll prompt, or establish that there is nothing to prompt about.
   *
   * Two structural guarantees live here:
   *
   * - **No usable check means no prompt.** Asking a player for a situational bonus for
   *   a batch in which nothing rolls is a dialog with no consequence.
   * - **A dismissal returns before the FIRST `salvage()` call.** Zero mutation on
   *   cancel is achieved structurally, by not having started, rather than by rolling
   *   anything back — there is nothing in this domain that could be rolled back.
   *
   * `allowAdvantage` is computed HERE, from the crafting system's AUTHORED formula,
   * and is all-or-nothing across the usable-check subjects: offering advantage that
   * only some rolls could honour would be a lie about half the batch. It is
   * deliberately not read from the listing projection, which carries no formula at all
   * — `InventoryListingBuilder._buildSalvage` computes one and discards it.
   *
   * @private
   */
  async _resolveRollDecision(runnable, interactive) {
    const none = { cancelled: false, rollDecision: null };
    if (interactive !== true || typeof this.promptRollDecision !== 'function') return none;

    const usable = runnable.filter((entry) => resolveSalvageCheck(entry.system).checkUsable);
    if (usable.length === 0) return none;

    const allowAdvantage = usable.every((entry) =>
      hasPlainD20(resolveSalvageCheck(entry.system).rollFormula)
    );
    const choice = await this.promptRollDecision({
      allowAdvantage,
      count: runnable.length,
      subjects: runnable.map((entry) => ({
        name: entry.item.name,
        img: entry.item.img,
      })),
    });
    if (!choice || choice.confirmed === false) return { cancelled: true, rollDecision: null };

    // `promptCheckRoll`'s shape MINUS `confirmed`, which is what makes the engine treat
    // it as a pre-resolved choice rather than as a fresh prompt result. Carrying
    // `confirmed` through would be read as a cancellation by any future tightening of
    // the evaluator's early exit.
    return {
      cancelled: false,
      rollDecision: {
        bonus: choice.bonus,
        rollMode: choice.rollMode,
        advantage: choice.advantage,
      },
    };
  }

  /**
   * Salvage one target and record what happened. NEVER throws: a thrown call becomes
   * an `error` row and the run continues, because one bad row must not cost the player
   * the other twenty-four.
   *
   * @private
   */
  async _runOne(entry, { interactive, rollDecision }) {
    const { item } = entry;
    try {
      const result = await this.salvage(
        entry.target.actorUuid,
        entry.target.systemId,
        entry.target.componentId,
        { interactive, rollDecision, suppressChat: true }
      );
      const outcome = classifySalvageOutcome(result);
      const salvageRun = result?.salvageRun ?? null;

      entry.outcome = outcome;
      item.outcome = outcome;
      item.message = result?.message ?? '';
      // A progressive check overwrites `value` with the AWARDING value on a forced
      // crit, so the raw `data.total` is preferred wherever a run record carries it —
      // the same precedence `rollTotalForCard` applies inside the engine. The
      // top-level `value` is the last resort because `salvage()` threads it only on
      // the SUCCESS return; a rolled failure's total is reachable only through the run.
      item.rollValue = firstFinite(
        salvageRun?.checkResult?.data?.total,
        salvageRun?.checkResult?.value,
        result?.value
      );
      item.tierStep = salvageRun?.checkResult?.data?.tierStepApplied ?? null;
      item.results = (result?.results || []).map((created) => ({
        name: created?.name || '',
        img: created?.img || '',
        quantity: awardedQuantityOf(created),
      }));
      item.tools = brokenToolEntries(salvageRun, entry.system);

      const units = consumedUnits(result, entry.component, outcome);
      item.consumed = units > 0 ? [{ name: item.name, img: item.img, quantity: units }] : [];
    } catch (error) {
      console.error(
        `Fabricate | Bulk salvage failed for component "${entry.target?.componentId}":`,
        error
      );
      entry.outcome = 'error';
      item.outcome = 'error';
      item.message = error?.message ?? String(error);
    }
  }

  /**
   * Build and post the ONE aggregated card.
   *
   * ## The `chatOutput` gate is PER SYSTEM, and applied here
   *
   * A run can span crafting systems, and each system's GM decides independently
   * whether Fabricate narrates to chat. So a subject appears on the card iff ITS OWN
   * system has `features.chatOutput === true`, and when no subject qualifies nothing
   * is posted at all — not an empty card. This is the service's job rather than the
   * card builder's because only the service holds the crafting systems; the builder is
   * pure.
   *
   * A `skipped` row never reached the engine and so has nothing to tell the table; it
   * belongs to the in-panel report only.
   *
   * @private
   */
  async _postAggregateCard(entries, rollDecision) {
    if (typeof this.postChatMessage !== 'function') return false;

    const eligible = entries.filter(
      (entry) => entry.outcome !== 'skipped' && entry.system?.features?.chatOutput === true
    );
    if (eligible.length === 0) return false;

    const subjects = eligible.map((entry) => entry.item);
    const actorNames = [...new Set(eligible.map((entry) => entry.item.actorName).filter(Boolean))];
    const actorUuids = new Set(eligible.map((entry) => entry.target?.actorUuid));
    const content = buildBulkSalvageChatContent(
      {
        status: rollUpStatus(subjects),
        actorNames,
        counts: countBy(subjects),
        subjects: subjects.map((item) => ({
          name: item.name,
          img: item.img,
          outcome: item.outcome,
          rollValue: item.rollValue,
          tierStep: item.tierStep,
          message: item.message,
        })),
        results: sumChatEntriesByName(subjects.flatMap((item) => item.results)),
        consumed: sumChatEntriesByName(subjects.flatMap((item) => item.consumed)),
        tools: dedupeTools(subjects.flatMap((item) => item.tools)),
      },
      this.localize
    );

    try {
      await this.postChatMessage({
        content,
        // The legacy roll-mode token the player chose, or null when nothing prompted.
        // The POSTER owns the version edge that decides which applier receives it and
        // in which vocabulary, and owns the fallback to the client's `core.rollMode`
        // when this is null. Translating here would put that decision in two places.
        rollMode: rollDecision?.rollMode ?? null,
        // A one-actor run speaks AS that actor. A run spanning actors has no single
        // speaker, so the poster falls back to an explicit alias with the acting user
        // rather than letting `getSpeaker` infer one from controlled tokens — which
        // would attribute the card to whatever unrelated NPC a GM had selected.
        actorUuid: actorUuids.size === 1 ? [...actorUuids][0] : null,
        actorNames,
      });
      return true;
    } catch (error) {
      // A chat failure must never cost the player an award that already happened.
      console.error('Fabricate | Failed to post the bulk salvage chat message:', error);
      return false;
    }
  }
}

/** Resolve a component id against a system's managed components. */
function findComponent(system, componentId) {
  return findById(getDefinitionIndex(system?.components), componentId);
}

/** The plain, document-free report row for one target. */
function buildItem(target, component, skipReason) {
  return {
    actorId: target?.actorId ?? null,
    actorName: target?.actorName ?? '',
    systemId: target?.systemId ?? null,
    componentId: target?.componentId ?? null,
    name: component?.name || '',
    img: component?.img || '',
    outcome: skipReason ? 'skipped' : null,
    skipReason: skipReason ?? null,
    rollValue: null,
    tierStep: null,
    message: '',
    results: [],
    consumed: [],
    tools: [],
  };
}

/** Tally rows by outcome, always reporting every outcome the vocabulary defines. */
function countBy(items) {
  const counts = {
    total: (items || []).length,
    succeeded: 0,
    failed: 0,
    waiting: 0,
    misconfigured: 0,
    skipped: 0,
    cancelled: 0,
    error: 0,
  };
  for (const item of items || []) {
    if (Object.hasOwn(counts, item?.outcome)) counts[item.outcome] += 1;
  }
  return counts;
}

/**
 * The card's roll-up: `succeeded` only when every row succeeded, `failed` when none
 * did, `mixed` otherwise. `mixed` rather than `partial`, which already names a
 * progressive award mode.
 */
function rollUpStatus(items) {
  const succeeded = items.filter((item) => item.outcome === 'succeeded').length;
  if (succeeded === items.length) return 'succeeded';
  if (succeeded === 0) return 'failed';
  return 'mixed';
}

/** Dedupe broken-tool entries by name + image; a tool breaks once per run. */
function dedupeTools(tools) {
  const byKey = new Map();
  for (const tool of tools || []) {
    byKey.set([tool?.name || '', tool?.img || ''].join('\n'), {
      name: tool?.name || '',
      img: tool?.img || '',
    });
  }
  return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name));
}
