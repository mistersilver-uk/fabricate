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

// The PLAYER forecast projection, and the trigger-id read that keeps it honest. Both are
// import-free leaves, so the "what could go wrong" preview costs this service no closure.
import { forecastComplications } from '../utils/complicationPlan.js';
import { hasPlainD20 } from '../utils/craftingCheckExpression.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { checkTriggerIdsOf } from '../utils/progressiveStageComplications.js';

import { buildBulkSalvageChatContent, sumChatEntriesByName } from './BulkSalvageChatCard.js';
import { awardedQuantityOf } from './componentStacking.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';

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
 * Reads the run record rather than the live breakage evidence, because that evidence
 * never leaves the engine: `salvage()` returns tool information only through
 * `salvageRun.usedTools`. On the RUNLESS path (`salvageRun === null`) there is therefore
 * no tool evidence at all and this correctly yields nothing — a stated limit of the
 * aggregate card, not a silent one.
 *
 * ## What it shares with the per-item card, and what it does NOT
 *
 * It answers the same QUESTION as `CraftingEngine._resolveBrokenToolChatEntries` — which
 * tools broke, as `{ name, img }` — from the same broken-only filter. It is not a mirror
 * of that function and must not be described as one:
 *
 * - it resolves `record.componentId` only, where the engine also resolves `record.toolId`
 *   against `system.tools` (issue 1119) so an item-sourced Tool is named rather than blank;
 * - it does not de-duplicate, where the engine skips a repeated
 *   `toolId || componentId || itemUuid`;
 * - on a DUPLICATED component id the two now disagree. This one is FIRST-wins, because
 *   that is what `findById` reproduces and what every other component lookup in the
 *   codebase does. The engine's `new Map(...)` is last-wins by accident of construction
 *   — it is a whole-array transform run once, correctly out of scope for issue 1202, and
 *   deliberately left alone.
 *
 * ## Why the index (issue 1202)
 *
 * This ran once per bulk ROW and built its own whole-library `Map` before looking at the
 * run record at all, so an N-row run over an M-component library paid `N x M` to answer a
 * question that is almost always "no tools broke". The retained index is built once for
 * the array and only consulted when there IS a broken record.
 */
