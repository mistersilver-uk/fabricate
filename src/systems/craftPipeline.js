/**
 * `CraftingEngine.craft()`'s body, as ordered pipeline functions over one threaded context. Each
 * returns null to proceed or `{ result, resolved }` for `craft()` to return; only `craft()` reads
 * a Foundry global, assigns `ctx.resolved`, or handles the errors these propagate.
 */
import {
  VERSIONED_EXECUTION_CONTEXT,
  rollTotalForCard,
  tierStepForCard,
} from './craftCardFields.js';
import { checkCurrencySpends } from './currencyAffordance.js';
import {
  assertNativeEffectsUninvoked,
  awardReceipts,
  mapConsumedIngredientRef,
} from './runHistoryEvidence.js';
import { getRunLifecycleContract } from './runLifecycleState.js';
import { selectedIngredientItems } from './stageReadiness.js';

const refuse = (message) => ({
  result: { success: false, results: null, message },
  resolved: false,
});

/** The recipe-access guard, the execution step this call runs, and mode validation of the recipe. */
export async function openCraftStep(engine, ctx) {
  const { craftingActor, componentSourceActors, recipe, run, user, visibilityService } = ctx;
  if (visibilityService) {
    const guard = visibilityService.guardCraftStart({
      viewer: user,
      recipe,
      craftingActor,
      componentSourceActors,
    });
    if (!guard.craftable) {
      const reasonMap = {
        'missing-system': 'Crafting system not found',
        'system-invalid': 'Crafting system is invalid',
        visibility: 'Recipe is not visible to this user',
        knowledge: 'Missing recipe knowledge',
        locked: 'Recipe is locked',
      };
      return refuse(reasonMap[guard.reason] || 'Crafting is blocked by recipe access rules');
    }
  }

  ctx.executionSteps =
    typeof recipe.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [
          {
            id: 'implicit-step',
            name: 'Step 1',
            ingredientSets: recipe.ingredientSets || [],
            resultGroups: recipe.resultGroups || [],
            toolIds: recipe.toolIds || [],
            timeRequirement: null,
            outcomeRouting: recipe.outcomeRouting || null,
          },
        ];

  let stepIndex = Number(run?.currentStepIndex);
  if (!Number.isFinite(stepIndex) || stepIndex < 0) stepIndex = 0;
  ctx.stepIndex = stepIndex;
  ctx.step = ctx.executionSteps[stepIndex];
  if (getRunLifecycleContract(run) === 'legacy')
    assertNativeEffectsUninvoked(run?.steps?.[stepIndex]);
  if (!ctx.step) return refuse('No active crafting step available');
  if (ctx.resolutionService) {
    const modeValidation = ctx.resolutionService.validateRecipe(recipe);
    if (!modeValidation.valid) {
      return refuse(`Mode validation failed: ${modeValidation.errors.join(', ')}`);
    }
  }
  return null;
}

