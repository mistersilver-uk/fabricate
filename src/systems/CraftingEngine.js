import { Recipe } from '../models/Recipe.js';
import { MacroExecutor } from '../utils/MacroExecutor.js';

/**
 * Handles the actual crafting process
 * Validates ingredients, consumes items, creates outputs
 */
export class CraftingEngine {
  constructor(recipeManager) {
    this.recipeManager = recipeManager;
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

    // Check if recipe can be crafted
    const canCraftCheck = this.recipeManager.canCraft(componentSourceActors, recipe);
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
      ingredientSet = recipe.ingredientSets.find(s => s.id === ingredientSetId);
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
    const catalystsForSet = this.recipeManager.getCatalystsForSet(recipe, ingredientSet);
    const catalystValidation = await this._validateCatalysts(componentSourceActors, recipe, catalystsForSet);
    if (!catalystValidation.valid) {
      return {
        success: false,
        results: null,
        message: catalystValidation.message
      };
    }

    // Run optional system-level crafting check before consuming ingredients.
    const checkResult = await this._runCraftingCheck(
      recipe,
      craftingActor,
      componentSourceActors,
      ingredientSet
    );
    if (!checkResult.success) {
      return {
        success: false,
        results: null,
        message: checkResult.message || 'Crafting check failed'
      };
    }

    // Consume ingredients from component source actors
    const consumedItems = await this._consumeIngredients(componentSourceActors, ingredientSet, recipe);

    // Apply catalyst degradation
    await this._degradeCatalysts(catalystValidation.catalysts);

    // Create the result item(s)
    const resultItems = await this._createResultItems(
      craftingActor,
      recipe,
      ingredientSet,
      consumedItems,
      catalystValidation.catalysts,
      checkResult
    );

    return {
      success: true,
      results: resultItems,
      message: `Successfully crafted ${recipe.name}`
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
  async _createResultItems(craftingActor, recipe, ingredientSet, consumedItems, catalystItems, checkResult = null) {
    // Determine which result groups to create.
    let groupsToCreate;
    const routedResultId = checkResult?.outcome && recipe?.outcomeRouting
      ? recipe.outcomeRouting[checkResult.outcome]
      : null;
    const allGroups = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];

    if (routedResultId) {
      groupsToCreate = allGroups.filter(group => group.id === routedResultId);
      if (groupsToCreate.length === 0) {
        console.warn(`Fabricate v2 | Outcome routing target not found: ${routedResultId}`);
      }
    }

    if ((!groupsToCreate || groupsToCreate.length === 0) && recipe.isVariable && ingredientSet.resultMapping.length > 0) {
      // Variable recipe mapping accepts group IDs (canonical) and legacy result IDs.
      groupsToCreate = allGroups.filter(group =>
        ingredientSet.resultMapping.includes(group.id) ||
        group.results.some(result => ingredientSet.resultMapping.includes(result.id))
      );
    } else if (!groupsToCreate || groupsToCreate.length === 0) {
      groupsToCreate = allGroups;
    }

    const createdItems = [];
    for (const group of groupsToCreate) {
      for (const result of group.results || []) {
        const resultItem = await this._createSingleResult(
          craftingActor,
          result,
          consumedItems,
          catalystItems,
          recipe,
          checkResult
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
  async _createSingleResult(craftingActor, result, consumedItems, catalystItems, recipe, checkResult = null) {
    // Get the source item
    let sourceItem;
    let managedItem = null;
    if (result.systemItemId && recipe.craftingSystemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(recipe.craftingSystemId);
      managedItem = system?.items?.find(i => i.id === result.systemItemId) || null;
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
      checkResult
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

  async _runCraftingCheck(recipe, craftingActor, componentSourceActors, ingredientSet) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { success: true, outcome: null, data: {} };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { success: true, outcome: null, data: {} };
    }

    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const features = system.features || {};
    const checksEnabled = advancedEnabled && features.craftingChecks === true;
    if (!checksEnabled) {
      return { success: true, outcome: null, data: {} };
    }

    const config = system.craftingCheck || {};
    if (!config.macroUuid) {
      return { success: true, outcome: null, data: {} };
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
        resolvedEssences
      });
    } catch (err) {
      console.error(`Fabricate v2 | Crafting check macro failed (${config.macroUuid})`, err);
      return {
        success: false,
        outcome: null,
        data: {},
        message: `Crafting check macro failed: ${err.message || config.macroUuid}`
      };
    }

    if (!result || typeof result !== 'object') {
      return {
        success: false,
        outcome: null,
        data: {},
        message: 'Crafting check macro must return an object'
      };
    }

    const outcome = result.outcome != null ? String(result.outcome) : null;
    const allowed = Array.isArray(config.outcomes) ? config.outcomes : [];
    if (outcome && allowed.length > 0 && !allowed.includes(outcome)) {
      return {
        success: false,
        outcome,
        data: result.data || {},
        message: `Crafting check returned invalid outcome "${outcome}"`
      };
    }

    const success = result.success !== false;
    return {
      success,
      outcome,
      data: result.data || {},
      message: success ? null : (result.message || 'Crafting check failed')
    };
  }

  async _runPropertyMacro(macroUuid, recipe, craftingActor, result, consumedItems, catalystItems, checkResult = null) {
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
      result: result?.toJSON?.() || result
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
      const itemEssences = item.getFlag('fabricate-v2', 'essences') || {};
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
      const itemEssences = item.getFlag('fabricate-v2', 'essences') || {};
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
      lines.push(`${ingredient.getDescription()}: have ${have}, need ${need}`);
    }

    for (const { type, have, need } of missing.essences) {
      lines.push(`${type} essence: have ${have}, need ${need}`);
    }

    for (const catalyst of missing.catalysts) {
      lines.push(`${catalyst.name}: missing`);
    }

    return lines.join('\n');
  }
}
