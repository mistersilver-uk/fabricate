import { Recipe } from '../models/Recipe.js';

/**
 * Manages recipe storage, retrieval, and CRUD operations
 */
export class RecipeManager {
  constructor() {
    this.recipes = new Map();
    this.initialized = false;
  }

  /**
   * Ensure only GMs can mutate recipe state
   * @param {string} action - Action name for error context
   * @private
   */
  _assertGM(action) {
    if (!game.user?.isGM) {
      throw new Error(`GM permissions required: ${action}`);
    }
  }

  /**
   * Initialize the recipe manager and load saved recipes
   */
  async initialize() {
    if (this.initialized) return;

    // Load recipes from game settings
    const savedRecipes = game.settings.get('fabricate-v2', 'recipes') || [];
    for (const recipeData of savedRecipes) {
      const recipe = Recipe.fromJSON(recipeData);
      this.recipes.set(recipe.id, recipe);
    }

    this.initialized = true;
    console.log(`Fabricate v2 | Loaded ${this.recipes.size} recipes`);
  }

  /**
   * Save all recipes to game settings
   */
  async save() {
    const recipesArray = Array.from(this.recipes.values()).map(r => r.toJSON());
    await game.settings.set('fabricate-v2', 'recipes', recipesArray);
  }

  /**
   * Create a new recipe
   * @param {Object} recipeData - Recipe configuration
   * @returns {Recipe}
   */
  async createRecipe(recipeData) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    const validation = recipe.validate();

    if (!validation.valid) {
      throw new Error(`Invalid recipe: ${validation.errors.join(', ')}`);
    }

    this.recipes.set(recipe.id, recipe);
    await this.save();