/** The collapsed-chain gate, then the time-gated step's START / WAIT / FINISH routing. */
export async function routeGatedExecution(engine, ctx) {
  const { craftingActor, componentSourceActors, options, recipe, runManager, step, stepIndex } =
    ctx;
  // Collapsed multi-step chain (issue 710): with the multi-step feature OFF, a recipe carrying
  // authored steps runs as ONE atomic craft action executing them back-to-back. The steps are
  // preserved; the durations are SUMMED into one gate armed at the chain's entry.
  ctx.collapsedChain = engine._isCollapsedChain(recipe);
  if (ctx.collapsedChain && stepIndex === 0) {
    const gateOutcome = await engine._handleCollapsedChainGate({
      craftingActor,
      recipe,
      executionSteps: ctx.executionSteps,
      runManager,
      run: ctx.run,
    });
    ctx.run = gateOutcome.run || ctx.run;
    // The run legitimately waits for its summed gate to mature — not a phantom.
    if (gateOutcome.waiting) return { result: gateOutcome.result, resolved: true };
  }

  // Time-gated step handling: a step over 0 seconds consumes at START, then resumes at
  // maturity to run the check and create results. The enabled flag gates only ARMING a new
  // gate — an already-armed gate must still resume, or FINISH would re-consume what START
  // spent. A collapsed chain skips this per-step gate entirely.
  const timeGateSeconds =
    runManager &&
    ctx.run &&
    step.timeRequirement &&
    !ctx.collapsedChain &&
    !options?.[VERSIONED_EXECUTION_CONTEXT] &&
    (engine._timeRequirementsEnabled(recipe) || !!ctx.run.steps?.[stepIndex]?.timeGate)
      ? runManager.durationToSeconds(step.timeRequirement)
      : 0;
  if (timeGateSeconds <= 0) return null;

  const existingGate = ctx.run.steps?.[stepIndex]?.timeGate;
  if (!existingGate) {
    // START: consume now, snapshot, then arm the gate.
    const startOutcome = await engine._startTimedStep({
      craftingActor,
      componentSourceActors,
      recipe,
      step,
      stepIndex,
      ingredientSetId: ctx.ingredientSetId,
      ingredientOptionOverrides: ctx.ingredientOptionOverrides,
      ingredientEssenceAllocation: ctx.ingredientEssenceAllocation,
      presentTools: ctx.presentTools,
      options,
      runManager,
      run: ctx.run,
      createdThisCall: ctx.createdThisCall,
    });
    return { result: startOutcome.result, resolved: startOutcome.resolved };
  }
  if (!runManager.canProceedTimeGate(ctx.run, stepIndex, ctx.readWorldTime())) {
    const remaining = Math.max(
      0,
      Math.ceil(Number(existingGate.availableAt || 0) - ctx.readWorldTime())
    );
    const stepLabel = step.name || `Step ${stepIndex + 1}`;
    // Components were already consumed at START; the run legitimately stays
    // active while its gate matures — not a phantom.
    return {
      result: {
        success: false,
        results: null,
        message: `Step "${stepLabel}" is still in progress (${remaining}s remaining)`,
      },
      resolved: true,
    };
  }
  // FINISH: gate matured. Run the check and create results WITHOUT
  // re-consuming (components/currency were already spent at START).
  ctx.run = await runManager.markStepInProgress(craftingActor, ctx.run, stepIndex);
  const finishOutcome = await engine._finishTimedStep({
    craftingActor,
    componentSourceActors,
    recipe,
    step,
    stepIndex,
    options,
    presentTools: ctx.presentTools,
    runManager,
    run: ctx.run,
  });
  return { result: finishOutcome.result, resolved: finishOutcome.resolved };
}

/**
 * The craftability gate, the ingredient set and the single craft selection every later function
 * reads, as a `craftInputs` record; a refusal returns `{ result, resolved }` instead.
 */
export async function resolveCraftInputs(engine, ctx) {
  const { craftingActor, componentSourceActors, ingredientOptionOverrides, presentTools, step } =
    ctx;
  const executionRecipe = engine._buildStepRecipeView(ctx.recipe, step);

  // Alchemy attempts inject the tier-4-aware submission resolver through the
  // craftability, selection, and essence-context paths (issue 578); standard
  // crafting gets `undefined` → the shared resolvers, byte-for-byte unchanged.
  const resolveComponent = engine._alchemyComponentResolver(ctx.options);

  // Check if recipe step can be crafted. Thread the crafting actor so a currency
  // alternative is craftable exactly when this actor can afford it — display and
  // execution agree on the same currency-aware decision.
  const canCraftCheck = engine.recipeManager.canCraft(componentSourceActors, executionRecipe, {
    presentTools,
    craftingActor,
    resolveComponent,
    optionOverrides: ingredientOptionOverrides,
  });
  if (!canCraftCheck.canCraft) {
    const missingMsg = engine._formatMissingItems(canCraftCheck.missing, executionRecipe);
    return refuse(`Missing required items:\n${missingMsg}`);
  }

  // Determine which ingredient set to use
  let ingredientSet;
  if (ctx.ingredientSetId) {
    ingredientSet = executionRecipe.ingredientSets.find((s) => s.id === ctx.ingredientSetId);
    if (!ingredientSet) return refuse(`Invalid ingredient set ID: ${ctx.ingredientSetId}`);
  } else {
    // Use the satisfiable set from canCraftCheck
    ingredientSet = canCraftCheck.satisfiableSet;
  }

  // SINGLE SELECTION SOURCE: the widened selection is computed exactly once here, with the
  // currency probe bound to the crafting actor. Both consumption and the currency gate read
  // THIS selection, so item mutation mid-craft cannot diverge the spend from the plan.
  const essenceAllocation = engine._scopedEssenceAllocation(
    ctx.ingredientEssenceAllocation,
    step,
    ingredientSet
  );
  const craftSelection = engine._resolveCraftSelection(
    componentSourceActors,
    ingredientSet,
    executionRecipe,
    craftingActor,
    resolveComponent,
    ingredientOptionOverrides,
    essenceAllocation
  );
  const shortAllocation = engine._allocationShortfallMessage(
    essenceAllocation,
    craftSelection,
    executionRecipe
  );
  if (shortAllocation) return refuse(shortAllocation);
  return {
    craftInputs: {
      executionRecipe,
      resolveComponent,
      ingredientSet,
      essenceAllocation,
      craftSelection,
      currencySpends: craftSelection.currencySpends || [],
    },
  };
}

