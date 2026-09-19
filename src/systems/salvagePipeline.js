/**
 * `CraftingEngine.salvage()`'s body, as ordered pipeline functions over one threaded context. Each
 * returns null to proceed or `{ result }` for `salvage()` to return; only `salvage()` reads a
 * Foundry global, opens the settlement bracket, or handles the errors these propagate.
 */
import { publicComplications } from '../utils/complicationPlan.js';
import { activityPermitsFailureResults } from '../utils/failureResultPolicy.js';

import { rollTotalForCard, tierStepForCard } from './craftCardFields.js';
import { readStackQuantity } from './itemStackQuantity.js';
import {
  assertNativeEffectsUninvoked,
  itemReceipt,
  mapConsumedIngredientRef,
} from './runHistoryEvidence.js';
import { resolveSalvageCheck } from './salvageCheckUsability.js';

/** The five-key shape every salvage refusal returns, here and at `salvage()`'s own gates. */
export const salvageRefusal = (message, extras = {}) => ({
  success: false,
  results: null,
  message,
  salvageRun: null,
  ...extras,
});

const refuse = (message, extras = {}) => ({ result: salvageRefusal(message, extras) });

/** Narrow a resolution's fired complications to the four keys the SALVAGE RUN RECORD stores
 * (issue 1286). Redaction happens HERE, at the write, through `publicComplications`, keyed on
 * the AUDIENCE rather than the acting user's role — the container is an ACTOR flag the owning
 * player can read. `resultId` is required: a complication fires per RESULT ENTRY. */
function salvageRunComplicationRecords(fired) {
  return publicComplications(fired).map(({ resultId, componentId, complicationId, buckets }) => ({
    resultId,
    componentId,
    complicationId,
    buckets,
  }));
}

/** The concrete owned Item documents a quantity-based consumption plan will touch, in the same
 * order `CraftingEngine#_consumeComponentItems` uses. */
function selectedQuantityItems(items, quantity) {
  const selected = new Set();
  let remaining = Number(quantity) || 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (remaining <= 0) break;
    selected.add(item);
    // Under-reading here OVER-selects items into the plan that the delete branch then
    // destroys one by one, so this is a routed site even though it never writes.
    remaining -= readStackQuantity(item);
  }
  return selected;
}

/** The run this salvage runs against, the stock it will spend, and the two refusals reachable
 * before anything is created. */
export async function resolveSalvageRunRecord(engine, ctx) {
  const { actor, component, componentId, craftingSystemId, options, system } = ctx;
  const salvageRunManager = engine._getSalvageRunManager();
  let salvageRun = null;
  if (salvageRunManager) {
    salvageRun = options?.runId
      ? salvageRunManager.getActiveRun(actor, options.runId)
      : salvageRunManager.findActiveRunForComponent(actor, craftingSystemId, componentId);
  }
  if (salvageRun) assertNativeEffectsUninvoked(salvageRun);
  ctx.salvageRunManager = salvageRunManager;
  ctx.salvageRun = salvageRun;
  // Track whether THIS call created the salvage run (vs reused an existing one), so a cancelled
  // interactive salvage can discard its phantom run and net ZERO run mutation — mirroring the
  // crafting `createdThisCall` phantom-discard.
  ctx.salvageRunCreatedThisCall = false;

  if (options?.runId && !salvageRun && salvageRunManager) {
    return refuse('Active salvage run not found');
  }

  const ingredientQuantity = Number(component.salvage.ingredientQuantity) || 1;
  const componentItems = engine.findComponentItems(actor, component, system);
  const totalAvailable = componentItems.reduce((sum, item) => sum + readStackQuantity(item), 0);
  ctx.ingredientQuantity = ingredientQuantity;
  ctx.componentItems = componentItems;
  if (totalAvailable < ingredientQuantity) {
    const message = `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`;
    if (salvageRunManager && salvageRun) {
      ctx.salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
        failureReason: message,
      });
    }
    return refuse(message, { salvageRun: ctx.salvageRun });
  }
  return null;
}