    ui.notifications.info(`Recipe "${recipe.name}" created`);
    return recipe;
  }

  /**
   * Update an existing recipe
   * @param {string} recipeId - Recipe ID to update
   * @param {Object} updates - Properties to update
   * @returns {Recipe}
   */
  async updateRecipe(recipeId, updates) {
    this._assertGM('update recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    const merged = {
      ...recipe.toJSON(),
      ...updates,
      id: recipeId
    };
    const updatedRecipe = Recipe.fromJSON(merged);
    const validation = updatedRecipe.validate();

    if (!validation.valid) {
      throw new Error(`Invalid recipe update: ${validation.errors.join(', ')}`);
    }

    this.recipes.set(recipeId, updatedRecipe);
    await this.save();
    ui.notifications.info(`Recipe "${updatedRecipe.name}" updated`);
    return updatedRecipe;
  }

  /**
   * Delete a recipe
   * @param {string} recipeId - Recipe ID to delete
   */
  async deleteRecipe(recipeId) {
    this._assertGM('delete recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    this.recipes.delete(recipeId);
    await this.save();
    ui.notifications.info(`Recipe "${recipe.name}" deleted`);
  }

  /**
   * Get a recipe by ID
   * @param {string} recipeId - Recipe ID
   * @returns {Recipe|null}
   */
  getRecipe(recipeId) {
    return this.recipes.get(recipeId) || null;
  }

  /**
   * Get all recipes
   * @param {Object} filters - Optional filters
   * @returns {Recipe[]}
   */
  getRecipes(filters = {}) {
    let recipes = Array.from(this.recipes.values());

    // Filter by category
    if (filters.category) {
      recipes = recipes.filter(r => r.category === filters.category);
    }

    // Filter by crafting system
    if (filters.craftingSystemId !== undefined) {
      recipes = recipes.filter(r => r.craftingSystemId === filters.craftingSystemId);
    }

    // Filter by system
    if (filters.system) {
      recipes = recipes.filter(r => (r.system || 'all') === 'all' || r.system === filters.system);
    }

    // Filter by enabled status
    if (filters.enabled !== undefined) {
      recipes = recipes.filter(r => r.enabled === filters.enabled);
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      recipes = recipes.filter(r =>
        filters.tags.some(tag => (r.tags || []).includes(tag))
      );
    }

    // Search by name
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      recipes = recipes.filter(r =>
        r.name.toLowerCase().includes(searchLower) ||
        r.description.toLowerCase().includes(searchLower)
      );
    }

    return recipes;
  }

  /**
   * Find recipes that can be crafted with the given component source actors
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @returns {Recipe[]}
   */
  getAvailableRecipes(componentSourceActors) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    const recipes = this.getRecipes({ enabled: true });
    const available = [];

    for (const recipe of recipes) {
      if (this.canCraft(componentSourceActors, recipe).canCraft) {
        available.push(recipe);
      }
    }

    return available;
  }

  /**
   * Check if a recipe can be crafted with items from the given component source actors
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to check
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
  canCraft(componentSourceActors, recipe) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    if (!Array.isArray(componentSourceActors) || componentSourceActors.length === 0) {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] }
      };
    }

    // Aggregate all items from component source actors
    const availableItems = componentSourceActors.flatMap(actor =>
      Array.from(actor.items)
    );

    // Check if ANY ingredient set can be satisfied
    for (const ingredientSet of recipe.ingredientSets) {
      const missing = this._checkIngredientSet(recipe, ingredientSet, availableItems);
      const catalystsForSet = this.getCatalystsForSet(recipe, ingredientSet);

      if (missing.ingredients.length === 0 && missing.essences.length === 0) {
        // This ingredient set is fully satisfied
        // Now check catalysts (catalysts are checked across all source actors)
        const catalystMissing = this._checkCatalysts(recipe, catalystsForSet, componentSourceActors);

        if (catalystMissing.length === 0) {
          return {
            canCraft: true,
            satisfiableSet: ingredientSet,
            missing: { ingredients: [], essences: [], catalysts: [] }
          };
        } else {
          return {
            canCraft: false,
            satisfiableSet: null,
            missing: {
              ingredients: [],
              essences: [],
              catalysts: catalystMissing
            }
          };
        }
      }
    }

    // No ingredient set can be satisfied - return missing from first set
    const firstSetMissing = this._checkIngredientSet(recipe, recipe.ingredientSets[0], availableItems);
    const firstSetCatalysts = this.getCatalystsForSet(recipe, recipe.ingredientSets[0]);
    const catalystMissing = this._checkCatalysts(recipe, firstSetCatalysts, componentSourceActors);

    return {
      canCraft: false,
      satisfiableSet: null,
      missing: {
        ingredients: firstSetMissing.ingredients,
        essences: firstSetMissing.essences,
        catalysts: catalystMissing
      }
    };
  }

  /**
   * Check if an ingredient set can be satisfied with available items
   * @param {IngredientSet} ingredientSet - The ingredient set to check
   * @param {Item[]} availableItems - Items available for crafting
   * @returns {{ingredients: Array, essences: Array}}
   * @private
   */
  _checkIngredientSet(recipe, ingredientSet, availableItems) {
    const missing = {
      ingredients: [],
      essences: []
    };
    const features = this._getSystemFeatures(recipe);

    // Check ingredients
    for (const ingredient of ingredientSet.ingredients) {
      const matchingItems = availableItems.filter(item => this.ingredientMatchesItem(recipe, ingredient, item));
      const totalQuantity = matchingItems.reduce((sum, item) =>
        sum + (item.system.quantity || 1), 0
      );

      if (totalQuantity < ingredient.quantity) {
        missing.ingredients.push({
          ingredient,
          have: totalQuantity,
          need: ingredient.quantity
        });
      }
    }

    // Check essences
    if (features.enableEssences && Object.keys(ingredientSet.essences || {}).length > 0) {
      const accumulatedEssences = this._accumulateEssences(availableItems);

      for (const [essenceType, requiredQty] of Object.entries(ingredientSet.essences)) {
        const availableQty = accumulatedEssences[essenceType] || 0;
        if (availableQty < requiredQty) {
          missing.essences.push({
            type: essenceType,
            have: availableQty,
            need: requiredQty
          });
        }
      }
    }

    return missing;
  }

  /**
   * Check if catalysts are available
   * @param {Catalyst[]} catalysts - Catalysts to check
   * @param {Actor[]} actors - Actors to search for catalysts
   * @returns {Array}
   * @private
   */
  _checkCatalysts(recipe, catalysts, actors) {
    const missing = [];

    for (const catalyst of catalysts) {
      if (catalyst.required === false) continue;

      let found = false;

      for (const actor of actors) {
        const matchingItems = actor.items.filter(item => this._catalystMatchesItem(recipe, catalyst, item));
        if (matchingItems.length > 0) {
          found = true;
          break;
        }
      }

      if (!found) {
        missing.push(catalyst);
      }
    }

    return missing;
  }

  /**
   * Return catalysts that apply to the given ingredient set.
   * Supports both legacy recipe-level catalysts and set-level catalysts.
   * @private
   */
  getCatalystsForSet(recipe, ingredientSet) {
    const setCatalysts = Array.isArray(ingredientSet?.catalysts) ? ingredientSet.catalysts : [];
    const recipeCatalysts = Array.isArray(recipe?.catalysts) ? recipe.catalysts : [];
    return [...recipeCatalysts, ...setCatalysts];
  }

  /**
   * Check whether a concrete item satisfies a recipe ingredient
   * @param {Recipe} recipe
   * @param {Ingredient} ingredient
   * @param {Item} item
   * @returns {boolean}
   */
  ingredientMatchesItem(recipe, ingredient, item) {
    const features = this._getSystemFeatures(recipe);
    if (ingredient.systemItemId) {
      const managedItem = this._getSystemItem(recipe, ingredient.systemItemId);
      if (!managedItem) return false;

      const byUuid = managedItem.sourceUuid ? item.uuid === managedItem.sourceUuid : false;
      const byName = !managedItem.sourceUuid && managedItem.name
        ? item.name?.toLowerCase() === managedItem.name.toLowerCase()
        : false;
      if (!byUuid && !byName) return false;
    } else if (!this._matchesIngredient(ingredient, item, features)) {
      return false;
    }

    return true;
  }

  /**
   * Check whether a concrete item satisfies a catalyst requirement
   * @param {Recipe} recipe
   * @param {Catalyst} catalyst
   * @param {Item} item
   * @returns {boolean}
   */
  catalystMatchesItem(recipe, catalyst, item) {
    return this._catalystMatchesItem(recipe, catalyst, item);
  }

  /**
   * Check whether a concrete item satisfies a catalyst requirement
   * @private
   */
  _catalystMatchesItem(recipe, catalyst, item) {
    if (catalyst.systemItemId) {
      const managedItem = this._getSystemItem(recipe, catalyst.systemItemId);
      if (!managedItem) return false;
      if (managedItem.sourceUuid) return item.uuid === managedItem.sourceUuid;
      return item.name?.toLowerCase() === (managedItem.name || '').toLowerCase();
    }
    return catalyst.matches(item);
  }

  _matchesIngredient(ingredient, item, features) {
    if (ingredient.itemUuid && item.uuid === ingredient.itemUuid) return true;

    if (ingredient.tag) {
      if (!features.enableTags) return false;
      const itemTags = item.getFlag('fabricate-v2', 'tags') || [];
      if (!itemTags.includes(ingredient.tag)) return false;
      if (ingredient.tier && features.enableTiers) {
        const itemTier = item.getFlag('fabricate-v2', 'tier');
        return itemTier === ingredient.tier;
      }
      return true;
    }

    if (Array.isArray(ingredient.alternatives) && ingredient.alternatives.length > 0) {
      return ingredient.alternatives.some(alt => this._matchesIngredient(alt, item, features));
    }

    return false;
  }

  _getSystemFeatures(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { enableTags: false, enableTiers: false, enableEssences: false };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    const advancedEnabled = system?.advancedOptionsEnabled !== false;
    return {
      enableTags: advancedEnabled && system?.enableTags === true,
      enableTiers: advancedEnabled && system?.enableTiers === true,
      enableEssences: advancedEnabled && system?.enableEssences === true
    };
  }

  /**
   * Resolve a managed system item by ID for the given recipe
   * @private
   */
  _getSystemItem(recipe, systemItemId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !systemItemId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    return system.items.find(item => item.id === systemItemId) || null;
  }

  /**
   * Accumulate essences from all available items
   * @param {Item[]} items - Items to check
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items) {
    const accumulated = {};

    for (const item of items) {
      const itemEssences = item.getFlag('fabricate-v2', 'essences') || {};
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  /**
   * Import recipes from JSON
   * @param {Object[]} recipesData - Array of recipe data
   * @param {boolean} overwrite - Whether to overwrite existing recipes
   */
  async importRecipes(recipesData, overwrite = false) {
    this._assertGM('import recipes');

    let imported = 0;
    let skipped = 0;

    for (const recipeData of recipesData) {
      const recipe = Recipe.fromJSON(recipeData);
      const validation = recipe.validate();

      if (!validation.valid) {
        console.warn(`Fabricate v2 | Skipping invalid recipe: ${recipe.name}`, validation.errors);
        skipped++;
        continue;
      }

      if (this.recipes.has(recipe.id) && !overwrite) {
        skipped++;
        continue;
      }

      this.recipes.set(recipe.id, recipe);
      imported++;
    }

    await this.save();
    ui.notifications.info(`Imported ${imported} recipes (${skipped} skipped)`);
  }

  /**
   * Export recipes to JSON
   * @param {string[]} recipeIds - Optional array of recipe IDs to export (exports all if not provided)
   * @returns {Object[]}
   */
  exportRecipes(recipeIds = null) {
    this._assertGM('export recipes');

    let recipes;

    if (recipeIds) {
      recipes = recipeIds.map(id => this.recipes.get(id)).filter(r => r);
    } else {
      recipes = Array.from(this.recipes.values());
    }

    return recipes.map(r => r.toJSON());
  }
}