/** The tool, currency and Item Piles gates, all of them before any mutation. */
export async function runAffordGates(engine, ctx, craftInputs) {
  const { craftingActor, componentSourceActors, presentTools } = ctx;
  const { craftSelection, currencySpends, executionRecipe, ingredientSet } = craftInputs;

  // Validate tools: the recipe's resolved library Tools must be present
  // (a matching, non-broken item) on the component source actors.
  const toolsForSet =
    typeof engine.recipeManager.getToolsForSet === 'function'
      ? engine.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
      : [];
  const toolValidation = await engine._validateTools(
    componentSourceActors,
    executionRecipe,
    toolsForSet,
    presentTools,
    craftingActor,
    { excludedItems: selectedIngredientItems(craftSelection) }
  );
  if (!toolValidation.valid) return refuse(toolValidation.message);
  craftInputs.toolValidation = toolValidation;

  // Currency afford gate: every chosen spend must be affordable (aggregated cross-unit on the
  // common ladder) BEFORE any mutation, so a shortfall aborts here with zero mutation.
  const currencyAffordCheck = await checkCurrencySpends(
    craftingActor,
    executionRecipe,
    currencySpends,
    engine._currencySeams()
  );
  if (!currencyAffordCheck.valid) return refuse(currencyAffordCheck.message);

  const itemPilesAffordCheck = await engine._checkItemPilesCurrencyCost(craftingActor, ctx.recipe);
  if (!itemPilesAffordCheck.valid) return refuse(itemPilesAffordCheck.message);
  return null;
}

/** The system-level crafting check, and the two zero-mutation aborts its result can carry. */
export async function runCraftCheck(engine, ctx, craftInputs) {
  const { options } = ctx;
  const { executionRecipe, ingredientSet, toolValidation } = craftInputs;
  // Run optional system-level crafting check before consuming ingredients.
  // `interactive` (opt-in, from a UI-triggered craft) surfaces a confirm/roll
  // dialog and posts the roll to chat; automation/macros omit it and stay silent.
  const checkResult =
    options?.[VERSIONED_EXECUTION_CONTEXT]?.resolvedCheckResult ??
    (await engine._runCraftingCheck(
      executionRecipe,
      ctx.craftingActor,
      ctx.componentSourceActors,
      ingredientSet,
      ctx.step,
      {
        interactive: options?.interactive === true,
        toolItems: toolValidation.tools,
      }
    ));
  craftInputs.checkResult = checkResult;
  // A misconfigured required check (no authored roll formula for the active mode) is a
  // GM-side system gap, not a rolled failure: abort with ZERO mutation. The
  // failure-consumption policy in `resolveCheckFailure` applies only to genuine rolled failures.
  if (checkResult.misconfigured) return refuse(checkResult.message);
  // The player dismissed the interactive roll dialog: a user choice, not a
  // failure. Abort with ZERO mutation (no consumption, no breakage, no chat)
  // before the failure-consumption path in `resolveCheckFailure`.
  if (checkResult.cancelled) {
    return {
      result: { success: false, cancelled: true, results: null, message: 'Crafting cancelled' },
      resolved: false,
    };
  }
  return null;
}