/** The synthetic recipe the tool and breakage seams read, and the required-tool gate over it. */
export async function validateSalvageTools(engine, ctx) {
  const { actor, component, componentItems, craftingSystemId, ingredientQuantity } = ctx;
  const { managedItems, salvageRun, salvageRunManager, system } = ctx;
  const syntheticRecipe = { craftingSystemId, components: managedItems };
  const salvageTools = engine._resolveSalvageTools(system, component.salvage);
  const toolValidation = await engine._validateTools(
    [actor],
    syntheticRecipe,
    salvageTools,
    null,
    actor,
    { excludedItems: selectedQuantityItems(componentItems, ingredientQuantity) }
  );
  ctx.syntheticRecipe = syntheticRecipe;
  ctx.toolValidation = toolValidation;
  if (!toolValidation.valid) {
    if (salvageRunManager && salvageRun) {
      ctx.salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
        failureReason: toolValidation.message,
      });
    }
    return refuse(toolValidation.message, { salvageRun: ctx.salvageRun });
  }
  return null;
}

/** The clock sample, the run this call may create, and the time gate's WAIT return. */
export async function openSalvageRun(engine, ctx) {
  const { actor, actorUuid, component, componentId, craftingSystemId } = ctx;
  const { options, readWorldTime, salvageRunManager } = ctx;
  // ONE sample, reused across the `createRun` and `markRunWaitingForTime` awaits below and by the
  // gate's remaining figure. `core.time` moves from the socket at exactly those yields, so a
  // second read here would measure the wait from a clock that has already advanced.
  const now = readWorldTime();
  const timeRequirement = component.salvage?.timeRequirement || null;

  if (salvageRunManager && !ctx.salvageRun) {
    ctx.salvageRun = await salvageRunManager.createRun(actor, {
      actorUuid,
      craftingSystemId,
      componentId,
      componentName: component.name || componentId,
      status: 'inProgress',
      startedAt: now,
      usedTools: [],
      // CAPTURE the starting user's result order onto the run (issue 651 D2) — the ONLY settings
      // read on the salvage path. A resumed salvage is driven by the synced `updateWorldTime`
      // hook, which fires on EVERY client, so reading the order from the run is what makes the
      // executing user irrelevant. The key is scoped per (systemId, componentId), because
      // component ids are NOT globally unique (issue 766), and must match the store's exactly.
      resultOrder: engine.getPlayerResultOrder({
        scope: 'salvage',
        id: `${craftingSystemId}:${componentId}`,
      }),
    });
    ctx.salvageRunCreatedThisCall = true;
  }

  if (salvageRunManager && timeRequirement && !options?.skipTimeGate) {
    ctx.salvageRun = await salvageRunManager.markRunWaitingForTime(
      actor,
      ctx.salvageRun,
      timeRequirement
    );
    const canProceed = salvageRunManager.canProceedTimeGate(ctx.salvageRun, now);
    if (!canProceed) {
      const remaining = Math.max(
        0,
        Math.ceil(Number(ctx.salvageRun.timeGate?.availableAt || 0) - now)
      );
      return {
        result: {
          success: true,
          // The run STARTED and is waiting on world time; nothing has been awarded yet (issue
          // 859). Additive and purely descriptive, so a caller can tell "started, come back later"
          // from "succeeded and awarded" without re-deriving it from `results == null`.
          waiting: true,
          results: null,
          message: `Salvage started for ${component.name || componentId} (${remaining}s remaining)`,
          salvageRun: ctx.salvageRun,
        },
      };
    }
  }

  if (salvageRunManager && ctx.salvageRun) {
    ctx.salvageRun = await salvageRunManager.markRunInProgress(actor, ctx.salvageRun);
  }
  return null;
}

