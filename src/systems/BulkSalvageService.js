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
import { salvageCheckNeed } from '../ui/presenters/salvageCheckNeed.js';
// The player forecast projection and its trigger-id read, both import-free leaves.
import { forecastComplications } from '../utils/complicationPlan.js';
import { findById, getDefinitionIndex } from '../utils/definitionIndex.js';
import { localizeWith } from '../utils/localizeWithFallback.js';
import { applyPlayerResultOrder } from '../utils/progressiveResultOrder.js';
import { checkTriggerIdsOf } from '../utils/progressiveStageComplications.js';

import { buildAdditionalDiceReach, resolveAdditionalDiceBudget } from './additionalDice.js';
import { advantageOfferFields, intersectAdvantageOffers } from './checkAdvantage.js';
import { buildCheckModifierContext, resolveEligibleModifierIds } from './checkModifierResolver.js';
import { activeCheckEvaluation, actorRollData } from './checkTarget.js';
import { countRequired } from './countCheck.js';
import { additionalDiceOffer } from './countCheckRoll.js';
import { resolvePool } from './countEvaluation.js';
import { awardReceipts } from './runHistoryEvidence.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';
import { resolvedComponentsFor, salvageToolsFor } from './scopedEntityReads.js';

/** Whether a subject's salvage check offers the prompt's situational bonus (issue 2005). */
function offersSituationalBonus(system) {
  return resolveSalvageCheck(system).config?.offerSituationalBonus !== false;
}

/**
 * The batch decision one subject rolls with: a typed bonus applies only where its check offers
 * one, and bought dice only on a row the additional-dice choice covers (issue 2008).
 */
function subjectRollDecision(entry, rollDecision, dice) {
  if (!rollDecision) return rollDecision;
  const keepBonus = offersSituationalBonus(entry.system);
  const keepDice = rollDecision.additionalDice === undefined || dice.eligible.has(entry);
  if (keepBonus && keepDice) return rollDecision;
  const { additionalDice, ...rest } = rollDecision;
  return {
    ...rest,
    ...(!keepBonus && { bonus: null }),
    ...(keepDice && additionalDice !== undefined && { additionalDice }),
  };
}

/** The refusals that stop a batch: its resource ran out or became unavailable (issue 2008). */
const STOPPING_REFUSALS = new Set([
  'resourceChanged',
  'spendRefused',
  'spendUnconfirmed',
  'choiceAboveLimit',
  'resourceMacroFailed',
  'resourceOverridden',
  'resourceNotWritable',
  'resourceUnreadable',
]);

/** A batch that offers no additional dice. */
const NO_DICE = Object.freeze({ eligible: new Set(), rows: new Map(), offer: null, mixed: false });

/** A usable row's additional-dice policy when its count check offers them, else null. */
function entryAdditionalDice(entry) {
  const evaluation = activeCheckEvaluation(resolveSalvageCheck(entry.system).config);
  const policy = evaluation.pool?.additionalDice;
  return evaluation.product === 'count' && policy?.enabled === true ? policy : null;
}

/** The resource a policy pays from: its stored path, or its read and spend macro pair. */
function resourceKey(policy) {
  return policy.source === 'macro'
    ? ['macro', policy.readMacroUuid, policy.spendMacroUuid].join('\n')
    : ['path', String(policy.path ?? '').trim()].join('\n');
}

/**
 * One covered row's pool before bought dice and its reach, as its own prompt would judge them.
 * Both are null where a library modifier or a Tool could move the pool, which the batch prompt
 * cannot settle, so that row never disables an action.
 */
