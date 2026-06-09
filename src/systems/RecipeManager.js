import { Recipe } from '../models/Recipe.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { getFabricateFlag } from '../config/flags.js';
import { itemMatchesComponentSource } from '../utils/sourceUuid.js';
import { accumulateItemEssences } from '../utils/essenceResolver.js';
import { SignatureValidator } from './SignatureValidator.js';
import { matchGatheringTools } from '../gatheringToolRuntime.js';

const DEFAULT_RECIPE_IMG = 'icons/svg/item-bag.svg';
const FALLBACK_RECIPE_IMG = 'icons/sundries/documents/document-bound-white-tan.webp';
const FALLBACK_COMPONENT_IMG = 'icons/svg/item-bag.svg';

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

  _notifyRecipesChanged(action, details = {}) {
    globalThis.Hooks?.callAll?.('fabricate.recipesChanged', {
      action,
      recipes: this.getRecipes(),
      ...details
    });
  }

  notifyRecipesChanged(details = {}) {
    this._notifyRecipesChanged(details.action || 'external', details);
  }

  /**
   * Create a new recipe
   * @param {Object} recipeData - Recipe configuration
   * @param {{notify?: boolean}} [options] - Set notify=false for batch callers that emit their own summary
   * @returns {Recipe}
   */
  async createRecipe(recipeData, options = {}) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    const validation = this._validateRecipeForCreateOrUpdate(recipe);

    if (!validation.valid) {
      throw new Error(`Invalid recipe: ${validation.errors.join(', ')}`);
    }

    this.recipes.set(recipe.id, recipe);
    await this.save();
    console.debug(`Fabricate | Created recipe "${recipe.name}" (${recipe.id})`);

    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${recipe.name}" created`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('create', { recipeId: recipe.id });
    }
    return recipe;
  }

  /**
   * Update an existing recipe
   * @param {string} recipeId - Recipe ID to update
   * @param {Object} updates - Properties to update
   * @param {{notify?: boolean}} [options] - Set notify=false for batch callers that emit their own summary
   * @returns {Recipe}
   */
  async updateRecipe(recipeId, updates, options = {}) {
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
    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${updatedRecipe.name}" updated`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('update', { recipeId });
    }
    return updatedRecipe;
  }

  /**
   * Delete a recipe
   * @param {string} recipeId - Recipe ID to delete
   * @param {{notify?: boolean}} [options] - Set notify=false for batch callers that emit their own summary
   */
  async deleteRecipe(recipeId, options = {}) {
    this._assertGM('delete recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    this.recipes.delete(recipeId);
    await this.save();
    await this._cleanupFlagsAfterRecipeMutation();
    if (options.notify !== false) {
      ui.notifications.info(`Recipe "${recipe.name}" deleted`);
    }
    if (options.emitChange !== false) {
      this._notifyRecipesChanged('delete', { recipeId });
    }
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
   * per-ingredient/essence/tool display states.
   *
   * This eliminates the divergent computation paths that caused the false
   * "Cannot Craft" status (T-082): previously canCraft() and the UI display loop
   * each walked the items independently, leading to inconsistent results when
   * shared items were involved.
   *
   * @param {Actor[]} componentSourceActors - Actors to pull ingredients from
   * @param {Recipe} recipe - The recipe to evaluate
   * @param {object} [options]
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [options.presentTools] -
   *   Virtual-present payload injected by an active canvas Tool station (Phase 4).
   *   A tool whose componentId is in `componentIds` AND whose recipe crafting
   *   system matches the payload `systemId` is satisfied WITHOUT an owned item and
   *   is marked `{ available: true, virtual: true }` so the caller excludes it
   *   from breakage/usage. componentId is per-system, so the system scope prevents
   *   a tool from system A satisfying a system-B recipe.
   * @returns {{
   *   canCraft: boolean,
   *   satisfiableSet: IngredientSet|null,
   *   missing: { ingredients: Array, essences: Array, tools: Array },
   *   ingredientStates: Array<{ description: string, need: number, have: number, satisfied: boolean }>,
   *   essenceStates: Array<{ type: string, need: number, have: number, satisfied: boolean }>,
   *   toolStates: Array<{ name: string, available: boolean, virtual?: boolean }>
   * }}
   */
  evaluateCraftability(componentSourceActors, recipe, { presentTools = null } = {}) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    const emptyResult = {
      canCraft: false,
      satisfiableSet: null,
      missing: { ingredients: [], essences: [], tools: [] },
      ingredientStates: [],
      essenceStates: [],
      toolStates: []
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
        const accumulatedEssences = this._accumulateEssences(availableItems, recipe);
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

    // Build tool states from resolved library Tools using the satisfiable set
    // (or first set as fallback). Reuses the gathering tool matcher path so the
    // presence check agrees with attempt validation. Tools resolve from the
    // per-system library via `toolIds`.
    const displaySet = satisfiableSet || firstSet;
    const toolsForSet = this.getToolsForSet(recipe, displaySet);
    const toolStates = this._buildToolStates(recipe, toolsForSet, availableItems, presentTools);
    const missingTools = toolsForSet.filter((_tool, idx) => !toolStates[idx].available);

    // Final craftability: ingredients satisfied AND tools present.
    const canCraft = satisfiableSet !== null && missingTools.length === 0;

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
        tools: missingTools
      },
      ingredientStates,
      essenceStates,
      toolStates
    };
  }

  /**
   * Build per-tool display/presence states for a recipe's resolved library
   * Tools. Each entry is
   * `{ name, available }` where `available` is true when at least one of the
   * supplied items satisfies the tool's component reference (and is not broken),
   * using the same matcher gathering attempt validation uses.
   *
   * @private
   * @param {Recipe} recipe
   * @param {Array<object>} tools - resolved library Tool objects
   * @param {Array<Item>} availableItems - aggregated source-actor items
   * @returns {Array<{ name: string, available: boolean }>}
   */
  _buildToolStates(recipe, tools, availableItems, presentTools = null) {
    if (!Array.isArray(tools) || tools.length === 0) return [];
    // `matchGatheringTools` scopes the virtual-present set to the system passed
    // here (the recipe's crafting system), so a present tool from a different
    // system never satisfies this recipe's tool prerequisites.
    const matched = matchGatheringTools({
      actor: { items: availableItems },
      system: { id: recipe?.craftingSystemId ?? null },
      task: { id: recipe?.id ?? null, craftingSystemId: recipe?.craftingSystemId ?? null },
      tools,
      craftingSystemManager: { recipeManager: this },
      presentTools
    });
    // Index by tool so the per-tool state can carry the virtual flag (a
    // virtual-present match has no owned item and must be excluded from
    // breakage/usage by the caller).
    const matchedByTool = new Map(matched.items.map(entry => [entry.tool, entry]));
    return tools.map(tool => {
      const entry = matchedByTool.get(tool) ?? null;
      const state = {
        name: this.resolveComponentName(recipe, tool?.componentId || tool?.systemItemId),
        available: entry !== null
      };
      if (entry?.virtual === true) state.virtual = true;
      return state;
    });
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
        const description = this._resolveIngredientDescription(recipe, ingredient)
          || options.map(o => this._resolveIngredientDescription(recipe, o) || '').join(' OR ');
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
          description: this._resolveIngredientDescription(recipe, ing) || '',
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
   * Resolve a human-readable description for an ingredient, using the resolved
   * component name instead of generic "component" text.
   *
   * @param {Recipe} recipe
   * @param {Ingredient|null} ingredient
   * @returns {string}
   * @private
   */
  _resolveIngredientDescription(recipe, ingredient) {
    if (!ingredient) return '';
    const match = ingredient.match || null;
    if (match?.type === 'component' && match.componentId) {
      const name = this.resolveComponentName(recipe, match.componentId);
      return `${ingredient.quantity || 1}x ${name}`;
    }
    return ingredient.getDescription?.() || '';
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

    const accumulatedEssences = this._accumulateEssences(availableItems, recipe);
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
   * @param {object} [options]
   * @param {{ systemId?: string|null, componentIds?: string[] }|null} [options.presentTools] -
   *   Virtual-present payload from an active canvas Tool station (see
   *   evaluateCraftability for the system-scoping semantics).
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
  canCraft(componentSourceActors, recipe, { presentTools = null } = {}) {
    if (!Array.isArray(componentSourceActors)) {
      componentSourceActors = componentSourceActors ? [componentSourceActors] : [];
    }

    if (componentSourceActors.length === 0) {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], tools: [] }
      };
    }

    const { canCraft, satisfiableSet, missing } = this.evaluateCraftability(componentSourceActors, recipe, { presentTools });
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
      const accumulatedEssences = this._accumulateEssences(availableItems, recipe);

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
   * Resolve the union of recipe-level and ingredient-set-level `toolIds` to
   * library Tool objects from the recipe's crafting system. Unknown ids are
   * skipped (resolved to nothing) rather than throwing. Ids are deduped across
   * the recipe + set tiers so a tool referenced at both granularities resolves
   * once.
   *
   * @param {Recipe} recipe
   * @param {IngredientSet} ingredientSet
   * @returns {Array<object>} resolved library Tool objects
   */
  getToolsForSet(recipe, ingredientSet) {
    const ids = [
      ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
      ...(Array.isArray(ingredientSet?.toolIds) ? ingredientSet.toolIds : [])
    ];
    const seen = new Set();
    const tools = [];
    for (const rawId of ids) {
      const id = String(rawId ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const tool = this._getTool(recipe, id);
      if (tool) tools.push(tool);
    }
    return tools;
  }

  /**
   * Resolve a single library Tool by id from the recipe's crafting system.
   * @private
   */
  _getTool(recipe, toolId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !toolId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    return (system.tools || []).find(tool => tool?.id === toolId) || null;
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

      if (itemMatchesComponentSource(item, managedItem)) return true;

      const byName = !managedItem.sourceUuid && managedItem.name
        ? item.name?.toLowerCase() === managedItem.name.toLowerCase()
        : false;
      if (!byName) return false;
    } else if (!this._matchesIngredient(ingredient, item, features)) {
      return false;
    }

    return true;
  }

  /**
   * Check whether a concrete item satisfies a Tool's component reference.
   *
   * A Tool references a managed component by id; an item satisfies the tool when
   * it matches that component's source reference chain (or, for sourceless
   * components, by name). This is the primary generic component matcher reused by
   * both recipe crafting and gathering tool validation.
   *
   * @param {Recipe} recipe
   * @param {{componentId?: string, systemItemId?: string}} tool
   * @param {Item} item
   * @returns {boolean}
   */
  toolMatchesItem(recipe, tool, item) {
    if (tool.componentId || tool.systemItemId) {
      const managedItem = this._getComponent(recipe, tool.componentId || tool.systemItemId);
      if (!managedItem) return false;
      if (managedItem.sourceUuid || managedItem.sourceItemUuid || managedItem.fallbackItemIds?.length) {
        if (itemMatchesComponentSource(item, managedItem)) return true;
        return false;
      }
      return item.name?.toLowerCase() === (managedItem.name || '').toLowerCase();
    }
    // No componentId means the tool cannot be matched; treat as no match.
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
      return true;
    }

    if (ingredient.tag) {
      if (!features.enableTags) return false;
      const itemTags = getFabricateFlag(item, 'tags', []);
      if (!itemTags.includes(ingredient.tag)) return false;
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
      return { enableTags: false, enableEssences: false };
    }
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    const features = system?.features || {};
    return {
      enableTags: !!system,
      enableEssences: system?.advancedOptionsEnabled !== false && features.essences === true
    };
  }

  /**
   * Resolve a component by ID for the given recipe
   * @private
   */
  _getComponent(recipe, componentId) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId || !componentId) return null;
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) return null;
    return (system.components || []).find(item => item.id === componentId) || null;
  }

  /**
   * Resolve the display name for a managed component.
   * Precedence: component.name (synchronous, no async needed for name-only).
   * Falls back to localized "Unknown Component" if the component is not found.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {string}
   */
  resolveComponentName(recipe, componentId) {
    if (!componentId) return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component) return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    return component.name || game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
  }

  /**
   * Resolve the display name for a managed component, resolving sourceUuid via fromUuid()
   * when the component has one. Falls back gracefully on broken references.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {Promise<string>}
   */
  async resolveComponentNameAsync(recipe, componentId) {
    if (!componentId) return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component) return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    if (component.sourceUuid && typeof fromUuid === 'function') {
      try {
        const item = await fromUuid(component.sourceUuid);
        if (item?.name) return item.name;
      } catch {
        // Broken reference — fall through to component.name
      }
    }
    return component.name || game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
  }

  /**
   * Resolve the icon image for a managed component.
   * Returns component.img if available, falls back to FALLBACK_COMPONENT_IMG.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {string}
   */
  resolveComponentImg(recipe, componentId) {
    if (!componentId) return FALLBACK_COMPONENT_IMG;
    const component = this._getComponent(recipe, componentId);
    if (!component) return FALLBACK_COMPONENT_IMG;
    return component.img || FALLBACK_COMPONENT_IMG;
  }

  /**
   * Resolve a result description using the component name.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @param {number} quantity
   * @returns {string}
   */
  resolveResultDescription(recipe, componentId, quantity = 1) {
    const name = this.resolveComponentName(recipe, componentId);
    return `${quantity}x ${name}`;
  }

  /**
   * Resolve the icon for a recipe (synchronous).
   * If the recipe has a non-default img, return it as-is.
   * Otherwise returns the recipe img (which may be the default bag icon).
   * For async resolution including linked item fallback, use resolveRecipeIconAsync().
   *
   * @param {Recipe} recipe
   * @returns {string}
   */
  resolveRecipeIcon(recipe) {
    const img = recipe?.img || DEFAULT_RECIPE_IMG;
    if (img && img !== DEFAULT_RECIPE_IMG) return img;
    // Synchronous path cannot reliably resolve recipe-item definitions — return the
    // fallback marker if async resolution may still produce a better icon.
    return img === DEFAULT_RECIPE_IMG ? FALLBACK_RECIPE_IMG : img;
  }

  /**
   * Resolve the icon for a recipe with full fallback chain (async).
   * Precedence:
   * 1. recipe.img if it is set AND is not the default bag icon
   * 2. recipeItemId -> recipe item definition -> resolved item.img
   * 3. linkedRecipeItemUuid → resolved item.img (legacy compatibility)
   * 3. FALLBACK_RECIPE_IMG
   *
   * @param {Recipe} recipe
   * @returns {Promise<string>}
   */
  async resolveRecipeIconAsync(recipe) {
    const img = recipe?.img || DEFAULT_RECIPE_IMG;
    if (img && img !== DEFAULT_RECIPE_IMG) return img;

    const systemManager = game?.fabricate?.getCraftingSystemManager?.();
    const recipeItemUuid = recipe?.recipeItemId
      ? systemManager?.getRecipeItemDefinition?.(recipe.craftingSystemId, recipe.recipeItemId)?.sourceItemUuid
      : null;
    const fallbackUuid = recipeItemUuid || recipe?.linkedRecipeItemUuid;

    if (fallbackUuid && typeof fromUuid === 'function') {
      try {
        const item = await fromUuid(fallbackUuid);
        if (item?.img) return item.img;
      } catch {
        // Broken reference — fall through
      }
    }

    return FALLBACK_RECIPE_IMG;
  }

  /**
   * Accumulate essences from all available items
   * @param {Item[]} items - Items to check
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items, recipe = null) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      multiplyByQuantity: true
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
    this._notifyRecipesChanged('import', { imported, skipped, total: recipesData.length });
    return { imported, skipped, total: recipesData.length };
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
    const signatureValidation = this._validateSignatures(recipe);
    errors.push(...signatureValidation.errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate that this recipe's ingredient signatures do not overlap with other recipes
   * in the same crafting system. Warns GMs of ambiguous crafting scenarios.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateSignatures(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return { valid: true, errors: [] };

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    if (!systemManager) return { valid: true, errors: [] };

    const csm = {
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem: (id) => this.getRecipes({ craftingSystemId: id }),
      getComponentsForSystem: (id) => {
        const system = systemManager.getSystem(id);
        if (!system) return [];
        return system.components || [];
      }
    };

    const validator = new SignatureValidator(csm);
    const result = validator.validateRecipe(recipe, systemId);
    const errors = result.conflicts.map(c => c.message);
    return { valid: errors.length === 0, errors };
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
