import { Recipe } from '../models/Recipe.js';
import { FormulaEvaluator } from '../utils/FormulaEvaluator.js';

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
      catalystValidation.catalysts
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
  async _createResultItems(craftingActor, recipe, ingredientSet, consumedItems, catalystItems) {
    // Determine which results to create
    let resultsToCreate;

    if (recipe.isVariable && ingredientSet.resultMapping.length > 0) {
      // Variable recipe: use ingredient set's result mapping
      resultsToCreate = recipe.results.filter(r =>
        ingredientSet.resultMapping.includes(r.id)
      );
    } else {
      // Non-variable recipe: create all results
      resultsToCreate = recipe.results;
    }

    const createdItems = [];

    // Create each result
    for (const result of resultsToCreate) {
      const resultItem = await this._createSingleResult(
        craftingActor,
        result,
        consumedItems,
        catalystItems,
        recipe
      );

      if (resultItem) {
        createdItems.push(resultItem);
      }
    }

    return createdItems;
  }

  /**
   * Create a single result item
   * @private
   */
  async _createSingleResult(craftingActor, result, consumedItems, catalystItems, recipe) {
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

    // Apply property formulas
    if (result.propertyFormulas && Object.keys(result.propertyFormulas).length > 0) {
      for (const [path, formula] of Object.entries(result.propertyFormulas)) {
        const value = this._evaluateFormula(formula, consumedItems, catalystItems, recipe);
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

  /**
   * Evaluate a formula with context from ingredients and catalysts
   * @private
   */
  _evaluateFormula(formula, consumedItems, catalystItems, recipe) {
    // Create context variables
    const context = {
      ingredientCount: consumedItems.length,
      ingredientTier: this._getAverageIngredientTier(consumedItems, recipe),
      catalystQuality: this._getAverageCatalystQuality(catalystItems)
    };

    // Use safe formula evaluator
    return FormulaEvaluator.evaluate(formula, context);
  }

  /**
   * Get average tier of consumed ingredients
   * @private
   */
  _getAverageIngredientTier(consumedItems, recipe) {
    const systemId = recipe?.craftingSystemId;
    if (systemId) {
      const systemManager = game.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem(systemId);
      const advancedEnabled = system?.advancedOptionsEnabled !== false;
      const tiersEnabled = advancedEnabled && system?.enableTiers === true;
      if (!tiersEnabled) return 1;
    }
    const tierMap = { 'common': 1, 'uncommon': 2, 'rare': 3, 'legendary': 4 };
    let totalTier = 0;
    let count = 0;

    for (const { item } of consumedItems) {
      const tier = item.getFlag('fabricate-v2', 'tier') || 'common';
      totalTier += tierMap[tier] || 1;
      count++;
    }

    return count > 0 ? totalTier / count : 1;
  }

  /**
   * Get average quality of catalysts used
   * @private
   */
  _getAverageCatalystQuality(catalystItems) {
    let totalQuality = 0;
    let count = 0;

    for (const { catalyst, item } of catalystItems) {
      totalQuality += catalyst.getQualityBonus(item);
      count++;
    }

    return count > 0 ? totalQuality / count : 0;
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