function rowAdditionalDice(entry, actor) {
  const unjudged = { countDice: null, reach: null };
  const { mode, config } = resolveSalvageCheck(entry.system);
  const context = buildCheckModifierContext(entry.system, 'salvage', entry.component);
  if (resolveEligibleModifierIds(context).length > 0) return unjudged;
  if (salvageToolsFor(entry.system, entry.component?.salvage).length > 0) return unjudged;
  const evaluation = activeCheckEvaluation(config);
  const rollData = actorRollData(actor);
  const pool = resolvePool({ evaluation, thresholdMode: config?.thresholdMode, rollData });
  if (!pool.ok) return unjudged;
  const override = entry.component?.salvage?.successesOverride;
  return {
    countDice: {
      base: pool.policy.resolved.base,
      poolDelta: 0,
      zeroPoolFails: evaluation.pool?.zeroPoolFails !== false,
      destination: evaluation.pool?.modifierDestination === 'threshold' ? 'threshold' : 'pool',
    },
    reach: buildAdditionalDiceReach({
      policy: pool.policy,
      needed: mode === 'simple' ? countRequired(evaluation, override) : null,
      triggers: config?.checkBreakage?.triggers ?? [],
      evaluation,
      routed: mode === 'routed',
    }),
  };
}

/** The read macro's payload for one batch read (data-models § Additional Dice Macro Contract). */
function batchPayload(eligible, actor) {
  const [first] = eligible;
  const systems = new Set(eligible.map((entry) => entry.system));
  return {
    actor,
    craftingSystem: systems.size === 1 ? first.system : null,
    activity: 'salvage',
    recipe: null,
    component: eligible.length === 1 ? first.component : null,
    task: null,
    evaluation: structuredClone(activeCheckEvaluation(resolveSalvageCheck(first.system).config)),
    rolls: eligible.length,
  };
}

/** One batch budget read as the rolling user, the user every row then spends as. */
function readBudgetAsUser({ additionalDice, actor, payload }) {
  const user = globalThis.game?.user ?? null;
  return resolveAdditionalDiceBudget({
    additionalDice,
    actor,
    user,
    payload: { ...payload, user },
  });
}

/** Mark a row the batch never ran; the row that stopped it also carries `stop` (issue 2008). */
function markExhausted(entry, exhaustion, stop = null) {
  entry.outcome = 'skipped';
  Object.assign(entry.item, {
    outcome: 'skipped',
    skipReason: BULK_SALVAGE_SKIP_REASONS.resourceExhausted,
    message: '',
    additionalDiceExhaustion: exhaustion,
    ...stop,
  });
}

/**
 * The targets one gesture may carry, enforced at SELECTION so salvage and destroy share one bound;
 * re-checked here as a backstop, hence the `maxItems` seam that makes `bulkLimit` testable.
 */
export const BULK_MAX_ITEMS = 25;

/**
 * Pre-flight refusals, advisory: the engine stays authoritative and can still fail a row.
 * `resourceExhausted` alone is not pre-flight: a mid-batch stop marks the rows it never ran.
 */
