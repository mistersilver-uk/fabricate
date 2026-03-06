import { Recipe } from '../models/Recipe.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { getFabricateFlag, setFabricateFlag } from '../config/flags.js';

/**
 * Handles the actual crafting process
 * Validates ingredients, consumes items, creates outputs
 */
export class CraftingEngine {
  constructor(recipeManager, craftingRunManager = null, resolutionModeService = null) {
    this.recipeManager = recipeManager;
    this.craftingRunManager = craftingRunManager;
    this.resolutionModeService = resolutionModeService;
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
    const resolutionService = this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    // Validate inputs
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected'
      };
    }

    if (!componentSourceActors || componentSourceActors.length === 0) {
      return {
        success: false,
        results: null,
        message: 'No component source actors selected'
      };
    }

    // Validate the recipe
    const validation = recipe.validate();
    if (!validation.valid) {
      return {
        success: false,
        results: null,
        message: `Invalid recipe: ${validation.errors.join(', ')}`
      };
    }

    const runManager = this.craftingRunManager || game.fabricate?.getCraftingRunManager?.();
    let run = null;
    if (runManager) {
      run = options?.runId
        ? runManager.getActiveRun(craftingActor, options.runId)
        : runManager.findActiveRunForRecipe(craftingActor, recipe.id);
      if (!run) {
        run = await runManager.createRun(craftingActor, recipe, componentSourceActors, game.user?.id || null);
      }
    }

    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    if (visibilityService) {
      const guard = visibilityService.guardCraftStart({
        viewer: game.user,
        recipe,
        craftingActor,
        componentSourceActors
      });
      if (!guard.craftable) {
        const reasonMap = {
          'missing-system': 'Crafting system not found',
          visibility: 'Recipe is not visible to this user',
          knowledge: 'Missing recipe knowledge',
          locked: 'Recipe is locked'
        };
        return {
          success: false,
          results: null,
          message: reasonMap[guard.reason] || 'Crafting is blocked by recipe access rules'
        };
      }
    }

    const executionSteps = typeof recipe.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [{
        id: 'implicit-step',
        name: 'Step 1',
        ingredientSets: recipe.ingredientSets || [],
        resultGroups: recipe.resultGroups || [],
        catalysts: recipe.catalysts || [],
        timeRequirement: null,
        outcomeRouting: recipe.outcomeRouting || null
      }];

    let stepIndex = Number(run?.currentStepIndex);
    if (!Number.isFinite(stepIndex) || stepIndex < 0) stepIndex = 0;
    const step = executionSteps[stepIndex];
    if (!step) {
      return {
        success: false,
        results: null,
        message: 'No active crafting step available'
      };
    }
    if (resolutionService) {
      const modeValidation = resolutionService.validateRecipe(recipe);
      if (!modeValidation.valid) {
        return {
          success: false,
          results: null,
          message: `Mode validation failed: ${modeValidation.errors.join(', ')}`
        };
      }
    }

    if (runManager && run && step.timeRequirement) {
      run = await runManager.markStepWaitingForTime(craftingActor, run, stepIndex, step.timeRequirement);
      const canProceed = runManager.canProceedTimeGate(run, stepIndex, Number(game.time?.worldTime || 0));
      if (!canProceed) {
        const gate = run.steps?.[stepIndex]?.timeGate;
        const remaining = Math.max(0, Math.ceil(Number(gate?.availableAt || 0) - Number(game.time?.worldTime || 0)));
        return {
          success: false,
          results: null,
          message: `Step "${step.name || `Step ${stepIndex + 1}`}" is still in progress (${remaining}s remaining)`
        };
      }
      run = await runManager.markStepInProgress(craftingActor, run, stepIndex);
    }

    const executionRecipe = this._buildStepRecipeView(recipe, step);

    // Check if recipe step can be crafted
    const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, executionRecipe);
    if (!canCraftCheck.canCraft) {
      const missingMsg = this._formatMissingItems(canCraftCheck.missing);
      return {
        success: false,
        results: null,
        message: `Missing required items:\n${missingMsg}`
      };
    }

    // Determine which ingredient set to use
    let ingredientSet;
    if (ingredientSetId) {
      ingredientSet = executionRecipe.ingredientSets.find(s => s.id === ingredientSetId);
      if (!ingredientSet) {
        return {
          success: false,
          results: null,
          message: `Invalid ingredient set ID: ${ingredientSetId}`
        };
      }
    } else {
      // Use the satisfiable set from canCraftCheck
      ingredientSet = canCraftCheck.satisfiableSet;
    }

    // Validate catalysts
    const catalystsForSet = this.recipeManager.getCatalystsForSet(executionRecipe, ingredientSet);
    const catalystValidation = await this._validateCatalysts(componentSourceActors, executionRecipe, catalystsForSet);
    if (!catalystValidation.valid) {
      return {
        success: false,
        results: null,
        message: catalystValidation.message
      };
    }

    const currencyCheck = await this._checkCurrencyRequirement(craftingActor, recipe, step);
    if (!currencyCheck.valid) {
      return {
        success: false,
        results: null,
        message: currencyCheck.message
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
      let degradedCatalysts = [];
      try {
        if (failurePolicy.consumeIngredientsOnFail) {
          consumedOnFail = await this._consumeIngredients(componentSourceActors, ingredientSet, executionRecipe);
        }
        if (failurePolicy.consumeCatalystsOnFail) {
          await this._degradeCatalysts(catalystValidation.catalysts);
          degradedCatalysts = catalystValidation.catalysts;
        }
      } catch (consumptionError) {
        console.error('Fabricate | Error during failure-path consumption:', consumptionError);
      }
      if (runManager && run) {
        await runManager.completeStepFailure(craftingActor, run, stepIndex, checkResult.message || 'Crafting check failed', {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: false,
            reason: checkResult.message || 'Crafting check failed',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {}
          },
          consumedIngredients: consumedOnFail.map(({ item, quantity }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity
          })),
          usedCatalysts: degradedCatalysts.map(({ item }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity: 1
          }))
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
          failureReason: checkResult.message || 'Crafting check failed',
          checkResult,
          consumedIngredients: consumedOnFail,
          consumedCatalysts: degradedCatalysts
        });
      }
      return {
        success: false,
        results: null,
        message: checkResult.message || 'Crafting check failed'
      };
    }
    if (resolutionService && !resolutionService.validateCheckResult({ recipe: executionRecipe, checkResult })) {
      const message = 'Crafting check result does not satisfy current resolution mode requirements';
      const validationFailurePolicy = this._getFailureConsumptionPolicy(executionRecipe);
      let consumedOnValidationFail = [];
      let degradedCatalystsOnValidationFail = [];
      try {
        if (validationFailurePolicy.consumeIngredientsOnFail) {
          consumedOnValidationFail = await this._consumeIngredients(componentSourceActors, ingredientSet, executionRecipe);
        }
        if (validationFailurePolicy.consumeCatalystsOnFail) {
          await this._degradeCatalysts(catalystValidation.catalysts);
          degradedCatalystsOnValidationFail = catalystValidation.catalysts;
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
            data: checkResult.data || {}
          },
          consumedIngredients: consumedOnValidationFail.map(({ item, quantity }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity
          })),
          usedCatalysts: degradedCatalystsOnValidationFail.map(({ item }) => ({
            actorUuid: item.parent?.uuid || null,
            itemUuid: item.uuid,
            quantity: 1
          }))
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
          consumedCatalysts: degradedCatalystsOnValidationFail
        });
      }
      return {
        success: false,
        results: null,
        message
      };
    }

    const currencyDecrement = await this._decrementCurrencyRequirement(craftingActor, recipe, step);
    if (!currencyDecrement.valid) {
      return {
        success: false,
        results: null,
        message: currencyDecrement.message
      };
    }

    // Consume ingredients from component source actors
    const consumedItems = await this._consumeIngredients(componentSourceActors, ingredientSet, executionRecipe);

    // Apply catalyst degradation
    await this._degradeCatalysts(catalystValidation.catalysts);

    // Create the result item(s)
    const resultItems = await this._createResultItems(
      craftingActor,
      executionRecipe,
      step,
      ingredientSet,
      consumedItems,
      catalystValidation.catalysts,
      checkResult,
      options?.resultGroupId || null
    );

    if (runManager && run) {
      run = await runManager.completeStepSuccess(craftingActor, run, stepIndex, {
        selectedIngredientSetId: ingredientSet.id,
        lastCheckResult: {
          success: true,
          reason: checkResult.message || 'Success',
          outcome: checkResult.outcome ?? undefined,
          value: checkResult.value ?? undefined,
          data: checkResult.data || {}
        },
        consumedIngredients: consumedItems.map(({ item, quantity }) => ({
          actorUuid: item.parent?.uuid || null,
          itemUuid: item.uuid,
          quantity
        })),
        usedCatalysts: catalystValidation.catalysts.map(({ item }) => ({
          actorUuid: item.parent?.uuid || null,
          itemUuid: item.uuid,
          quantity: 1
        })),
        createdResults: (resultItems || []).map(item => ({
          actorUuid: craftingActor.uuid,
          itemUuid: item.uuid,
          quantity: Number(item.system?.quantity || 1)
        }))
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
        consumedCatalysts: catalystValidation.catalysts,
        createdResults: resultItems || [],
        checkResult
      });
    }

    if (visibilityService) {
      await visibilityService.applyRecipeItemUseOnCraft({
        recipe,
        craftingActor,
        componentSourceActors
      });
    }

    return {
      success: true,
      results: resultItems,
      message: run?.status === 'succeeded'
        ? `Successfully crafted ${recipe.name}`
        : `Completed ${step.name || `step ${stepIndex + 1}`} for ${recipe.name}`
    };
  }

  /**
   * Validate that all required catalysts are available and usable
   * @private
   */
  async _validateCatalysts(actors, recipe, catalysts = []) {
    const catalystItems = [];

    for (const catalyst of catalysts) {
      let found = false;
      let catalystItem = null;

      // Search across all component source actors
      for (const actor of actors) {
        const matching = actor.items.find(item => this.recipeManager.catalystMatchesItem(recipe, catalyst, item));
        if (matching) {
          found = true;
          catalystItem = matching;
          break;
        }
      }

      if (!found) {
        return { valid: false, message: `Missing required catalyst (componentId: ${catalyst.componentId || catalyst.systemItemId})` };
      }

      catalystItems.push({ catalyst, item: catalystItem });
    }

    return { valid: true, catalysts: catalystItems };
  }

  /**
   * Consume ingredients from component source actors
   * @private
   */
  async _consumeIngredients(componentSourceActors, ingredientSet, recipe) {
    const consumedItems = [];

    // Aggregate all items from component source actors
    const availableItems = componentSourceActors.flatMap(actor =>
      Array.from(actor.items)
    );

    // Match ingredients to items
    const consumptionPlan = ingredientSet.matchIngredients(
      availableItems,
      (ingredient, item) => this.recipeManager.ingredientMatchesItem(recipe, ingredient, item)
    );

    // Execute consumption
    for (const { item, quantity, ingredient } of consumptionPlan) {
      const itemQuantity = item.system.quantity || 1;

      // Store consumed item info for effect transfer
      consumedItems.push({
        item: item,
        quantity: quantity,
        ingredient: ingredient
      });

      // Update or delete the item
      if (quantity >= itemQuantity) {
        await item.delete();
      } else {
        await item.update({ 'system.quantity': itemQuantity - quantity });
      }
    }

    return consumedItems;
  }

  /**
   * Apply degradation to catalysts that were used
   * @private
   */
  async _degradeCatalysts(catalystItems) {
    for (const { catalyst, item } of catalystItems) {
      await catalyst.applyDegradation(item);
    }
  }

  /**
   * Create the result items based on recipe configuration
   * @private
   */
  async _createResultItems(craftingActor, recipe, step, ingredientSet, consumedItems, catalystItems, checkResult = null, selectedResultGroupId = null) {
    const resolutionService = this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    const resolved = resolutionService
      ? resolutionService.resolveResultGroups({
        recipe,
        step,
        ingredientSet,
        checkResult,
        selectedResultGroupId
      })
      : {
        groups: Array.isArray(step?.resultGroups) ? step.resultGroups : [],
        meta: {}
      };

    const groupsToCreate = Array.isArray(resolved?.groups) ? resolved.groups : [];

    const createdItems = [];
    for (const group of groupsToCreate) {
      for (const result of group.results || []) {
        const resultItem = await this._createSingleResult(
          craftingActor,
          result,
          consumedItems,
          catalystItems,
          recipe,
          {
            ...(checkResult || {}),
            resolutionMeta: resolved?.meta || {}
          },
          step
        );

        if (resultItem) {
          createdItems.push(resultItem);
        }
      }
    }

    return createdItems;
  }

  /**
   * Create a single result item
   * @private
   */
  async _createSingleResult(craftingActor, result, consumedItems, catalystItems, recipe, checkResult = null, step = null) {
    // Get the source item
    let sourceItem;
    let managedItem = null;
    if ((result.componentId || result.systemItemId) && recipe.craftingSystemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      const managedItems = Array.isArray(system?.components) ? system.components : (Array.isArray(system?.managedItems) ? system.managedItems : (system?.items || []));
      managedItem = managedItems.find(i => i.id === (result.componentId || result.systemItemId)) || null;
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
      const fallbackType = craftingActor.items.contents[0]?.type || 'loot';
      itemData = {
        name: managedItem.name || 'Crafted Item',
        img: managedItem.img || 'icons/svg/item-bag.svg',
        type: fallbackType,
        system: {}
      };
    } else {
      console.error(`Fabricate | Result item not found: ${result.itemUuid || result.componentId || result.systemItemId}`);
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
      catalystItems,
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
    const { resolvedEssences } = this._buildEssenceContext(consumedItems);
    const contributingEssenceIds = Object.keys(resolvedEssences);
    if (contributingEssenceIds.length === 0) return;

    // 3. For each contributing essence, find its EssenceDefinition and resolve the source item
    const essenceDefinitions = system.essenceDefinitions || [];
    const effectsData = [];

    for (const essenceId of contributingEssenceIds) {
      const definition = essenceDefinitions.find(d => d.id === essenceId);
      if (!definition?.sourceItemUuid) continue;

      const sourceItem = await fromUuid(definition.sourceItemUuid);
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

  _getCurrencyRequirementConfig(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;

    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const currency = system?.requirements?.currency || {};
    return {
      enabled: advancedEnabled && currency.enabled === true,
      provider: currency.provider === 'system' ? 'system' : 'macro',
      systemAdapter: currency.systemAdapter || null,
      checkCurrencyMacroUuid: currency.checkCurrencyMacroUuid || null,
      decrementCurrencyMacroUuid: currency.decrementCurrencyMacroUuid || null,
      formatCurrencyMacroUuid: currency.formatCurrencyMacroUuid || null,
      system
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
      consumeCatalystsOnFail: consumption.consumeCatalystsOnFail === true
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
      failureMacroUuid: system.craftingCheck?.failureMacroUuid || null
    };
  }

  async _runSuccessMacro(recipe, context) {
    const { successMacroUuid } = this._getSuccessFailureMacroUuids(recipe);
    if (!successMacroUuid) return;
    try {
      await MacroExecutor.run(successMacroUuid, context);
    } catch (err) {
      console.error(`Fabricate | Success macro failed (${successMacroUuid}):`, err);
    }
  }

  async _runFailureMacro(recipe, context) {
    const { failureMacroUuid } = this._getSuccessFailureMacroUuids(recipe);
    if (!failureMacroUuid) return;
    try {
      await MacroExecutor.run(failureMacroUuid, context);
    } catch (err) {
      console.error(`Fabricate | Failure macro failed (${failureMacroUuid}):`, err);
    }
  }

  _getStepCurrencyRequirement(step) {
    if (!step?.currencyRequirement || typeof step.currencyRequirement !== 'object') return null;
    const unit = String(step.currencyRequirement.unit || '').trim();
    const amount = Math.max(0, Number(step.currencyRequirement.amount || 0) || 0);
    if (!unit || amount <= 0) return null;
    return { unit, amount };
  }

  _getActorCurrencyBucket(actor, unit) {
    const pool = actor?.system?.currency;
    if (!pool || typeof pool !== 'object') return null;

    const key = Object.keys(pool).find(k => String(k).toLowerCase() === String(unit).toLowerCase()) || unit;
    const raw = pool[key];
    if (raw == null) return null;

    if (typeof raw === 'number' || typeof raw === 'string') {
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      return { key, value, path: `system.currency.${key}` };
    }

    if (typeof raw === 'object') {
      const valueFromValue = Number(raw.value);
      if (Number.isFinite(valueFromValue)) {
        return { key, value: valueFromValue, path: `system.currency.${key}.value` };
      }
      const valueFromAmount = Number(raw.amount);
      if (Number.isFinite(valueFromAmount)) {
        return { key, value: valueFromAmount, path: `system.currency.${key}.amount` };
      }
    }

    return null;
  }

  _normalizeCurrencyUnit(unit, adapter = null) {
    const raw = String(unit || '').trim().toLowerCase();
    if (!raw) return raw;
    const aliases = {
      copper: 'cp',
      silver: 'sp',
      electrum: 'ep',
      gold: 'gp',
      platinum: 'pp',
      credits: 'credits',
      credit: 'credits'
    };
    if (aliases[raw]) return aliases[raw];
    if (['dnd5e', 'pf2e'].includes(adapter || '')) {
      if (['cp', 'sp', 'ep', 'gp', 'pp'].includes(raw)) return raw;
    }
    return raw;
  }

  _getDnd5eCurrencyBucket(actor, unit) {
    const normalizedUnit = this._normalizeCurrencyUnit(unit, 'dnd5e');
    return this._getActorCurrencyBucket(actor, normalizedUnit);
  }

  _getPf2eCurrencyBucket(actor, unit) {
    const normalizedUnit = this._normalizeCurrencyUnit(unit, 'pf2e');
    const pool = actor?.system?.currency;
    if (!pool || typeof pool !== 'object') {
      return this._getActorCurrencyBucket(actor, normalizedUnit);
    }

    // PF2e usually stores denomination objects under system.currency (cp/sp/gp/pp).
    const key = Object.keys(pool).find(k => String(k).toLowerCase() === normalizedUnit) || normalizedUnit;
    const valuePath = `system.currency.${key}.value`;
    const value = Number(foundry.utils.getProperty(actor, valuePath));
    if (Number.isFinite(value)) {
      return { key, value, path: valuePath };
    }

    return this._getActorCurrencyBucket(actor, normalizedUnit);
  }

  _getSystemCurrencyBucket(actor, requirement, config = {}) {
    const adapter = String(config.systemAdapter || '').trim();
    if (adapter === 'dnd5e') return this._getDnd5eCurrencyBucket(actor, requirement.unit);
    if (adapter === 'pf2e') return this._getPf2eCurrencyBucket(actor, requirement.unit);
    return this._getActorCurrencyBucket(actor, requirement.unit);
  }

  async _formatCurrencyRequirement(config, requirement, craftingActor, recipe, step) {
    const fallback = `${requirement.amount} ${requirement.unit}`;
    const macroUuid = config?.formatCurrencyMacroUuid;
    if (!macroUuid) return fallback;
    try {
      const value = await MacroExecutor.run(macroUuid, {
        craftingActor,
        actor: craftingActor,
        recipe: recipe?.toJSON?.() || recipe,
        step,
        requirement,
        amount: requirement.amount,
        unit: requirement.unit,
        craftingSystem: config.system
      });
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    } catch (err) {
      console.error(`Fabricate | Currency format macro failed (${macroUuid})`, err);
    }
    return fallback;
  }

  async _checkCurrencyRequirement(craftingActor, recipe, step) {
    const requirement = this._getStepCurrencyRequirement(step);
    if (!requirement) return { valid: true };

    const config = this._getCurrencyRequirementConfig(recipe);
    if (!config?.enabled) return { valid: true };

    const formatted = await this._formatCurrencyRequirement(config, requirement, craftingActor, recipe, step);

    if (config.provider === 'macro') {
      if (!config.checkCurrencyMacroUuid) {
        return { valid: false, message: 'Currency requirement check macro is not configured.' };
      }
      try {
        const result = await MacroExecutor.run(config.checkCurrencyMacroUuid, {
          craftingActor,
          actor: craftingActor,
          recipe: recipe?.toJSON?.() || recipe,
          step,
          requirement,
          amount: requirement.amount,
          unit: requirement.unit,
          requiredAmount: requirement.amount,
          requiredUnit: requirement.unit,
          craftingSystem: config.system
        });
        const allowed = typeof result === 'boolean'
          ? result
          : (result && typeof result === 'object'
            ? (result.allowed !== false && result.success !== false && result.canAfford !== false)
            : false);
        if (!allowed) {
          const message = (result && typeof result === 'object' && result.message)
            ? String(result.message)
            : `Insufficient currency. Requires ${formatted}.`;
          return { valid: false, message };
        }
        return { valid: true };
      } catch (err) {
        console.error(`Fabricate | Currency check macro failed (${config.checkCurrencyMacroUuid})`, err);
        return { valid: false, message: `Currency check failed: ${err.message || config.checkCurrencyMacroUuid}` };
      }
    }

    if (config.provider === 'system') {
      const bucket = this._getSystemCurrencyBucket(craftingActor, requirement, config);
      if (!bucket) {
        return { valid: false, message: `Currency unit "${requirement.unit}" is not available on ${craftingActor.name}.` };
      }
      if (bucket.value < requirement.amount) {
        return { valid: false, message: `Insufficient currency. Requires ${formatted}.` };
      }
      return { valid: true };
    }

    return { valid: false, message: 'Unsupported currency requirement provider.' };
  }

  async _decrementCurrencyRequirement(craftingActor, recipe, step) {
    const requirement = this._getStepCurrencyRequirement(step);
    if (!requirement) return { valid: true };

    const config = this._getCurrencyRequirementConfig(recipe);
    if (!config?.enabled) return { valid: true };

    const formatted = await this._formatCurrencyRequirement(config, requirement, craftingActor, recipe, step);

    if (config.provider === 'macro') {
      if (!config.decrementCurrencyMacroUuid) {
        return { valid: false, message: 'Currency decrement macro is not configured.' };
      }
      try {
        const result = await MacroExecutor.run(config.decrementCurrencyMacroUuid, {
          craftingActor,
          actor: craftingActor,
          recipe: recipe?.toJSON?.() || recipe,
          step,
          requirement,
          amount: requirement.amount,
          unit: requirement.unit,
          craftingSystem: config.system
        });
        const ok = result === undefined || result === null
          ? true
          : (typeof result === 'boolean'
            ? result
            : (result && typeof result === 'object'
              ? (result.success !== false && result.decremented !== false)
              : false));
        if (!ok) {
          const message = (result && typeof result === 'object' && result.message)
            ? String(result.message)
            : `Could not spend currency. Requires ${formatted}.`;
          return { valid: false, message };
        }
        return { valid: true };
      } catch (err) {
        console.error(`Fabricate | Currency decrement macro failed (${config.decrementCurrencyMacroUuid})`, err);
        return { valid: false, message: `Currency decrement failed: ${err.message || config.decrementCurrencyMacroUuid}` };
      }
    }

    if (config.provider === 'system') {
      const bucket = this._getSystemCurrencyBucket(craftingActor, requirement, config);
      if (!bucket) {
        return { valid: false, message: `Currency unit "${requirement.unit}" is not available on ${craftingActor.name}.` };
      }
      if (bucket.value < requirement.amount) {
        return { valid: false, message: `Insufficient currency. Requires ${formatted}.` };
      }
      const next = Math.max(0, bucket.value - requirement.amount);
      try {
        await craftingActor.update({ [bucket.path]: next });
      } catch (err) {
        console.error('Fabricate | Failed to decrement system currency', err);
        return { valid: false, message: `Could not spend currency (${formatted}).` };
      }
      return { valid: true };
    }

    return { valid: false, message: 'Unsupported currency requirement provider.' };
  }

  async _runCraftingCheck(recipe, craftingActor, componentSourceActors, ingredientSet, step = null) {
    const resolutionService = this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
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
    const checkRequired = mode === 'tiered' || mode === 'progressive';
    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const features = system.features || {};
    const checksEnabled = advancedEnabled && (features.craftingChecks === true || system?.craftingCheck?.enabled === true);
    if (!checksEnabled && !checkRequired) {
      return { success: true, outcome: null, data: {} };
    }

    const config = system.craftingCheck || {};
    if (!config.macroUuid) {
      if (checkRequired) {
        return {
          success: false,
          outcome: null,
          value: null,
          data: {},
          message: `${mode} mode requires a crafting check macro`
        };
      }
      return { success: true, outcome: null, value: null, data: {} };
    }

    const ingredientPool = componentSourceActors.flatMap(actor =>
      Array.from(actor.items).map(item => ({
        actorId: actor.id,
        actorName: actor.name,
        item
      }))
    );
    const resolvedEssences = this._accumulateEssencesFromItems(
      ingredientPool.map(entry => entry.item)
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
        step
      });
    } catch (err) {
      console.error(`Fabricate | Crafting check macro failed (${config.macroUuid})`, err);
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: `Crafting check macro failed: ${err.message || config.macroUuid}`
      };
    }

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: 'Crafting check macro must return an object'
      };
    }

    const outcome = result.outcome != null ? String(result.outcome) : null;
    const value = Number.isFinite(Number(result.value)) ? Number(result.value) : null;
    const allowed = Array.isArray(config.outcomes) ? config.outcomes : [];
    if (outcome && allowed.length > 0 && !allowed.includes(outcome)) {
      return {
        success: false,
        outcome,
        value,
        data: result.data || {},
        message: `Crafting check returned invalid outcome "${outcome}"`
      };
    }

    const success = result.success !== false;
    return {
      success,
      outcome,
      value,
      data: result.data || {},
      message: success ? null : (result.message || 'Crafting check failed')
    };
  }

  async _runPropertyMacro(macroUuid, recipe, craftingActor, result, consumedItems, catalystItems, checkResult = null, step = null) {
    if (!macroUuid) return null;

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const craftingSystem = recipe?.craftingSystemId ? systemManager?.getSystem(recipe.craftingSystemId) : null;
    const advancedEnabled = craftingSystem?.advancedOptionsEnabled !== false;
    const features = craftingSystem?.features || {};
    const enabled = advancedEnabled && features.propertyMacros === true;
    if (!enabled) return null;

    const essenceContext = this._buildEssenceContext(consumedItems);
    const context = {
      recipe: recipe?.toJSON?.() || recipe,
      craftingSystem,
      craftingActor,
      ingredientPool: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient
      })),
      resolvedIngredients: consumedItems.map(({ item, quantity, ingredient }) => ({
        item,
        quantity,
        ingredient
      })),
      resolvedCatalysts: catalystItems.map(({ item, catalyst }) => ({
        item,
        catalyst
      })),
      resolvedEssences: essenceContext.resolvedEssences,
      essenceSources: essenceContext.essenceSources,
      checkResult,
      result: result?.toJSON?.() || result,
      step
    };

    try {
      const updates = await MacroExecutor.run(macroUuid, context);
      if (updates == null) return null;
      if (typeof updates !== 'object' || Array.isArray(updates)) {
        console.warn(`Fabricate | Property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (err) {
      console.error(`Fabricate | Property macro failed (${macroUuid})`, err);
      ui.notifications.error(`Property macro failed: ${err.message || macroUuid}`);
      return null;
    }
  }

  _buildEssenceContext(consumedItems) {
    const resolvedEssences = {};
    const essenceSources = {};

    for (const { item, quantity } of consumedItems) {
      const itemEssences = getFabricateFlag(item, 'essences', {});
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
          essenceTotal: total
        });
      }
    }

    return { resolvedEssences, essenceSources };
  }

  _accumulateEssencesFromItems(items) {
    const resolved = {};
    for (const item of items) {
      const itemEssences = getFabricateFlag(item, 'essences', {});
      for (const [essenceId, qty] of Object.entries(itemEssences)) {
        const value = Number(qty);
        if (!Number.isFinite(value) || value <= 0) continue;
        resolved[essenceId] = (resolved[essenceId] || 0) + value;
      }
    }
    return resolved;
  }

  /**
   * Format missing items message
   * @private
   */
  _formatMissingItems(missing) {
    const lines = [];

    for (const { ingredient, have, need } of missing.ingredients) {
      const description = typeof ingredient?.getDescription === 'function'
        ? ingredient.getDescription()
        : 'Ingredient';
      lines.push(`${description}: have ${have}, need ${need}`);
    }

    for (const { type, have, need } of missing.essences) {
      lines.push(`${type} essence: have ${have}, need ${need}`);
    }

    for (const catalyst of missing.catalysts) {
      lines.push(`Catalyst (componentId: ${catalyst.componentId || catalyst.systemItemId}): missing`);
    }

    return lines.join('\n');
  }

  _buildStepRecipeView(recipe, step) {
    return {
      ...recipe,
      ingredientSets: step?.ingredientSets || recipe.ingredientSets || [],
      resultGroups: step?.resultGroups || recipe.resultGroups || [],
      outcomeRouting: step?.outcomeRouting || recipe.outcomeRouting || null,
      catalysts: [
        ...(Array.isArray(recipe?.catalysts) ? recipe.catalysts : []),
        ...(Array.isArray(step?.catalysts) ? step.catalysts : [])
      ]
    };
  }

  /**
   * Perform the salvage pipeline for a component.
   *
   * Resolves actor, system, and component from their IDs/UUIDs, then runs
   * the full pipeline: validate -> ownership check -> catalyst check ->
   * salvage check -> failure policy -> consume -> create results -> record run.
   *
   * @param {string} actorUuid - UUID of the actor performing salvage.
   * @param {string} craftingSystemId - ID of the crafting system.
   * @param {string} componentId - ID of the component to salvage.
   * @param {Object} [options={}] - Optional overrides.
   * @returns {Promise<{success: boolean, results: Item[]|null, message: string, salvageRun: object|null}>}
   */
  async salvage(actorUuid, craftingSystemId, componentId, options = {}) {
    // 1. Resolve actor
    const actor = await fromUuid(actorUuid);
    if (!actor) {
      return { success: false, results: null, message: 'Actor not found', salvageRun: null };
    }

    // 2. Resolve system and component
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(craftingSystemId);
    if (!system) {
      return { success: false, results: null, message: `Crafting system "${craftingSystemId}" not found`, salvageRun: null };
    }

    const managedItems = Array.isArray(system.components) ? system.components
      : (Array.isArray(system.managedItems) ? system.managedItems : []);
    const component = managedItems.find(c => c.id === componentId) || null;
    if (!component) {
      return { success: false, results: null, message: `Component "${componentId}" not found in system`, salvageRun: null };
    }

    // 3. Validate salvage is enabled
    if (!system.features?.salvage) {
      return { success: false, results: null, message: 'Salvage feature is not enabled on this crafting system', salvageRun: null };
    }
    if (!component.salvage?.enabled) {
      return { success: false, results: null, message: `Salvage is not enabled for component "${component.name || componentId}"`, salvageRun: null };
    }

    // 4. Validate salvage configuration via ResolutionModeService
    const resolutionService = this.resolutionModeService || game.fabricate?.getResolutionModeService?.();
    if (resolutionService) {
      const validation = resolutionService.validateSalvage(component, system);
      if (!validation.valid) {
        return {
          success: false,
          results: null,
          message: `Invalid salvage configuration: ${validation.errors.join(', ')}`,
          salvageRun: null
        };
      }
    }

    // 5. Check actor has enough of the component item
    const ingredientQuantity = Number(component.salvage.ingredientQuantity) || 1;
    const componentItems = this._findComponentItems(actor, component, system);
    const totalAvailable = componentItems.reduce((sum, item) => sum + (Number(item.system?.quantity) || 1), 0);
    if (totalAvailable < ingredientQuantity) {
      return {
        success: false,
        results: null,
        message: `Not enough "${component.name || componentId}" to salvage. Need ${ingredientQuantity}, have ${totalAvailable}`,
        salvageRun: null
      };
    }

    // 6. Validate salvage catalysts
    const salvageCatalysts = Array.isArray(component.salvage.catalysts) ? component.salvage.catalysts : [];
    // Build a minimal recipe-like object for catalyst matching
    const syntheticRecipe = { craftingSystemId, components: managedItems };
    const catalystValidation = await this._validateCatalysts([actor], syntheticRecipe, salvageCatalysts);
    if (!catalystValidation.valid) {
      return { success: false, results: null, message: catalystValidation.message, salvageRun: null };
    }

    const now = Number(game.time?.worldTime || 0);

    // 7. Run salvage crafting check
    const checkResult = await this._runSalvageCraftingCheck(component, system, actor, catalystValidation.catalysts);

    const failurePolicy = this._getSalvageFailureConsumptionPolicy(system);

    if (!checkResult.success) {
      // Apply failure consumption policy
      let consumedOnFail = [];
      let degradedCatalysts = [];
      try {
        if (failurePolicy.consumeComponentOnFail) {
          consumedOnFail = await this._consumeComponentItems(actor, componentItems, ingredientQuantity);
        }
        if (failurePolicy.consumeCatalystsOnFail) {
          await this._degradeCatalysts(catalystValidation.catalysts);
          degradedCatalysts = catalystValidation.catalysts;
        }
      } catch (err) {
        console.error('Fabricate | Error during salvage failure-path consumption:', err);
      }

      const failedRun = await this._createSalvageRun(actor, {
        actorUuid,
        craftingSystemId,
        componentId,
        status: 'failed',
        startedAt: now,
        finishedAt: Number(game.time?.worldTime || 0),
        consumedComponents: consumedOnFail.map(({ item }) => ({ itemUuid: item.uuid, quantity: 1 })),
        usedCatalysts: degradedCatalysts.map(({ item, catalyst }) => ({
          itemUuid: item.uuid,
          componentId: catalyst.componentId || catalyst.systemItemId,
          degraded: true
        })),
        createdResults: [],
        checkResult: { success: false, outcome: checkResult.outcome, value: checkResult.value },
        failureReason: checkResult.message || 'Salvage check failed'
      });

      return {
        success: false,
        results: null,
        message: checkResult.message || 'Salvage check failed',
        salvageRun: failedRun
      };
    }

    // 8. Resolve which result groups to use
    const resultGroups = this._resolveSalvageResultGroups(component, system, checkResult);

    // 9. Consume component items
    const consumedItems = await this._consumeComponentItems(actor, componentItems, ingredientQuantity);

    // 10. Degrade catalysts
    await this._degradeCatalysts(catalystValidation.catalysts);

    // 11. Create result items (reuse _createSingleResult with a synthetic recipe view)
    const salvageRecipeView = this._buildSalvageRecipeView(component, system);
    const resultItems = [];
    for (const group of resultGroups) {
      for (const result of group.results || []) {
        const created = await this._createSingleResult(
          actor,
          result,
          consumedItems,
          catalystValidation.catalysts,
          salvageRecipeView,
          checkResult,
          null
        );
        if (created) resultItems.push(created);
      }
    }

    // 12. Record successful salvage run
    const succeededRun = await this._createSalvageRun(actor, {
      actorUuid,
      craftingSystemId,
      componentId,
      status: 'succeeded',
      startedAt: now,
      finishedAt: Number(game.time?.worldTime || 0),
      consumedComponents: consumedItems.map(({ item }) => ({ itemUuid: item.uuid, quantity: 1 })),
      usedCatalysts: catalystValidation.catalysts.map(({ item, catalyst }) => ({
        itemUuid: item.uuid,
        componentId: catalyst.componentId || catalyst.systemItemId,
        degraded: true
      })),
      createdResults: resultItems.map(item => ({
        itemUuid: item.uuid,
        componentId: null,
        quantity: Number(item.system?.quantity || 1)
      })),
      checkResult: { success: true, outcome: checkResult.outcome, value: checkResult.value },
      failureReason: null
    });

    return {
      success: true,
      results: resultItems,
      message: `Successfully salvaged ${component.name || componentId}`,
      salvageRun: succeededRun
    };
  }

  /**
   * Find items on actor that match a managed component.
   * Matches by sourceUuid (item.uuid or flags.core.sourceId) then falls back to name.
   * @private
   */
  _findComponentItems(actor, component, system) {
    const items = Array.from(actor.items);
    if (component.sourceUuid) {
      const byUuid = items.filter(item =>
        item.uuid === component.sourceUuid ||
        (item.flags?.core?.sourceId === component.sourceUuid)
      );
      if (byUuid.length > 0) return byUuid;
    }
    // Name fallback
    const name = component.name;
    if (name) {
      return items.filter(item => item.name === name);
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
      if (toConsume >= available) {
        await item.delete();
      } else {
        await item.update({ 'system.quantity': available - toConsume });
      }
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
      consumeCatalystsOnFail: consumption.consumeCatalystsOnFail === true
    };
  }

  /**
   * Resolve which salvage result groups to use based on mode and check result.
   * @private
   */
  _resolveSalvageResultGroups(component, system, checkResult) {
    const mode = system?.salvageResolutionMode || 'simple';
    const allGroups = Array.isArray(component.salvage?.resultGroups) ? component.salvage.resultGroups : [];

    if (mode === 'simple') {
      return allGroups.slice(0, 1);
    }

    if (mode === 'tiered') {
      const outcome = checkResult?.outcome != null ? String(checkResult.outcome) : null;
      const routing = component.salvage?.outcomeRouting || {};
      const routedId = outcome ? routing[outcome] : null;
      if (!routedId) return [];
      return allGroups.filter(g => g.id === routedId);
    }

    if (mode === 'progressive') {
      const group = allGroups[0];
      if (!group) return [];

      const value = Number(checkResult?.value || 0);
      const awardMode = system?.salvageCraftingCheck?.progressive?.awardMode || 'equal';
      const awarded = [];
      let remaining = value;

      for (const result of group.results || []) {
        const managedItems = Array.isArray(system?.components) ? system.components
          : (Array.isArray(system?.managedItems) ? system.managedItems : []);
        const managedItem = managedItems.find(e => e.id === (result.componentId || result.systemItemId));
        const cost = Number(managedItem?.difficulty);
        if (!Number.isFinite(cost) || cost < 1) continue;

        if (awardMode === 'exceed') {
          if (remaining > cost) { awarded.push(result); remaining -= cost; }
          else break;
          continue;
        }
        if (awardMode === 'partial') {
          if (remaining >= cost) { awarded.push(result); remaining -= cost; continue; }
          if (remaining > 0) { awarded.push(result); remaining = 0; }
          break;
        }
        // equal (default)
        if (remaining >= cost) { awarded.push(result); remaining -= cost; }
        else break;
      }

      return [{ ...group, results: awarded }];
    }

    return allGroups;
  }

  /**
   * Run the salvage crafting check macro when configured.
   * @private
   */
  async _runSalvageCraftingCheck(component, system, actor, catalystItems) {
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
        catalystItems
      });
    } catch (err) {
      console.error(`Fabricate | Salvage check macro failed (${check.macroUuid})`, err);
      return {
        success: false,
        outcome: null,
        value: null,
        data: {},
        message: `Salvage check macro failed: ${err.message || check.macroUuid}`
      };
    }

    if (!result || typeof result !== 'object') {
      return { success: false, outcome: null, value: null, data: {}, message: 'Salvage check macro must return an object' };
    }

    const outcome = result.outcome != null ? String(result.outcome) : null;
    const value = Number.isFinite(Number(result.value)) ? Number(result.value) : null;
    const success = result.success !== false;
    return {
      success,
      outcome,
      value,
      data: result.data || {},
      message: success ? null : (result.message || 'Salvage check failed')
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
      toJSON() { return { id: this.id, name: this.name }; }
    };
  }

  /**
   * Create and persist a SalvageRun record on the actor.
   * History is capped at 50 entries.
   * @private
   */
  async _createSalvageRun(actor, runData) {
    const existing = getFabricateFlag(actor, 'salvageRuns', null) || { active: {}, history: [] };
    const history = Array.isArray(existing.history) ? [...existing.history] : [];

    const run = {
      id: foundry.utils.randomID(),
      ...runData
    };

    history.unshift(run);
    if (history.length > 50) history.length = 50;

    await setFabricateFlag(actor, 'salvageRuns', { ...existing, history });
    return run;
  }
}