/** A matched Simple alchemy attempt whose check failed: a genuine outcome, not a fizzle. */
export async function routeAlchemySimpleFailure(engine, ctx, craftInputs) {
  const { options } = ctx;
  const { checkResult, craftSelection, currencySpends } = craftInputs;
  const { executionRecipe, ingredientSet, toolValidation } = craftInputs;
  if (checkResult.success) return null;
  // Consume per `alchemy.consumeOnFail`, produce the reserved failure group, learn on match
  // and post a DISTINCT failure banner. Tiered alchemy failure fizzles via `resolveCheckFailure`.
  if (options?.isAlchemyAttempt !== true) return null;
  if (engine._getAlchemyCheckMode(executionRecipe) !== 'simple') return null;
  const outcome = await engine._resolveAlchemySimpleFailure({
    craftingActor: ctx.craftingActor,
    componentSourceActors: ctx.componentSourceActors,
    recipe: ctx.recipe,
    executionRecipe,
    step: ctx.step,
    stepIndex: ctx.stepIndex,
    ingredientSet,
    craftSelection,
    currencySpends,
    toolValidation,
    checkResult,
    options,
    runManager: ctx.runManager,
    run: ctx.run,
  });
  return { result: outcome.result, resolved: outcome.resolved };
}

/**
 * A rolled check failure: the policy's consumption and breakage, then THE FAILURE AWARD (issue
 * 1098), which runs after both so the reserved output transfers the essences the attempt spent.
 */
export async function resolveCheckFailure(engine, ctx, craftInputs) {
  const { craftingActor, options, run, runManager, step, stepIndex } = ctx;
  const { checkResult, craftSelection, currencySpends } = craftInputs;
  const { executionRecipe, ingredientSet, toolValidation } = craftInputs;
  if (checkResult.success) return null;
  const failurePolicy = engine._getFailureConsumptionPolicy(executionRecipe);
  let consumedOnFail = [];
  let usedToolPairs = [];
  let usedToolsOnFail = [];
  try {
    if (failurePolicy.consumeIngredientsOnFail) {
      consumedOnFail = await engine._consumeNativeIngredients(craftSelection.plan, {
        craftingActor,
        run,
        runManager,
        stepIndex,
      });
      // Currency is consumed alongside items on the failure path only when the
      // policy consumes ingredients on failure (it is a chosen ingredient).
      await engine._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
    }
    if (failurePolicy.breakToolsOnFail) {
      usedToolPairs = toolValidation.tools;
      // The shared `evaluateCheckBreakage` seam applies failure-path breakage too, gated
      // by `breakToolsOnFail`; only `checkDriven` lets the check's triggers force it.
      const breakDecision = engine._resolveCraftingBreakageDecision(
        engine._getRecipeSystem(executionRecipe),
        executionRecipe,
        checkResult
      );
      usedToolsOnFail = await engine._applyToolBreakage(executionRecipe, toolValidation.tools, {
        forceBreak: breakDecision.forceBreak,
        authority: breakDecision.authority,
        reason: breakDecision.reason,
        triggerId: breakDecision.triggerId,
      });
    }
  } catch (consumptionError) {
    if (consumptionError.code === 'HISTORY_EFFECT_UNCERTAIN') throw consumptionError;
    console.error('Fabricate | Error during failure-path consumption:', consumptionError);
  }
  const failureResults = await engine._produceCraftingFailureResults({
    craftingActor,
    executionRecipe,
    step,
    ingredientSet,
    consumedItems: consumedOnFail,
    toolItems: toolValidation.tools,
    checkResult,
    resultGroupId: options?.resultGroupId || null,
  });
  return publishCheckFailure(engine, ctx, craftInputs, {
    consumedOnFail,
    usedToolPairs,
    usedToolsOnFail,
    failureResults,
  });
}