/** The salvage check, the failure policy, and the two zero-mutation aborts the result can carry. */
export async function runSalvageCheck(engine, ctx) {
  const { actor, component, options, salvageRunManager, system, toolValidation } = ctx;
  const checkResult = await engine._runSalvageCraftingCheck(component, system, actor, {
    interactive: options?.interactive === true,
    toolItems: toolValidation.tools,
    rollDecision: options?.rollDecision ?? null,
  });
  ctx.checkResult = checkResult;
  ctx.failurePolicy = engine._getSalvageFailureConsumptionPolicy(system);

  // A misconfigured required salvage check is a GM-side system gap, not a rolled failure: abort
  // with ZERO mutation so the component is never consumed and no tools are broken. Discard a
  // run created by THIS call so nothing is left `inProgress`; a reused pre-existing run is left
  // untouched. The failure-consumption policy below applies only to genuine rolled failures.
  if (checkResult.misconfigured) {
    if (salvageRunManager && ctx.salvageRun && ctx.salvageRunCreatedThisCall) {
      await salvageRunManager.discardRun(actor, ctx.salvageRun.id);
    }
    return refuse(checkResult.message, {
      // Additive discriminator (issue 859): a GM-side config gap, NOT a rolled
      // failure. `success` is unchanged, so no existing consumer regresses; a caller
      // that cares can now say "not configured — tell your GM" instead of reporting a
      // failed roll that never happened.
      misconfigured: true,
      salvageRun: ctx.salvageRunCreatedThisCall ? null : ctx.salvageRun,
    });
  }

  // The player dismissed the interactive roll dialog: a user choice, not a failure. Abort with
  // ZERO mutation before the failure/consumption paths below, and discard a run created by THIS
  // call so a cancel leaves no orphaned `inProgress` run. A reused run is left untouched.
  if (checkResult.cancelled) {
    if (salvageRunManager && ctx.salvageRun && ctx.salvageRunCreatedThisCall) {
      await salvageRunManager.discardRun(actor, ctx.salvageRun.id);
    }
    return refuse('Salvage cancelled', {
      cancelled: true,
      salvageRun: ctx.salvageRunCreatedThisCall ? null : ctx.salvageRun,
    });
  }
  return null;
}

/**
 * The resolution snapshot and the pending settlement, written OUTSIDE the award bracket exactly
 * where `salvage()` opens it today: this actor-flag write's rejection must escape uncaught rather
 * than reach the uncertainty recorder, which would overwrite it with a second write.
 */
export async function beginSalvageSettlement(engine, ctx) {
  const { actor, checkResult, failurePolicy, salvageRun, salvageRunManager, system } = ctx;
  const salvageCheck = resolveSalvageCheck(system);
  if (salvageRunManager && salvageRun) {
    salvageRun.resolutionSnapshot = {
      kind: salvageCheck.checkUsable ? 'check' : 'none',
      mode: salvageCheck.mode,
    };
    salvageRun.historySettlement = {
      consumption:
        checkResult.success || failurePolicy.consumeComponentOnFail ? 'pending' : 'notApplicable',
      awards: 'pending',
    };
    await salvageRunManager.updateRun(actor, salvageRun);
  }
  return null;
}

/**
 * A failed salvage check: the policy's consumption and breakage, then the reserved failure award
 * (issue 1098), which runs after both so the reserved output sees what the attempt spent.
 */
