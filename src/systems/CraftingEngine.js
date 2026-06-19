import { isToolBroken, resolvePresentComponentIds } from '../gatheringToolRuntime.js';
import { Tool } from '../models/Tool.js';
import { applyToolUsageAndBreakage } from '../toolBreakageRuntime.js';
import { accumulateItemEssences, resolveItemEssences } from '../utils/essenceResolver.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import {
  getItemSourceReferences,
  getComponentSourceReferences,
  itemMatchesComponentSource,
} from '../utils/sourceUuid.js';

import { CraftingCheckAdapterRegistry } from './CraftingCheckAdapter.js';
import {
  buildCurrencySpendUpdates,
  findCurrencyUnit,
  formatCurrencyRequirement,
  readCurrencyBalances,
  validateCurrencyProfile,
} from './currencyProfile.js';
import { SignatureValidator } from './SignatureValidator.js';

/**
 * Handles the actual crafting process
 * Validates ingredients, consumes items, creates outputs
 */
export class CraftingEngine {
  constructor(
    recipeManager,
    craftingRunManager = null,
    resolutionModeService = null,
    itemPilesIntegration = null,
    salvageRunManager = null,
    coinSpender = null
  ) {
    this.recipeManager = recipeManager;
    this.craftingRunManager = craftingRunManager;
    this.resolutionModeService = resolutionModeService;
    this.itemPilesIntegration = itemPilesIntegration;
    this.salvageRunManager = salvageRunManager;
    this.coinSpender = coinSpender;
  }