/** The run receipt, the card and the return for a rolled check failure and whatever it awarded. */
export async function publishCheckFailure(engine, ctx, craftInputs, failure) {
  const { craftingActor, options, run, runManager, stepIndex } = ctx;
  const { checkResult, ingredientSet } = craftInputs;
  const { consumedOnFail, failureResults, usedToolPairs, usedToolsOnFail } = failure;
  if (runManager && run) {
    await runManager.completeStepFailure(
      craftingActor,
      run,
      stepIndex,
      checkResult.message || 'Crafting check failed',
      {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: false,
          reason: checkResult.message || 'Crafting check failed',
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedOnFail.map(mapConsumedIngredientRef),
        usedTools: usedToolsOnFail,
        // In the SUCCESS branch's shape, through the same mapper: the record lands
        // in the actor's run-container flag, so an empty list beside real items is a
        // durable contradiction rather than a cosmetic gap.
        createdResults: awardReceipts(failureResults),
      },
      engine._versionedMutationOptions(options, run)
    );
  }
  await engine._postCraftChatMessage({
    success: false,
    craftingActor,
    recipe: ctx.recipe,
    consumedIngredients: consumedOnFail,
    tools: usedToolPairs,
    // The card's failure branch renders these under its own results section; an
    // empty list leaves every existing failure card byte-for-byte unchanged.
    createdResults: failureResults,
    failureReason: checkResult.message || 'Crafting check failed',
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
  });
  return {
    result: {
      success: false,
      // `null` when nothing was awarded — what every existing caller reads as "a
      // failed craft produced nothing". The discriminator is attached only when
      // something WAS produced, so today's failure return is unchanged.
      results: failureResults.length > 0 ? failureResults : null,
      message: checkResult.message || 'Crafting check failed',
      ...(failureResults.length > 0 && { disposition: 'produced-on-failure' }),
    },
    resolved: false,
  };
}

/**
 * A check that SUCCEEDED but does not satisfy the resolution mode: the same consumption rule as a
 * rolled failure, and a settlement that awards nothing and records no `createdResults` at all.
 */
export async function resolveModeValidationFailure(engine, ctx, craftInputs) {
  const { craftingActor, options, resolutionService, run, runManager, stepIndex } = ctx;
  const { checkResult, craftSelection, currencySpends } = craftInputs;
  const { executionRecipe, ingredientSet, toolValidation } = craftInputs;
  if (!resolutionService) return null;
  if (resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })) return null;
  const message = 'Crafting check result does not satisfy current resolution mode requirements';
  const validationFailurePolicy = engine._getFailureConsumptionPolicy(executionRecipe);
  let consumedOnValidationFail = [];
  let usedToolPairsOnValidationFail = [];
  let usedToolsOnValidationFail = [];
  try {
    if (validationFailurePolicy.consumeIngredientsOnFail) {
      consumedOnValidationFail = await engine._consumeNativeIngredients(craftSelection.plan, {
        craftingActor,
        run,
        runManager,
        stepIndex,
      });
      await engine._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);
    }
    if (validationFailurePolicy.breakToolsOnFail) {
      usedToolPairsOnValidationFail = toolValidation.tools;
      // Resolution-mode validation failure: route through the shared seam so the
      // breakage authority (and immune handling) stay consistent. The check
      // itself succeeded, so a checkDriven trigger may still force breakage.
      const validationBreakDecision = engine._resolveCraftingBreakageDecision(
        engine._getRecipeSystem(executionRecipe),
        executionRecipe,
        checkResult
      );
      usedToolsOnValidationFail = await engine._applyToolBreakage(
        executionRecipe,
        toolValidation.tools,
        {
          forceBreak: validationBreakDecision.forceBreak,
          authority: validationBreakDecision.authority,
          reason: validationBreakDecision.reason,
          triggerId: validationBreakDecision.triggerId,
        }
      );
    }
  } catch (consumptionError) {
    if (consumptionError.code === 'HISTORY_EFFECT_UNCERTAIN') throw consumptionError;
    console.error('Fabricate | Error during failure-path consumption:', consumptionError);
  }
  if (runManager && run) {
    await runManager.completeStepFailure(
      craftingActor,
      run,
      stepIndex,
      message,
      {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedOnValidationFail.map(mapConsumedIngredientRef),
        usedTools: usedToolsOnValidationFail,
      },
      engine._versionedMutationOptions(options, run)
    );
  }
  await engine._postCraftChatMessage({
    success: false,
    craftingActor,
    recipe: ctx.recipe,
    consumedIngredients: consumedOnValidationFail,
    tools: usedToolPairsOnValidationFail,
    createdResults: [],
    failureReason: message,
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
  });
  return refuse(message);
}