function brokenToolEntries(salvageRun, system) {
  const broken = (salvageRun?.usedTools || []).filter((record) => record?.broken === true);
  if (broken.length === 0) return [];
  const index = getDefinitionIndex(resolvedComponentsFor(system));
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
   * @param {Function} [options.deliverComplications] The complication delivery writer's
   *   `deliver({craftingSystemId, actorUuid, complications})`, already bound. Omitted means
   *   the run still FIRES every row's complications — the firing is the engine's and happens
   *   whatever this service does — and simply relays none of them, which is the same drop a
   *   world with no connected GM already takes.
   * @param {Function} [options.getPlayerResultOrder] `({scope, id}) => string[]|null`, the
   *   executing user's stored progressive result order — the SAME seam
   *   `CraftingEngine` captures onto a run record at start, and read with the same
   *   `salvage:<systemId>:<componentId>` id. Consumed by {@link BulkSalvageService#forecast}
   *   only; the run path never reads it here, because the order a row is resolved against is
   *   the one its own run captured. Omitted means the forecast reads the authored order,
   *   which is what an unwired caller got before.
   * @param {Function} [options.localize] Key-only localization lookup.
   * @param {number} [options.maxItems] Defensive selection bound; see
   *   {@link BULK_MAX_ITEMS}.
   */
  constructor({
    salvage,
    getCraftingSystem,
    promptRollDecision = null,
    postChatMessage = null,
    deliverComplications = null,
    getPlayerResultOrder = null,
    localize = (key) => key,
    maxItems = BULK_MAX_ITEMS,
  } = {}) {
    this.salvage = salvage;
    this.getCraftingSystem = getCraftingSystem;
    this.promptRollDecision = promptRollDecision;
    this.postChatMessage = postChatMessage;
    this.deliverComplications = deliverComplications;
    this.getPlayerResultOrder =
      typeof getPlayerResultOrder === 'function' ? getPlayerResultOrder : () => null;
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
    // BESIDE the aggregate card, not per row: every row's GM requests reach the elected GM
    // as one message. Before the card, because the relay is ordered "after the award
    // commits, before the chat card is posted" and the aggregate card is this run's card.
    this._deliverComplications(entries);
    const posted = await this._postAggregateCard(entries, decision.rollDecision);
    return { cancelled: false, items, counts: countBy(items), posted };
  }

  /**
   * The PRE-RUN complication forecast for a bulk selection (issue 1286): what could go
   * wrong, per queued component, before anything is rolled or committed.
   *
   * ## It reuses pre-flight rather than filtering the targets itself
   *
   * The forecast must describe the run that would actually happen, so it is built over
   * {@link BulkSalvageService#_preflight}'s classification and contributes only RUNNABLE
   * rows. That is what makes it respect the selection cap for free: the 26th selected
   * target is refused by POSITION as `bulkLimit`, so it is absent from the preview exactly
   * as it will be absent from the run — and so are the duplicate, unknown-system,
   * feature-disabled, unknown-component and salvage-disabled rows. A second filter here
   * would be a second cap, and the two would drift.
   *
   * ## Progressive only, and in the PLAYER'S order
   *
   * Complications fire from an ordered progressive stage list; every other salvage mode
   * returns null plan inputs from the engine, so a forecast for one would promise a
   * consequence nothing can deliver. Within a row the stages are read in the player's
   * stored order through the same `applyPlayerResultOrder` reconciliation the engine
   * captures onto the run record, honouring `allowPlayerResultReorder: false` the same way
   * — so the preview lists a row's complications in the order the roll will be spent down.
   *
   * ## What "per component" means, and what the count counts
   *
   * One group per queued `(systemId, componentId)`, in queue order: two selected rows of
   * the same component on two actors are one warning, not two. Inside a group there is one
   * entry per STAGE OCCURRENCE that carries the complication, and NO dedupe across
   * occurrences: the runtime fires per result entry, so a component staged five times is
   * five separate awards that can go wrong five separate ways, and an entry list that
   * collapsed them would under-report what the run can do.
   *
   * `count` is the total of those entries, which is therefore a count of the firings this
   * row could produce. It is still not a prediction across the whole run — each queued row
   * is its own resolution, so the same complication can fire again on the next row, and the
   * headline stays a warning rather than arithmetic.
   *
   * This is the same rule and the same shape the in-panel bulk block draws from the store's
   * `attachStageComplications` output (`ui-integration/spec.md` § Bulk complication
   * forecast). The two projections read different sources for different callers; they must
   * not read different rules.
   *
   * Nothing here is an audience decision of this service's own: the entries come from the
   * player forecast projection, which is where the `gmOnly` filter lives, and this service
   * must not grow a second copy of that rule.
   *
   * ## It has no caller in this repository, and that is stated rather than implied
   *
   * The shipped bulk "What could go wrong" block reads the queued entry the inventory store
   * publishes, NOT this method — `ui-integration/spec.md` says so explicitly. This is the
   * service-side projection published for a caller holding no store, and no such caller
   * exists here yet; it is covered by tests and by that spec sentence alone. An earlier
   * revision of this docblock claimed the surface was unshipped and that this was what it
   * would read, and both halves were false.
   *
   * @param {Array<{actorId: string, actorName: string, systemId: string,
   *   componentId: string}>} targets the selection, in the order the player sees it.
   * @returns {{count: number, components: Array<{systemId: string|null,
   *   componentId: string|null, name: string, img: string,
   *   complications: Array<{id: string|null, name: string, description: string,
   *     severity: string, visibility: string, resultId: string|null, componentId: string,
   *     componentName: string}>}>}} `resultId` names the stage occurrence an entry hangs
   *   off, so two entries for a component staged twice are distinguishable rather than
   *   indistinguishable repeats.
   */
  forecast(targets = []) {
    const groups = new Map();
    let count = 0;
    for (const entry of this._preflight(targets)) {
      if (entry.outcome !== null) continue;
      const key = `${entry.target?.systemId}\n${entry.target?.componentId}`;
      if (groups.has(key)) continue;
      const complications = this._forecastComplicationsFor(entry);
      if (complications.length === 0) continue;
      count += complications.length;
      groups.set(key, {
        systemId: entry.target?.systemId ?? null,
        componentId: entry.target?.componentId ?? null,
        name: entry.item.name,
        img: entry.item.img,
        complications,
      });
    }
    return { count, components: [...groups.values()] };
  }

  /**
   * One runnable row's ordered progressive stage results, or `[]` when the row cannot
   * produce a stage list at all.
   *
   * Mirrors `CraftingEngine._resolveProgressiveSalvageAward`'s ordering half exactly: the
   * FIRST result group, reordered by the player's stored order unless the GM pinned the
   * authored one. It stops short of the award loop, which needs a rolled budget this
   * forecast deliberately does not have.
   *
   * @private
   */
  _forecastStageResults(entry) {
    const salvage = entry.component?.salvage ?? null;
    const groups = Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : [];
    const authored = Array.isArray(groups[0]?.results) ? groups[0].results : [];
    if (authored.length === 0) return authored;
    if (salvage?.allowPlayerResultReorder === false) return authored;
    // The id space is `<systemId>:<componentId>` because component ids are not globally
    // unique; it must match the store's write key and the engine's capture key exactly, or
    // the forecast quietly reads the authored order while the run reads the player's.
    const ordered = this.getPlayerResultOrder({
      scope: 'salvage',
      id: `${entry.target?.systemId}:${entry.target?.componentId}`,
    });
    return applyPlayerResultOrder(authored, ordered);
  }

  /**
   * The player-visible complications one runnable row could fire, in stage order, ONE ENTRY
   * PER STAGE OCCURRENCE.
   *
   * There is deliberately no dedupe. The runtime fires per result entry, so a component
   * staged five times is five awards that can each go wrong on their own, and folding them
   * to one entry would promise fewer consequences than the run can deliver. The pair key
   * this method used to hold mirrored a firing rule that no longer exists.
   *
   * The component a stage names is the one it PRODUCES, never the component being
   * salvaged — a complication is authored on the yield.
   *
   * @private
   */
  _forecastComplicationsFor(entry) {
    const { mode, config, unsupportedMode } = resolveSalvageCheck(entry.system);
    if (unsupportedMode || mode !== 'progressive') return [];
    const results = this._forecastStageResults(entry);
    if (results.length === 0) return [];
    const componentIndex = getDefinitionIndex(resolvedComponentsFor(entry.system));
    const checkTriggerIds = checkTriggerIdsOf(config?.checkBreakage);
    const forecast = [];
    for (const result of results) {
      const componentId = result?.componentId || result?.systemItemId || null;
      const component = componentId ? findById(componentIndex, componentId) : null;
      const entries = forecastComplications(component, { activity: 'salvage', checkTriggerIds });
      for (const complication of entries) {
        forecast.push({
          ...complication,
          resultId: result?.id ?? null,
          componentId,
          componentName: component?.name || '',
        });
      }
    }
    return forecast;
  }

  /**
   * Relay every row's complications to the elected GM as ONE message per addressed
   * `(craftingSystemId, actorUuid)` pair (issue 1286).
   *
   * ## Why the grouping is by that pair and not simply "one message"
   *
   * The delivery payload names ONE crafting system and ONE actor, because the elected GM
   * re-reads the authored complication from that system's record and re-authorizes that
   * actor against the attested sender. Both are authorization inputs, so they cannot be
   * per-entry without moving the authorization decision onto the wire. A bulk run may
   * legitimately span actors (`salvageComponents` takes an `actorId` per target), so the
   * honest bound is one message per distinct pair — which for the ordinary run, and for
   * every run the rate limiter was sized against, is exactly one.
   *
   * Fire and forget, and guarded: the awards are committed, the run records are written and
   * the card is about to post, so a relay failure is a lost narrative beat and must never be
   * able to cost the player a report of what they already received.
   *
   * @private
   */
  _deliverComplications(entries) {
    if (typeof this.deliverComplications !== 'function') return;
    const batched = new Map();
    for (const entry of entries) {
      for (const request of entry.complicationRequests || []) {
        const craftingSystemId = entry.target?.systemId ?? null;
        const actorUuid = entry.target?.actorUuid ?? null;
        const key = `${craftingSystemId}\n${actorUuid}`;
        if (!batched.has(key)) batched.set(key, { craftingSystemId, actorUuid, complications: [] });
        batched.get(key).complications.push(request);
      }
    }
    for (const message of batched.values()) {
      try {
        this.deliverComplications(message);
      } catch (error) {
        console.error('Fabricate | Failed to relay bulk salvage complications:', error);
      }
    }
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
        // `deferComplicationDelivery` is what makes a 25-row run ONE socket message rather
        // than 25. The row still fires its own complications — each row is its own
        // resolution — but the GM requests come back on the return for
        // {@link BulkSalvageService#_deliverComplications} to batch. Batching is what keeps a
        // run inside the GM-side rate limit: the relay sends one message per addressed
        // (system, actor) pair, so a fanned-out selection is bounded by the 25-row cap rather
        // than by the row count. A per-row emit would silently refuse the tail of a long run
        // on a path the player never sees.
        { interactive, rollDecision, suppressChat: true, deferComplicationDelivery: true }
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
      // The addressing-only GM requests, held on the ENTRY rather than the item: they are
      // not report rows and must never reach the card model. The player-visible fired
      // complications go on the ITEM, already redacted by the engine through
      // `publicComplications`, and gain the component name the aggregate card names them by
      // — a bulk card lists many components, so an unattributed complication row cannot be
      // reconciled with the results table above it.
      entry.complicationRequests = result?.complicationRequests ?? [];
      item.complications = (result?.complications || []).map((complication) => ({
        ...complication,
        componentName: item.name,
      }));

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
        // Every row's PLAYER-VISIBLE complications, in run order and NOT deduped: they ride
        // this card because a bulk salvage is not one resolution — each row has its own run
        // record — so there is no single run to hang them on. Already redacted by the engine
        // through `publicComplications`, so a `gmOnly` complication cannot be here even when
        // a GM is the acting user; this service holds no audience filter of its own and must
        // not grow one, or the disclosure guarantee would live in two places.
        complications: subjects.flatMap((item) => item.complications || []),
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
  return findById(getDefinitionIndex(resolvedComponentsFor(system)), componentId);
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
    complications: [],
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