export async function resolveSalvageFailure(engine, ctx) {
  const { actor, checkResult, component, componentItems, failurePolicy } = ctx;
  const { ingredientQuantity, salvageRun, salvageRunManager } = ctx;
  const { syntheticRecipe, system, toolValidation } = ctx;
  if (checkResult.success) return null;
  let consumedOnFail = [];
  let usedTools = [];
  try {
    if (failurePolicy.consumeComponentOnFail) {
      consumedOnFail = await engine._consumeComponentItems(
        actor,
        componentItems,
        ingredientQuantity
      );
      await engine._recordSalvageConsumption(actor, salvageRunManager, salvageRun, consumedOnFail);
    }
    if (failurePolicy.breakToolsOnFail) {
      // Salvage parity (issue 419): the FAILURE path breaks required tools only
      // when `breakToolsOnFail === true` (this gate), matching crafting.
      const salvageFailBreak = engine._resolveSalvageBreakageDecision(system, checkResult);
      usedTools = await engine._applyToolBreakage(syntheticRecipe, toolValidation.tools, {
        forceBreak: salvageFailBreak.forceBreak,
        authority: salvageFailBreak.authority,
        reason: salvageFailBreak.reason,
        triggerId: salvageFailBreak.triggerId,
      });
    }
  } catch (error) {
    if (error.code === 'HISTORY_EFFECT_UNCERTAIN') throw error;
    console.error('Fabricate | Error during salvage failure-path consumption:', error);
  }
  ctx.consumedOnFail = consumedOnFail;
  ctx.usedTools = usedTools;

  // THE FAILURE AWARD (issue 1098, decision 5), which is why `failureResultPolicy: 'never'`
  // is what the 1.25.0 migration seeds onto every existing world. The disposition is
  // EXPLICIT: the default `'success'` would hand back the clamped SUCCESS group instead.
  const failureResultGroups = activityPermitsFailureResults(system, 'salvage')
    ? engine._resolveSalvageResultGroups(component, system, checkResult, salvageRun, 'failure')
    : [];
  // The success branch builds this view before `_createSingleResult`; the failure
  // branch had none, because it never created anything.
  const failureSalvageRecipeView =
    failureResultGroups.length > 0 ? engine._buildSalvageRecipeView(component, system) : null;
  const { resultItems: failureResultItems, createdRecords: failureCreatedRecords } =
    failureSalvageRecipeView
      ? await engine._awardSalvageResultGroups({
          actor,
          resultGroups: failureResultGroups,
          consumedItems: consumedOnFail,
          tools: toolValidation.tools,
          salvageRecipeView: failureSalvageRecipeView,
          checkResult,
        })
      : { resultItems: [], createdRecords: [] };
  ctx.failureResultItems = failureResultItems;
  ctx.failureCreatedRecords = failureCreatedRecords;
  return null;
}

/** The failed salvage's run receipt, its card and its return. */
export async function publishSalvageFailure(engine, ctx) {
  const { actor, checkResult, component, consumedOnFail, failureCreatedRecords } = ctx;
  const { failureResultItems, options, salvageRunManager, system, usedTools } = ctx;
  if (checkResult.success) return null;
  if (salvageRunManager && ctx.salvageRun) {
    ctx.salvageRun.createdResults = failureCreatedRecords.map(itemReceipt);
    await salvageRunManager.updateRun(actor, ctx.salvageRun);
    ctx.salvageRun = await salvageRunManager.completeRun(actor, ctx.salvageRun, 'failed', {
      consumedComponents: consumedOnFail.map(mapConsumedIngredientRef),
      historySettlement: {
        consumption: ctx.salvageRun.historySettlement?.consumption ?? 'notApplicable',
        awards: 'complete',
      },
      usedTools,
      // In the SUCCESS BRANCH'S SHAPE, through the same mapper. An empty list beside
      // real items on the actor is a durable contradiction, not a cosmetic gap.
      createdResults: failureCreatedRecords.map(itemReceipt),
      checkResult: {
        success: false,
        outcome: checkResult.outcome,
        value: checkResult.value,
        data: checkResult.data || {},
      },
      failureReason: checkResult.message || 'Salvage check failed',
    });
  }

  // Salvage chat parity (issue 675): crafting posts on failure too. Report the
  // source forfeited on failure (per the consumption policy) and any tools that
  // broke — merged into one "Consumed on Failure" section by the shared card.
  const forfeitedQuantity = consumedOnFail.reduce(
    (sum, { quantity }) => sum + (Number(quantity) || 0),
    0
  );
  await engine._postSalvageChatMessage({
    success: false,
    actor,
    system,
    component,
    consumedQuantity: forfeitedQuantity,
    // The card renders these under its own failure-award section (issue 1098);
    // an empty list leaves every existing failure card byte-for-byte unchanged.
    results: failureResultItems,
    usedTools,
    failureReason: checkResult.message || 'Salvage check failed',
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
    suppressed: options?.suppressChat === true,
  });

  return {
    result: {
      success: false,
      // `null` when nothing was awarded — that is what every existing caller reads as
      // "a failed salvage produced nothing", and the bulk-salvage surfaces read THIS
      // value rather than the run record or the card (issue 1098, AF5/CF9).
      results: failureResultItems.length > 0 ? failureResultItems : null,
      message: checkResult.message || 'Salvage check failed',
      salvageRun: ctx.salvageRun,
    },
  };
}