/**
 * PRE-CONSUMPTION MISCONFIGURATION GATE (issue 85). Resolve the awarded result group(s) BEFORE
 * consuming anything: a matched signature whose check outcome resolves to no valid group is a
 * GM-side authoring gap. Abort with ZERO mutation and surface the GM diagnostic (spec
 * `resolution-modes` §Alchemy Mode and `recipes-and-steps` §Alchemy Execution Lifecycle).
 */
export async function runResolutionPreflight(engine, ctx, craftInputs) {
  const { craftingActor, options, resolutionService, run, runManager, step, stepIndex } = ctx;
  const { checkResult, executionRecipe, ingredientSet } = craftInputs;
  if (typeof resolutionService?.resolveResultGroups !== 'function') return null;
  const preflightResolution = resolutionService.resolveResultGroups({
    recipe: executionRecipe,
    step,
    ingredientSet,
    checkResult,
    selectedResultGroupId: options?.resultGroupId || null,
  });
  if (!engine._isMisconfigurationDisposition(preflightResolution?.meta?.disposition)) return null;
  const message = preflightResolution.meta.error || 'Crafting resolution failed';
  if (runManager && run) {
    await runManager.completeStepFailure(
      craftingActor,
      run,
      stepIndex,
      message,
      {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: false,
          reason: message,
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: [],
        usedTools: [],
      },
      engine._versionedMutationOptions(options, run)
    );
  }
  await engine._postCraftChatMessage({
    success: false,
    craftingActor,
    recipe: ctx.recipe,
    consumedIngredients: [],
    tools: [],
    createdResults: [],
    failureReason: message,
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
  });
  return {
    result: {
      success: false,
      results: null,
      message,
      disposition: preflightResolution.meta.disposition,
    },
    resolved: false,
  };
}

/**
 * The award: consumption, currency, breakage and the result items, then the run's success receipt.
 *
 * @returns {Promise<object>} the `award` record `publishCraftSuccess` and `craft()` read.
 */
