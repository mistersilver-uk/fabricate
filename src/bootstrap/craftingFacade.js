/**
 * The crafting, inventory and alchemy half of the `game.fabricate` facade. Method shorthand, for
 * the reason `./gatheringFacade.js` states.
 */

import { isGatheringActorSelectableByUser } from '../config/preferencesCleanup.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { resolveAdvanceSources } from '../systems/advanceCraftingSources.js';
import { resolveCheckFormulaDisplay } from '../systems/checkRoll.js';
import { executePublicCraft } from '../systems/journalRunCommands.js';
import { resolvedComponentsFor } from '../systems/scopedEntityReads.js';
import {
  activeRunStepState,
  buildStepRecipeView,
  resolveStepIngredientSet,
} from '../systems/stepRecipeView.js';
import { AlchemyListingBuilder } from '../ui/presenters/AlchemyListingBuilder.js';
import { CraftingListingBuilder } from '../ui/presenters/CraftingListingBuilder.js';
import { InventoryListingBuilder } from '../ui/presenters/InventoryListingBuilder.js';
import { resolveAlchemySubmissions } from '../utils/alchemySubmissions.js';
import { findMatchingComponent } from '../utils/essenceResolver.js';

import { localizeGathering } from './gatheringRuntime.js';

export const craftingFacade = {
  /**
   * Lazily build and cache the `CraftingListingBuilder` projecting the backend into redaction-safe
   * listing models, so GM and player viewers resolve through one code path. It imports no Foundry
   * globals — `localize` and `nowWorldTime` are injected here.
   */
  _getCraftingListingBuilder() {
    if (this._craftingListingBuilder) return this._craftingListingBuilder;
    this._craftingListingBuilder = new CraftingListingBuilder({
      recipeManager: this.recipeManager,
      recipeVisibility: this.recipeVisibilityService,
      resolutionModeService: this.resolutionModeService,
      craftingSystemManager: this.craftingSystemManager,
      // Read ONLY for `findActiveRunForRecipe`, so the projection can name the step a run is parked
      // on (issue 917). Safe to capture: `this.craftingRunManager` is never reassigned.
      craftingRunManager: this.craftingRunManager,
      localize: (key, data) =>
        data === undefined
          ? (game.i18n?.localize?.(key) ?? key)
          : (game.i18n?.format?.(key, data) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
      // How a held document resolves to a managed component (issue 1075): the SAME full resolver
      // `InventoryListingBuilder` matches owned stacks with, so the crafting row's "looks makeable"
      // and the inventory tab's owned count cannot disagree. Injected, so its graph stays out of
      // the harness.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._craftingListingBuilder;
  },

  /**
   * Resolve a stored crafting actor preference; null for a stale id. DEFENCE IN DEPTH: a non-GM
   * viewer's actor must pass the gathering attempt path's ownership predicate.
   */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  },

  /**
   * Resolve the effective crafting actor and component-source actors against the persisted defaults;
   * a truthy `rememberedActorId` overrides and stale ids resolve to nothing.
   */
  _resolveCraftingSources({ rememberedActorId = null, componentSourceActorIds = null } = {}) {
    const actorId = rememberedActorId || this.getSelectedCraftingActorId() || null;
    const craftingActor = this._resolveCraftingActor(actorId);
    const sourceIds = Array.isArray(componentSourceActorIds)
      ? componentSourceActorIds
      : this.getCraftingComponentSourceIds();
    const componentSourceActors = sourceIds
      .map((id) => this._resolveCraftingActor(id))
      .filter(Boolean);
    return { craftingActor, componentSourceActors };
  },

  /**
   * Build the player-facing Crafting listing. The current Foundry user is ALWAYS the viewer, and the
   * visibility service honours the GM bypass.
   */
  listCraftingForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getCraftingListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  },

  /**
   * DETAIL PHASE — the exact rich model for ONE recipe (issue 1075), companion to
   * `listCraftingForActor`'s cheap summary rows, so craftability, check resolution and stages are
   * computed for what is on screen. `recipeId` is NOT trusted: the actor and sources are re-resolved
   * through `_resolveCraftingSources` and visibility is re-evaluated, so an id the viewer may not
   * see answers `null`.
   */
  hydrateCraftingRecipe({ recipeId = null, actorId = null, componentSourceActorIds = null } = {}) {
    this._requireReady();
    if (!recipeId) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getCraftingListingBuilder().buildRecipeDetail({
      recipeId,
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  },

  /**
   * Lazily build and cache the `InventoryListingBuilder`; `recipeVisibility` is injected so a non-GM
   * viewer's used-by list never names a teaser recipe.
   */
  _getInventoryListingBuilder() {
    if (this._inventoryListingBuilder) return this._inventoryListingBuilder;
    this._inventoryListingBuilder = new InventoryListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data === undefined
          ? (game.i18n?.localize?.(key) ?? key)
          : (game.i18n?.format?.(key, data) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      // Gathering tasks live in the `gatheringConfig` setting keyed by system id, not on the system
      // object, so they are surfaced here for the "produced by" gathering index.
      getGatheringTasksForSystem: (systemId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
    });
    return this._inventoryListingBuilder;
  },

  /**
   * Build the player-facing Inventory listing, reusing the crafting selection so the two tabs agree
   * on what the player owns. The current Foundry user is always the viewer.
   */
  listInventoryForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getInventoryListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  },

  /**
   * Learn one recipe from an owned book against the scope the listing was computed for, delegated to
   * the visibility service, which enforces the per-document learn budget for capped systems.
   */
  async learnRecipeFromInventory({
    actorId = null,
    recipeId = null,
    componentSourceActorIds = null,
  } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) {
      return { success: false, message: 'FABRICATE.Knowledge.NoMatchingItem' };
    }
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this.recipeVisibilityService.learnRecipeFromOwnedBook({
      recipe,
      craftingActor,
      componentSourceActors,
    });
  },

  /**
   * Craft a recipe for the current selection, delegating to {@link Fabricate#craft} but taking actor
   * IDS rather than documents, and resolving the crafting actor and component sources so the attempt
   * uses the inventory scope the listing was computed for. New starts use version 1 and preserve
   * ready, fully supplied one-call execution; waiting or unresolved choices leave the run in the
   * Journal without editable-material spending, and a stale `ingredientEssenceAllocation` blocks
   * versioned execution until repaired. Versioned required checks use the authority's
   * prepare/prompt/resolve exchange whatever `interactive` says, and cancelling the prompt leaves
   * the stage unexecuted rather than the run absent.
   */
  async craftRecipe({
    actorId = null,
    recipeId,
    ingredientSetId = null,
    ingredientOptionOverrides = null,
    ingredientEssenceAllocation = null,
    componentSourceActorIds = null,
    interactive = false,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    // `interactive` opts into the confirm-roll dialog and chat post; false for automation.
    return await this.craft(craftingActor, recipeId, {
      componentSourceActors: sources,
      lifecycleVersion: 1,
      ingredientSetId,
      // Per-group player option overrides (issue 552); null keeps default resolution.
      ingredientOptionOverrides,
      // Scoped essence-block funding (issue 917); null keeps the allocator's suggestion.
      ingredientEssenceAllocation,
      interactive,
    });
  },

  /**
   * Salvage one owned component for the current selection (issue 675). TAKES AN `actorId`, NEVER AN
   * `actorUuid`: `CraftingEngine.salvage` performs NO ownership check, so `_resolveCraftingActor` is
   * the ONLY gate here, and a uuid would reach `fromUuid()` and THROW rather than answering the
   * `{ success: false, message }` a store expects. `craftRecipe` parity is the contract.
   */
  async salvageComponent({ actorId = null, systemId, componentId, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor } = this._resolveCraftingSources({ rememberedActorId: actorId });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    return await this.craftingEngine.salvage(craftingActor.uuid, systemId, componentId, {
      interactive,
    });
  },

  /**
   * Re-evaluate ONE ingredient set's craftability with in-session per-group overrides (issue 552),
   * through the SAME `evaluateCraftability` seam the engine consumes. Synchronous, for a `$derived`.
   */
  evaluateSelectedSet({
    recipeId = null,
    setId = null,
    optionOverrides = null,
    essenceAllocation = null,
    stepId = null,
    actorId = null,
    componentSourceActorIds = null,
  } = {}) {
    this._requireReady();
    const recipe = this.recipeManager?.getRecipe?.(recipeId);
    if (!recipe) return null;
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    const sources =
      componentSourceActors.length > 0
        ? componentSourceActors
        : craftingActor
          ? [craftingActor]
          : [];
    if (sources.length === 0) return null;
    // Resolve through the EXECUTION STEPS, not the `recipe.ingredientSets` that is EMPTY for every
    // explicit multi-step recipe; `resolveStepIngredientSet` also enforces the two rules that make
    // this safe.
    const resolved = resolveStepIngredientSet({
      steps: this.resolutionModeService?.getExecutionSteps?.(recipe) ?? [],
      stepId,
      activeStepIndex: activeRunStepState(this.craftingRunManager, craftingActor, recipe.id).index,
      setId,
    });
    if (!resolved) return null;
    // Narrow to the one selected set through the SHARED step view the engine crafts against, so the
    // step's tool union applies and the IngredientSet instance methods survive.
    const singleSetRecipe = {
      ...buildStepRecipeView(recipe, resolved.step),
      ingredientSets: [resolved.set],
    };
    return (
      this.recipeManager.evaluateCraftability(sources, singleSetRecipe, {
        craftingActor,
        optionOverrides,
        essenceAllocation,
      }) ?? null
    );
  },

  /** Lazily cache the `AlchemyListingBuilder`: the leak-safe, Foundry-global-free workbench view. */
  _getAlchemyListingBuilder() {
    if (this._alchemyListingBuilder) return this._alchemyListingBuilder;
    this._alchemyListingBuilder = new AlchemyListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data === undefined
          ? (game.i18n?.localize?.(key) ?? key)
          : (game.i18n?.format?.(key, data) ?? key),
      // The per-pass inventory snapshot's component resolver (issue 1228): the workbench reads no
      // tallies itself, but its snapshot must be the same complete value every other pass builds.
      resolveComponentForItem: findMatchingComponent,
    });
    return this._alchemyListingBuilder;
  },

  /**
   * Build the leak-safe player Alchemy workbench listing for `craftingSystemId`. The current user is
   * always the viewer and the actor goes through crafting's owner gate, so a non-owner viewer's
   * actor resolves to null and the builder answers a denied, empty listing.
   */
  listAlchemyForActor({
    actorId = null,
    craftingSystemId = null,
    componentSourceActorIds = null,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    return this._getAlchemyListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
      craftingSystemId,
    });
  },

  /**
   * Submit a workbench of components as an alchemy brew attempt. Owner-scoped like `craftRecipe`,
   * then delegated to the AUTHORITATIVE `CraftingEngine#craftAlchemy`, which matches every enabled
   * recipe known and undiscovered and otherwise fizzles with no check and no roll. `interactive`
   * prompts on a MATCHED brew only.
   */
  async submitAlchemyAttempt({
    actorId = null,
    craftingSystemId = null,
    submittedComponentIds = [],
    componentSourceActorIds = null,
    interactive = false,
  } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return {
        success: false,
        results: null,
        message: 'No crafting actor selected',
        disposition: 'error',
      };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    const system = this.craftingSystemManager?.getSystem?.(craftingSystemId) ?? null;
    const components = resolvedComponentsFor(system);
    const submittedItems = resolveAlchemySubmissions(
      sources,
      components,
      submittedComponentIds,
      craftingSystemId
    );
    if (submittedItems.length === 0) {
      return {
        success: false,
        results: null,
        message: 'FABRICATE.App.Alchemy.NoIngredients',
        disposition: 'error',
      };
    }
    return await this.craftingEngine.craftAlchemy(craftingActor, sources, submittedItems, {
      craftingSystemId,
      lifecycleVersion: 1,
      interactive,
    });
  },

  /** Persist the selected alchemy system. */
  setSelectedAlchemySystemId: (id) => setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, id ?? ''),

  /** Persist the remembered crafting-actor selection. */
  setSelectedCraftingActorId: (id) => setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, id ?? ''),

  /** Persist the component-source actor ids. */
  setCraftingComponentSourceIds: (ids) =>
    setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES, Array.isArray(ids) ? ids : []),

  /** Toggle a recipe's favourite state and persist the updated id list. */
  toggleFavouriteRecipe(recipeId) {
    const current = this.getFavouriteRecipeIds();
    if (!recipeId) return current;
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    setSetting(SETTING_KEYS.FAVOURITE_RECIPES, next);
    return next;
  },

  /**
   * Persist the player's preferred result order for one namespaced key. ASYNC AND MUST BE AWAITED:
   * under `user` scope `set` is a replicated write that can REJECT, unlike the client-scoped
   * fire-and-forget in `toggleFavouriteRecipe`.
   */
  async setProgressiveResultOrder(key, orderedIds) {
    const current = this.getProgressiveResultOrder();
    if (!key) return current;
    const next = { ...current, [key]: Array.isArray(orderedIds) ? orderedIds : [] };
    await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, next);
    return next;
  },

  /**
   * Persist the "hide unavailable environments" preference, client-scoped and view-only: it changes
   * no saved data, no engine listing and no GM configuration.
   */
  setHideUnavailableEnvironments: (value) =>
    setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true),

  /**
   * Advance a crafting run's current step — the single player-triggerable advance boundary. `craft()`
   * writes directly to the source actors, so a non-owner gets a "needs owner" message rather than a
   * throw. THE RECIPE COMES FROM THE RESOLVED RUN, NEVER THE CALLER (issue 966).
   */
  async advanceCraftingRun({ actorId, runId, interactive = false } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return {
        success: false,
        message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner'),
      };
    }
    // A run that vanished between render and click has no recipe to resolve. Report it rather than
    // falling through to `craft()`, which would treat the missing run as a fresh craft.
    if (!run?.recipeId) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NoRun') };
    }
    return this.craft(actor, run.recipeId, {
      runId,
      componentSourceActors: resolved.componentSourceActors,
      interactive,
    });
  },

  /**
   * Cancel a player's in-progress craft (issue 848), reusing `advanceCraftingRun`'s ownership guard:
   * `cancelCraft` restores items to the source actors, so a non-owner is blocked gracefully.
   */
  async cancelCraftingRun({ actorId, runId } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return {
        success: false,
        message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner'),
      };
    }
    const result = await this.craftingEngine.cancelCraft(
      actor,
      resolved.componentSourceActors,
      runId
    );
    if (result?.success && result.cancelled) {
      let key = 'FABRICATE.App.Journal.Actions.Cancelled';
      if (result.refunded) {
        key = 'FABRICATE.App.Journal.Actions.CancelledRefunded';
      } else if (result.partialRefund) {
        // A partial reversal must not claim a full return: some inputs came back and others,
        // or the currency refund, could not be restored.
        key = 'FABRICATE.App.Journal.Actions.CancelledPartial';
      }
      return { ...result, message: localizeGathering(key) };
    }
    return result;
  },

  /**
   * Craft a recipe for a resolved Actor DOCUMENT — never an id or uuid string; {@link
   * Fabricate#craftRecipe} is the player-facing actor-ID facade. One-call execution is preserved
   * when the stage is ready and all choices are supplied; new starts use version 1 through active-GM
   * authority, waiting stages and unresolved choices stay in the Journal without editable-material
   * spending, and resuming an existing unversioned run keeps its legacy contract.
   * Required versioned checks use the authority's player prompt and GM evaluation; a SECRET check
   * uses a generic prompt and GM private posting with no player roll-data handoff, and Foundry's
   * whisper presentation is not a server confidentiality guarantee.
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // The id is captured BEFORE the lookup, so the not-found message names it: reading the
    // resolved value after the lookup always reported "Recipe undefined not found".
    let resolvedRecipe = recipe;
    if (typeof recipe === 'string') {
      resolvedRecipe = this.recipeManager.getRecipe(recipe);
      if (!resolvedRecipe) {
        throw new Error(`Recipe ${recipe} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return executePublicCraft({
      engine: this.craftingEngine,
      runManager: this.craftingRunManager,
      actor,
      sourceActors: componentSourceActors,
      recipe: resolvedRecipe,
      ingredientSetId,
      options,
      executeCommand: (command, options) => this.executeJournalRunCommand(command, options),
      resolveUuid: (uuid) => globalThis.fromUuid?.(uuid),
    });
  },

  /**
   * Delete a recipe by id through `CraftingSystemManager.deleteRecipes` (issue 1132), so this public
   * API and the GM studio cannot disagree about what deleting a recipe reaches.
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const recipe = this.recipeManager.getRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    return await this.craftingSystemManager.deleteRecipes(recipe.craftingSystemId, [recipeId]);
  },
};
