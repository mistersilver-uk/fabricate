import { Recipe } from '../models/Recipe.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { getFabricateFlag } from '../config/flags.js';

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
    const savedRecipes = getSetting(SETTING_KEYS.RECIPES) || [];
    for (const recipeData of savedRecipes) {
      const recipe = Recipe.fromJSON(recipeData);
      this.recipes.set(recipe.id, recipe);
    }

    this.initialized = true;
    console.log(`Fabricate | Loaded ${this.recipes.size} recipes`);
  }

  /**
   * Save all recipes to game settings
   */
  async save() {
    const recipesArray = Array.from(this.recipes.values()).map(r => r.toJSON());
    await setSetting(SETTING_KEYS.RECIPES, recipesArray);
  }

  /**
   * Create a new recipe
   * @param {Object} recipeData - Recipe configuration
   * @returns {Recipe}
   */
  async createRecipe(recipeData) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    const validation = this._validateRecipeForCreateOrUpdate(recipe);

    if (!validation.valid) {
      throw new Error(`Invalid recipe: ${validation.errors.join(', ')}`);
    }

    this.recipes.set(recipe.id, recipe);
    await this.save();
    console.debug(`Fabricate | Created recipe "${recipe.name}" (${recipe.id})`);

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
    const validation = this._validateRecipeForCreateOrUpdate(updatedRecipe);

    if (!validation.valid) {
      throw new Error(`Invalid recipe update: ${validation.errors.join(', ')}`);
    }

    this.recipes.set(recipeId, updatedRecipe);
    await this.save();
    console.debug(`Fabricate | Updated recipe "${updatedRecipe.name}" (${updatedRecipe.id})`);
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
    await this._cleanupFlagsAfterRecipeMutation();
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
   * Evaluate whether a recipe can be crafted, returning a single unified result
   * that is the sole source of truth for both the craftability boolean and the
   * per-ingredient/essence/catalyst display states.
   *
   * This eliminates the divergent computation paths that caused the false
   * "Cannot Craft" status (T-082): previously canCraft() and the UI display loop
   * each walked the items independently, leading to inconsistent results when
   * shared items were involved.
   *
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to evaluate
   * @returns {{
   *   canCraft: boolean,
   *   satisfiableSet: IngredientSet|null,
   *   missing: { ingredients: Array, essences: Array, catalysts: Array },
   *   ingredientStates: Array<{ description: string, need: number, have: number, satisfied: boolean }>,
   *   essenceStates: Array<{ type: string, need: number, have: number, satisfied: boolean }>,
   *   catalystStates: Array<{ name: string, available: boolean }>
   * }}
   */
  evaluateCraftability(componentSourceActors, recipe) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    const emptyResult = {
      canCraft: false,
      satisfiableSet: null,
      missing: { ingredients: [], essences: [], catalysts: [] },
      ingredientStates: [],
      essenceStates: [],
      catalystStates: []
    };

    if (componentSourceActors.length === 0) {
      return emptyResult;
    }

    // Guard against multi-step recipes where ingredientSets is empty.
    if (recipe.ingredientSets.length === 0) {
      return emptyResult;
    }

    // Aggregate all items from component source actors once.
    const availableItems = componentSourceActors.flatMap(actor =>
      Array.from(actor.items)
    );

    const features = this._getSystemFeatures(recipe);

    // Attempt to find a satisfiable ingredient set.
    // We capture both the satisfiable set (if any) and the first-set result for
    // the fallback display path.
    let satisfiableSet = null;
    let satisfiableSetSelection = null;

    // Also keep the first-set selection for the "unsatisfied" display fallback.
    let firstSetSelection = null;
    let firstSet = recipe.ingredientSets[0];

    for (const ingredientSet of recipe.ingredientSets) {
      const selection = typeof ingredientSet.resolveIngredientSelection === 'function'
        ? ingredientSet.resolveIngredientSelection(
          availableItems,
          (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item)
        )
        : { success: true, missingGroups: [], selectedIngredients: [], plan: [] };

      // Track the first set's selection for the unsatisfied fallback display.
      if (firstSetSelection === null) {
        firstSetSelection = selection;
      }

      // Check essences for this set.
      let essencesMet = true;
      if (features.enableEssences && Object.keys(ingredientSet.essences || {}).length > 0) {
        const accumulatedEssences = this._accumulateEssences(availableItems);
        for (const [essenceType, requiredQty] of Object.entries(ingredientSet.essences)) {
          if ((accumulatedEssences[essenceType] || 0) < requiredQty) {
            essencesMet = false;
            break;
          }
        }
      }

      if (selection.success && essencesMet) {
        satisfiableSet = ingredientSet;
        satisfiableSetSelection = selection;
        break;
      }
    }

    // Build catalyst states using the satisfiable set (or first set as fallback).
    const displaySet = satisfiableSet || firstSet;
    const catalystsForSet = this.getCatalystsForSet(recipe, displaySet);
    const catalystStates = catalystsForSet.map(cat => {
      let available = false;
      for (const actor of componentSourceActors) {
        const actorItems = Array.from(actor?.items ?? []);
        if (actorItems.filter(item => this._catalystMatchesItem(recipe, cat, item)).length > 0) {
          available = true;
          break;
        }
      }
      return { name: cat.name, available };
    });
    const missingCatalysts = catalystsForSet.filter((_cat, idx) => !catalystStates[idx].available);

    // Final craftability: ingredients satisfied AND catalysts present.
    const canCraft = satisfiableSet !== null && missingCatalysts.length === 0;

    // Build ingredient display states from the selection result that matches
    // the craftability decision — ensuring they are always consistent.
    //
    // If craftable: use satisfiableSetSelection (all groups satisfied).
    // If not craftable: use firstSetSelection (shows what is missing from set 0).
    const displaySelection = canCraft ? satisfiableSetSelection : firstSetSelection;
    const displayIngredientSet = canCraft ? satisfiableSet : firstSet;

    const ingredientStates = this._buildIngredientStates(
      recipe, displayIngredientSet, displaySelection, availableItems
    );

    // Build essence states from the display set.
    const essenceStates = this._buildEssenceStates(recipe, displayIngredientSet, availableItems, features);

    // Build the missing object (for backward compatibility with canCraft() callers).
    const missingIngredients = [];
    for (const groupMissing of (displaySelection?.missingGroups || [])) {
      const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
      if (!ingredient) continue;
      missingIngredients.push({
        ingredient,
        have: Number(groupMissing.have || 0),
        need: Number(groupMissing.need || ingredient.quantity || 1)
      });
    }
    const missingEssences = essenceStates.filter(s => !s.satisfied).map(s => ({
      type: s.type,
      have: s.have,
      need: s.need
    }));

    return {
      canCraft,
      satisfiableSet: canCraft ? satisfiableSet : null,
      missing: {
        ingredients: canCraft ? [] : missingIngredients,
        essences: canCraft ? [] : missingEssences,
        catalysts: missingCatalysts
      },
      ingredientStates,
      essenceStates,
      catalystStates
    };
  }

  /**
   * Derive per-group ingredient display states from a resolved selection result.
   * The states are derived from the SAME selection result that determined craftability,
   * so they are always consistent with the canCraft boolean.
   *
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @param {Object} selection - result from resolveIngredientSelection
   * @param {Item[]} availableItems
   * @returns {Array<{ description: string, need: number, have: number, satisfied: boolean }>}
   * @private
   */
  _buildIngredientStates(recipe, ingredientSet, selection, availableItems) {
    if (!ingredientSet) return [];

    const groups = Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
      ? ingredientSet.ingredientGroups
      : (ingredientSet.ingredients || []).map(ingredient => ({ options: [ingredient] }));

    // Build a set of missing group IDs for O(1) lookup.
    const missingGroupIds = new Set(
      (selection?.missingGroups || []).map(mg => mg?.group?.id).filter(Boolean)
    );

    return groups.map(group => {
      const options = group.options || [];

      // Check whether any option in this group is satisfied.
      // We use the selectedIngredients from the selection to determine which option was chosen,
      // then compute have/need from the actual available items using the same matcher.
      //
      // For missing groups, report the best-effort have/need from the missingGroups data.
      const isMissing = missingGroupIds.has(group.id);

      if (isMissing) {
        // Find this group's missing data.
        const missingEntry = (selection?.missingGroups || []).find(mg => mg?.group?.id === group.id);
        const ingredient = missingEntry?.ingredient || options[0] || null;
        const description = ingredient?.getDescription?.() || options.map(o => o?.getDescription?.() || '').join(' OR ');
        return {
          description,
          need: Number(missingEntry?.need || ingredient?.quantity || 1),
          have: Number(missingEntry?.have || 0),
          satisfied: false
        };
      }

      // This group is satisfied — find which option was selected.
      // The selectedIngredients array holds the chosen option objects in group order.
      // We match by position: selected options appear in the same order as groups
      // (groups are iterated in order; selectedIngredients are appended in order).
      //
      // To avoid positional assumptions we instead compute have/need for each option
      // using the availableItems (no remaining-quantity deduction here — we only need
      // display values, and the group is already known to be satisfied).
      const optionStates = options.map(ing => {
        const matchingItems = availableItems.filter(item =>
          this.ingredientMatchesItem(recipe, ing, item)
        );
        const totalQty = matchingItems.reduce((sum, item) => sum + (item.system?.quantity || 1), 0);
        return {
          description: ing.getDescription?.() || '',
          need: ing.quantity,
          have: totalQty,
          satisfied: totalQty >= ing.quantity
        };
      });

      const satisfiedOption = optionStates.find(s => s.satisfied) || optionStates[0];
      return {
        description: optionStates.map(s => s.description).join(' OR '),
        need: satisfiedOption?.need || 1,
        have: satisfiedOption?.have || 0,
        satisfied: true
      };
    });
  }

  /**
   * Build essence display states for the given ingredient set.
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @param {Item[]} availableItems
   * @param {{ enableEssences: boolean }} features
   * @returns {Array<{ type: string, need: number, have: number, satisfied: boolean }>}
   * @private
   */
  _buildEssenceStates(recipe, ingredientSet, availableItems, features) {
    if (!ingredientSet || !features.enableEssences) return [];
    const essences = ingredientSet.essences || {};
    if (Object.keys(essences).length === 0) return [];

    const accumulatedEssences = this._accumulateEssences(availableItems);
    return Object.entries(essences).map(([type, need]) => {
      const have = accumulatedEssences[type] || 0;
      return { type, need, have, satisfied: have >= need };
    });
  }

  /**
   * Check if a recipe can be crafted with items from the given component source actors.
   * This is a thin wrapper around evaluateCraftability() that returns only the
   * backward-compatible subset: { canCraft, satisfiableSet, missing }.
   *
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to check
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
  canCraft(componentSourceActors, recipe) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    if (componentSourceActors.length === 0) {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], catalysts: [] }
      };
    }

    const { canCraft, satisfiableSet, missing } = this.evaluateCraftability(componentSourceActors, recipe);
    return { canCraft, satisfiableSet, missing };
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
    const selection = typeof ingredientSet.resolveIngredientSelection === 'function'
      ? ingredientSet.resolveIngredientSelection(
        availableItems,
        (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item)
      )
      : { success: true, missingGroups: [] };

    if (!selection.success) {
      for (const groupMissing of selection.missingGroups || []) {
        const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
        if (!ingredient) continue;
        missing.ingredients.push({
          ingredient,
          have: Number(groupMissing.have || 0),
          need: Number(groupMissing.need || ingredient.quantity || 1)
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
      let found = false;

      for (const actor of actors) {
        const actorItems = Array.from(actor?.items ?? []);
        const matchingItems = actorItems.filter(item => this._catalystMatchesItem(recipe, catalyst, item));
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
   * @private
   */
  getCatalystsForSet(recipe, ingredientSet) {
    return [
      ...(Array.isArray(recipe?.catalysts) ? recipe.catalysts : []),
      ...(Array.isArray(ingredientSet?.catalysts) ? ingredientSet.catalysts : [])
    ];
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
    const match = ingredient.match || null;
    const componentId = (match?.type === 'component' || match?.type === 'systemItem')
      ? (match.componentId || match.systemItemId || null)
      : (ingredient.componentId || ingredient.systemItemId || null);

    if (componentId) {
      const managedItem = this._getComponent(recipe, componentId);
      if (!managedItem) return false;

      const sourceId = foundry.utils.getProperty(item, 'flags.core.sourceId');
      const byUuid = managedItem.sourceUuid
        ? (item.uuid === managedItem.sourceUuid || sourceId === managedItem.sourceUuid)
        : false;
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
    if (catalyst.componentId || catalyst.systemItemId) {
      const managedItem = this._getComponent(recipe, catalyst.componentId || catalyst.systemItemId);
      if (!managedItem) return false;
      if (managedItem.sourceUuid) {
        const sourceId = foundry.utils.getProperty(item, 'flags.core.sourceId');
        return item.uuid === managedItem.sourceUuid || sourceId === managedItem.sourceUuid;
      }
      return item.name?.toLowerCase() === (managedItem.name || '').toLowerCase();
    }
    // No componentId means catalyst cannot be matched; treat as no match.
    return false;
  }

  _matchesIngredient(ingredient, item, features) {
    if (ingredient.itemUuid && item.uuid === ingredient.itemUuid) return true;

    if (ingredient.match?.type === 'tags') {
      if (!features.enableTags) return false;
      const requiredTags = Array.isArray(ingredient.match.tags) ? ingredient.match.tags : [];
      const itemTags = getFabricateFlag(item, 'tags', []);
      const matched = ingredient.match.tagMatch === 'all'
        ? requiredTags.every(tag => itemTags.includes(tag))
        : requiredTags.some(tag => itemTags.includes(tag));
      if (!matched) return false;
      if (ingredient.tier && features.enableTiers) {
        const itemTier = getFabricateFlag(item, 'tier', null);
        return itemTier === ingredient.tier;
      }
      return true;
    }

    if (ingredient.tag) {
      if (!features.enableTags) return false;
      const itemTags = getFabricateFlag(item, 'tags', []);
      if (!itemTags.includes(ingredient.tag)) return false;
      if (ingredient.tier && features.enableTiers) {
        const itemTier = getFabricateFlag(item, 'tier', null);
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
    const features = system?.features || {};
    return {
      enableTags: advancedEnabled && features.itemTags === true,
      enableTiers: false,
      enableEssences: advancedEnabled && features.essences === true
    };
  }

  /**
   * Resolve a managed system item by ID for the given recipe
   * @private
   */
  _getComponent(recipe, componentId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !componentId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    const managedItems = Array.isArray(system.components) ? system.components : (Array.isArray(system.managedItems) ? system.managedItems : (system.items || []));
    return managedItems.find(item => item.id === componentId) || null;
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
      const itemEssences = getFabricateFlag(item, 'essences', {});
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
      const validation = this._validateRecipeForCreateOrUpdate(recipe);

      if (!validation.valid) {
        console.warn(`Fabricate | Skipping invalid recipe: ${recipe.name}`, validation.errors);
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
    await this._cleanupFlagsAfterRecipeMutation();
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

  /**
   * Validate recipe core rules and system-specific essence references
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateRecipeForCreateOrUpdate(recipe) {
    const baseValidation = recipe.validate();
    const errors = [...(baseValidation.errors || [])];

    const systemValidation = this._validateEssenceReferences(recipe);
    errors.push(...systemValidation.errors);
    const tagValidation = this._validateTagPlaceholders(recipe);
    errors.push(...tagValidation.errors);
    const modeValidation = this._validateResolutionMode(recipe);
    errors.push(...modeValidation.errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate ingredient-set essence requirements against crafting system essence definitions.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateEssenceReferences(recipe) {
    const errors = [];
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { valid: true, errors };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { valid: true, errors };
    }

    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const features = system.features || {};
    const essencesEnabled = advancedEnabled && (features.essences === true || system.enableEssences === true);
    if (!essencesEnabled) {
      return { valid: true, errors };
    }

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const validEssenceIds = new Set(definitions.map(def => def.id));

    for (const set of recipe.ingredientSets || []) {
      for (const [essenceId, qty] of Object.entries(set.essences || {})) {
        if (!validEssenceIds.has(essenceId)) {
          errors.push(`Ingredient set "${set.name || set.id}" references unknown essence "${essenceId}"`);
        }
        const num = Number(qty);
        if (!Number.isFinite(num) || num <= 0) {
          errors.push(`Ingredient set "${set.name || set.id}" has invalid quantity for essence "${essenceId}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _validateResolutionMode(recipe) {
    const modeService = game.fabricate?.getResolutionModeService?.();
    if (!modeService) {
      return { valid: true, errors: [] };
    }
    return modeService.validateRecipe(recipe);
  }

  _validateTagPlaceholders(recipe) {
    const errors = [];
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { valid: true, errors };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { valid: true, errors };
    }

    const advancedEnabled = system.advancedOptionsEnabled !== false;
    const features = system.features || {};
    const itemTagsEnabled = advancedEnabled && features.itemTags === true;
    const validTags = new Set([
      ...((system.itemTags || []).map(tag => String(tag || '').trim())),
      ...((system.tags || []).map(tag => String(tag || '').trim()))
    ].filter(Boolean));

    const steps = typeof recipe.getExecutionSteps === 'function'
      ? recipe.getExecutionSteps()
      : [{ id: 'implicit', ingredientSets: recipe.ingredientSets || [] }];
    for (const step of steps) {
      for (const ingredientSet of step.ingredientSets || []) {
        const groups = Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
          ? ingredientSet.ingredientGroups
          : (ingredientSet.ingredients || []).map(ingredient => ({ options: [ingredient] }));

        for (const group of groups) {
          for (const option of group.options || []) {
            const match = option.match || null;
            const isTagPlaceholder = match?.type === 'tags';
            if (!isTagPlaceholder) continue;
            const tagIds = Array.isArray(match.tags) ? match.tags : [];

            if (!itemTagsEnabled) {
              errors.push(
                `Ingredient group "${group.name || group.id}" uses tag placeholders but item tags are disabled for this crafting system`
              );
              continue;
            }

            for (const tagId of tagIds) {
              const normalized = String(tagId || '').trim();
              if (!normalized) continue;
              if (validTags.has(normalized)) continue;
              errors.push(
                `Ingredient group "${group.name || group.id}" references unknown tag "${normalized}"`
              );
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async _cleanupFlagsAfterRecipeMutation() {
    const runManager = game.fabricate?.getCraftingRunManager?.();
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    if (!runManager && !visibilityService) return;

    const validRecipes = new Set(this.getRecipes({}).map(r => r.id));
    const validSystems = new Set((systemManager?.getSystems?.() || []).map(s => s.id));
    if (runManager) {
      await runManager.cleanupInvalidRuns(validRecipes, validSystems);
    }
    if (visibilityService) {
      await visibilityService.cleanupLearnedRecipes(validRecipes);
    }
  }
}