export async function commitCraft(engine, ctx, craftInputs) {
  const { componentSourceActors, craftingActor, options, run, runManager, step, stepIndex } = ctx;
  const { checkResult, craftSelection, currencySpends } = craftInputs;
  const { executionRecipe, ingredientSet, resolveComponent, toolValidation } = craftInputs;

  // Consume ingredients from the single craft selection's item plan.
  const consumedItems = await engine._consumeNativeIngredients(craftSelection.plan, {
    craftingActor,
    run,
    runManager,
    stepIndex,
  });

  // For alchemy attempts: also consume submitted items that weren't handled
  // by standard ingredient matching (e.g. items used only for essences).
  await engine._consumeAlchemyExtraItems(consumedItems, componentSourceActors, options);
  await engine._saveNativeConsumption(consumedItems, {
    craftingActor,
    run,
    runManager,
    stepIndex,
  });

  // Deduct the chosen currency spends after item consumption (`runAffordGates` already
  // confirmed every spend is affordable). A mid-loop spend failure is logged
  // like the Item-Piles deduct error below — not refunded.
  await engine._spendCraftCurrency(craftingActor, executionRecipe, currencySpends);

  // Apply tool usage/breakage via the single shared `evaluateCheckBreakage` seam: under
  // `toolSpecific` each matched Tool's retained mode decides, under `checkDriven` the active
  // check's triggers do. The SUCCESS path always applies breakage — it has no fail gate.
  const successBreakDecision = engine._resolveCraftingBreakageDecision(
    engine._getRecipeSystem(executionRecipe),
    executionRecipe,
    checkResult
  );
  const usedTools = await engine._applyToolBreakage(executionRecipe, toolValidation.tools, {
    forceBreak: successBreakDecision.forceBreak,
    authority: successBreakDecision.authority,
    reason: successBreakDecision.reason,
    triggerId: successBreakDecision.triggerId,
  });

  // Deduct Item Piles currency cost after ingredients are consumed to avoid
  // losing currency if ingredient consumption throws.
  await engine._deductItemPilesCurrencyCost(craftingActor, ctx.recipe);

  // Create the result item(s). The awarded group was already resolved and validated by
  // `runResolutionPreflight`, so this re-resolution yields real groups.
  const { items: resultItems, resolutionMeta } = await engine._createResultItems(
    craftingActor,
    executionRecipe,
    step,
    ingredientSet,
    consumedItems,
    toolValidation.tools,
    checkResult,
    options?.resultGroupId || null,
    { resolveComponent }
  );

  if (runManager && run) {
    ctx.run = await runManager.completeStepSuccess(
      craftingActor,
      run,
      stepIndex,
      {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: true,
          reason: checkResult.message || 'Success',
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedItems.map(mapConsumedIngredientRef),
        usedTools,
        createdResults: awardReceipts(resultItems),
      },
      engine._versionedMutationOptions(options, run)
    );
  }
  return { consumedItems, usedTools, resultItems, resolutionMeta };
}

/** Recipe use and knowledge, the component complications, and the success card. */
export async function publishCraftSuccess(engine, ctx, craftInputs, award) {
  const { componentSourceActors, craftingActor, options, recipe, step, visibilityService } = ctx;
  const { checkResult, executionRecipe, toolValidation } = craftInputs;
  if (visibilityService) {
    await visibilityService.applyRecipeItemUseOnCraft({
      recipe,
      craftingActor,
      componentSourceActors,
    });
    if (options?.isAlchemyAttempt === true) {
      await visibilityService.learnRecipeOnCraft(recipe, craftingActor);
    }
  }

  // Component complications (issue 1286): AFTER the award is committed and BEFORE the card is
  // posted, so the card can report what fired. Progressive resolutions only.
  const firedComplications = await engine._fireCraftComplications({
    actor: craftingActor,
    recipe: executionRecipe,
    step,
    checkResult,
    resolutionMeta: award.resolutionMeta,
  });

  await engine._postCraftChatMessage({
    success: true,
    craftingActor,
    recipe,
    consumedIngredients: award.consumedItems,
    tools: toolValidation.tools,
    createdResults: award.resultItems,
    rollValue: rollTotalForCard(checkResult),
    tierStep: tierStepForCard(checkResult),
    // Redacted inside the poster, which holds the system the component names resolve
    // against. Null for every non-progressive craft (issue 1286).
    firedComplications: firedComplications?.fired ?? null,
  });
  return null;
}

/**
 * Collapsed chain (issue 710): a non-final step just succeeded, so continue the atomic action in
 * the SAME craft call, with a NULL ingredient set and cleared per-step overrides so each later
 * step auto-resolves its own satisfiable set. `ingredientEssenceAllocation` MUST be nulled too
 * (issue 917): the chain enters at step 0. The continuation is returned UNAWAITED, so its
 * rejection reaches the caller of `craft()` rather than `craft()`'s own `catch`.
 */
export function continueCollapsedChain(engine, ctx) {
  const { collapsedChain, componentSourceActors, craftingActor, options, recipe, run, runManager } =
    ctx;
  if (!collapsedChain || !runManager || run?.status === 'succeeded') return null;
  if (!runManager.getActiveRun(craftingActor, run.id)) return null;
  return {
    result: engine.craft(craftingActor, componentSourceActors, recipe, null, {
      ...options,
      runId: run.id,
      ingredientOptionOverrides: null,
      ingredientEssenceAllocation: null,
      resultGroupId: null,
    }),
    resolved: true,
  };
}
