/**
 * Runs a bulk salvage (issue 859; DOMAIN.md "Bulk Salvage"): one gesture, N salvage attempts, one
 * aggregated chat card. Every collaborator is injected and no Foundry global is read, so the
 * outcome vocabulary is unit-testable. Execution is STRICTLY SEQUENTIAL, never `Promise.all`: tool
 * breakage at row k must be visible at k+1, rows can share a stack, and each run record is a
 * read-modify-write `setFlag` with no compare-and-set. That sequencing plus each `salvage()`'s own
 * availability check stops duplicate targets double-consuming; the dedupe is defensive.
 */

import {
  buildBulkSalvageChatContent,
  sumChatEntriesByName,
} from '../ui/presenters/BulkSalvageChatCard.js';
// The player forecast projection and its trigger-id read, both import-free leaves.
import { forecastComplications } from '../utils/complicationPlan.js';
import { hasPlainD20 } from '../utils/craftingCheckExpression.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { checkTriggerIdsOf } from '../utils/progressiveStageComplications.js';

import { awardReceipts } from './runHistoryEvidence.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import { resolvedComponentsFor } from './scopedEntityReads.js';

/**
 * The targets one gesture may carry, enforced at SELECTION so salvage and destroy share one bound;
 * re-checked here as a backstop, hence the `maxItems` seam that makes `bulkLimit` testable.
 */
export const BULK_MAX_ITEMS = 25;

/** Pre-flight refusals, advisory: the engine stays authoritative and can still fail a row. */
export const BULK_SALVAGE_SKIP_REASONS = Object.freeze({
  unknownSystem: 'unknownSystem',
  featureDisabled: 'featureDisabled',
  unknownComponent: 'unknownComponent',
  salvageDisabled: 'salvageDisabled',
  duplicate: 'duplicate',
  bulkLimit: 'bulkLimit',
});

/**
 * What one `salvage()` return means, in the one total order: the time gate returns `waiting` WITH
 * `success: true` and a misconfigured check `misconfigured` WITH `success: false`, so both are read
 * before `success`. Total given a salvage run manager; without one the time gate never arms.
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
 * The tools that broke in one salvage, as `{ name, img }`, read from the run record because
 * `salvage()` returns tool evidence only there (the runless path has none, a stated limit). It
 * answers the question `CraftingEngine._resolveBrokenToolChatEntries` answers but is no mirror: it
 * resolves `componentId` only, does not dedupe, and is first-wins on a duplicated component id.
 * The index is consulted only when a record broke (issue 1202).
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

/** Units consumed: the run record's, else `ingredientQuantity` on a runless success. */
function consumedUnits(result, component, outcome) {
  const recorded = salvageRunConsumed(result?.salvageRun);
  if (recorded !== null) return recorded;
  if (outcome !== 'succeeded') return 0;
  return Number(component?.salvage?.ingredientQuantity) || 1;
}