export const BULK_SALVAGE_SKIP_REASONS = Object.freeze({
  unknownSystem: 'unknownSystem',
  featureDisabled: 'featureDisabled',
  unknownComponent: 'unknownComponent',
  salvageDisabled: 'salvageDisabled',
  duplicate: 'duplicate',
  bulkLimit: 'bulkLimit',
  resourceExhausted: 'resourceExhausted',
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
 * A row's rolled total: the raw `data.total` first, since a forced crit overwrites `value` (as
 * `rollTotalForCard` reads it), the top-level `value` last, since `salvage()` threads it only on
 * success, and null for a zero pool, which rolled nothing.
 */
function rowRollValue(checkResult, result) {
  if (checkResult?.data?.zeroPool === true) return null;
  return firstFinite(checkResult?.data?.total, checkResult?.value, result?.value);
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
   * forecast reads it; a row resolves against the order its run captured. `getActor` and
   * `readAdditionalDiceBudget` read the one batch budget additional dice are offered from.
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
    getActor = (uuid) => globalThis.fromUuidSync?.(uuid) ?? null,
    readAdditionalDiceBudget = readBudgetAsUser,
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
    this.getActor = getActor;
    this.readAdditionalDiceBudget = readAdditionalDiceBudget;
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
      return {
        cancelled: true,
        items: [],
        counts: countBy([]),
        posted: false,
        ...decision.refusal,
      };

    await this._runEntries(entries, decision, { interactive, onProgress });

    const items = entries.map((entry) => entry.item);
    // Beside the aggregate card as one relay, and before it: the relay is ordered "after the award
    // commits, before the chat card is posted", and the aggregate card is this run's card.
    this._deliverComplications(entries);
    const posted = await this._postAggregateCard(entries, decision.rollDecision);
    return { cancelled: false, items, counts: countBy(items), posted };
  }

  /**
   * Run every entry in order, SEQUENTIAL BY CONTRACT (see the module header). Progress counts every
   * entry, pre-flight skips included, since the panel marks the queued rows in this order. A row
   * whose resource ran out stops the batch: it and every later row are skipped (issue 2008).
   */
  async _runEntries(entries, { rollDecision, dice = NO_DICE }, { interactive, onProgress }) {
    let completed = 0;
    let rolled = 0;
    let exhaustion = null;
    for (const entry of entries) {
      if (entry.outcome === null && exhaustion) markExhausted(entry, exhaustion);
      else if (entry.outcome === null) {
        const covered = dice.eligible.has(entry);
        await this._runOne(entry, {
          interactive,
          rollDecision: subjectRollDecision(entry, rollDecision, dice),
          additionalDiceRolls: covered ? dice.rolls : null,
        });
        if (entry.additionalDiceStop) {
          exhaustion = Object.freeze({
            resourceLabel: dice.label,
            done: rolled,
            rolls: dice.rolls,
          });
          markExhausted(entry, exhaustion, entry.additionalDiceStop);
        } else if (covered) rolled += 1;
      }
      completed += 1;
      reportBulkProgress(onProgress, completed, entries.length);
    }
  }

  /**
   * The batch's additional-dice plan (issue 2008): the rows one choice covers and the offer, read
   * once for every roll, when they share one actor and one resource; `mixed` when they do not.
   * The offer's `max` is the lowest any covered row allows.
   */
  async _additionalDicePlan(usable) {
    const eligible = usable.filter((entry) => entryAdditionalDice(entry));
    if (eligible.length === 0) return NO_DICE;
    const policies = eligible.map(entryAdditionalDice);
    const owners = eligible.map((entry, index) => {
      return `${entry.target?.actorUuid}\n${resourceKey(policies[index])}`;
    });
    if (new Set(owners).size > 1) return { ...NO_DICE, mixed: true };
    const actor = this.getActor(eligible[0].target?.actorUuid);
    const labels = new Set(policies.map((policy) => policy.label ?? ''));
    const policy = {
      ...policies[0],
      max: Math.min(...policies.map((entry) => entry.max)),
      label: labels.size === 1 ? [...labels][0] : '',
    };
    const budget = await this.readAdditionalDiceBudget({
      additionalDice: policy,
      actor,
      payload: batchPayload(eligible, actor),
    });
    const rolls = eligible.length;
    return {
      eligible: new Set(eligible),
      rows: new Map(eligible.map((entry) => [entry, rowAdditionalDice(entry, actor)])),
      offer: additionalDiceOffer({ additionalDice: policy, budget, rolls }),
      mixed: false,
      rolls,
      label: policy.label,
    };
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
   * before the first `salvage()`, so a cancel mutates nothing. The advantage offer intersects the
   * usable checks' own offers, from their AUTHORED rules, which the listing projection lacks.
   */
  async _resolveRollDecision(runnable, interactive) {
    const none = { cancelled: false, rollDecision: null };
    if (interactive !== true || typeof this.promptRollDecision !== 'function') return none;

    const usable = runnable.filter((entry) => resolveSalvageCheck(entry.system).checkUsable);
    if (usable.length === 0) return none;

    const advantageOffer = intersectAdvantageOffers(
      usable.map((entry) => {
        const { config, rollFormula } = resolveSalvageCheck(entry.system);
        return advantageOfferFields(config, activeCheckEvaluation(config), rollFormula)
          .advantageOffer;
      })
    );
    const actorNames = new Set(runnable.map((entry) => entry.item.actorName));
    const dice = await this._additionalDicePlan(usable);
    const choice = await this.promptRollDecision({
      allowAdvantage: advantageOffer.advantage,
      advantageOffer,
      activity: this._salvageActivity(),
      actorName: actorNames.size === 1 ? [...actorNames][0] || undefined : undefined,
      count: runnable.length,
      subjects: runnable.map((entry) => promptSubject(entry, dice)),
      ...(dice.offer && { additionalDiceOffer: dice.offer }),
      ...(dice.mixed && { additionalDiceMixed: true }),
    });
    if (!choice || choice.confirmed === false) return { cancelled: true, rollDecision: null };
    return batchDecision(choice, dice);
  }

  /** The prompt heading's activity, localized when the key resolves. */
  _salvageActivity() {
    return localizeWith(
      this.localize,
      'FABRICATE.App.Journal.Filters.Kind.Salvage',
      undefined,
      'Salvage'
    );
  }

  /** Salvage one target, never throwing: a throw becomes an `error` row and the run goes on. */
  async _runOne(entry, { interactive, rollDecision, additionalDiceRolls = null }) {
    const { item } = entry;
    try {
      const result = await this.salvage(
        entry.target.actorUuid,
        entry.target.systemId,
        entry.target.componentId,
        // Deferred, so a 25-row run is ONE socket message per (system, actor) pair rather than
        // 25, inside the GM-side rate limit; each row still fires its own complications and
        // returns the GM requests for `_deliverComplications` to batch.
        {
          interactive,
          rollDecision,
          suppressChat: true,
          deferComplicationDelivery: true,
          ...(additionalDiceRolls && { additionalDiceRolls }),
        }
      );
      const outcome = classifySalvageOutcome(result);
      entry.additionalDiceStop = STOPPING_REFUSALS.has(result?.additionalDiceRefusal) && {
        additionalDiceRefusal: result.additionalDiceRefusal,
        additionalDiceNotice: result.additionalDiceNotice ?? null,
      };
      const salvageRun = result?.salvageRun ?? null;

      entry.outcome = outcome;
      item.outcome = outcome;
      item.message = result?.message ?? '';
      item.rollValue = rowRollValue(salvageRun?.checkResult, result);
      item.tierStep = salvageRun?.checkResult?.data?.tierStepApplied ?? null;
      item.check = result?.check ?? null;
      item.results = awardReceipts(result?.results).map((created) => ({
        name: created?.name || '',
        img: created?.img || '',
        quantity: created.quantity,
      }));
      item.tools = brokenToolEntries(salvageRun, entry.system); // ratchet-exempt(world-scope): not-a-system
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
          check: item.check ?? null,
          message: item.message,
        })),
        results: sumChatEntriesByName(subjects.flatMap((item) => item.results)),
        consumed: sumChatEntriesByName(subjects.flatMap((item) => item.consumed)),
        tools: dedupeTools(subjects.flatMap((item) => item.tools)), // ratchet-exempt(world-scope): not-a-system
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

/** One prompt row: its need, its bonus offer, and the pool and reach a covered row is judged by. */
function promptSubject(entry, dice) {
  return {
    name: entry.item.name,
    img: entry.item.img,
    need: salvageCheckNeed({ ...resolveSalvageCheck(entry.system), component: entry.component }),
    offerSituationalBonus: offersSituationalBonus(entry.system),
    ...(dice.rows.has(entry) && { additionalDice: dice.rows.get(entry) }),
  };
}

/**
 * `promptCheckRoll`'s shape minus `confirmed`, so the engine reads a pre-resolved choice, never a
 * fresh prompt result a tightened early exit could read as a cancellation. Bought dice ride along
 * when chosen; a choice the offer refuses cancels the batch with its reason, mutating nothing.
 */
function batchDecision(choice, dice) {
  const { offer } = dice;
  if (offer && choice.additionalDiceRefusal) {
    const notice = { dice: choice.additionalDice, limit: offer.limit, available: offer.available };
    return {
      cancelled: true,
      rollDecision: null,
      refusal: {
        additionalDiceRefusal: choice.additionalDiceRefusal,
        additionalDiceNotice: { ...notice, label: dice.label, source: null },
      },
    };
  }
  return {
    cancelled: false,
    rollDecision: {
      bonus: choice.bonus,
      rollMode: choice.rollMode,
      advantage: choice.advantage,
      ...(offer && choice.additionalDice > 0 && { additionalDice: choice.additionalDice }),
    },
    dice,
  };
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