  /**
   * Attempt to craft an item using a recipe
   * @param {Actor} craftingActor - The actor where results will be added
   * @param {Actor[]} componentSourceActors - The actors to consume ingredients from
   * @param {Recipe} recipe - The recipe to use
   * @param {string} ingredientSetId - Which ingredient set to use (optional, uses first satisfiable if not provided)
   * @param {Object} options - Additional options
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string}>}
   */
  async craft(craftingActor, componentSourceActors, recipe, ingredientSetId = null, options = {}) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    // Virtual-present tools injected by an active canvas Tool station (Phase 4):
    // a `{ systemId, componentIds }` payload. A componentId is satisfied without
    // an owned item (and excluded from breakage/usage) ONLY when the active
    // tool's systemId matches the recipe's crafting system — componentId is a
    // per-system id, so a tool from system A must not satisfy a system-B recipe.
    const presentTools =
      options?.presentTools && !Array.isArray(options.presentTools) ? options.presentTools : null;
    // Validate inputs
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
      };
    }

    if (!componentSourceActors || componentSourceActors.length === 0) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected',
      };
    }

    // Validate the recipe
    const validation = recipe.validate();
    if (!validation.valid) {
      return {
        success: false,
        results: null,
        message: `Invalid recipe: ${validation.errors.join(', ')}`,
      };
    }

    const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
    let run = null;
    if (runManager) {
      run = options?.runId
        ? runManager.getActiveRun(craftingActor, options.runId)
        : runManager.findActiveRunForRecipe(craftingActor, recipe.id);
      if (!run) {
        run = await runManager.createRun(
          craftingActor,
          recipe,
          componentSourceActors,
          game.user?.id || null
        );
      }
    }

    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      const guard = visibilityService.guardCraftStart({
        viewer: game.user,
        recipe,
        craftingActor,
        componentSourceActors,
      });
      if (!guard.craftable) {
        const reasonMap = {
          'missing-system': 'Crafting system not found',
          visibility: 'Recipe is not visible to this user',
          knowledge: 'Missing recipe knowledge',
          locked: 'Recipe is locked',
        };
        return {
          success: false,
          results: null,
          message: reasonMap[guard.reason] || 'Crafting is blocked by recipe access rules',
        };
      }
    }

    const executionSteps =
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
    const step = executionSteps[stepIndex];
    if (!step) {
      return {
        success: false,
        results: null,
        message: 'No active crafting step available',
      };
    }
    if (resolutionService) {
      const modeValidation = resolutionService.validateRecipe(recipe);
      if (!modeValidation.valid) {
        return {
          success: false,
          results: null,
          message: `Mode validation failed: ${modeValidation.errors.join(', ')}`,
        };
      }
    }

    if (runManager && run && step.timeRequirement) {
      run = await runManager.markStepWaitingForTime(
        craftingActor,
        run,
        stepIndex,
        step.timeRequirement
      );
      const canProceed = runManager.canProceedTimeGate(
        run,
        stepIndex,
        Number(game.time?.worldTime || 0)
      );
      if (!canProceed) {
        const gate = run.steps?.[stepIndex]?.timeGate;
        const remaining = Math.max(
          0,
          Math.ceil(Number(gate?.availableAt || 0) - Number(game.time?.worldTime || 0))
        );
        return {
          success: false,
          results: null,
          message: `Step "${step.name || `Step ${stepIndex + 1}`}" is still in progress (${remaining}s remaining)`,
        };
      }
      run = await runManager.markStepInProgress(craftingActor, run, stepIndex);
    }

    const executionRecipe = this._buildStepRecipeView(recipe, step);

    // Check if recipe step can be crafted
    const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, executionRecipe, {
      presentTools,
    });
    if (!canCraftCheck.canCraft) {
      const missingMsg = this._formatMissingItems(canCraftCheck.missing);
      return {
        success: false,
        results: null,
        message: `Missing required items:\n${missingMsg}`,
      };
    }

    // Determine which ingredient set to use
    let ingredientSet;
    if (ingredientSetId) {
      ingredientSet = executionRecipe.ingredientSets.find((s) => s.id === ingredientSetId);
      if (!ingredientSet) {
        return {
          success: false,
          results: null,
          message: `Invalid ingredient set ID: ${ingredientSetId}`,
        };
      }
    } else {
      // Use the satisfiable set from canCraftCheck
      ingredientSet = canCraftCheck.satisfiableSet;
    }

    // Validate tools: the recipe's resolved library Tools must be present
    // (a matching, non-broken item) on the component source actors.
    const toolsForSet =
      typeof this.recipeManager.getToolsForSet === 'function'
        ? this.recipeManager.getToolsForSet(executionRecipe, ingredientSet)
        : [];
    const toolValidation = await this._validateTools(
      componentSourceActors,
      executionRecipe,
      toolsForSet,
      presentTools
    );
    if (!toolValidation.valid) {
      return {
        success: false,
        results: null,
        message: toolValidation.message,
      };
    }

    const currencyCheck = await this._checkCurrencyRequirement(craftingActor, recipe, step);
    if (!currencyCheck.valid) {
      return {
        success: false,
        results: null,
        message: currencyCheck.message,
      };
    }

    const itemPilesAffordCheck = await this._checkItemPilesCurrencyCost(craftingActor, recipe);
    if (!itemPilesAffordCheck.valid) {
      return {
        success: false,
        results: null,
        message: itemPilesAffordCheck.message,
      };
    }

    // Run optional system-level crafting check before consuming ingredients.
    const checkResult = await this._runCraftingCheck(
      executionRecipe,
      craftingActor,
      componentSourceActors,
      ingredientSet,
      step
    );
    if (!checkResult.success) {
      const failurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
      let consumedOnFail = [];
      let usedToolPairs = [];
      let usedToolsOnFail = [];
      try {
        if (failurePolicy.consumeIngredientsOnFail) {
          consumedOnFail = await this._consumeIngredients(
            componentSourceActors,
            ingredientSet,
            executionRecipe
          );
        }
        if (failurePolicy.consumeCatalystsOnFail) {
          usedToolPairs = toolValidation.tools;
          usedToolsOnFail = await this._applyToolBreakage(executionRecipe, toolValidation.tools);
        }
      } catch (consumptionError) {
        console.error('Fabricate | Error during failure-path consumption:', consumptionError);
      }
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
            consumedIngredients: consumedOnFail.map(({ item, quantity }) => ({
              actorUuid: item.parent?.uuid || null,
              itemUuid: item.uuid,
              quantity,
            })),
            usedTools: usedToolsOnFail,
          }
        );
      }
      // Execute failure macro (spec 002 Failure Macro Contract)
      {
        const _systemManager = game.fabricate?.getCraftingSystemManager?.();
        const _craftingSystem = _systemManager?.getSystem(recipe.craftingSystemId);
        await this._runFailureMacro(recipe, {
          recipe: recipe?.toJSON?.() || recipe,
          craftingSystem: _craftingSystem,
          craftingActor,
          componentSourceActors,
          step,
          selectedIngredientSet: ingredientSet,
          failureReason: checkResult.message || 'Crafting check failed',
          checkResult,
          consumedIngredients: consumedOnFail,
          consumedTools: usedToolPairs,
        });
      }
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedOnFail,
        tools: usedToolPairs,
        createdResults: [],
        failureReason: checkResult.message || 'Crafting check failed',
      });
      return {
        success: false,
        results: null,
        message: checkResult.message || 'Crafting check failed',
      };
    }
    if (
      resolutionService &&
      !resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })
    ) {
      const message = 'Crafting check result does not satisfy current resolution mode requirements';
      const validationFailurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
      let consumedOnValidationFail = [];
      let usedToolPairsOnValidationFail = [];
      let usedToolsOnValidationFail = [];
      try {
        if (validationFailurePolicy.consumeIngredientsOnFail) {
          consumedOnValidationFail = await this._consumeIngredients(
            componentSourceActors,
            ingredientSet,
            executionRecipe
          );
        }
        if (validationFailurePolicy.consumeCatalystsOnFail) {
          usedToolPairsOnValidationFail = toolValidation.tools;
          usedToolsOnValidationFail = await this._applyToolBreakage(
            executionRecipe,
            toolValidation.tools
          );
        }
      } catch (consumptionError) {
        console.error('Fabricate | Error during failure-path consumption:', consumptionError);
      }
      if (runManager && run) {
        await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: false,
            reason: message,
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: consumedOnValidationFail.map(({ item, quantity }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity,
          })),
          usedTools: usedToolsOnValidationFail,
        });
      }
      // Execute failure macro (spec 002 Failure Macro Contract)
      {
        const _systemManager = game.fabricate?.getCraftingSystemManager?.();
        const _craftingSystem = _systemManager?.getSystem(recipe.craftingSystemId);
        await this._runFailureMacro(recipe, {
          recipe: recipe?.toJSON?.() || recipe,
          craftingSystem: _craftingSystem,
          craftingActor,
          componentSourceActors,
          step,
          selectedIngredientSet: ingredientSet,
          failureReason: message,
          checkResult,
          consumedIngredients: consumedOnValidationFail,
          consumedTools: usedToolPairsOnValidationFail,
        });
      }
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedOnValidationFail,
        tools: usedToolPairsOnValidationFail,
        createdResults: [],
        failureReason: message,
      });
      return {
        success: false,
        results: null,
        message,
      };
    }

    const currencyDecrement = await this._decrementCurrencyRequirement(craftingActor, recipe, step);
    if (!currencyDecrement.valid) {
      return {
        success: false,
        results: null,
        message: currencyDecrement.message,
      };
    }

    // Consume ingredients from component source actors
    const consumedItems = await this._consumeIngredients(
      componentSourceActors,
      ingredientSet,
      executionRecipe
    );

    // For alchemy attempts: also consume submitted items that weren't handled
    // by standard ingredient matching (e.g. items used only for essences).
    if (options?.isAlchemyAttempt && Array.isArray(options?.alchemySubmittedItems)) {
      const alreadyConsumedUuids = new Set(consumedItems.map((c) => c.item.uuid));
      const essenceConsumeCounts = new Map();
      for (const item of options.alchemySubmittedItems) {
        if (item.uuid && !alreadyConsumedUuids.has(item.uuid)) {
          essenceConsumeCounts.set(item.uuid, (essenceConsumeCounts.get(item.uuid) || 0) + 1);
        }
      }
      for (const actor of componentSourceActors) {
        for (const item of actor.items || []) {
          const count = essenceConsumeCounts.get(item.uuid);
          if (!count) continue;
          const qty = Number(item.system?.quantity ?? 1);
          await (count >= qty ? item.delete() : item.update({ 'system.quantity': qty - count }));
          consumedItems.push({ item, quantity: count, ingredient: null });
        }
      }
    }

    // Apply tool usage/breakage for the recipe's resolved library Tools.
    const usedTools = await this._applyToolBreakage(executionRecipe, toolValidation.tools);

    // Deduct Item Piles currency cost after ingredients are consumed to avoid
    // losing currency if ingredient consumption throws.
    await this._deductItemPilesCurrencyCost(craftingActor, recipe);

    // Create the result item(s)
    const {
      items: resultItems,
      rollTableMeta,
      resolutionMeta,
    } = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      toolValidation.tools,
      checkResult,
      options?.resultGroupId || null
    );

    if (
      resolutionMeta?.disposition === 'error' ||
      resolutionMeta?.disposition === 'misconfiguration'
    ) {
      const message = resolutionMeta.error || 'Crafting resolution failed';
      if (runManager && run) {
        await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: false,
            reason: message,
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {},
          },
          consumedIngredients: consumedItems.map(({ item, quantity }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity,
          })),
          usedTools,
        });
      }
      {
        const _systemManager = game.fabricate?.getCraftingSystemManager?.();
        const _craftingSystem = _systemManager?.getSystem(recipe.craftingSystemId);
        await this._runFailureMacro(recipe, {
          recipe: recipe?.toJSON?.() || recipe,
          craftingSystem: _craftingSystem,
          craftingActor,
          componentSourceActors,
          step,
          selectedIngredientSet: ingredientSet,
          failureReason: message,
          checkResult,
          consumedIngredients: consumedItems,
          consumedTools: toolValidation.tools,
        });
      }
      await this._postCraftChatMessage({
        success: false,
        craftingActor,
        recipe,
        consumedIngredients: consumedItems,
        tools: toolValidation.tools,
        createdResults: [],
        failureReason: message,
        rollTableMeta,
      });
      return {
        success: false,
        results: null,
        message,
      };
    }

    if (runManager && run) {
      run = await runManager.completeStepSuccess(craftingActor, run, stepIndex, {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: true,
          reason: checkResult.message || 'Success',
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {},
        },
        consumedIngredients: consumedItems.map(({ item, quantity }) => ({
          actorUuid: item.parent?.uuid || null,
          itemUuid: item.uuid,
          quantity,
        })),
        usedTools,
        createdResults: (resultItems || []).map((item) => ({
          actorUuid: craftingActor.uuid,
          itemUuid: item.uuid,
          quantity: Number(item.system?.quantity || 1),
        })),
      });
    }

    // Execute success macro (spec 002 Success Macro Contract)
    {
      const _systemManager = game.fabricate?.getCraftingSystemManager?.();
      const _craftingSystem = _systemManager?.getSystem(recipe.craftingSystemId);
      await this._runSuccessMacro(recipe, {
        recipe: recipe?.toJSON?.() || recipe,
        craftingSystem: _craftingSystem,
        craftingActor,
        componentSourceActors,
        step,
        selectedIngredientSet: ingredientSet,
        consumedIngredients: consumedItems,
        consumedTools: toolValidation.tools,
        createdResults: resultItems || [],
        checkResult,
      });
    }

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

    await this._postCraftChatMessage({
      success: true,
      craftingActor,
      recipe,
      consumedIngredients: consumedItems,
      tools: toolValidation.tools,
      createdResults: resultItems,
      rollTableMeta,
    });

    return {
      success: true,
      results: resultItems,
      message:
        run?.status === 'succeeded'
          ? `Successfully crafted ${recipe.name}`
          : `Completed ${step.name || `step ${stepIndex + 1}`} for ${recipe.name}`,
    };
  }

  /**
   * Attempt to craft using the alchemy discovery mode.
   *
   * Submitted items are matched against the component signatures of all enabled recipes in the
   * crafting system. The recipe names and ingredient lists are hidden from players; they discover
   * recipes by experimentation. This method requires the crafting system to have
   * `resolutionMode: 'alchemy'`.
   *
   * @param {Actor} craftingActor - The actor that will receive crafted results.
   * @param {Actor[]} componentSourceActors - The actors whose inventories are checked for submitted items.
   * @param {object[]} submittedItems - Items dragged in by the player. Each must include at minimum
   *   `{ uuid, name }` so signature matching and consumption can identify them.
   * @param {object} options - Additional options.
   * @param {string} [options.craftingSystemId] - ID of the crafting system to match against.
   * @param {object} [options.signatureValidator] - Optional override for the {@link SignatureValidator}
   *   instance. Defaults to a fresh instance using the system's component list.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, disposition: string}>}
   *   Returns `disposition: 'no-match'` when no recipe signature matches the submitted items.
   *   Returns `disposition: 'error'` for configuration or validation failures.
   *   On success, delegates to {@link CraftingEngine#craft} and returns its result.
   */
  async craftAlchemy(craftingActor, componentSourceActors, submittedItems, options = {}) {
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
        disposition: 'error',
      };
    }
    if (!componentSourceActors?.length) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected',
        disposition: 'error',
      };
    }
    if (!submittedItems?.length) {
      return {
        success: false,
        results: null,
        message: 'No ingredients submitted',
        disposition: 'error',
      };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const systemId = options.craftingSystemId;
    const system = systemManager?.getSystem(systemId);
    if (!system || system.resolutionMode !== 'alchemy') {
      return {
        success: false,
        results: null,
        message: 'No alchemy-mode crafting system found',
        disposition: 'error',
      };
    }

    const recipeManager = this.recipeManager || game.fabricate?.getRecipeManager?.();
    const systemRecipes = recipeManager
      ? recipeManager.getRecipes({ craftingSystemId: systemId, enabled: true })
      : [];
    const signatureValidator =
      options.signatureValidator ||
      new SignatureValidator({
        getSystem: (id) => systemManager.getSystem(id),
        getRecipesForSystem: (id) =>
          recipeManager ? recipeManager.getRecipes({ craftingSystemId: id, enabled: true }) : [],
        getComponentsForSystem: (id) => {
          const sys = systemManager.getSystem(id);
          return sys?.components || [];
        },
      });

    const components = system.components || [];
    const recipes = systemRecipes;
    const matchResult = this._matchAlchemySignature(
      submittedItems,
      recipes,
      components,
      signatureValidator,
      { system }
    );

    const alchemyCfg = system.alchemy || {};
    const shouldConsume = alchemyCfg.consumeOnFail !== false;

    if (!matchResult.matched) {
      if (shouldConsume) {
        await this._consumeSubmittedAlchemyItems(componentSourceActors, submittedItems);
      }
      return {
        success: false,
        results: null,
        message: 'FABRICATE.Alchemy.NoMatch',
        disposition: 'no-match',
        consumed: shouldConsume,
      };
    }

    const recipe = matchResult.recipe;
    const ingredientSetId = matchResult.ingredientSetId;
    return this.craft(craftingActor, componentSourceActors, recipe, ingredientSetId, {
      ...options,
      isAlchemyAttempt: true,
      alchemySubmittedItems: submittedItems,
    });
  }

  /**
   * Match submitted item UUIDs against all recipe signatures in the system.
   * Returns { matched: true, recipe, ingredientSetId } or { matched: false }.
   * @private
   */
  _matchAlchemySignature(submittedItems, recipes, components, signatureValidator, options = {}) {
    const submittedRefs = new Set();
    for (const item of submittedItems) {
      for (const ref of getItemSourceReferences(item)) submittedRefs.add(ref);
      if (item?.sourceUuid) submittedRefs.add(item.sourceUuid);
    }

    // Check whether the system supports essences
    const system = options?.system;
    const essencesEnabled = system?.features?.essences === true;

    // Accumulate essences from ALL submitted items (duplicates count multiple times)
    let submittedEssences = null;
    if (essencesEnabled) {
      submittedEssences = accumulateItemEssences(submittedItems, { components });
    }

    for (const recipe of recipes) {
      if (!recipe.enabled) continue;
      const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
      for (const set of ingredientSets) {
        const signature = signatureValidator.computeSignature(set, components);
        const setEssences = set.essences || {};
        const hasEssences = essencesEnabled && Object.keys(setEssences).length > 0;

        // Skip sets that have neither ingredient groups nor essence requirements
        if (signature.length === 0 && !hasEssences) continue;

        // Check ingredient groups (existing logic)
        const allGroupsSatisfied = signature.every((groupComponentIds) => {
          for (const componentId of groupComponentIds) {
            const comp = components.find((c) => c.id === componentId);
            if (!comp) continue;
            if (getComponentSourceReferences(comp).some((ref) => submittedRefs.has(ref)))
              return true;
          }
          return false;
        });

        // Check essences
        let essencesSatisfied = true;
        if (hasEssences && submittedEssences) {
          for (const [essenceType, requiredQty] of Object.entries(setEssences)) {
            if ((submittedEssences[essenceType] || 0) < requiredQty) {
              essencesSatisfied = false;
              break;
            }
          }
        }

        if (allGroupsSatisfied && essencesSatisfied) {
          return { matched: true, recipe, ingredientSetId: set.id };
        }
      }
    }
    return { matched: false };
  }

  /**
   * Consume submitted alchemy items (no-match failure path).
   * Best-effort: removes items by UUID from component source actors.
   * @private
   */
  async _consumeSubmittedAlchemyItems(componentSourceActors, submittedItems) {
    // Count how many times each UUID appears in submitted items
    const consumeCounts = new Map();
    for (const item of submittedItems) {
      if (item.uuid) {
        consumeCounts.set(item.uuid, (consumeCounts.get(item.uuid) || 0) + 1);
      }
    }
    for (const actor of componentSourceActors) {
      for (const item of actor.items || []) {
        const count = consumeCounts.get(item.uuid);
        if (!count) continue;
        try {
          const qty = Number(item.system?.quantity ?? 1);
          await (count >= qty ? item.delete() : item.update({ 'system.quantity': qty - count }));
        } catch (error) {
          console.error('Fabricate | Alchemy: failed to consume item', item.uuid, error);
        }
      }
    }
  }

  /**
   * Consume ingredients from component source actors
   * @private
   */
  async _consumeIngredients(componentSourceActors, ingredientSet, recipe) {
    const consumedItems = [];

    // Aggregate all items from component source actors
    const availableItems = componentSourceActors.flatMap((actor) => [...actor.items]);

    // Match ingredients to items
    const consumptionPlan = ingredientSet.matchIngredients(availableItems, (ingredient, item) =>
      this.recipeManager.ingredientMatchesItem(recipe, ingredient, item)
    );

    // Execute consumption
    for (const { item, quantity, ingredient } of consumptionPlan) {
      const itemQuantity = item.system?.quantity ?? 1;

      // Store consumed item info for effect transfer
      consumedItems.push({
        item,
        quantity,
        ingredient,
      });

      // Update or delete the item
      await (quantity >= itemQuantity
        ? item.delete()
        : item.update({ 'system.quantity': itemQuantity - quantity }));
    }

    return consumedItems;
  }

  /**
   * Validate that all required library Tools resolved for this recipe/step are
   * present (a matching, non-broken item) on the component source actors.
   *
   * Returns the matched `{ tool, item }` pairs so the caller can apply
   * usage/breakage on the success and failure-consumption paths.
   *
   * Virtual-present injection (Phase 4): a tool whose `componentId` is in the
   * active canvas Tool's `presentTools` payload AND whose recipe crafting system
   * matches the active tool's `systemId` is satisfied WITHOUT an owned item (the
   * active canvas Tool station provides it). Its `{ tool, item: null, virtual:
   * true }` pair is returned so {@link _applyToolBreakage} skips it — there is no
   * owned item to use or break. An owned, non-broken item still takes precedence.
   * The system scope is enforced via {@link resolvePresentComponentIds}: a
   * present tool from system A never satisfies a system-B recipe.
   *
   * @private
   * @param {Actor[]} actors
   * @param {Recipe} recipe
   * @param {Array<object>} tools - resolved library Tool objects
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [presentTools] - virtual-present payload
   * @returns {Promise<{ valid: boolean, message?: string, tools?: Array<{tool: object, item: Item|null, virtual?: boolean}> }>}
   */
  async _validateTools(actors, recipe, tools = [], presentTools = null) {
    const toolItems = [];
    const presentSet = resolvePresentComponentIds({
      presentTools,
      systemId: recipe?.craftingSystemId ?? null,
    });

    for (const tool of tools) {
      let found = null;
      for (const actor of actors) {
        const matching = [...(actor?.items ?? [])].find(
          (item) => !isToolBroken(item) && this.recipeManager.toolMatchesItem(recipe, tool, item)
        );
        if (matching) {
          found = matching;
          break;
        }
      }

      if (found) {
        toolItems.push({ tool, item: found });
      } else if (presentSet.has(tool?.componentId)) {
        // Virtual-present: satisfied by the active canvas Tool, no owned item.
        toolItems.push({ tool, item: null, virtual: true });
      } else {
        return {
          valid: false,
          message: `Missing required tool (componentId: ${tool?.componentId || tool?.systemItemId})`,
        };
      }
    }

    return { valid: true, tools: toolItems };
  }

  /**
   * Apply usage and breakage to matched tools, delegating to the shared
   * {@link applyToolUsageAndBreakage} runtime (the same plan/apply core the
   * gathering tool breakage uses). Returns `usedTools` evidence in the
   * run-record item-ref shape.
   *
   * @private
   * @param {Recipe} recipe
   * @param {Array<{tool: object, item: Item}>} toolItems
   * @returns {Promise<Array<{ actorUuid: string|null, itemUuid: string|null, quantity: number, componentId: string|null, broken: boolean }>>}
   */
  async _applyToolBreakage(recipe, toolItems = []) {
    const evidence = [];
    for (const { tool: toolData, item, virtual } of toolItems) {
      // Virtual-present (canvas-tool) matches have no owned item to use/break,
      // and must not produce a consuming usedTools run-record entry.
      if (virtual || !item) continue;
      const tool = toolData instanceof Tool ? toolData : Tool.fromJSON(toolData);
      const actor = item?.parent ?? null;
      const entry = await applyToolUsageAndBreakage({
        tool,
        actor,
        item,
        buildItemRef: (_actor, breakItem) => ({
          actorUuid: breakItem?.parent?.uuid || null,
          itemUuid: breakItem?.uuid || null,
          quantity: 1,
        }),
        createReplacement: this._makeToolReplacementCreator(recipe),
      });
      evidence.push({
        actorUuid: entry.itemRef?.actorUuid ?? null,
        itemUuid: entry.itemRef?.itemUuid ?? null,
        quantity: entry.itemRef?.quantity ?? 1,
        componentId: entry.componentId ?? null,
        broken: entry.broken === true,
      });
    }
    return evidence;
  }

  /**
   * Build a `replaceWith` creator that resolves the replacement component from
   * the recipe's crafting system and creates the item on the actor.
   * @private
   */
  _makeToolReplacementCreator(recipe) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    return async ({ actor, componentId }) => {
      const component =
        (system?.components || []).find((entry) => entry.id === componentId) || null;
      if (!component || typeof actor?.createEmbeddedDocuments !== 'function') return;
      let source = component;
      if (component.sourceUuid && typeof globalThis.fromUuidSync === 'function') {
        try {
          source = globalThis.fromUuidSync(component.sourceUuid) ?? component;
        } catch {
          source = component;
        }
      }
      const itemData = source.toObject?.() ?? {
        name: source.name ?? 'Replacement Item',
        img: source.img ?? 'icons/svg/item-bag.svg',
        type: source.type ?? 'loot',
        system: source.system
          ? (globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system })
          : {},
      };
      itemData.system ??= {};
      if (itemData.system.quantity !== undefined) itemData.system.quantity = 1;
      if (source.uuid) {
        globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
      }
      await actor.createEmbeddedDocuments('Item', [itemData]);
    };
  }

  /**
   * Create the result items based on recipe configuration
   * @private
   */
  async _createResultItems(
    craftingActor,
    recipe,
    step,
    ingredientSet,
    consumedItems,
    toolItems,
    checkResult = null,
    selectedResultGroupId = null
  ) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();

    // Pre-resolve rollTableOutcome before calling resolveResultGroups
    let rollTableResult = null;
    if (recipe?.resultSelection?.provider === 'rollTableOutcome' && resolutionService) {
      const allGroups =
        Array.isArray(step?.resultGroups) && step.resultGroups.length > 0
          ? step.resultGroups
          : Array.isArray(recipe?.resultGroups)
            ? recipe.resultGroups
            : [];
      rollTableResult = await resolutionService.resolveByRollTable(recipe, step, allGroups);
      if (rollTableResult.meta?.error && !rollTableResult.meta?.disposition) {
        console.error(`Fabricate | rollTableOutcome error: ${rollTableResult.meta.error}`);
        return {
          items: [],
          rollTableMeta: { error: rollTableResult.meta.error, disposition: 'error' },
          resolutionMeta: { error: rollTableResult.meta.error, disposition: 'error' },
        };
      }
      if (rollTableResult.meta?.disposition === 'misconfiguration') {
        console.error(
          `Fabricate | rollTableOutcome misconfiguration: ${rollTableResult.meta.error}`
        );
        return {
          items: [],
          rollTableMeta: { error: rollTableResult.meta.error, disposition: 'misconfiguration' },
          resolutionMeta: { error: rollTableResult.meta.error, disposition: 'misconfiguration' },
        };
      }
    }

    const resolved = resolutionService
      ? resolutionService.resolveResultGroups({
          recipe,
          step,
          ingredientSet,
          checkResult,
          selectedResultGroupId,
          rollTableResult,
        })
      : {
          groups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
          meta: {},
        };

    const groupsToCreate = Array.isArray(resolved?.groups) ? resolved.groups : [];

    const createdItems = [];
    for (const group of groupsToCreate) {
      for (const result of group.results || []) {
        const resultItem = await this._createSingleResult(
          craftingActor,
          result,
          consumedItems,
          toolItems,
          recipe,
          {
            ...checkResult,
            resolutionMeta: resolved?.meta || {},
          },
          step
        );

        if (resultItem) {
          createdItems.push(resultItem);
        }
      }
    }

    return {
      items: createdItems,
      rollTableMeta: rollTableResult?.meta || null,
      resolutionMeta: resolved?.meta || null,
    };
  }

  /**
   * Create a single result item
   * @private
   */
  async _createSingleResult(
    craftingActor,
    result,
    consumedItems,
    toolItems,
    recipe,
    checkResult = null,
    step = null
  ) {
    // Get the source item
    let sourceItem;
    let managedItem = null;
    if ((result.componentId || result.systemItemId) && recipe.craftingSystemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      const managedItems = system?.components || [];
      managedItem =
        managedItems.find((i) => i.id === (result.componentId || result.systemItemId)) || null;
      if (managedItem?.sourceUuid) {
        sourceItem = await fromUuid(managedItem.sourceUuid);
      }
    }

    if (result.itemUuid) {
      sourceItem = await fromUuid(result.itemUuid);
    }

    let itemData;
    if (sourceItem) {
      itemData = sourceItem.toObject();
    } else if (managedItem) {
      console.warn(
        `Fabricate | Managed result source item could not be resolved for "${managedItem.id || managedItem.name || 'unknown'}"; using fallback item data`
      );
      itemData = {
        name: managedItem.name || 'Crafted Item',
        img: managedItem.img || 'icons/svg/item-bag.svg',
        type: 'loot',
        system: {},
      };
    } else {
      console.error(
        `Fabricate | Result item not found: ${result.itemUuid || result.componentId || result.systemItemId}`
      );
      return null;
    }

    // Set quantity
    if (itemData.system.quantity !== undefined || !sourceItem) {
      itemData.system.quantity = result.quantity;
    }

    // Apply macro-based property updates
    const propertyUpdates = await this._runPropertyMacro(
      result.propertyMacroUuid,
      recipe,
      craftingActor,
      result,
      consumedItems,
      toolItems,
      checkResult,
      step
    );
    if (propertyUpdates && typeof propertyUpdates === 'object') {
      for (const [path, value] of Object.entries(propertyUpdates)) {
        foundry.utils.setProperty(itemData, path, value);
      }
    }

    // Create the item in crafting actor's inventory
    const [createdItem] = await craftingActor.createEmbeddedDocuments('Item', [itemData]);

    // Transfer active effects if configured (requires both recipe-level and system-level flags)
    if (recipe.transferEffects) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      if (system?.features?.effectTransfer === true) {
        await this._transferEffects(createdItem, consumedItems, recipe);
      }
    }

    return createdItem;
  }

  /**
   * Transfer active effects from essence source items to the result item.
   *
   * Per spec 005 §"Effect Transfer Semantics":
   *   1. Determine contributing essence IDs from resolved ingredients.
   *   2. For each contributing essence, if EssenceDefinition.sourceItemUuid resolves,
   *      collect active effects from that item.
   *   3. Transfer collected effects to the result item via createEmbeddedDocuments.
   *
   * The old ingredient-level extractEffects / effectFilter path has been removed.
   * @private
   */
  async _transferEffects(resultItem, consumedItems, recipe) {
    // 1. Get the crafting system and verify essences are enabled
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe.craftingSystemId);
    if (!system?.features?.essences) return;

    // 2. Build essence context — resolvedEssences maps essenceId -> total quantity contributed
    const { resolvedEssences } = this._buildEssenceContext(consumedItems, recipe);
    const contributingEssenceIds = Object.keys(resolvedEssences);
    if (contributingEssenceIds.length === 0) return;

    // 3. For each contributing essence, find its EssenceDefinition and resolve the source item
    const essenceDefinitions = system.essenceDefinitions || [];
    const effectsData = [];

    for (const essenceId of contributingEssenceIds) {
      const definition = essenceDefinitions.find((d) => d.id === essenceId);
      const sourceItemUuid = this._sourceUuidForEssenceDefinition(definition, system);
      if (!sourceItemUuid) continue;

      const sourceItem = await fromUuid(sourceItemUuid);
      if (!sourceItem) continue;

      const itemEffects = sourceItem.effects || [];
      for (const effect of itemEffects) {
        effectsData.push(effect.toObject());
      }
    }

    // 4. Transfer all collected effects to the result item
    if (effectsData.length === 0) return;
    await resultItem.createEmbeddedDocuments('ActiveEffect', effectsData);
  }

  _sourceUuidForEssenceDefinition(definition, system) {
    if (!definition) return null;
    const sourceComponentId =
      definition.sourceComponentId || definition.associatedSystemItemId || '';
    if (sourceComponentId) {
      const components = Array.isArray(system?.components)
        ? system.components
        : Array.isArray(system?.items)
          ? system.items
          : [];
      const component = components.find((item) => item?.id === sourceComponentId) || null;
      if (component?.sourceItemUuid || component?.sourceUuid) {
        return component.sourceItemUuid || component.sourceUuid;
      }
      return null;
    }
    return definition.sourceItemUuid || null;
  }

  _getCurrencyRequirementConfig(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;

    const currency = system?.requirements?.currency || {};
    const spendStrategy = currency.spendStrategy === 'pf2eInventory' ? 'pf2eInventory' : 'dataPath';
    return {
      enabled: currency.enabled === true,
      spendStrategy,
      units: Array.isArray(currency.units) ? currency.units : [],
      system,
    };
  }

  _getFailureConsumptionPolicy(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { consumeIngredientsOnFail: true, consumeCatalystsOnFail: false };
    }
    const consumption = system.craftingCheck?.consumption || {};
    return {
      consumeIngredientsOnFail: consumption.consumeIngredientsOnFail !== false,
      consumeCatalystsOnFail: consumption.consumeCatalystsOnFail === true,
    };
  }

  _getSuccessFailureMacroUuids(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return { successMacroUuid: null, failureMacroUuid: null };
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return { successMacroUuid: null, failureMacroUuid: null };
    return {
      successMacroUuid: system.craftingCheck?.successMacroUuid || null,
      failureMacroUuid: system.craftingCheck?.failureMacroUuid || null,
    };
  }

  async _runSuccessMacro(recipe, context) {
    const { successMacroUuid } = this._getSuccessFailureMacroUuids(recipe);
    if (!successMacroUuid) return;
    try {
      await MacroExecutor.run(successMacroUuid, context);
    } catch (error) {
      console.error(`Fabricate | Success macro failed (${successMacroUuid}):`, error);
    }
  }

  async _runFailureMacro(recipe, context) {
    const { failureMacroUuid } = this._getSuccessFailureMacroUuids(recipe);
    if (!failureMacroUuid) return;
    try {
      await MacroExecutor.run(failureMacroUuid, context);
    } catch (error) {
      console.error(`Fabricate | Failure macro failed (${failureMacroUuid}):`, error);
    }
  }

  _getStepCurrencyRequirement(step) {
    if (!step?.currencyRequirement || typeof step.currencyRequirement !== 'object') return null;
    const unit = String(step.currencyRequirement.unit || '').trim();
    const amount = Math.max(0, Number(step.currencyRequirement.amount || 0) || 0);
    if (!unit || amount <= 0) return null;
    return { unit, amount };
  }

  _formatCurrencyRequirement(config, requirement) {
    return formatCurrencyRequirement(requirement, config?.units || []);
  }

  /**
   * Check Item Piles currency cost on a recipe, if the integration is enabled.
   * @private
   */
  async _checkItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return { valid: true };

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return { valid: true };

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return { valid: true };

    try {
      const affordable = await integration.canAfford(craftingActor, cost.currencies);
      if (!affordable) {
        return {
          valid: false,
          message: 'Insufficient currency (Item Piles). Cannot afford recipe cost.',
        };
      }
      return { valid: true };
    } catch (error) {
      console.error('Fabricate | Item Piles canAfford error', error);
      return { valid: false, message: 'Item Piles currency check failed: ' + error.message };
    }
  }

  /**
   * Deduct Item Piles currency cost from actor after a successful craft.
   * Errors are logged but do not throw, to avoid losing crafting results.
   * @private
   */
  async _deductItemPilesCurrencyCost(craftingActor, recipe) {
    const cost = recipe?.currencyCost;
    if (!cost?.currencies?.length) return;

    const integration = this.itemPilesIntegration || game.fabricate?.getItemPilesIntegration?.();
    if (!integration) return;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!integration.isEnabled(system)) return;

    try {
      await integration.deductCurrency(craftingActor, cost.currencies);
    } catch (error) {
      console.error('Fabricate | Item Piles deductCurrency error', error);
    }
  }

  _getCoinSpender() {
    return this.coinSpender || game.fabricate?.getCoinSpender?.() || null;
  }

  async _checkCurrencyRequirement(craftingActor, recipe, step) {
    const requirement = this._getStepCurrencyRequirement(step);
    if (!requirement) return { valid: true };

    const config = this._getCurrencyRequirementConfig(recipe);
    if (!config?.enabled) return { valid: true };

    const profile = validateCurrencyProfile(config.units || [], {
      spendStrategy: config.spendStrategy,
    });
    if (!profile.valid) {
      return {
        valid: false,
        message: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
      };
    }
    const unit = findCurrencyUnit(profile.units, requirement.unit);
    if (!unit)
      return { valid: false, message: `Currency unit "${requirement.unit}" is not configured.` };

    if (config.spendStrategy === 'pf2eInventory') {
      return this._checkPf2eCurrencyRequirement(craftingActor, requirement, profile, unit);
    }

    const balances = readCurrencyBalances(craftingActor, profile.units);
    if (!balances.valid) return { valid: false, message: balances.message };
    const spend = buildCurrencySpendUpdates(craftingActor, requirement, profile.units);
    if (!spend.valid) return { valid: false, message: spend.message };
    return { valid: true };
  }

  _checkPf2eCurrencyRequirement(craftingActor, requirement, profile, unit) {
    const spender = this._getCoinSpender();
    const coins = spender?.readCoins?.(craftingActor) ?? null;
    if (!coins) {
      return {
        valid: false,
        message: `Currency unit "${unit.label || unit.id}" is not available on ${craftingActor?.name || 'actor'}.`,
      };
    }
    const baseValue = Number(profile.metadata.get(unit.id)?.baseValue) || 0;
    const requiredBase = requirement.amount * baseValue;
    if (Number(coins.copperValue) < requiredBase) {
      return {
        valid: false,
        message: `Insufficient currency. Requires ${formatCurrencyRequirement(requirement, profile.units)}.`,
      };
    }
    return { valid: true };
  }

  async _decrementCurrencyRequirement(craftingActor, recipe, step) {
    const requirement = this._getStepCurrencyRequirement(step);
    if (!requirement) return { valid: true };

    const config = this._getCurrencyRequirementConfig(recipe);
    if (!config?.enabled) return { valid: true };

    if (config.spendStrategy === 'pf2eInventory') {
      const profile = validateCurrencyProfile(config.units || [], {
        spendStrategy: config.spendStrategy,
      });
      if (!profile.valid) {
        return {
          valid: false,
          message: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
        };
      }
      const unit = findCurrencyUnit(profile.units, requirement.unit);
      if (!unit)
        return { valid: false, message: `Currency unit "${requirement.unit}" is not configured.` };
      const spender = this._getCoinSpender();
      if (!spender?.spend) {
        return {
          valid: false,
          message: `Currency unit "${unit.label || unit.id}" is not available on ${craftingActor?.name || 'actor'}.`,
        };
      }
      try {
        return await spender.spend(craftingActor, { unit, amount: requirement.amount });
      } catch (error) {
        console.error('Fabricate | Failed to decrement pf2e currency', error);
        return {
          valid: false,
          message: `Could not spend currency (${formatCurrencyRequirement(requirement, profile.units)}).`,
        };
      }
    }

    const spend = buildCurrencySpendUpdates(craftingActor, requirement, config.units || []);
    if (!spend.valid) return { valid: false, message: spend.message };
    try {
      if (Object.keys(spend.updates || {}).length > 0) {
        await craftingActor.update(spend.updates);
      }
    } catch (error) {
      console.error('Fabricate | Failed to decrement currency', error);
      return {
        valid: false,
        message: `Could not spend currency (${spend.formatted || this._formatCurrencyRequirement(config, requirement)}).`,
      };
    }
    return { valid: true };
  }

  async _runCraftingCheck(
    recipe,
    craftingActor,
    componentSourceActors,
    ingredientSet,
    step = null
  ) {
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { success: true, outcome: null, value: null, data: {} };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { success: true, outcome: null, value: null, data: {} };
    }

    const mode = resolutionService?.getMode(recipe) || system?.resolutionMode || 'simple';
    const selection =
      resolutionService?.getResultSelection?.(recipe, step) || recipe?.resultSelection || null;
    const checkRequired =
      mode === 'tiered' ||
      mode === 'progressive' ||
      (mode === 'routed' && selection?.provider === 'macroOutcome');
    const features = system.features || {};
    const checksEnabled =
      features.craftingChecks === true || system?.craftingCheck?.enabled === true;
    if (!checksEnabled && !checkRequired) {
      return { success: true, outcome: null, data: {} };
    }

    const config = system.craftingCheck || {};
    const checkSource = config.checkSource || 'macro';

    if (checkSource === 'builtIn') {
      const gameSystemId = typeof game === 'undefined' ? null : game.system?.id;
      const adapter = CraftingCheckAdapterRegistry.get(gameSystemId);
      if (!adapter) {
        return {
          success: false,
          outcome: null,
          value: null,
          data: {},
          message:
            'No system adapter available for built-in checks. Switch to macro mode or install a compatible game system.',
        };
      }
      let adapterResult;
      try {
        adapterResult = await adapter.executeCheck(craftingActor, config.builtIn || {});
      } catch (error) {
        console.error('Fabricate | Built-in crafting check failed', error);
        return {
          success: false,
          outcome: null,
          value: null,
          data: {},
          message: `Built-in crafting check failed: ${error.message}`,
        };
      }
      const success = adapterResult.success !== false;
      return {
        success,
        outcome: adapterResult.outcome ?? null,
        value: adapterResult.value ?? null,
        data: adapterResult.data || {},
        message: success ? null : adapterResult.message || 'Built-in crafting check failed',
      };
    }

    if (!config.macroUuid) {
      if (checkRequired) {
        return {
          success: false,
          outcome: null,
          value: null,
          data: {},
          message: `${mode} mode requires a crafting check macro`,
        };
      }
      return { success: true, outcome: null, value: null, data: {} };
    }

    const ingredientPool = componentSourceActors.flatMap((actor) =>
      [...actor.items].map((item) => ({
        actorId: actor.id,
        actorName: actor.name,
        item,
      }))
    );
    const resolvedEssences = this._accumulateEssencesFromItems(
      ingredientPool.map((entry) => entry.item),
      recipe
    );

    let result;
    try {
      result = await MacroExecutor.run(config.macroUuid, {
        recipe: recipe?.toJSON?.() || recipe,
        craftingSystem: system,
        craftingActor,
        componentSourceActors,
        ingredientPool,
        candidateIngredientSet: ingredientSet,
        resolvedEssences,
        step,
      });
    } catch (error) {
      console.error(`Fabricate | Crafting check macro failed (${config.macroUuid})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: `Crafting check macro failed: ${error.message || config.macroUuid}`,
      };
    }

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: 'Crafting check macro must return an object',
      };
    }

    const outcome = result.outcome == null ? null : String(result.outcome);
    const value = Number.isFinite(Number(result.value)) ? Number(result.value) : null;
    const allowed = Array.isArray(config.outcomes) ? config.outcomes : [];
    const normalizedOutcome = outcome?.trim().toLowerCase();
    const normalizedAllowed = allowed
      .map((entry) =>
        String(entry || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
    if (outcome && normalizedAllowed.length > 0 && !normalizedAllowed.includes(normalizedOutcome)) {
      return {
        success: false,
        outcome,
        value,
        data: result.data || {},
        message: `Crafting check returned invalid outcome "${outcome}"`,
      };
    }

    const success = result.success !== false;
    return {
      success,
      outcome,
      value,
      data: result.data || {},
      message: success ? null : result.message || 'Crafting check failed',
    };
  }

  /**
   * Post an automatic crafting summary chat message.
   *
   * Checks system.features.chatOutput; returns silently when the toggle is off or
   * when the crafting system cannot be resolved.  Errors from ChatMessage.create
   * are caught so they never propagate up the craft() call stack.
   *
   * @param {object}  params
   * @param {boolean} params.success            - Whether the craft succeeded.
   * @param {object}  params.craftingActor      - The actor performing the craft.
   * @param {object}  params.recipe             - The recipe being crafted.
   * @param {Array}   params.consumedIngredients - Array of { item, quantity } entries.
   * @param {Array}   params.tools               - Array of { tool, item } entries.
   * @param {Array}   params.createdResults      - Array of created Item documents (success only).
   * @param {string}  [params.failureReason]     - Human-readable failure reason (failure only).
   * @private
   */
  async _postCraftChatMessage({
    success,
    craftingActor,
    recipe,
    consumedIngredients,
    tools,
    createdResults,
    failureReason,
    rollTableMeta = null,
  }) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(recipe?.craftingSystemId);
    if (!system || system.features?.chatOutput !== true) return;

    const loc = (key) => game.i18n?.localize?.(key) ?? key;

    let content;
    if (success) {
      const lines = [
        `<h3>${loc('FABRICATE.Chat.CraftSuccess')}: ${recipe.name}</h3>`,
        `<p><strong>${loc('FABRICATE.Chat.Actor')}:</strong> ${craftingActor?.name || ''}</p>`,
      ];

      if (rollTableMeta?.drawnName) {
        lines.push(
          `<p><strong>${loc('FABRICATE.Chat.RollTableResult') || 'Roll Table Result'}:</strong> ${rollTableMeta.drawnName}</p>`
        );
      }

      if (createdResults && createdResults.length > 0) {
        lines.push(`<p><strong>${loc('FABRICATE.Chat.Results')}</strong></p><ul>`);
        for (const item of createdResults) {
          const qty = Number(item?.system?.quantity || 1);
          lines.push(`<li>${qty}x ${item?.name || ''}</li>`);
        }
        lines.push('</ul>');
      }

      if (consumedIngredients && consumedIngredients.length > 0) {
        lines.push(`<p><strong>${loc('FABRICATE.Chat.Consumed')}</strong></p><ul>`);
        for (const { item, quantity } of consumedIngredients) {
          lines.push(`<li>${quantity}x ${item?.name || ''}</li>`);
        }
        lines.push('</ul>');
      }

      if (tools && tools.length > 0) {
        lines.push(`<p><strong>${loc('FABRICATE.Chat.Tools')}</strong></p><ul>`);
        for (const { item } of tools) {
          lines.push(`<li>${item?.name || ''}</li>`);
        }
        lines.push('</ul>');
      }

      content = lines.join('\n');
    } else {
      const lines = [
        `<h3>${loc('FABRICATE.Chat.CraftFailure')}: ${recipe.name}</h3>`,
        `<p><strong>${loc('FABRICATE.Chat.Actor')}:</strong> ${craftingActor?.name || ''}</p>`,
        `<p><strong>${loc('FABRICATE.Chat.FailureReason')}:</strong> ${failureReason || ''}</p>`,
      ];

      const hasConsumed =
        (consumedIngredients && consumedIngredients.length > 0) || (tools && tools.length > 0);

      if (hasConsumed) {
        lines.push(`<p><strong>${loc('FABRICATE.Chat.ConsumedOnFailure')}</strong></p><ul>`);
        for (const { item, quantity } of consumedIngredients || []) {
          lines.push(`<li>${quantity}x ${item?.name || ''}</li>`);
        }
        for (const { item } of tools || []) {
          lines.push(`<li>${item?.name || ''}</li>`);
        }
        lines.push('</ul>');
      }

      content = lines.join('\n');
    }

    try {
      await ChatMessage.create({
        user: game.user?.id,
        speaker: ChatMessage.getSpeaker({ actor: craftingActor }),
        content,
      });
    } catch (error) {
      console.error('Fabricate | Failed to post crafting chat message:', error);
    }
  }

  async _runPropertyMacro(
    macroUuid,
    recipe,
    craftingActor,
    result,
    consumedItems,
    toolItems,
    checkResult = null,
    step = null
  ) {
    if (!macroUuid) return null;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const craftingSystem = recipe?.craftingSystemId
      ? systemManager?.getSystem(recipe.craftingSystemId)
      : null;
    const features = craftingSystem?.features || {};
    const enabled = features.propertyMacros === true;
    if (!enabled) return null;

    const essenceContext = this._buildEssenceContext(consumedItems, recipe);
    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem,
      craftingActor,
      ingredientPool: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedIngredients: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient,
      })),
      resolvedTools: toolItems.map(({ item, tool }) => ({
        item,
        tool,
      })),
      resolvedEssences: essenceContext.resolvedEssences,
      essenceSources: essenceContext.essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step,
    };

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (error) {
      console.error(`Fabricate | Property macro failed (${macroUuid})`, error);
      ui.notifications.error(`Property macro failed: ${error.message || macroUuid}`);
      return null;
    }
  }

  _buildEssenceContext(consumedItems, recipe = null) {
    const resolvedEssences = {};
    const essenceSources = {};
    const components = this._getSystemComponents(recipe);

    for (const { item, quantity } of consumedItems) {
      const itemEssences = resolveItemEssences(item, components);
      for (const [essenceId, perUnit] of Object.entries(itemEssences)) {
        const value = Number(perUnit);
        if (!Number.isFinite(value) || value <= 0) continue;
        const total = value * (Number(quantity) || 1);
        resolvedEssences[essenceId] = (resolvedEssences[essenceId] || 0) + total;
        essenceSources[essenceId] = essenceSources[essenceId] || [];
        essenceSources[essenceId].push({
          itemId: item.id,
          itemName: item.name,
          quantityConsumed: quantity,
          essencePerItem: value,
          essenceTotal: total,
        });
      }
    }

    return { resolvedEssences, essenceSources };
  }

  _accumulateEssencesFromItems(items, recipe = null) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      multiplyByQuantity: true,
    });
  }

  _getSystemComponents(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    return Array.isArray(system?.components) ? system.components : [];
  }

  /**
   * Format missing items message
   * @private
   */
  _formatMissingItems(missing) {
    const lines = [];

    for (const { ingredient, have, need } of missing.ingredients) {
      const description =
        typeof ingredient?.getDescription === 'function'
          ? ingredient.getDescription()
          : 'Ingredient';
      lines.push(`${description}: have ${have}, need ${need}`);
    }

    for (const { type, have, need } of missing.essences) {
      lines.push(`${type} essence: have ${have}, need ${need}`);
    }

    for (const tool of missing.tools || []) {
      lines.push(`Tool (componentId: ${tool.componentId || tool.systemItemId}): missing`);
    }

    return lines.join('\n');
  }

  _buildStepRecipeView(recipe, step) {
    return {
      ...recipe,
      ingredientSets: step?.ingredientSets || recipe.ingredientSets || [],
      resultGroups: step?.resultGroups || recipe.resultGroups || [],
      outcomeRouting: step?.outcomeRouting || recipe.outcomeRouting || null,
      resultSelection: step?.resultSelection || recipe.resultSelection || null,
      // Merge step-level toolIds with recipe-level so the union flows to
      // RecipeManager.getToolsForSet via recipe.toolIds. getToolsForSet dedupes
      // by id, so recipe/step overlap resolves once.
      toolIds: [
        ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
        ...(Array.isArray(step?.toolIds) ? step.toolIds : []),
      ],
    };
  }

  _getSalvageRunManager() {
    return this.salvageRunManager || game.fabricate?.getSalvageRunManager?.() || null;
  }

  async processPendingSalvageRuns(worldTime = Number(game.time?.worldTime || 0)) {
    const salvageRunManager = this._getSalvageRunManager();
    if (!salvageRunManager) return;

    await salvageRunManager.processWorldTime(worldTime, async (actor, run) => {
      try {
        await this.salvage(actor.uuid, run.craftingSystemId, run.componentId, {
          runId: run.id,
          skipTimeGate: true,
        });
      } catch (error) {
        console.error(`Fabricate | Failed to resume salvage run ${run.id}:`, error);
      }
    });
  }

  /**
   * Perform the salvage pipeline for a component.
   *
   * Resolves actor, system, and component from their IDs/UUIDs, then runs
   * the full pipeline: validate -> ownership check -> tool check ->
   * salvage check -> failure policy -> consume -> create results -> record run.
   *
   * @param {string} actorUuid - UUID of the actor performing salvage.
   * @param {string} craftingSystemId - ID of the crafting system.
   * @param {string} componentId - ID of the component to salvage.
   * @param {Object} [options={}] - Optional overrides.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, salvageRun: object|null}>}
   */
  async salvage(actorUuid, craftingSystemId, componentId, options = {}) {
    const actor = await fromUuid(actorUuid);
    if (!actor) {
      return { success: false, results: null, message: 'Actor not found', salvageRun: null };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(craftingSystemId);
    if (!system) {
      return {
        success: false,
        results: null,
        message: `Crafting system "${craftingSystemId}" not found`,
        salvageRun: null,
      };
    }

    const managedItems = system.components || [];
    const component = managedItems.find((c) => c.id === componentId) || null;
    if (!component) {
      return {
        success: false,
        results: null,
        message: `Component "${componentId}" not found in system`,
        salvageRun: null,
      };
    }

    if (!system.features?.salvage) {
      return {
        success: false,
        results: null,
        message: 'Salvage feature is not enabled on this crafting system',
        salvageRun: null,
      };
    }
    if (!component.salvage?.enabled) {
      return {
        success: false,
        results: null,
        message: `Salvage is not enabled for component "${component.name || componentId}"`,
        salvageRun: null,
      };
    }

    // 4. Validate salvage configuration via ResolutionModeService
    const resolutionService =
      this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService) {
      const validation = resolutionService.validateSalvage(component, system);
      if (!validation.valid) {
        return {
          success: false,
          results: null,
          message: `Invalid salvage configuration: ${validation.errors.join(', ')}`,
          salvageRun: null,
        };
      }
    }

    const salvageRunManager = this._getSalvageRunManager();
    let salvageRun = null;
    if (salvageRunManager) {
      salvageRun = options?.runId
        ? salvageRunManager.getActiveRun(actor, options.runId)
        : salvageRunManager.findActiveRunForComponent(actor, craftingSystemId, componentId);
    }

    if (options?.runId && !salvageRun && salvageRunManager) {
      return {
        success: false,
        results: null,
        message: 'Active salvage run not found',
        salvageRun: null,
      };
    }

    const ingredientQuantity = Number(component.salvage.ingredientQuantity) || 1;
    const componentItems = this._findComponentItems(actor, component, system);
    const totalAvailable = componentItems.reduce(
      (sum, item) => sum + (Number(item.system?.quantity) || 1),
      0
    );
    if (totalAvailable < ingredientQuantity) {
      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          failureReason: `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`,
        });
      }
      return {
        success: false,
        results: null,
        message: `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`,
        salvageRun,
      };
    }

    const syntheticRecipe = { craftingSystemId, components: managedItems };
    const salvageTools = this._resolveSalvageTools(system, component.salvage);
    const toolValidation = await this._validateTools([actor], syntheticRecipe, salvageTools);
    if (!toolValidation.valid) {
      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          failureReason: toolValidation.message,
        });
      }
      return { success: false, results: null, message: toolValidation.message, salvageRun };
    }

    const now = Number(game.time?.worldTime || 0);
    const timeRequirement = component.salvage?.timeRequirement || null;

    if (salvageRunManager && !salvageRun) {
      salvageRun = await salvageRunManager.createRun(actor, {
        actorUuid,
        craftingSystemId,
        componentId,
        componentName: component.name || componentId,
        status: 'inProgress',
        startedAt: now,
        usedTools: [],
      });
    }

    if (salvageRunManager && timeRequirement && !options?.skipTimeGate) {
      salvageRun = await salvageRunManager.markRunWaitingForTime(
        actor,
        salvageRun,
        timeRequirement
      );
      const canProceed = salvageRunManager.canProceedTimeGate(salvageRun, now);
      if (!canProceed) {
        const remaining = Math.max(
          0,
          Math.ceil(Number(salvageRun.timeGate?.availableAt || 0) - now)
        );
        return {
          success: true,
          results: null,
          message: `Salvage started for ${component.name || componentId} (${remaining}s remaining)`,
          salvageRun,
        };
      }
    }

    if (salvageRunManager && salvageRun) {
      salvageRun = await salvageRunManager.markRunInProgress(actor, salvageRun);
    }

    const checkResult = await this._runSalvageCraftingCheck(
      component,
      system,
      actor,
      toolValidation.tools
    );
    const failurePolicy = this._getSalvageFailureConsumptionPolicy(system);

    if (!checkResult.success) {
      let consumedOnFail = [];
      let usedToolPairs = [];
      let usedTools = [];
      try {
        if (failurePolicy.consumeComponentOnFail) {
          consumedOnFail = await this._consumeComponentItems(
            actor,
            componentItems,
            ingredientQuantity
          );
        }
        if (failurePolicy.consumeCatalystsOnFail) {
          usedToolPairs = toolValidation.tools;
          usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools);
        }
      } catch (error) {
        console.error('Fabricate | Error during salvage failure-path consumption:', error);
      }

      if (salvageRunManager && salvageRun) {
        salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'failed', {
          consumedComponents: consumedOnFail.map(({ item, quantity }) => ({
            itemUuid: item.uuid,
            quantity,
          })),
          usedTools,
          createdResults: [],
          checkResult: {
            success: false,
            outcome: checkResult.outcome,
            value: checkResult.value,
            data: checkResult.data || {},
          },
          failureReason: checkResult.message || 'Salvage check failed',
        });
      }

      await this._runSalvageFailureMacro(component, system, {
        component,
        craftingSystem: system,
        craftingActor: actor,
        salvageInput: { componentId, quantity: ingredientQuantity },
        consumedComponents: consumedOnFail,
        consumedTools: usedToolPairs,
        createdResults: [],
        checkResult,
        failureReason: checkResult.message || 'Salvage check failed',
      });

      return {
        success: false,
        results: null,
        message: checkResult.message || 'Salvage check failed',
        salvageRun,
      };
    }

    const resultGroups = this._resolveSalvageResultGroups(component, system, checkResult);
    const consumedItems = await this._consumeComponentItems(
      actor,
      componentItems,
      ingredientQuantity
    );
    const usedTools = await this._applyToolBreakage(syntheticRecipe, toolValidation.tools);

    const salvageRecipeView = this._buildSalvageRecipeView(component, system);
    const resultItems = [];
    for (const group of resultGroups) {
      for (const result of group.results || []) {
        const created = await this._createSingleResult(
          actor,
          result,
          consumedItems,
          toolValidation.tools,
          salvageRecipeView,
          checkResult,
          null
        );
        if (created) resultItems.push(created);
      }
    }

    if (salvageRunManager && salvageRun) {
      salvageRun = await salvageRunManager.completeRun(actor, salvageRun, 'succeeded', {
        consumedComponents: consumedItems.map(({ item, quantity }) => ({
          itemUuid: item.uuid,
          quantity,
        })),
        usedTools,
        createdResults: resultItems.map((item) => ({
          itemUuid: item.uuid,
          componentId: null,
          quantity: Number(item.system?.quantity || 1),
        })),
        checkResult: {
          success: true,
          outcome: checkResult.outcome,
          value: checkResult.value,
          data: checkResult.data || {},
        },
        failureReason: null,
      });
    }

    await this._runSalvageSuccessMacro(component, system, {
      component,
      craftingSystem: system,
      craftingActor: actor,
      salvageInput: { componentId, quantity: ingredientQuantity },
      consumedComponents: consumedItems,
      consumedTools: toolValidation.tools,
      createdResults: resultItems,
      checkResult,
    });

    return {
      success: true,
      results: resultItems,
      message: `Successfully salvaged ${component.name || componentId}`,
      salvageRun,
    };
  }

  /**
   * Find items on actor that match a managed component.
   * Matches against the component's full source-reference chain: live `sourceUuid`,
   * canonical `sourceItemUuid`, and any recorded `fallbackItemIds`. Falls back to
   * name matching only when the component has no source references.
   * @private
   */
  _findComponentItems(actor, component, _system) {
    const items = [...actor.items];
    if (component.sourceUuid || component.sourceItemUuid || component.fallbackItemIds?.length) {
      const byUuid = items.filter((item) => itemMatchesComponentSource(item, component));
      if (byUuid.length > 0) return byUuid;
    }
    // Name fallback
    const name = component.name;
    if (name) {
      return items.filter((item) => item.name === name);
    }
    return [];
  }

  /**
   * Consume a specific total quantity from component items on the actor.
   * Deletes items when fully consumed, reduces quantity otherwise.
   * Returns array of { item, quantity: consumed }.
   * @private
   */
  async _consumeComponentItems(actor, items, quantity) {
    const consumed = [];
    let remaining = quantity;

    for (const item of items) {
      if (remaining <= 0) break;
      const available = Number(item.system?.quantity) || 1;
      const toConsume = Math.min(available, remaining);
      consumed.push({ item, quantity: toConsume });
      remaining -= toConsume;
      await (toConsume >= available
        ? item.delete()
        : item.update({ 'system.quantity': available - toConsume }));
    }

    return consumed;
  }

  /**
   * Get the salvage failure consumption policy from the system.
   * Defaults: consumeComponentOnFail=true, consumeCatalystsOnFail=false.
   * @private
   */
  _getSalvageFailureConsumptionPolicy(system) {
    const consumption = system?.salvageCraftingCheck?.consumption || {};
    return {
      consumeComponentOnFail: consumption.consumeComponentOnFail !== false,
      consumeCatalystsOnFail: consumption.consumeCatalystsOnFail === true,
    };
  }

  _getSalvageSuccessFailureMacroUuids(system) {
    return {
      successMacroUuid: system?.salvageCraftingCheck?.successMacroUuid || null,
      failureMacroUuid: system?.salvageCraftingCheck?.failureMacroUuid || null,
    };
  }

  async _runSalvageSuccessMacro(component, system, context) {
    const { successMacroUuid } = this._getSalvageSuccessFailureMacroUuids(system);
    if (!successMacroUuid) return;
    try {
      await MacroExecutor.run(successMacroUuid, context);
    } catch (error) {
      console.error(`Fabricate | Salvage success macro failed (${successMacroUuid}):`, error);
    }
  }

  async _runSalvageFailureMacro(component, system, context) {
    const { failureMacroUuid } = this._getSalvageSuccessFailureMacroUuids(system);
    if (!failureMacroUuid) return;
    try {
      await MacroExecutor.run(failureMacroUuid, context);
    } catch (error) {
      console.error(`Fabricate | Salvage failure macro failed (${failureMacroUuid}):`, error);
    }
  }

  /**
   * Resolve which salvage result groups to use based on mode and check result.
   * @private
   */
  _resolveSalvageResultGroups(component, system, checkResult) {
    const rawMode = system?.salvageResolutionMode || 'simple';
    const mode = rawMode === 'tiered' ? 'routed' : rawMode;
    const allGroups = Array.isArray(component.salvage?.resultGroups)
      ? component.salvage.resultGroups
      : [];

    if (mode === 'simple') {
      return allGroups.slice(0, 1);
    }

    if (mode === 'routed') {
      const outcome = checkResult?.outcome == null ? null : String(checkResult.outcome);
      const routing = component.salvage?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      if (!routedId) return [];
      return allGroups.filter((g) => g.id === routedId);
    }

    if (mode === 'progressive') {
      const group = allGroups[0];
      if (!group) return [];

      const value = Number(checkResult?.value || 0);
      const awardMode = system?.salvageCraftingCheck?.progressive?.awardMode || 'equal';
      const awarded = [];
      let remaining = value;

      for (const result of group.results || []) {
        const managedItems = system?.components || [];
        const managedItem = managedItems.find(
          (e) => e.id === (result.componentId || result.systemItemId)
        );
        const cost = Number(managedItem?.difficulty);
        if (!Number.isFinite(cost) || cost < 1) continue;

        if (awardMode === 'exceed') {
          if (remaining > cost) {
            awarded.push(result);
            remaining -= cost;
          } else break;
          continue;
        }
        if (awardMode === 'partial') {
          if (remaining >= cost) {
            awarded.push(result);
            remaining -= cost;
            continue;
          }
          if (remaining > 0) {
            awarded.push(result);
          }
          break;
        }
        // equal (default)
        if (remaining >= cost) {
          awarded.push(result);
          remaining -= cost;
        } else break;
      }

      return [{ ...group, results: awarded }];
    }

    return allGroups;
  }

  /**
   * Resolve a component's salvage `toolIds` to library Tool objects from the
   * owning crafting system. Unknown ids are skipped (resolved to nothing) rather
   * than throwing. Ids are deduped.
   * @private
   * @param {object} system - the owning crafting system
   * @param {object} salvage - the component's salvage config
   * @returns {Array<object>} resolved library Tool objects
   */
  _resolveSalvageTools(system, salvage) {
    const ids = Array.isArray(salvage?.toolIds) ? salvage.toolIds : [];
    const library = Array.isArray(system?.tools) ? system.tools : [];
    const seen = new Set();
    const tools = [];
    for (const rawId of ids) {
      const id = String(rawId ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tool = library.find((entry) => entry?.id === id);
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /**
   * Run the salvage crafting check macro when configured.
   * @private
   */
  async _runSalvageCraftingCheck(component, system, actor, toolItems) {
    const check = system?.salvageCraftingCheck;
    if (!check?.enabled && !check?.macroUuid) {
      return { success: true, outcome: null, value: null, data: {} };
    }
    if (!check.macroUuid) {
      return { success: true, outcome: null, value: null, data: {} };
    }

    let result;
    try {
      result = await MacroExecutor.run(check.macroUuid, {
        component,
        craftingSystem: system,
        craftingActor: actor,
        toolItems,
      });
    } catch (error) {
      console.error(`Fabricate | Salvage check macro failed (${check.macroUuid})`, error);
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: `Salvage check macro failed: ${error.message || check.macroUuid}`,
      };
    }

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: 'Salvage check macro must return an object',
      };
    }

    const outcome = result.outcome == null ? null : String(result.outcome);
    const value = Number.isFinite(Number(result.value)) ? Number(result.value) : null;
    const success = result.success !== false;
    return {
      success,
      outcome,
      value,
      data: result.data || {},
      message: success ? null : result.message || 'Salvage check failed',
    };
  }

  /**
   * Build a minimal recipe-like view from a component's salvage data.
   * Used as context for _createSingleResult.
   * @private
   */
  _buildSalvageRecipeView(component, system) {
    return {
      id: component.id,
      name: component.name,
      craftingSystemId: system?.id,
      resultGroups: component.salvage?.resultGroups || [],
      outcomeRouting: component.salvage?.outcomeRouting || null,
      ingredientSets: [],
      transferEffects: false,
      toJSON() {
        return { id: this.id, name: this.name };
      },
    };
  }
}
