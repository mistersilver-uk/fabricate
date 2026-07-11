import { getFabricateFlag } from '../config/flags.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { matchGatheringTools, classifyGatheringToolStates } from '../gatheringToolRuntime.js';
import { getIngredientComponentId, getMatchHandler } from '../models/match/matchTypes.js';
import { DEFAULT_RECIPE_IMAGE, Recipe } from '../models/Recipe.js';
import { accumulateItemEssences } from '../utils/essenceResolver.js';
import {
  itemResolvesToComponent,
  itemResolvesToTool,
  itemIsToolByDurableIdentity,
} from '../utils/sourceUuid.js';

import { buildCurrencyAffordProbe } from './currencyAffordance.js';
import { SignatureValidator } from './SignatureValidator.js';
import { computeSystemVisibility } from './systemValidation.js';

const DEFAULT_RECIPE_IMG = DEFAULT_RECIPE_IMAGE;
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
    const recipesArray = [...this.recipes.values()].map((r) => r.toJSON());
    await setSetting(SETTING_KEYS.RECIPES, recipesArray);
  }

  /**
   * Re-read the persisted recipes setting into the in-memory map. Unlike
   * `initialize()` (which early-returns once initialized), this is the un-guarded
   * refresh path used when the replicated world setting changes on ANOTHER client —
   * the GM's save updates their own map directly, but a player's in-memory map only
   * catches up here. Does NOT persist, so it is safe to call from a settings hook
   * without a write loop.
   *
   * @returns {boolean} `true` only when the serialized recipes actually changed, so
   *   callers can skip re-emitting a change hook (and avoid a redundant refresh on
   *   the writing client, whose map already holds the saved data).
   */
  reload() {
    const serialize = (map) => JSON.stringify([...map.values()].map((r) => r.toJSON()));
    const before = serialize(this.recipes);
    const savedRecipes = getSetting(SETTING_KEYS.RECIPES) || [];
    const next = new Map();
    for (const recipeData of savedRecipes) {
      const recipe = Recipe.fromJSON(recipeData);
      next.set(recipe.id, recipe);
    }
    this.recipes = next;
    this.initialized = true;
    return before !== serialize(this.recipes);
  }

  _notifyRecipesChanged(action, details = {}) {
    globalThis.Hooks?.callAll?.('fabricate.recipesChanged', {
      action,
      recipes: this.getRecipes(),
      ...details,
    });
  }

  notifyRecipesChanged(details = {}) {
    this._notifyRecipesChanged(details.action || 'external', details);
  }

  /**
   * Create a new recipe
   * @param {Object} recipeData - Recipe configuration
   * @param {{notify?: boolean, allowIncomplete?: boolean}} [options] - Set notify=false for batch
   *   callers that emit their own summary. Set allowIncomplete=true to persist a structurally
   *   valid but incomplete authoring shell (missing ingredient sets / result groups); such a
   *   shell stays non-craftable because the engine gates on the full completeness contract.
   * @returns {Promise<Recipe>}
   */
  async createRecipe(recipeData, options = {}) {
    this._assertGM('create recipe');

    const recipe = new Recipe(recipeData);
    const validation = this._validateRecipeForPersistence(recipe, {
      requireComplete: !options.allowIncomplete,
    });

    if (!validation.valid) {
      throw new Error(`Invalid recipe: ${validation.errors.join(', ')}`);
    }

    // A recipe may only be created active when fully valid. A drafting create (allowIncomplete) is
    // not an enable action, so an invalid draft is born disabled; a strict create that explicitly
    // asks for an active recipe is rejected so the caller fixes it first.
    if (recipe.enabled === true) {
      const activation = this._validateRecipeForActivation(recipe);
      if (!activation.valid) {
        if (options.allowIncomplete) {
          recipe.enabled = false;
        } else {
          throw new Error(`Cannot enable recipe "${recipe.name}": ${activation.errors.join(', ')}`);
        }
      }
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
   * @param {{notify?: boolean, allowIncomplete?: boolean}} [options] - Set notify=false for batch
   *   callers that emit their own summary. Set allowIncomplete=true to persist a structurally
   *   valid but incomplete authoring shell (e.g. identity-only edits to a recipe whose
   *   ingredients/results are still empty); such a shell stays non-craftable.
   * @returns {Promise<Recipe>}
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
      id: recipeId,
    };
    const updatedRecipe = Recipe.fromJSON(merged);
    const validation = this._validateRecipeForPersistence(updatedRecipe, {
      requireComplete: !options.allowIncomplete,
    });

    if (!validation.valid) {
      throw new Error(`Invalid recipe update: ${validation.errors.join(', ')}`);
    }

    // Only an explicit transition into the enabled state requires full validity. Edits to an
    // already-enabled recipe (and any disable) persist on structural validity alone; the engine
    // still gates craftability and the alchemy signature re-check disables conflicts after deletes.
    if (updatedRecipe.enabled === true && recipe.enabled !== true) {
      const activation = this._validateRecipeForActivation(updatedRecipe);
      if (!activation.valid) {
        throw new Error(
          `Cannot enable recipe "${updatedRecipe.name}": ${activation.errors.join(', ')}`
        );
      }
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
   * @param {{notify?: boolean, emitChange?: boolean, cleanupFlags?: boolean}} [options]
   *   Set `notify=false` for batch callers that emit their own summary. Set
   *   `cleanupFlags=false` when a batch caller (e.g. `CraftingSystemManager.deleteSystem`)
   *   deletes many recipes and then runs its OWN single bulk actor-flag cleanup pass,
   *   so the per-recipe `_cleanupFlagsAfterRecipeMutation` fan-out (N recipes × M actors
   *   flag scans) is not repeated once per recipe.
   */
  async deleteRecipe(recipeId, options = {}) {
    this._assertGM('delete recipe');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    this.recipes.delete(recipeId);
    await this.save();
    if (options.cleanupFlags !== false) {
      await this._cleanupFlagsAfterRecipeMutation();
    }
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
    let recipes = [...this.recipes.values()];

    // Filter by category
    if (filters.category) {
      recipes = recipes.filter((r) => r.category === filters.category);
    }

    // Filter by crafting system
    if (filters.craftingSystemId !== undefined) {
      recipes = recipes.filter((r) => r.craftingSystemId === filters.craftingSystemId);
    }

    // Filter by system
    if (filters.system) {
      recipes = recipes.filter((r) => (r.system || 'all') === 'all' || r.system === filters.system);
    }

    // Filter by enabled status
    if (filters.enabled !== undefined) {
      recipes = recipes.filter((r) => r.enabled === filters.enabled);
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      recipes = recipes.filter((r) => filters.tags.some((tag) => (r.tags || []).includes(tag)));
    }

    // Search by name
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      recipes = recipes.filter(
        (r) =>
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
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const recipes = this.getRecipes({ enabled: true });
    const available = [];

    // System-validity gate: a system with a `blocks: 'system'` issue exposes NO
    // recipes to non-GM users (the crafting guard then has nothing to start). GMs
    // bypass the gate so they can still reach a broken system to fix it. The
    // per-system blocker decision is computed at most once per listing call
    // (cached by system id), NOT a full overview rebuild — this is a synchronous
    // per-render read.
    const isGM = game.user?.isGM === true;
    const blockedSystemCache = new Map();

    for (const recipe of recipes) {
      if (!isGM && this._isSystemBlockedForRecipes(recipe.craftingSystemId, blockedSystemCache)) {
        continue;
      }
      if (this.canCraft(sourceActors, recipe).canCraft) {
        available.push(recipe);
      }
    }

    return available;
  }

  /**
   * Whether a system is hidden by a `blocks: 'system'` validation issue. Cached
   * per listing call so a multi-recipe system is evaluated once. Returns false
   * (fail-open) when the system or validation collaborators are unavailable, so a
   * missing manager never blanks a player's recipe list. GM bypass is the
   * caller's concern.
   *
   * @param {string|null|undefined} systemId
   * @param {Map<string, boolean>} cache Per-call blocker cache, keyed by system id.
   * @returns {boolean}
   * @private
   */
  _isSystemBlockedForRecipes(systemId, cache) {
    if (!systemId) return false;
    if (cache.has(systemId)) return cache.get(systemId);

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem?.(systemId);
    if (!system) {
      cache.set(systemId, false);
      return false;
    }

    const { blocksSystem } = computeSystemVisibility(system, {
      recipes: this.getRecipes({ craftingSystemId: systemId }),
      components: system.components || [],
    });
    cache.set(systemId, blocksSystem === true);
    return blocksSystem === true;
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
   * @param {object|null} [options.craftingActor] - the actor whose currency funds a
   *   currency-alternative group. The display probe is bound to this actor so the
   *   craftability shown to a player agrees with what the engine spends. Defaults to
   *   `null`, which makes every currency option show as missing (no crash).
   * @param {Function} [options.resolveComponent] - Optional component resolver injected
   *   on the alchemy craft path (issue 578) so a tier-4-only submission satisfies the
   *   ingredient and essence checks against the same component the collector bucketed it
   *   to. Defaults (undefined) to the shared resolvers used by standard crafting and
   *   every display caller — byte-for-byte unchanged.
   * @returns {{
   *   canCraft: boolean,
   *   satisfiableSet: IngredientSet|null,
   *   missing: { ingredients: Array, essences: Array, tools: Array },
   *   ingredientStates: Array<{ description: string, need: number, have: number, satisfied: boolean }>,
   *   essenceStates: Array<{ type: string, need: number, have: number, satisfied: boolean }>,
   *   toolStates: Array<{ name: string, img: string|null, available: boolean, virtual?: boolean }>
   * }}
   */
  evaluateCraftability(
    componentSourceActors,
    recipe,
    { presentTools = null, craftingActor = null, resolveComponent } = {}
  ) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const emptyResult = {
      canCraft: false,
      satisfiableSet: null,
      missing: { ingredients: [], essences: [], tools: [] },
      ingredientStates: [],
      essenceStates: [],
      toolStates: [],
    };

    if (sourceActors.length === 0) {
      return emptyResult;
    }

    // Guard against multi-step recipes where ingredientSets is empty.
    if (recipe.ingredientSets.length === 0) {
      return emptyResult;
    }

    // Aggregate all items from component source actors once.
    const availableItems = sourceActors.flatMap((actor) => [...actor.items]);

    const features = this._getSystemFeatures(recipe);

    // Bind the currency affordability probe to the crafting actor so a currency
    // alternative is selectable in the display exactly when the engine could spend
    // it. A null actor yields a probe that is always false (currency shows missing).
    const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe);

    // Attempt to find a satisfiable ingredient set.
    // We capture both the satisfiable set (if any) and the first-set result for
    // the fallback display path.
    let satisfiableSet = null;
    let satisfiableSetSelection = null;

    // Also keep the first-set selection for the "unsatisfied" display fallback.
    let firstSetSelection = null;
    const firstSet = recipe.ingredientSets[0];

    for (const ingredientSet of recipe.ingredientSets) {
      const selection =
        typeof ingredientSet.resolveIngredientSelection === 'function'
          ? ingredientSet.resolveIngredientSelection(
              availableItems,
              (ingredient, item) =>
                this.ingredientMatchesItem(recipe, ingredient, item, resolveComponent),
              { affordCurrency }
            )
          : {
              success: true,
              missingGroups: [],
              selectedIngredients: [],
              plan: [],
              currencySpends: [],
            };

      // Track the first set's selection for the unsatisfied fallback display.
      if (firstSetSelection === null) {
        firstSetSelection = selection;
      }

      // Check essences for this set.
      let essencesMet = true;
      if (features.enableEssences && Object.keys(ingredientSet.essences || {}).length > 0) {
        const accumulatedEssences = this._accumulateEssences(
          availableItems,
          recipe,
          resolveComponent
        );
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
      recipe,
      displayIngredientSet,
      displaySelection,
      availableItems
    );

    // Build essence states from the display set.
    const essenceStates = this._buildEssenceStates(
      recipe,
      displayIngredientSet,
      availableItems,
      features
    );

    // Build the missing object (for backward compatibility with canCraft() callers).
    const missingIngredients = [];
    for (const groupMissing of displaySelection?.missingGroups || []) {
      const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
      if (!ingredient) continue;
      missingIngredients.push({
        ingredient,
        have: Number(groupMissing.have || 0),
        need: Number(groupMissing.need || ingredient.quantity || 1),
      });
    }
    const missingEssences = essenceStates
      .filter((s) => !s.satisfied)
      .map((s) => ({
        type: s.type,
        have: s.have,
        need: s.need,
      }));

    return {
      canCraft,
      satisfiableSet: canCraft ? satisfiableSet : null,
      missing: {
        ingredients: canCraft ? [] : missingIngredients,
        essences: canCraft ? [] : missingEssences,
        tools: missingTools,
      },
      ingredientStates,
      essenceStates,
      toolStates,
    };
  }

  /**
   * The material requirement to craft a recipe ONCE via ANY ingredient set, for the
   * shopping list. Unlike {@link evaluateCraftability} (which reports a single
   * chosen set), this unions every set: per component / per essence the `need` is
   * the MAXIMUM across sets, and tools are the union of every set's tools. That is
   * exactly enough to craft the recipe once whichever set the player picks — NOT
   * enough to craft every set at once.
   *
   * Same `{ ingredientStates, essenceStates, toolStates }` shape as
   * evaluateCraftability (with `have` re-derived against the merged max `need`), so
   * the shopping aggregator consumes it identically.
   *
   * @param {Actor[]} componentSourceActors
   * @param {Recipe} recipe
   * @param {object} [options]
   * @param {object|null} [options.craftingActor]
   * @returns {{ ingredientStates: Array, essenceStates: Array, toolStates: Array }}
   */
  evaluateShoppingRequirement(componentSourceActors, recipe, { craftingActor = null } = {}) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    const empty = { ingredientStates: [], essenceStates: [], toolStates: [] };
    if (sourceActors.length === 0 || !Array.isArray(recipe?.ingredientSets)) return empty;
    if (recipe.ingredientSets.length === 0) return empty;

    const availableItems = sourceActors.flatMap((actor) => [...actor.items]);
    const features = this._getSystemFeatures(recipe);
    const affordCurrency = buildCurrencyAffordProbe(craftingActor, recipe);

    const ingredientByKey = new Map();
    const essenceByType = new Map();
    const toolByKey = new Map();

    for (const set of recipe.ingredientSets) {
      const selection =
        typeof set.resolveIngredientSelection === 'function'
          ? set.resolveIngredientSelection(
              availableItems,
              (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item),
              { affordCurrency }
            )
          : {
              success: true,
              missingGroups: [],
              selectedIngredients: [],
              plan: [],
              currencySpends: [],
            };

      // Keep the highest-need state per component (need = worst-case single set).
      for (const state of this._buildIngredientStates(recipe, set, selection, availableItems)) {
        const key = state.componentId ?? state.description ?? state.name;
        const existing = ingredientByKey.get(key);
        if (!existing || (state.need ?? 0) > (existing.need ?? 0)) {
          ingredientByKey.set(key, { ...state });
        }
      }

      for (const essence of this._buildEssenceStates(recipe, set, availableItems, features)) {
        const existing = essenceByType.get(essence.type);
        if (!existing || (essence.need ?? 0) > (existing.need ?? 0)) {
          essenceByType.set(essence.type, { ...essence });
        }
      }

      // A tool is needed if ANY set requires it; prefer an unavailable/repair reading.
      const toolStates = this._buildToolStates(
        recipe,
        this.getToolsForSet(recipe, set),
        availableItems,
        null
      );
      for (const tool of toolStates) {
        const key = tool.componentId ?? tool.name;
        const existing = toolByKey.get(key);
        if (!existing || (existing.available === true && tool.available !== true)) {
          toolByKey.set(key, tool);
        }
      }
    }

    // Re-derive satisfaction against the merged max need.
    const ingredientStates = [...ingredientByKey.values()].map((state) => ({
      ...state,
      satisfied: (state.have ?? 0) >= (state.need ?? 0),
    }));
    const essenceStates = [...essenceByType.values()].map((essence) => ({
      ...essence,
      satisfied: (essence.have ?? 0) >= (essence.need ?? 0),
    }));

    return { ingredientStates, essenceStates, toolStates: [...toolByKey.values()] };
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
    const matchArgs = {
      actor: { items: availableItems },
      system: { id: recipe?.craftingSystemId ?? null },
      task: { id: recipe?.id ?? null, craftingSystemId: recipe?.craftingSystemId ?? null },
      tools,
      craftingSystemManager: { recipeManager: this },
      presentTools,
    };
    const matched = matchGatheringTools(matchArgs);
    // The same matcher, split into present/damaged/missing so the UI can show
    // "Repair" (present-but-broken) vs "Acquire" (absent) — `matched` alone
    // collapses both broken and absent into unavailable.
    const stateByTool = new Map(
      classifyGatheringToolStates(matchArgs).map((entry) => [entry.tool, entry.state])
    );
    // Index by tool so the per-tool state can carry the virtual flag (a
    // virtual-present match has no owned item and must be excluded from
    // breakage/usage by the caller).
    const matchedByTool = new Map(matched.items.map((entry) => [entry.tool, entry]));
    return tools.map((tool) => {
      const entry = matchedByTool.get(tool) ?? null;
      const toolId = tool?.componentId || tool?.systemItemId;
      const state = {
        name: this.resolveComponentName(recipe, toolId),
        img: this.resolveComponentImg(recipe, toolId),
        available: entry !== null,
        needsRepair: stateByTool.get(tool) === 'damaged',
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
   * @returns {Array<{ componentId: string|null, name: string, img: string|null, description: string, need: number, have: number, satisfied: boolean }>}
   * @private
   */
  _buildIngredientStates(recipe, ingredientSet, selection, availableItems) {
    if (!ingredientSet) return [];

    const groups =
      Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
        ? ingredientSet.ingredientGroups
        : (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));

    // Build a set of missing group IDs for O(1) lookup.
    const missingGroupIds = new Set(
      (selection?.missingGroups || []).map((mg) => mg?.group?.id).filter(Boolean)
    );

    return groups.map((group) => {
      const options = group.options || [];

      // Check whether any option in this group is satisfied.
      // We use the selectedIngredients from the selection to determine which option was chosen,
      // then compute have/need from the actual available items using the same matcher.
      //
      // For missing groups, report the best-effort have/need from the missingGroups data.
      const isMissing = missingGroupIds.has(group.id);

      if (isMissing) {
        // Find this group's missing data.
        const missingEntry = (selection?.missingGroups || []).find(
          (mg) => mg?.group?.id === group.id
        );
        const ingredient = missingEntry?.ingredient || options[0] || null;
        const description =
          this._resolveIngredientDescription(recipe, ingredient) ||
          options.map((o) => this._resolveIngredientDescription(recipe, o) || '').join(' OR ');
        const visual = this._resolveIngredientVisual(recipe, ingredient);
        return {
          ...visual,
          description,
          need: Number(missingEntry?.need || ingredient?.quantity || 1),
          have: Number(missingEntry?.have || 0),
          satisfied: false,
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
      const optionStates = options.map((ing) => {
        const matchingItems = availableItems.filter((item) =>
          this.ingredientMatchesItem(recipe, ing, item)
        );
        const totalQty = matchingItems.reduce((sum, item) => sum + (item.system?.quantity || 1), 0);
        return {
          ingredient: ing,
          description: this._resolveIngredientDescription(recipe, ing) || '',
          need: ing.quantity,
          have: totalQty,
          satisfied: totalQty >= ing.quantity,
        };
      });

      const satisfiedOption = optionStates.find((s) => s.satisfied) || optionStates[0];
      const visual = this._resolveIngredientVisual(
        recipe,
        satisfiedOption?.ingredient || options[0]
      );
      return {
        ...visual,
        description: optionStates.map((s) => s.description).join(' OR '),
        need: satisfiedOption?.need || 1,
        have: satisfiedOption?.have || 0,
        satisfied: true,
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
   * Resolve the tile visuals (component id, display name, icon image) for an
   * ingredient, so the player detail can render an image grid. Component-typed
   * matches resolve through the managed component library; anything else falls
   * back to a null image (the UI thumbnail then shows its default) and the
   * ingredient's own description as the name.
   *
   * @param {Recipe} recipe
   * @param {Ingredient|null} ingredient
   * @returns {{ componentId: string|null, name: string, img: string|null }}
   * @private
   */
  _resolveIngredientVisual(recipe, ingredient) {
    const match = ingredient?.match || null;
    if (match?.type === 'component' && match.componentId) {
      return {
        componentId: match.componentId,
        name: this.resolveComponentName(recipe, match.componentId),
        img: this.resolveComponentImg(recipe, match.componentId),
      };
    }
    return { componentId: null, name: ingredient?.getDescription?.() || '', img: null };
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
      const definition = this._resolveEssenceDefinition(recipe, type);
      const name = definition?.name;
      const icon = definition?.icon;
      return {
        type,
        name: typeof name === 'string' && name.trim() ? name : String(type ?? ''),
        icon: typeof icon === 'string' && icon.trim() ? icon : null,
        need,
        have,
        satisfied: have >= need,
      };
    });
  }

  /**
   * Resolve an essence's definition (`{ id, name, icon, … }`) from its system's
   * essence library, or null when no definition matches.
   * @private
   */
  _resolveEssenceDefinition(recipe, type) {
    const systemId = recipe?.craftingSystemId;
    const system = systemId
      ? game.fabricate?.getCraftingSystemManager?.()?.getSystem(systemId)
      : null;
    const definitions = Array.isArray(system?.essenceDefinitions) ? system.essenceDefinitions : [];
    return definitions.find((def) => def?.id === type) ?? null;
  }

  /**
   * Resolve an essence's display label from the system's essence definitions,
   * falling back to the raw type id when no definition/name is configured.
   * @private
   */
  _resolveEssenceName(recipe, type) {
    const name = this._resolveEssenceDefinition(recipe, type)?.name;
    return typeof name === 'string' && name.trim() ? name : String(type ?? '');
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
   * @param {object|null} [options.craftingActor] - actor whose currency funds a
   *   currency-alternative group (see evaluateCraftability). Defaults to `null`.
   * @param {Function} [options.resolveComponent] - Optional component resolver injected
   *   on the alchemy craft path (issue 578); defaults (undefined) to the standard-craft
   *   resolvers (see evaluateCraftability).
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
  canCraft(
    componentSourceActors,
    recipe,
    { presentTools = null, craftingActor = null, resolveComponent } = {}
  ) {
    const sourceActors = Array.isArray(componentSourceActors)
      ? componentSourceActors
      : componentSourceActors
        ? [componentSourceActors]
        : [];

    if (sourceActors.length === 0) {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: { ingredients: [], essences: [], tools: [] },
      };
    }

    const { canCraft, satisfiableSet, missing } = this.evaluateCraftability(sourceActors, recipe, {
      presentTools,
      craftingActor,
      resolveComponent,
    });
    return { canCraft, satisfiableSet, missing };
  }

  /**
   * Check if an ingredient set can be satisfied with available items.
   *
   * Deliberately currency-BLIND: it passes no `affordCurrency` probe, so a currency
   * alternative never satisfies a group here. This helper does not feed the
   * craftability decision (that runs through {@link evaluateCraftability}, which is
   * actor-bound and currency-aware); it is an item/essence-only completeness check,
   * so threading the actor probe through it would add nothing.
   *
   * @param {IngredientSet} ingredientSet - The ingredient set to check
   * @param {Item[]} availableItems - Items available for crafting
   * @returns {{ingredients: Array, essences: Array}}
   * @private
   */
  _checkIngredientSet(recipe, ingredientSet, availableItems) {
    const missing = {
      ingredients: [],
      essences: [],
    };
    const features = this._getSystemFeatures(recipe);
    const selection =
      typeof ingredientSet.resolveIngredientSelection === 'function'
        ? ingredientSet.resolveIngredientSelection(availableItems, (ingredient, item) =>
            this.ingredientMatchesItem(recipe, ingredient, item)
          )
        : { success: true, missingGroups: [] };

    if (!selection.success) {
      for (const groupMissing of selection.missingGroups || []) {
        const ingredient = groupMissing?.ingredient || groupMissing?.group?.options?.[0] || null;
        if (!ingredient) continue;
        missing.ingredients.push({
          ingredient,
          have: Number(groupMissing.have || 0),
          need: Number(groupMissing.need || ingredient.quantity || 1),
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
            need: requiredQty,
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
      ...(Array.isArray(ingredientSet?.toolIds) ? ingredientSet.toolIds : []),
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
    return (system.tools || []).find((tool) => tool?.id === toolId) || null;
  }

  /**
   * Check whether a concrete item satisfies a recipe ingredient
   * @param {Recipe} recipe
   * @param {Ingredient} ingredient
   * @param {Item} item
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only submission resolves to the same
   *   component the collector bucketed it to. Defaults (undefined) to the shared
   *   {@link resolveComponentForItem} used by standard crafting — byte-for-byte unchanged.
   * @returns {boolean}
   */
  ingredientMatchesItem(recipe, ingredient, item, resolveComponent) {
    const features = this._getSystemFeatures(recipe);
    // A component (or legacy systemItem) match resolves its id via the handler;
    // tags/currency/no-match return null and fall to the bare-field fallback,
    // then on to `_matchesIngredient`.
    const componentId = getIngredientComponentId(ingredient);

    if (componentId) {
      const managedItem = this._getComponent(recipe, componentId);
      if (!managedItem) return false;

      if (
        itemResolvesToComponent(
          item,
          managedItem,
          this._getSystemComponents(recipe),
          recipe?.craftingSystemId,
          resolveComponent
        )
      )
        return true;

      // Source-UUID matching failed — fall back to an exact (case-insensitive) name
      // match, even when the component carries a registeredItemUuid. Foundry's transitive
      // `_stats.duplicateSource` points at the ORIGINAL template rather than the
      // component's own source item, so an inventory copy of a component that was
      // built by copying another item as a template (a common GM workflow) has no
      // ref back to the component's source and would otherwise never match despite
      // being the right, identically-named component.
      const byName = managedItem.name
        ? item.name?.toLowerCase() === managedItem.name.toLowerCase()
        : false;
      if (!byName) return false;
    } else if (!this._matchesIngredient(ingredient, item, features)) {
      return false;
    }

    return true;
  }

  /**
   * Check whether a concrete item satisfies a Tool's PRESENCE requirement — the wide,
   * non-destructive gate (issue 561). A first-class Tool carries its OWN source references,
   * so the owned item is resolved against the system's Tools library directly (durable
   * `roles[systemId].toolId` first, then source-ref intersection) — NOT through a managed
   * component. It falls back to an exact, case-insensitive match on the tool's snapshot name
   * (the linked component's name for a migrated componentId-tool), so an un-restamped
   * template copy still satisfies presence.
   *
   * @param {Recipe} recipe
   * @param {object} tool - A first-class library Tool
   * @param {Item} item
   * @returns {boolean}
   */
  toolMatchesItem(recipe, tool, item) {
    if (!tool) return false;
    const tools = this._getSystemTools(recipe);
    if (itemResolvesToTool(item, tool, tools, recipe?.craftingSystemId)) return true;
    // Snapshot-name fallback (presence only, never destructive): the item-sourced tool's
    // own snapshot name, or the linked component's name for a migrated componentId-tool.
    const fallbackName =
      tool.name || this._getComponent(recipe, tool.componentId || tool.systemItemId)?.name || '';
    if (!fallbackName) return false;
    return item?.name?.toLowerCase() === fallbackName.toLowerCase();
  }

  /**
   * Whether an owned item may be selected for a Tool's **usage or breakage** — the narrow
   * durable-identity gate (issue 561, superseding the component-scoped #557 gate). Delegates
   * to {@link itemIsToolByDurableIdentity}, which accepts ONLY the tool's own durable
   * identity (`roles[systemId].toolId`) or the item's own uuid/compendium source — never a
   * transitive `_stats.duplicateSource` reference and never a name fallback.
   *
   * This is the destructive-path counterpart to the wide {@link toolMatchesItem} presence
   * matcher: an item that satisfies presence only by duplicate-source or name is NOT
   * selected to be consumed or destroyed.
   *
   * @param {Recipe} recipe
   * @param {object} tool - A first-class library Tool
   * @param {Item} item
   * @returns {boolean}
   */
  toolMatchesItemByIdentity(recipe, tool, item) {
    if (!tool || tool.id == null) return false;
    return itemIsToolByDurableIdentity(
      item,
      tool,
      this._getSystemTools(recipe),
      recipe?.craftingSystemId
    );
  }

  _matchesIngredient(ingredient, item, features) {
    if (ingredient.itemUuid && item.uuid === ingredient.itemUuid) return true;

    // Dispatch ONLY for terminal match types — they fully decide the result off
    // the match object. A `component`/null/unknown match is non-terminal and
    // falls through to the legacy bare-field `ingredient.tag` block and the
    // `ingredient.alternatives` recursion below, which key off bare
    // `ingredient.*` fields, not the match (so a `{type:'component'}` ingredient
    // with `alternatives` still recurses into them). The handler declares its own
    // terminality (tags/currency → true; component/unknown → false).
    const handler = getMatchHandler(ingredient.match);
    if (handler.isTerminalInventoryMatch) {
      return handler.matchesItem(ingredient.match, item, { features });
    }

    if (ingredient.tag) {
      if (!features.enableTags) return false;
      const itemTags = getFabricateFlag(item, 'tags', []);
      if (!itemTags.includes(ingredient.tag)) return false;
      return true;
    }

    if (Array.isArray(ingredient.alternatives) && ingredient.alternatives.length > 0) {
      return ingredient.alternatives.some((alt) => this._matchesIngredient(alt, item, features));
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
      enableEssences: features.essences === true,
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
    return (system.components || []).find((item) => item.id === componentId) || null;
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
    if (!componentId)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    return (
      component.name ||
      game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') ||
      'Unknown Component'
    );
  }

  /**
   * Resolve the display name for a managed component, resolving registeredItemUuid via fromUuid()
   * when the component has one. Falls back gracefully on broken references.
   *
   * @param {Recipe} recipe
   * @param {string|null} componentId
   * @returns {Promise<string>}
   */
  async resolveComponentNameAsync(recipe, componentId) {
    if (!componentId)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    const component = this._getComponent(recipe, componentId);
    if (!component)
      return game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') || 'Unknown Component';
    if (component.registeredItemUuid && typeof fromUuid === 'function') {
      try {
        const item = await fromUuid(component.registeredItemUuid);
        if (item?.name) return item.name;
      } catch {
        // Broken reference — fall through to component.name
      }
    }
    return (
      component.name ||
      game.i18n?.localize?.('FABRICATE.Labels.UnknownComponent') ||
      'Unknown Component'
    );
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
      ? systemManager?.getRecipeItemDefinition?.(recipe.craftingSystemId, recipe.recipeItemId)
          ?.originItemUuid
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
  _accumulateEssences(items, recipe = null, resolveComponent) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      systemId: recipe?.craftingSystemId,
      multiplyByQuantity: true,
      resolveComponent,
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
   * Resolve the first-class Tools library for a recipe's crafting system (issue 561),
   * mirroring {@link _getSystemComponents}. The single source of truth the tool matchers
   * resolve owned items against.
   * @private
   */
  _getSystemTools(recipe) {
    const systemId = recipe?.craftingSystemId;
    if (!systemId) return [];
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    return Array.isArray(system?.tools) ? system.tools : [];
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
      const validation = this._validateRecipeForActivation(recipe);

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

    const recipes = recipeIds
      ? recipeIds.map((id) => this.recipes.get(id)).filter(Boolean)
      : [...this.recipes.values()];

    return recipes.map((r) => r.toJSON());
  }

  /**
   * Validate recipe core rules and system-specific essence references
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  /**
   * Validation required to *persist* a recipe. Structural/completeness integrity (per
   * {@link Recipe#validate}/{@link Recipe#validateStructure}) plus essence, tag-placeholder, and
   * resolution-mode reference checks. Signature uniqueness is intentionally excluded — a signature
   * conflict never blocks persistence; it only blocks activation (see
   * {@link RecipeManager#_validateRecipeForActivation}).
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateRecipeForPersistence(recipe, { requireComplete = true } = {}) {
    const baseValidation = requireComplete ? recipe.validate() : recipe.validateStructure();
    const errors = [...(baseValidation.errors || [])];

    const systemValidation = this._validateEssenceReferences(recipe);
    errors.push(...systemValidation.errors);
    const tagValidation = this._validateTagPlaceholders(recipe);
    errors.push(...tagValidation.errors);
    const modeValidation = this._validateResolutionMode(recipe, { requireComplete });
    errors.push(...modeValidation.errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Full validity required to *activate* a recipe (set `enabled === true`): completeness plus all
   * persistence checks plus signature uniqueness. A recipe may be persisted while invalid, but may
   * only be enabled when this passes.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[]}}
   * @private
   */
  _validateRecipeForActivation(recipe) {
    const persistence = this._validateRecipeForPersistence(recipe, { requireComplete: true });
    const errors = [...persistence.errors];
    const signatureValidation = this._validateSignatures(recipe);
    errors.push(...signatureValidation.errors);

    return {
      valid: errors.length === 0,
      errors,
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

    // Signature uniqueness only matters when the engine *infers* which recipe
    // the player is crafting from the submitted ingredients — i.e. alchemy
    // mode (see CraftingEngine._matchAlchemySignature). In every selected-recipe
    // mode (simple/mapped/tiered/routed/progressive) the player picks the recipe
    // explicitly, so shared base materials — iron+wood → axe OR spear OR shield —
    // are never ambiguous. Enforcing overlap there is stricter than the runtime
    // that depends on it and rejects perfectly valid recipes.
    const system = systemManager.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return { valid: true, errors: [] };

    const csm = {
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem: (id) => this.getRecipes({ craftingSystemId: id }),
      getComponentsForSystem: (id) => {
        const system = systemManager.getSystem(id);
        if (!system) return [];
        return system.components || [];
      },
    };

    const validator = new SignatureValidator(csm);
    const result = validator.validateRecipe(recipe, systemId);
    const errors = result.conflicts.map((c) => c.message);
    return { valid: errors.length === 0, errors };
  }

  /**
   * In an alchemy system, disable every currently-enabled recipe that participates in any ingredient
   * signature conflict. Used to reconcile recipes after an essence/component deletion changes
   * signatures. No-op for non-alchemy systems.
   * @param {string} systemId
   * @returns {Promise<Array<{id: string, name: string}>>} the recipes that were disabled
   */
  async disableSignatureConflicts(systemId) {
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (system?.resolutionMode !== 'alchemy') return [];

    const validator = new SignatureValidator({
      getSystem: (id) => systemManager.getSystem(id),
      getRecipesForSystem: (id) => this.getRecipes({ craftingSystemId: id }),
      getComponentsForSystem: (id) => systemManager.getSystem(id)?.components || [],
    });

    const { conflicts } = validator.validateSystem(systemId);
    const conflictIds = new Set();
    for (const conflict of conflicts) {
      conflictIds.add(conflict.recipeA.id);
      conflictIds.add(conflict.recipeB.id);
    }

    const disabled = [];
    for (const id of conflictIds) {
      const recipe = this.recipes.get(id);
      if (recipe?.enabled === true) {
        recipe.enabled = false;
        disabled.push({ id, name: recipe.name });
      }
    }

    if (disabled.length > 0) {
      await this.save();
      this._notifyRecipesChanged('update', {
        disabledForSignatureConflict: disabled.map((d) => d.id),
      });
    }

    return disabled;
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

    const features = system.features || {};
    const essencesEnabled = features.essences === true || system.enableEssences === true;
    if (!essencesEnabled) {
      return { valid: true, errors };
    }

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const validEssenceIds = new Set(definitions.map((def) => def.id));

    for (const set of recipe.ingredientSets || []) {
      for (const [essenceId, qty] of Object.entries(set.essences || {})) {
        if (!validEssenceIds.has(essenceId)) {
          errors.push(
            `Ingredient set "${set.name || set.id}" references unknown essence "${essenceId}"`
          );
        }
        const num = Number(qty);
        if (!Number.isFinite(num) || num <= 0) {
          errors.push(
            `Ingredient set "${set.name || set.id}" has invalid quantity for essence "${essenceId}"`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  _validateResolutionMode(recipe, { requireComplete = true } = {}) {
    const modeService = game.fabricate?.getResolutionModeService?.();
    if (!modeService) {
      return { valid: true, errors: [] };
    }
    return modeService.validateRecipe(recipe, { requireComplete });
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

    const validTags = new Set(
      [
        ...(system.itemTags || []).map((tag) => String(tag || '').trim()),
        ...(system.tags || []).map((tag) => String(tag || '').trim()),
      ].filter(Boolean)
    );

    const steps =
      typeof recipe.getExecutionSteps === 'function'
        ? recipe.getExecutionSteps()
        : [{ id: 'implicit', ingredientSets: recipe.ingredientSets || [] }];
    for (const step of steps) {
      for (const ingredientSet of step.ingredientSets || []) {
        const groups =
          Array.isArray(ingredientSet.ingredientGroups) && ingredientSet.ingredientGroups.length > 0
            ? ingredientSet.ingredientGroups
            : (ingredientSet.ingredients || []).map((ingredient) => ({ options: [ingredient] }));

        for (const group of groups) {
          for (const option of group.options || []) {
            const match = option.match || null;
            if (getMatchHandler(match).type !== 'tags') continue;
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
      errors,
    };
  }

  async _cleanupFlagsAfterRecipeMutation() {
    const runManager = game.fabricate?.getCraftingRunManager?.();
    const visibilityService = game.fabricate?.getRecipeVisibilityService?.();
    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    if (!runManager && !visibilityService) return;

    const validRecipes = new Set(this.getRecipes({}).map((r) => r.id));
    const validSystems = new Set((systemManager?.getSystems?.() || []).map((s) => s.id));
    if (runManager) {
      await runManager.cleanupInvalidRuns(validRecipes, validSystems);
    }
    if (visibilityService) {
      await visibilityService.cleanupLearnedRecipes(validRecipes);
    }
  }
}