/** The award: the resolved groups, the consumption, the breakage, the created items, and the
 * interim receipt the run carries until it completes. */
export async function commitSalvage(engine, ctx) {
  const { actor, checkResult, component, componentItems, ingredientQuantity } = ctx;
  const { salvageRun, salvageRunManager, syntheticRecipe, system, toolValidation } = ctx;
  const resultGroups = engine._resolveSalvageResultGroups(
    component,
    system,
    checkResult,
    salvageRun
  );
  // Captured HERE, beside the resolution it must agree with, because `completeRun`
  // below reassigns `salvageRun` and the ordered list is read off its captured
  // `resultOrder` (issue 1286). Null for every non-progressive salvage.
  ctx.complicationInputs = engine._progressiveSalvagePlanInputs(
    component,
    system,
    checkResult,
    salvageRun
  );
  const consumedItems = await engine._consumeComponentItems(
    actor,
    componentItems,
    ingredientQuantity
  );
  ctx.consumedItems = consumedItems;
  await engine._recordSalvageConsumption(actor, salvageRunManager, salvageRun, consumedItems);
  // Salvage parity (issue 419): the SUCCESS path always applies breakage (no
  // `breakToolsOnFail` gate exists here), via the shared seam.
  const salvageSuccessBreak = engine._resolveSalvageBreakageDecision(system, checkResult);
  const usedTools = await engine._applyToolBreakage(syntheticRecipe, toolValidation.tools, {
    forceBreak: salvageSuccessBreak.forceBreak,
    authority: salvageSuccessBreak.authority,
    reason: salvageSuccessBreak.reason,
    triggerId: salvageSuccessBreak.triggerId,
  });
  ctx.usedTools = usedTools;

  const salvageRecipeView = engine._buildSalvageRecipeView(component, system);
  const { resultItems, createdRecords } = await engine._awardSalvageResultGroups({
    actor,
    resultGroups,
    consumedItems,
    tools: toolValidation.tools,
    salvageRecipeView,
    checkResult,
  });
  ctx.resultItems = resultItems;
  ctx.createdRecords = createdRecords;
  if (salvageRunManager && salvageRun) {
    salvageRun.createdResults = createdRecords.map(itemReceipt);
    await salvageRunManager.updateRun(actor, salvageRun);
  }
  return null;
}