/**
 * Report progress fire-and-forget, absorbing a listener's throw: the batch is mid-flight
 * mutation, so reporting must never cost the rows not yet run.
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
   * `promptRollDecision` opens the ONE bulk roll prompt (absent: base formulas); `postChatMessage`
   * owns speaker, visibility and creation. Without `deliverComplications` the rows still fire
   * their complications and relay none, the drop a GM-less world takes. `getPlayerResultOrder` is
   * the engine's own seam, read with the same `salvage:<systemId>:<componentId>` id, and only the
   * forecast reads it; a row resolves against the order its run captured.
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
   * Salvage every target in order. NO OWNERSHIP CHECK: each `actorUuid` goes straight to
   * `CraftingEngine#salvage`, which mutates that actor's Items ungated, so the facade's
   * `salvageComponents` (actor ids through `_resolveCraftingActor`) is the only gate, no UI may
   * plumb a uuid through, and this service is never exported on `game.fabricate`. `interactive`
   * opens ONE prompt applied to every roll; `onProgress(completed, total)` is optional and never
   * awaited. Answers plain models only, since a consumed source's document is already deleted.
   */
  async run({ targets = [], interactive = true, onProgress = null } = {}) {
    const entries = this._preflight(targets);
    const runnable = entries.filter((entry) => entry.outcome === null);

    const decision = await this._resolveRollDecision(runnable, interactive);
    if (decision.cancelled)
      return { cancelled: true, items: [], counts: countBy([]), posted: false };

    // Progress counts every entry, pre-flight skips included, since the panel marks the queued
    // rows in this order.
    let completed = 0;
    for (const entry of entries) {
      // SEQUENTIAL BY CONTRACT (see the module header); a skipped row still advances the count.
      if (entry.outcome === null) {
        await this._runOne(entry, { interactive, rollDecision: decision.rollDecision });
      }
      completed += 1;
      reportBulkProgress(onProgress, completed, entries.length);
    }

    const items = entries.map((entry) => entry.item);
    // Beside the aggregate card as one relay, and before it: the relay is ordered "after the award
    // commits, before the chat card is posted", and the aggregate card is this run's card.
    this._deliverComplications(entries);
    const posted = await this._postAggregateCard(entries, decision.rollDecision);
    return { cancelled: false, items, counts: countBy(items), posted };
  }

  /**
   * The pre-run complication forecast (issue 1286): per queued `(systemId, componentId)`, in queue
   * order, the player-visible complications a PROGRESSIVE row could fire, one entry per stage
   * occurrence (`resultId` tells repeats apart) in the player's stored stage order. Built over
   * `_preflight`, so it honours the selection cap and every skip without a second filter. `count`
   * totals the entries, a warning rather than a run-wide prediction. The rule matches the store's
   * (`ui-crafting-app/spec.md` § Player Salvage Surface, _Bulk complication forecast_), and the
   * audience filter lives in the forecast projection alone. No caller in this repository reads
   * it: the shipped bulk block reads the inventory store.
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
   * One row's ordered progressive stage results: `_resolveProgressiveSalvageAward`'s ordering
   * half, the first result group in the player's order unless the GM pinned the authored one.
   */
  _forecastStageResults(entry) {
    const salvage = entry.component?.salvage ?? null;
    const groups = Array.isArray(salvage?.resultGroups) ? salvage.resultGroups : [];
    const authored = Array.isArray(groups[0]?.results) ? groups[0].results : [];
    if (authored.length === 0) return authored;
    if (salvage?.allowPlayerResultReorder === false) return authored;
    // Keyed `<systemId>:<componentId>`, as component ids are not globally unique; it must match
    // the store's write key and the engine's capture key.
    const ordered = this.getPlayerResultOrder({
      scope: 'salvage',
      id: `${entry.target?.systemId}:${entry.target?.componentId}`,
    });
    return applyPlayerResultOrder(authored, ordered);
  }

  /**
   * One row's player-visible complications, one per stage occurrence with no dedupe, since each
   * occurrence can go wrong on its own; a stage names the component it PRODUCES.
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
   * Relay every row's complications to the elected GM, one message per `(craftingSystemId,
   * actorUuid)` pair, because both are authorization inputs the GM re-reads and cannot ride per
   * entry. Fire and forget, and guarded: a relay failure must not cost the player the card.
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

  /** Classify each target without the engine, in input order; the cap goes first, by POSITION. */
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
   * Open the ONE roll prompt, or not: no usable check means no prompt, and a dismissal returns
   * before the first `salvage()`, so a cancel mutates nothing. `allowAdvantage` is all-or-nothing
   * over the usable checks' AUTHORED formulas, which the listing projection does not carry.
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

    // `promptCheckRoll`'s shape minus `confirmed`, so the engine reads a pre-resolved choice,
    // never a fresh prompt result a tightened early exit could read as a cancellation.
    return {
      cancelled: false,
      rollDecision: {
        bonus: choice.bonus,
        rollMode: choice.rollMode,
        advantage: choice.advantage,
      },
    };
  }

  /** Salvage one target, never throwing: a throw becomes an `error` row and the run goes on. */
  async _runOne(entry, { interactive, rollDecision }) {
    const { item } = entry;
    try {
      const result = await this.salvage(
        entry.target.actorUuid,
        entry.target.systemId,
        entry.target.componentId,
        // Deferred, so a 25-row run is ONE socket message per (system, actor) pair rather than
        // 25, inside the GM-side rate limit; each row still fires its own complications and
        // returns the GM requests for `_deliverComplications` to batch.
        { interactive, rollDecision, suppressChat: true, deferComplicationDelivery: true }
      );
      const outcome = classifySalvageOutcome(result);
      const salvageRun = result?.salvageRun ?? null;

      entry.outcome = outcome;
      item.outcome = outcome;
      item.message = result?.message ?? '';
      // The raw `data.total` first, since a forced crit overwrites `value` (as `rollTotalForCard`
      // reads it); the top-level `value` last, since `salvage()` threads it only on success.
      item.rollValue = firstFinite(
        salvageRun?.checkResult?.data?.total,
        salvageRun?.checkResult?.value,
        result?.value
      );
      item.tierStep = salvageRun?.checkResult?.data?.tierStepApplied ?? null;
      item.results = awardReceipts(result?.results).map((created) => ({
        name: created?.name || '',
        img: created?.img || '',
        quantity: created.quantity,
      }));
      item.tools = brokenToolEntries(salvageRun, entry.system);
      // GM requests stay on the ENTRY, never the card model; the engine-redacted player
      // complications go on the ITEM with the component name the bulk card attributes them by.
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
   * Build and post the ONE aggregated card. The `chatOutput` gate is per system: a subject appears
   * only when its own system narrates, and with none nothing posts. A skipped row stays in-panel.
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
        // Every row's engine-redacted player complications, in run order and undeduped (each row
        // is its own run); this service holds no audience filter and must not grow one.
        complications: subjects.flatMap((item) => item.complications || []),
      },
      this.localize
    );

    try {
      await this.postChatMessage({
        content,
        // The legacy token the player chose, or null; the poster owns the version edge and the
        // `core.rollMode` fallback.
        rollMode: rollDecision?.rollMode ?? null,
        // One actor speaks as itself; several get an explicit alias from the poster, never
        // `getSpeaker`'s guess from controlled tokens.
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

/** `succeeded` if all did, `failed` if none did, else `mixed` (`partial` names an award mode). */
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
