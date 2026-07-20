import { getFabricateFlag } from '../config/flags.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { matchGatheringTools, classifyGatheringToolStates } from '../gatheringToolRuntime.js';
import { getIngredientComponentId, getMatchHandler } from '../models/match/matchTypes.js';
import { DEFAULT_RECIPE_IMAGE, Recipe } from '../models/Recipe.js';
import { matchComponentByName } from '../utils/componentNameMatch.js';
import {
  accumulateItemEssences,
  findMatchingComponent,
  resolveItemEssences,
} from '../utils/essenceResolver.js';
import { buildRecipeActivationIssue } from '../utils/recipeActivationMessages.js';
import {
  itemResolvesToComponent,
  itemResolvesToTool,
  itemIsToolByDurableIdentity,
} from '../utils/sourceUuid.js';

import { buildCurrencyAffordProbe, getCurrencyRequirementConfig } from './currencyAffordance.js';
import { formatCurrencyRequirement, normalizeCurrencyUnit } from './currencyProfile.js';
import { RecipeActivationError } from './RecipeActivationError.js';
import { RecipePersistenceError } from './RecipePersistenceError.js';
import { SignatureValidator } from './SignatureValidator.js';
import { computeSystemVisibility } from './systemValidation.js';

const DEFAULT_RECIPE_IMG = DEFAULT_RECIPE_IMAGE;
const FALLBACK_RECIPE_IMG = 'icons/sundries/documents/document-bound-white-tan.webp';
const FALLBACK_COMPONENT_IMG = 'icons/svg/item-bag.svg';
// Match-kind fallback icons for ingredient tiles whose match carries no managed
// component id (issue 551). A tag match falls back to a generic item icon when
// nothing in inventory currently satisfies it; a currency match — which never
// resolves to an inventory item — always shows a coin icon.
const FALLBACK_TAG_IMG = 'icons/svg/item-bag.svg';
const FALLBACK_CURRENCY_IMG = 'icons/svg/coins.svg';
// An essence match never resolves to an inventory item (it is met by accumulating an
// essence across items), so its tile shows a generic aura image plus the essence
// definition's authored icon when one exists.
const FALLBACK_ESSENCE_IMG = 'icons/svg/aura.svg';

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
      // A structural/reference save failure carries coded, id-free issues so the UI
      // can localize it (issue 595); the `.message` keeps the headless English
      // aggregate for console/non-UI callers.
      throw new RecipePersistenceError('create', recipe.name, validation.issues);
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
          throw new RecipeActivationError(recipe.name, activation.issues);
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
      // See createRecipe: a coded, id-free persistence error the UI can localize
      // (issue 595) — e.g. an ingredient set mapping to a missing result group on an
      // ordinary save no longer leaks the set/group id into the toast.
      throw new RecipePersistenceError('update', updatedRecipe.name, validation.issues);
    }

    // Only an explicit transition into the enabled state requires full validity. Edits to an
    // already-enabled recipe (and any disable) persist on structural validity alone; the engine
    // still gates craftability and the alchemy signature re-check disables conflicts after deletes.
    if (updatedRecipe.enabled === true && recipe.enabled !== true) {
      const activation = this._validateRecipeForActivation(updatedRecipe);
      if (!activation.valid) {
        throw new RecipeActivationError(updatedRecipe.name, activation.issues);
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
   * @param {object|null} [options.optionOverrides] - Per-group player option overrides
   *   (issue 552), keyed by `group.id` → `{ optionIndex, heldItemId? }`. Threaded to
   *   `resolveIngredientSelection` so both this display path and the engine's
   *   consumption resolve the SAME chosen option/stack. Null (the default) keeps the
   *   first-satisfiable behaviour byte-for-byte unchanged.
   * @returns {{
   *   canCraft: boolean,
   *   satisfiableSet: IngredientSet|null,
   *   missing: { ingredients: Array, essences: Array, tools: Array },
   *   ingredientStates: Array<{ groupId: string|null, description: string, need: number, have: number, satisfied: boolean, hasChoice: boolean, choiceCount: number }>,
   *   ingredientChoices: Array<object>,
   *   essenceStates: Array<{ type: string, need: number, have: number, satisfied: boolean }>,
   *   toolStates: Array<{ name: string, img: string|null, available: boolean, virtual?: boolean }>
   * }}
   */
  evaluateCraftability(
    componentSourceActors,
    recipe,
    { presentTools = null, craftingActor = null, resolveComponent, optionOverrides = null } = {}
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

    // Resolve the recipe's currency units once so a currency option's cost row can
    // render a human label (abbreviation, else label) instead of the raw unit id.
    // Normalizing here (not the raw config units) applies the abbreviation self-heal
    // and works even when currency is disabled/invalid.
    const currencyUnits = this._resolveNormalizedCurrencyUnits(recipe);

    // Bind the component-aware essence resolver so an essence GROUP option can draw
    // down items carrying that essence (issue 649). Byte-for-byte for recipes with no
    // essence options; a capability increase for those that do.
    const resolveItemEssencesForSet = this._buildEssenceOptionResolver(recipe, resolveComponent);

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
              { affordCurrency, optionOverrides, resolveItemEssences: resolveItemEssencesForSet }
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

    // Per-group player-facing option/stack choices (issue 552). Empty unless a group
    // offers a real choice (multiple authored options, or a tag option matching more
    // than one held stack), so the common single-option case renders no selector.
    const ingredientChoices = this._buildIngredientChoices(
      recipe,
      displayIngredientSet,
      displaySelection,
      availableItems,
      optionOverrides,
      affordCurrency,
      currencyUnits
    );
    // Tag each ingredient state with whether its group has a choice + how many
    // alternatives, so the tile can show a discoverability badge next to it.
    const choiceCountByGroup = new Map();
    for (const choice of ingredientChoices) {
      const count = choice.kind === 'option' ? choice.options.length : choice.stacks.length;
      choiceCountByGroup.set(
        choice.groupId,
        Math.max(choiceCountByGroup.get(choice.groupId) ?? 0, count)
      );
    }
    for (const state of ingredientStates) {
      state.hasChoice = choiceCountByGroup.has(state.groupId);
      state.choiceCount = choiceCountByGroup.get(state.groupId) ?? 0;
    }

    // Build essence states from the display set. This readout is display-only and is
    // intentionally NOT threaded with the alchemy tier-4 resolver (issue 578): it is
    // harmless because `missing.essences` below is forced empty whenever canCraft is
    // true, and the alchemy workbench does not render this per-type essence-state list.
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
      ingredientChoices,
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
    const resolveItemEssencesForSet = this._buildEssenceOptionResolver(recipe);

    const ingredientByKey = new Map();
    const essenceByType = new Map();
    const toolByKey = new Map();

    for (const set of recipe.ingredientSets) {
      const selection =
        typeof set.resolveIngredientSelection === 'function'
          ? set.resolveIngredientSelection(
              availableItems,
              (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item),
              { affordCurrency, resolveItemEssences: resolveItemEssencesForSet }
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

    // Lazily accumulate held essences once (only when a satisfied essence tile needs
    // it), via the same component-aware `_accumulateEssences` path the resolver uses.
    let accumulatedEssences = null;
    const getAccumulatedEssences = () => {
      if (accumulatedEssences === null) {
        accumulatedEssences = this._accumulateEssences(availableItems, recipe);
      }
      return accumulatedEssences;
    };

    // The option the engine chose per group (issue 553), so the tile always mirrors
    // the option/stack the craft consumes.
    const chosenByGroup = this._chosenOptionByGroup(ingredientSet, selection);

    return groups.map((group) => {
      const options = group.options || [];
      const isMissing = missingGroupIds.has(group.id);
      const chosenOption = chosenByGroup.get(group?.id) ?? options[0] ?? null;
      // Show ONLY the chosen option's description (issue 552) instead of OR-joining
      // every option's name against a single unlabelled have/need pip — the tile now
      // names the specific option the craft will consume.
      const description =
        this._resolveIngredientDescription(recipe, chosenOption) ||
        options.map((o) => this._resolveIngredientDescription(recipe, o) || '').join(' OR ');

      if (isMissing) {
        const missingEntry = (selection?.missingGroups || []).find(
          (mg) => mg?.group?.id === group.id
        );
        const visual = this._resolveIngredientVisual(recipe, chosenOption, availableItems);
        return {
          ...visual,
          groupId: group?.id ?? null,
          description,
          need: Number(missingEntry?.need || chosenOption?.quantity || 1),
          have: Number(missingEntry?.have || 0),
          satisfied: false,
        };
      }

      // The specific inventory item the engine will consume for this option, from the
      // same consumption plan, so a shared tag/component tile shows the CONSUMED item
      // rather than the first inventory item that merely matches (issue 553).
      const consumedItem =
        (selection?.plan || []).find((entry) => entry.ingredient === chosenOption)?.item || null;

      const visual = this._resolveIngredientVisual(
        recipe,
        chosenOption,
        availableItems,
        consumedItem
      );

      // An essence option is amount-based, not occurrence-based: `ingredientMatchesItem`
      // returns false for it, so use the essence amount as `need` and the accumulated
      // essence for its id as `have` (the same component-aware `_accumulateEssences`
      // path the resolver consumes) — else a satisfied essence tile reads have 0 / need 1.
      if (chosenOption?.match?.type === 'essence') {
        const essenceId = String(chosenOption.match.essenceId || '').trim();
        const accumulated = getAccumulatedEssences();
        return {
          ...visual,
          groupId: group?.id ?? null,
          description,
          need: Math.max(0, Number(chosenOption.match.amount) || 0),
          have: accumulated[essenceId] || 0,
          satisfied: true,
        };
      }

      const matchingItems = availableItems.filter((item) =>
        this.ingredientMatchesItem(recipe, chosenOption, item)
      );
      const have = matchingItems.reduce((sum, item) => sum + (item.system?.quantity || 1), 0);
      return {
        ...visual,
        groupId: group?.id ?? null,
        description,
        need: Number(chosenOption?.quantity || 1),
        have,
        satisfied: true,
      };
    });
  }

  /**
   * Map each group id to the option the resolver chose for it. For a satisfied group
   * that is the pushed `selectedIngredients` entry (item or currency); for a missing
   * group it is the `missingGroups` representative option (the overridden or
   * best-effort short option). resolveIngredientSelection appends exactly ONE entry
   * to `selectedIngredients` per NON-missing group in group order, so satisfied
   * groups read their option by running index.
   * @private
   * @returns {Map<string, Ingredient|null>}
   */
  _chosenOptionByGroup(ingredientSet, selection) {
    const map = new Map();
    const groups = Array.isArray(ingredientSet?.ingredientGroups)
      ? ingredientSet.ingredientGroups
      : [];
    const missingIds = new Set(
      (selection?.missingGroups || []).map((mg) => mg?.group?.id).filter(Boolean)
    );
    let satisfiedIndex = 0;
    for (const group of groups) {
      if (missingIds.has(group?.id)) {
        const entry = (selection?.missingGroups || []).find((mg) => mg?.group?.id === group?.id);
        map.set(group?.id, entry?.ingredient ?? group?.options?.[0] ?? null);
      } else {
        map.set(
          group?.id,
          selection?.selectedIngredients?.[satisfiedIndex] ?? group?.options?.[0] ?? null
        );
        satisfiedIndex += 1;
      }
    }
    return map;
  }

  /**
   * Resolve the recipe's configured currency units into normalized units so a currency
   * option's cost row renders a human label. Normalizing (rather than reading the raw
   * config units) applies the abbreviation self-heal, so a legacy unit whose stored
   * abbreviation is its own generated id still resolves to its label.
   * @private
   * @returns {object[]}
   */
  _resolveNormalizedCurrencyUnits(recipe) {
    const units = getCurrencyRequirementConfig(recipe)?.units || [];
    return units.map((unit) => normalizeCurrencyUnit(unit)).filter(Boolean);
  }

  /**
   * Build the player-facing per-group option/stack choices (issue 552). Only groups
   * that offer a real choice appear: a MULTI-option group emits an `option`
   * radiogroup, and when the currently-chosen option is a tag matching MORE THAN ONE
   * held stack it also emits a `stack` radiogroup so the player can pick which held
   * item to consume. Single-option groups with no multi-stack tag emit nothing, so
   * the common case shows no selector.
   *
   * Each `option` carries `{ optionIndex, name, img, need, have, satisfied,
   * isCurrency, costLabel, affordable }` — an insufficient option is included
   * (selectable but flagged `satisfied: false`), matching the resolver, which
   * honours it and lets the craft block with the missing-materials message.
   *
   * @private
   * @returns {Array<object>}
   */
  _buildIngredientChoices(
    recipe,
    ingredientSet,
    selection,
    availableItems,
    optionOverrides,
    affordCurrency,
    currencyUnits = []
  ) {
    const groups = Array.isArray(ingredientSet?.ingredientGroups)
      ? ingredientSet.ingredientGroups
      : [];
    if (groups.length === 0) return [];

    const chosenByGroup = this._chosenOptionByGroup(ingredientSet, selection);
    const choices = [];

    for (const group of groups) {
      const options = group.options || [];
      if (options.length === 0) continue;
      const groupName =
        (typeof group.name === 'string' && group.name.trim()) ||
        this._defaultGroupName(recipe, options);
      const chosenOption = chosenByGroup.get(group?.id) ?? options[0] ?? null;
      let selectedOptionIndex = options.indexOf(chosenOption);
      if (selectedOptionIndex < 0) selectedOptionIndex = 0;

      if (options.length > 1) {
        choices.push({
          kind: 'option',
          groupId: group?.id ?? null,
          groupName,
          selectedOptionIndex,
          options: options.map((option, idx) =>
            this._buildOptionChoice(
              recipe,
              option,
              idx,
              availableItems,
              affordCurrency,
              currencyUnits
            )
          ),
        });
      }

      // Tag-stack sub-choice for the currently-selected option only.
      const selectedOption = options[selectedOptionIndex] ?? null;
      const stacks = this._heldStacksForTagOption(recipe, selectedOption, availableItems);
      if (stacks.length > 1) {
        const consumedItem =
          (selection?.plan || []).find((entry) => entry.ingredient === selectedOption)?.item ||
          null;
        const overrideHeldId = optionOverrides?.[group?.id]?.heldItemId ?? null;
        const selectedHeldItemId =
          overrideHeldId ?? (consumedItem?.uuid || consumedItem?.id) ?? stacks[0].itemId;
        choices.push({
          kind: 'stack',
          groupId: group?.id ?? null,
          groupName,
          optionIndex: selectedOptionIndex,
          selectedHeldItemId,
          stacks,
        });
      }
    }

    return choices;
  }

  /** Fallback group label when a group has no authored name. @private */
  _defaultGroupName(recipe, options) {
    const first = options?.[0] ?? null;
    return this._resolveIngredientDescription(recipe, first) || 'Alternatives';
  }

  /**
   * Build one option descriptor for the choices model. `have` is the raw total held
   * quantity matching the option across the full inventory (an isolated affordability
   * indicator per alternative, independent of the shared remaining-quantity pool).
   * @private
   */
  _buildOptionChoice(
    recipe,
    option,
    optionIndex,
    availableItems,
    affordCurrency,
    currencyUnits = []
  ) {
    const visual = this._resolveIngredientVisual(recipe, option, availableItems);
    const isCurrency = option?.match?.type === 'currency';
    if (isCurrency) {
      const handler = getMatchHandler(option.match);
      const spend = handler.isComplete(option.match)
        ? handler.getCurrencySpend(option.match)
        : null;
      const affordable = handler.affords(option.match, { affordCurrency });
      return {
        optionIndex,
        name: visual.name || this._resolveIngredientDescription(recipe, option),
        img: visual.img,
        need: spend?.amount ?? 0,
        have: 0,
        satisfied: affordable,
        isCurrency: true,
        costLabel: spend ? formatCurrencyRequirement(spend, currencyUnits) : '',
        affordable,
      };
    }
    const matchingItems = availableItems.filter((item) =>
      this.ingredientMatchesItem(recipe, option, item)
    );
    const have = matchingItems.reduce((sum, item) => sum + (item.system?.quantity || 1), 0);
    const need = Number(option?.quantity || 1);
    return {
      optionIndex,
      name: visual.name || this._resolveIngredientDescription(recipe, option),
      img: visual.img,
      need,
      have,
      satisfied: have >= need,
      isCurrency: false,
      costLabel: '',
      affordable: true,
    };
  }

  /**
   * The distinct held stacks a tag option matches, or `[]` when the option is not a
   * tag option (component/currency/exact-item options resolve to a single item and
   * offer no held-stack choice).
   * @private
   * @returns {Array<{ itemId: string, name: string, img: string|null, have: number }>}
   */
  _heldStacksForTagOption(recipe, option, availableItems) {
    if (option?.match?.type !== 'tags') return [];
    return (availableItems || [])
      .filter((item) => this.ingredientMatchesItem(recipe, option, item))
      .map((item) => ({
        itemId: item.uuid || item.id,
        name: item.name ?? '',
        img: item.img ?? null,
        have: Number(item.system?.quantity || 1),
      }));
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
    // Resolve the essence NAME (not the raw essenceId, which is a generated id) so an
    // essence option's tile reads "3x Fire essence" rather than "3x <uuid> essence"
    // (the issue-595 opaque-id class). The pure handler's describe stays generic.
    if (match?.type === 'essence' && match.essenceId) {
      const name = this._resolveEssenceName(recipe, match.essenceId);
      const amount = Math.max(0, Number(match.amount) || 0);
      return `${amount}x ${name} essence`;
    }
    return ingredient.getDescription?.() || '';
  }

  /**
   * Resolve the tile visuals (component id, display name, icon image) for an
   * ingredient, so the player detail can render an image grid. Component-typed
   * matches resolve through the managed component library. Tag- and currency-typed
   * matches carry no managed component id, so their image is resolved from a live
   * inventory item that satisfies the match (issue 551): a tag tile shows the img
   * of the first held item matching the tag, falling back to a generic tag icon
   * when nothing in inventory matches; a currency tile always shows a coin icon (currency never
   * resolves to an inventory item). Anything else falls back to a null image (the
   * UI thumbnail then shows its default) and the ingredient's own description.
   *
   * @param {Recipe} recipe
   * @param {Ingredient|null} ingredient
   * @param {Item[]} [availableItems] - live inventory used to resolve a tag tile's
   *   image from a satisfying item; defaults to none.
   * @param {Item|null} [consumedItem] - the specific inventory item the engine will
   *   actually consume for this option (from the resolved consumption plan). When
   *   supplied, a tag tile borrows THIS item's image so the tile matches the item
   *   the craft spends, not merely the first inventory item that shares the tag
   *   (issue 553). Falls back to the first tag-matching held item (issue 551).
   * @returns {{ componentId: string|null, name: string, img: string|null }}
   * @private
   */
  _resolveIngredientVisual(recipe, ingredient, availableItems = [], consumedItem = null) {
    const match = ingredient?.match || null;
    if (match?.type === 'component' && match.componentId) {
      return {
        componentId: match.componentId,
        name: this.resolveComponentName(recipe, match.componentId),
        img: this.resolveComponentImg(recipe, match.componentId),
      };
    }

    // An essence tile resolves its NAME + authored icon from the essence definition
    // (never the raw essenceId) and shows a generic aura image, mirroring the
    // currency tile's coin fallback. The FA `icon` class is carried alongside so a
    // tile that renders an icon can prefer it.
    if (match?.type === 'essence') {
      const definition = this._resolveEssenceDefinition(recipe, match.essenceId);
      const essenceName = this._resolveIngredientDescription(recipe, ingredient);
      const icon =
        typeof definition?.icon === 'string' && definition.icon.trim() ? definition.icon : null;
      return { componentId: null, name: essenceName, img: FALLBACK_ESSENCE_IMG, icon };
    }

    const name = ingredient?.getDescription?.() || '';

    if (match?.type === 'tags') {
      const matchingItem =
        consumedItem ||
        (availableItems || []).find((item) => this.ingredientMatchesItem(recipe, ingredient, item));
      return { componentId: null, name, img: matchingItem?.img || FALLBACK_TAG_IMG };
    }

    if (match?.type === 'currency') {
      return { componentId: null, name, img: FALLBACK_CURRENCY_IMG };
    }

    return { componentId: null, name, img: null };
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
   * @param {object|null} [options.optionOverrides] - Per-group player option overrides
   *   (issue 552), keyed by group id, forwarded to the resolver so the craftability
   *   decision honours the chosen option/stack (an insufficient choice blocks).
   * @returns {{canCraft: boolean, satisfiableSet: IngredientSet|null, missing: Object}}
   */
  canCraft(
    componentSourceActors,
    recipe,
    { presentTools = null, craftingActor = null, resolveComponent, optionOverrides = null } = {}
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
      optionOverrides,
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
        ? ingredientSet.resolveIngredientSelection(
            availableItems,
            (ingredient, item) => this.ingredientMatchesItem(recipe, ingredient, item),
            { resolveItemEssences: this._buildEssenceOptionResolver(recipe) }
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
      // being the right, identically-named component. Shared, telemetry-bearing helper
      // (issue 540); case-INSENSITIVE, exactly as before.
      const byName = matchComponentByName(item, managedItem, {
        caseSensitive: false,
        systemId: recipe?.craftingSystemId,
      });
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
    // Shared, telemetry-bearing helper (issue 540); case-INSENSITIVE, exactly as before.
    const fallbackName =
      tool.name || this._getComponent(recipe, tool.componentId || tool.systemItemId)?.name || '';
    if (!fallbackName) return false;
    return matchComponentByName(
      item,
      { name: fallbackName, id: tool.id },
      { caseSensitive: false, systemId: recipe?.craftingSystemId }
    );
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
   * @param {Recipe|null} [recipe] - Recipe whose system supplies the candidate
   *   components and system id for essence resolution.
   * @param {Function} [resolveComponent] - Optional component resolver injected on the
   *   alchemy craft path (issue 578) so a tier-4-only item contributes its component's
   *   essences. Defaults to the shared {@link findMatchingComponent} via
   *   {@link accumulateItemEssences} used by standard crafting — byte-for-byte unchanged.
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items, recipe = null, resolveComponent = findMatchingComponent) {
    return accumulateItemEssences(items, {
      components: this._getSystemComponents(recipe),
      systemId: recipe?.craftingSystemId,
      multiplyByQuantity: true,
      resolveComponent,
    });
  }

  /**
   * A per-item essence resolver bound to a recipe's system components + id (and the
   * optional alchemy-path component resolver), for threading into
   * `IngredientSet.resolveIngredientSelection` so an essence GROUP option draws down
   * items carrying that essence — the component-aware capability increase over the
   * flag-only default (issue 649).
   * @param {Recipe} recipe
   * @param {Function} [resolveComponent]
   * @returns {(item: object) => Record<string, number>}
   * @private
   */
  _buildEssenceOptionResolver(recipe, resolveComponent = findMatchingComponent) {
    const components = this._getSystemComponents(recipe);
    const systemId = recipe?.craftingSystemId;
    return (item) => resolveItemEssences(item, components, systemId, resolveComponent);
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
   * Import recipes from JSON.
   *
   * Each recipe that cannot be imported is skipped and recorded as a conflict:
   * `reason: 'invalid'` when activation validation fails (carrying the validation
   * `errors`), or `reason: 'duplicate-id'` when a recipe with the same id already
   * exists and `overwrite` is false. On completion the skipped recipes are surfaced
   * in ONE aggregated conflict-report notification (spec item 3), kept distinct from
   * the terminal counts notification (spec item 4). Duplicate-id skips are no longer
   * silent.
   *
   * @param {Object[]} recipesData - Array of recipe data
   * @param {boolean} overwrite - Whether to overwrite existing recipes
   * @returns {Promise<{ imported: number, skipped: number, total: number,
   *   conflicts: Array<{ recipeId: string, recipeName: string, reason: string,
   *   errors?: string[] }> }>} import counts plus the per-recipe conflict list
   */
  async importRecipes(recipesData, overwrite = false) {
    this._assertGM('import recipes');

    let imported = 0;
    let skipped = 0;
    // Per-recipe conflict reasons, aggregated into ONE report at completion (spec
    // item 3) rather than mid-loop console.warn (invalid) or silent skips (duplicate
    // id). Distinct from the terminal counts notification below (spec item 4).
    const conflicts = [];

    for (const recipeData of recipesData) {
      const recipe = Recipe.fromJSON(recipeData);
      const validation = this._validateRecipeForActivation(recipe);

      if (!validation.valid) {
        conflicts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          reason: 'invalid',
          errors: validation.errors,
        });
        skipped++;
        continue;
      }

      if (this.recipes.has(recipe.id) && !overwrite) {
        conflicts.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          reason: 'duplicate-id',
        });
        skipped++;
        continue;
      }

      this.recipes.set(recipe.id, recipe);
      imported++;
    }

    await this.save();
    await this._cleanupFlagsAfterRecipeMutation();
    // Spec item 3: one aggregated conflict report naming each skipped recipe and its
    // reason (duplicate-id skips are no longer silent).
    if (conflicts.length > 0) {
      ui.notifications.warn(this._formatImportConflictReport(conflicts));
    }
    // Spec item 4: the terminal counts notification, kept distinct from the report.
    ui.notifications.info(`Imported ${imported} recipes (${skipped} skipped)`);
    this._notifyRecipesChanged('import', {
      imported,
      skipped,
      total: recipesData.length,
      conflicts,
    });
    return { imported, skipped, total: recipesData.length, conflicts };
  }

  /**
   * Build the aggregated import-conflict report string: names each skipped recipe
   * and its machine-readable reason. Emitted once at import completion (spec item 3),
   * distinct from the terminal counts notification (spec item 4).
   * @param {Array<{ recipeId: string, recipeName: string, reason: string }>} conflicts
   * @returns {string}
   * @private
   */
  _formatImportConflictReport(conflicts) {
    const reasonLabels = { 'duplicate-id': 'duplicate id', invalid: 'invalid' };
    const details = conflicts
      .map((c) => `"${c.recipeName || c.recipeId}" (${reasonLabels[c.reason] || c.reason})`)
      .join(', ');
    return `${conflicts.length} recipe(s) could not be imported: ${details}`;
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
    // Collect structured issues in the same order as the raw error strings (base,
    // essence, tag, resolution mode). The base/essence/tag validators still emit
    // plain English strings, so they ride as UNCODED issues (the localizer passes
    // their message through). Resolution-mode failures now carry a stable `code` +
    // id-free params so the UI can localize them (issue 595).
    const issues = [];
    const pushPlain = (list) => {
      for (const message of list || []) issues.push({ code: null, params: {}, message });
    };
    // A sub-validator that supplies structured `issues` (coded + id-free, issue 595)
    // contributes them directly; a legacy string-only validator rides as UNCODED
    // issues (English passthrough). Every recipe-save validator here — base
    // (Recipe.validate/validateStructure), essence references, tag placeholders, and
    // resolution mode — now supplies coded, id-free issues.
    const pushValidation = (validation) => {
      if (Array.isArray(validation?.issues)) issues.push(...validation.issues);
      else pushPlain(validation?.errors);
    };
    pushValidation(baseValidation);
    pushValidation(this._validateEssenceReferences(recipe));
    pushValidation(this._validateTagPlaceholders(recipe));
    pushValidation(this._validateResolutionMode(recipe, { requireComplete }));

    const errors = issues.map((issue) => issue.message);
    return {
      valid: errors.length === 0,
      errors,
      issues,
    };
  }

  /**
   * Full validity required to *activate* a recipe (set `enabled === true`): completeness plus all
   * persistence checks plus signature uniqueness. A recipe may be persisted while invalid, but may
   * only be enabled when this passes.
   * @param {Recipe} recipe
   * @returns {{valid: boolean, errors: string[], issues: {code: string|null, params: object, message: string}[]}}
   *   `issues` mirrors `errors` with a stable `code` + params so the UI can
   *   localize the enable failure (issue 550); `errors` stays the raw English list.
   * @private
   */
  _validateRecipeForActivation(recipe) {
    const persistence = this._validateRecipeForPersistence(recipe, { requireComplete: true });
    const errors = [...persistence.errors];
    // Structured, coded issues run in parallel with the raw `errors` strings so a
    // UI caller can localize them (issue 550). Persistence now supplies its own
    // structured issues — coded + id-free for resolution-mode failures (issue 595),
    // uncoded (English passthrough) for the remaining base/essence/tag strings.
    const issues = [...persistence.issues];
    const signatureValidation = this._validateSignatures(recipe);
    errors.push(...signatureValidation.errors);
    issues.push(...(signatureValidation.issues || []));

    return {
      valid: errors.length === 0,
      errors,
      issues,
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
      // The validator is now enabled-scoped (issue 649). This gate runs on an ENABLE
      // transition, but the store copy of `recipe` is still disabled (it is persisted
      // only after this passes). Substitute the candidate recipe (enabled = its target
      // state) so the scan evaluates the collision the enable would create; without the
      // swap the enabled-scoped validator would exclude the still-disabled store copy
      // and miss the conflict.
      getRecipesForSystem: (id) =>
        this.getRecipes({ craftingSystemId: id }).map((existing) =>
          existing.id === recipe.id ? recipe : existing
        ),
      getComponentsForSystem: (id) => {
        const system = systemManager.getSystem(id);
        if (!system) return [];
        return system.components || [];
      },
    };

    const validator = new SignatureValidator(csm);
    const result = validator.validateRecipe(recipe, systemId);
    const errors = result.conflicts.map((c) => c.message);
    const issues = result.conflicts.map((c) => ({
      code: c.code,
      params: c.params,
      message: c.message,
    }));
    return { valid: errors.length === 0, errors, issues };
  }

  /**
   * In an alchemy system, disable every currently-enabled recipe that participates in any ingredient
   * signature conflict. Used to reconcile recipes after an essence/component deletion changes
   * signatures. No-op for non-alchemy systems.
   *
   * `SignatureValidator.validateSystem` is enabled-scoped (issue 649), so the conflicts it
   * reports are only among ENABLED recipes — the exact set the runtime matcher can pick.
   * A recipe whose sole collision partner is already disabled therefore does NOT appear as a
   * conflict and STAYS enabled: the enabled residual is the collision-free set the runtime
   * needs. Disabling all participants of a conflict genuinely clears the gate.
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
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { valid: true, errors: [], issues: [] };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const features = system.features || {};
    const essencesEnabled = features.essences === true || system.enableEssences === true;
    if (!essencesEnabled) {
      return { valid: true, errors: [], issues: [] };
    }

    const definitions = Array.isArray(system.essenceDefinitions) ? system.essenceDefinitions : [];
    const validEssenceIds = new Set(definitions.map((def) => def.id));
    // Resolve an essence's display NAME from the system's definitions (issue 595) so
    // a message never surfaces the raw essence id. An UNKNOWN essence has no
    // definition and therefore no name, so its message omits it entirely.
    const essenceNames = new Map(
      definitions
        .filter((def) => typeof def?.name === 'string' && def.name.trim())
        .map((def) => [def.id, def.name.trim()])
    );

    const issues = [];

    // Report a non-positive-quantity essence, preferring the named message when the
    // essence resolves to a definition (issue 595 — never surface the raw id).
    const pushBadQuantity = (setLabel, essenceId) => {
      const essenceName = essenceNames.get(essenceId);
      issues.push(
        essenceName
          ? buildRecipeActivationIssue('ingredientSetEssenceQuantityNamed', {
              set: setLabel,
              essence: essenceName,
            })
          : buildRecipeActivationIssue('ingredientSetEssenceQuantity', { set: setLabel })
      );
    };

    // Walk recipe-level AND step-level ingredient sets, validating BOTH the legacy
    // per-set essences map (back-compat read) AND first-class essence group OPTIONS
    // (issue 649) so a dangling essence reference in a group option still raises
    // `ingredientSetUnknownEssence` on enable.
    const allSets = [
      ...(recipe.ingredientSets || []),
      ...(recipe.steps || []).flatMap((step) => step?.ingredientSets || []),
    ];
    for (const [setIndex, set] of allSets.entries()) {
      const setLabel =
        typeof set?.name === 'string' && set.name.trim() ? set.name.trim() : String(setIndex + 1);
      for (const [essenceId, qty] of Object.entries(set.essences || {})) {
        if (!validEssenceIds.has(essenceId)) {
          issues.push(buildRecipeActivationIssue('ingredientSetUnknownEssence', { set: setLabel }));
        }
        const num = Number(qty);
        if (!Number.isFinite(num) || num <= 0) {
          pushBadQuantity(setLabel, essenceId);
        }
      }
      for (const group of set.ingredientGroups || []) {
        for (const option of group?.options || []) {
          if (option?.match?.type !== 'essence') continue;
          const essenceId = String(option.match.essenceId || '').trim();
          if (!validEssenceIds.has(essenceId)) {
            issues.push(
              buildRecipeActivationIssue('ingredientSetUnknownEssence', { set: setLabel })
            );
          }
          const num = Number(option.match.amount);
          if (!Number.isFinite(num) || num <= 0) {
            pushBadQuantity(setLabel, essenceId);
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
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
    const systemId = recipe?.craftingSystemId;
    if (!systemId) {
      return { valid: true, errors: [], issues: [] };
    }

    const systemManager = game.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem(systemId);
    if (!system) {
      return { valid: true, errors: [], issues: [] };
    }

    const validTags = new Set(
      [
        ...(system.itemTags || []).map((tag) => String(tag || '').trim()),
        ...(system.tags || []).map((tag) => String(tag || '').trim()),
      ].filter(Boolean)
    );

    const issues = [];
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

        for (const [groupIndex, group] of groups.entries()) {
          // Name the group by author-name or 1-based position, never its id (595).
          const groupLabel =
            typeof group?.name === 'string' && group.name.trim()
              ? group.name.trim()
              : String(groupIndex + 1);
          for (const option of group.options || []) {
            const match = option.match || null;
            if (getMatchHandler(match).type !== 'tags') continue;
            const tagIds = Array.isArray(match.tags) ? match.tags : [];

            for (const tagId of tagIds) {
              const normalized = String(tagId || '').trim();
              if (!normalized) continue;
              if (validTags.has(normalized)) continue;
              issues.push(
                buildRecipeActivationIssue('ingredientGroupUnknownTag', {
                  group: groupLabel,
                  tag: normalized,
                })
              );
            }
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      errors: issues.map((issue) => issue.message),
      issues,
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
