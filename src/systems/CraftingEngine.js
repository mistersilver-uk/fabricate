import { Recipe } from '../models/Recipe.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';
import { getFabricateFlag } from '../config/flags.js';

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
      if (runManager && run) {
        await runManager.completeStepFailure(craftingActor, run, stepIndex, checkResult.message || 'Crafting check failed', {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: false,
            reason: checkResult.message || 'Crafting check failed',
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {}
          }
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
      if (runManager && run) {
        await runManager.completeStepFailure(craftingActor, run, stepIndex, message, {
          selectedIngredientSetId: ingredientSet.id,
          lastCheckResult: {
            success: false,
            reason: message,
            outcome: checkResult.outcome ?? undefined,
            value: checkResult.value ?? undefined,
            data: checkResult.data || {}
          }
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
      if (catalyst.required === false) continue;

      let found = false;
      let catalystItem = null;

      // Search across all component source actors
      for (const actor of actors) {
        const matching = actor.items.find(item => this.recipeManager.catalystMatchesItem(recipe, catalyst, item));
        if (matching) {
          const validation = await catalyst.validateItem(matching);
          if (!validation.valid) continue;
          found = true;
          catalystItem = matching;
          break;
        }
      }

      if (!found) {
        return { valid: false, message: `Missing required catalyst: ${catalyst.name}` };
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
    if (result.systemItemId && recipe.craftingSystemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      const managedItems = Array.isArray(system?.managedItems) ? system.managedItems : (system?.items || []);
      managedItem = managedItems.find(i => i.id === result.systemItemId) || null;
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
      console.error(`Fabricate v2 | Result item not found: ${result.itemUuid || result.systemItemId}`);
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

    // Transfer active effects if configured
    if (recipe.transferEffects) {
      await this._transferEffects(createdItem, consumedItems, recipe);
    }

    return createdItem;
  }

  /**
   * Transfer active effects from consumed items to the result item
   * @private
   */
  async _transferEffects(resultItem, consumedItems, recipe) {
    const effectsToTransfer = [];

    // Extract effects from consumed items
    for (const { item, quantity, ingredient } of consumedItems) {
      if (!ingredient.extractEffects) continue;

      const itemEffects = item.effects || [];

      for (const effect of itemEffects) {
        // Filter effects if needed
        if (ingredient.effectFilter) {
          const filterRegex = new RegExp(ingredient.effectFilter, 'i');
          if (!filterRegex.test(effect.name)) continue;
        }

        effectsToTransfer.push({
          effect: effect.toObject(),
          quantity,
          source: item
        });
      }
    }

    if (effectsToTransfer.length === 0) return;

    // Create effects on result item
    // For simplicity, just add all effects (no merging strategy for now)
    const effectsData = effectsToTransfer.map(e => e.effect);
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
      console.error(`Fabricate v2 | Currency format macro failed (${macroUuid})`, err);
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
        console.error(`Fabricate v2 | Currency check macro failed (${config.checkCurrencyMacroUuid})`, err);
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
        console.error(`Fabricate v2 | Currency decrement macro failed (${config.decrementCurrencyMacroUuid})`, err);
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
        console.error('Fabricate v2 | Failed to decrement system currency', err);
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
      console.error(`Fabricate v2 | Crafting check macro failed (${config.macroUuid})`, err);
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
        console.warn(`Fabricate v2 | Property macro ${macroUuid} did not return an object`);
        return null;
      }
      return updates;
    } catch (err) {
      console.error(`Fabricate v2 | Property macro failed (${macroUuid})`, err);
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
      lines.push(`${catalyst.name}: missing`);
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
}