/** The complications the committed award earned, and the two redactions of what fired. */
export async function fireSalvageComplications(engine, ctx) {
  const { actor, checkResult, complicationInputs, craftingSystemId } = ctx;
  const { deferComplicationDelivery, system } = ctx;
  // Component complications (issue 1286): after the items are on the actor and before the card
  // is posted. It sits BEFORE the run completion because `firedComplications` is written AT
  // WRITE TIME, in the completion payload, and `completeRun` moves the run into `history`,
  // which cannot be amended afterwards.
  let complicationRequests = null;
  let firedComplications = null;
  if (complicationInputs) {
    const fired = await engine._fireComponentComplications({
      activity: 'salvage',
      actor,
      craftingSystemId,
      stages: complicationInputs.stages,
      award: complicationInputs.award,
      checkBreakage: engine._resolveSalvageCheckBreakage(system),
      checkResult,
      deliver: deferComplicationDelivery !== true,
    });
    firedComplications = fired?.fired ?? null;
    if (deferComplicationDelivery === true) complicationRequests = fired?.gmRequests ?? [];
  }
  ctx.firedComplications = firedComplications;
  ctx.complicationRequests = complicationRequests;
  // TWO redactions of one list, deliberately: the run record narrows to four durable
  // keys, the return carries the seven a view-model renders. Both start from
  // `publicComplications`, so neither can widen past the player audience.
  ctx.runComplications = salvageRunComplicationRecords(firedComplications);
  ctx.playerComplications = publicComplications(firedComplications);
  return null;
}

/** The successful salvage's run receipt, its card and its return. */
export async function publishSalvageSuccess(engine, ctx) {
  const { actor, checkResult, complicationRequests, component, componentId } = ctx;
  const { consumedItems, createdRecords, firedComplications, options } = ctx;
  const { playerComplications, resultItems, runComplications } = ctx;
  const { salvageRunManager, system, usedTools } = ctx;
  if (salvageRunManager && ctx.salvageRun) {
    ctx.salvageRun = await salvageRunManager.completeRun(actor, ctx.salvageRun, 'succeeded', {
      consumedComponents: consumedItems.map(mapConsumedIngredientRef),
      historySettlement: { consumption: 'complete', awards: 'complete' },
      usedTools,
      createdResults: createdRecords.map(itemReceipt),
      checkResult: {
        success: true,
        outcome: checkResult.outcome,
        value: checkResult.value,
        data: checkResult.data || {},
      },
      failureReason: null,
      // Spread conditionally so a salvage that fired nothing — which is every
      // non-progressive salvage and most progressive ones — writes a record with no
      // such key at all, exactly as it did before this feature existed. `completeRun`
      // spreads its payload with NO allowlist, so the field persists once written.
      ...(runComplications.length > 0 && { firedComplications: runComplications }),
    });
  }

  // Salvage chat parity (issue 675): the same card crafting posts, reading as a
  // salvage analogue — the source broken down, the materials recovered, and any
  // tools that broke. Gated on the same `chatOutput` toggle inside the poster.
  const consumedQuantity = consumedItems.reduce(
    (sum, { quantity }) => sum + (Number(quantity) || 0),
    0
  );
  await engine._postSalvageChatMessage({
    success: true,
    actor,
    system,
    component,
    consumedQuantity,
    results: resultItems,
    usedTools,
    failureReason: '',
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
    suppressed: options?.suppressChat === true,
    firedComplications,
  });

  return {
    result: {
      success: true,
      results: resultItems,
      message: `Successfully salvaged ${component.name || componentId}`,
      // Present ONLY when the caller asked to batch (bulk salvage). Addressing only, by
      // construction: a GM request carries no name, description, macro uuid or
      // visibility, so there is nothing here for a player-facing surface to redact.
      ...(complicationRequests === null ? undefined : { complicationRequests }),
      // The FIRED surface, and unlike the requests above it needs redacting — it is read
      // by the player's own salvage view-model, so a `gmOnly` complication must not be
      // here even when a GM is the acting user. Omitted entirely when nothing
      // player-visible fired, so an unchanged caller sees an unchanged return.
      ...(playerComplications.length > 0 && { complications: playerComplications }),
      // The rolled total, threaded top-level so the player summary can read it even on
      // the RUNLESS path (no salvage run manager) where `salvageRun` is null. `null` for
      // a no-check simple salvage (nothing was rolled); a finite number otherwise.
      value: checkResult.value ?? null,
      salvageRun: ctx.salvageRun,
    },
  };
}
