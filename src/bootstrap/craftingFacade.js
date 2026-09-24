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
  /** One redaction-safe projection for GM and player viewers; Foundry globals are injected here. */
  _getCraftingListingBuilder() {
    if (this._craftingListingBuilder) return this._craftingListingBuilder;
    this._craftingListingBuilder = new CraftingListingBuilder({
      recipeManager: this.recipeManager,
      recipeVisibility: this.recipeVisibilityService,
      resolutionModeService: this.resolutionModeService,
      craftingSystemManager: this.craftingSystemManager,
      // Read only to name the step a run is parked on (issue 917); the field is never reassigned.
      craftingRunManager: this.craftingRunManager,
      localize: (key, data) =>
        data === undefined
          ? (game.i18n?.localize?.(key) ?? key)
          : (game.i18n?.format?.(key, data) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor, craftingModifier) =>
        resolveCheckFormulaDisplay(formula, actor, craftingModifier),
      // The resolver `InventoryListingBuilder` uses, so "looks makeable" and the owned count
      // cannot disagree (issue 1075).
      resolveComponentForItem: findMatchingComponent,
    });
    return this._craftingListingBuilder;
  },

  /** Null for a stale id or, for a non-GM, an actor failing the gathering ownership predicate. */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  },

  /** A truthy `rememberedActorId` overrides the persisted default; stale ids resolve to nothing. */
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

  /** The current user is always the viewer; the visibility service honours the GM bypass. */
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
   * The rich model for one recipe beside `listCraftingForActor`'s summary rows (issue 1075).
   * `recipeId` is untrusted: sources and visibility are re-evaluated; a hidden id answers `null`.
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

  /** `recipeVisibility` keeps a teaser recipe out of a non-GM viewer's used-by list. */
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
      // Tasks live in the `gatheringConfig` setting, not on the system, so they are passed in.
      getGatheringTasksForSystem: (systemId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
    });
    return this._inventoryListingBuilder;
  },

  /** Reuses the crafting selection so both tabs agree on what is owned; the user is the viewer. */
  listInventoryForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getInventoryListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  },

  /** The visibility service enforces the per-document learn budget for capped systems. */
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
   * {@link Fabricate#craft} by actor ids, against the listing's inventory scope. A stale
   * `ingredientEssenceAllocation` blocks versioned execution until repaired. Versioned required
   * checks prompt whatever `interactive` says; a cancelled prompt leaves the stage unexecuted.
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
    return await this.craft(craftingActor, recipeId, {
      componentSourceActors: sources,
      lifecycleVersion: 1,
      ingredientSetId,
      // Null keeps default resolution (issue 552) and the allocator's suggestion (issue 917).
      ingredientOptionOverrides,
      ingredientEssenceAllocation,
      interactive,
    });
  },

  /**
   * Takes an `actorId`, never a uuid (issue 675): `CraftingEngine.salvage` checks no ownership, so
   * `_resolveCraftingActor` is the only gate, and a uuid would reach `fromUuid()` and throw.
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
   * One ingredient set's craftability under in-session overrides (issue 552), through the engine's
   * `evaluateCraftability` seam. Synchronous, for a `$derived`.
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
    // Via the steps: `recipe.ingredientSets` is empty for an explicit multi-step recipe.
    const resolved = resolveStepIngredientSet({
      steps: this.resolutionModeService?.getExecutionSteps?.(recipe) ?? [],
      stepId,
      activeStepIndex: activeRunStepState(this.craftingRunManager, craftingActor, recipe.id).index,
      setId,
    });
    if (!resolved) return null;
    // The engine's step view, so the step's tool union applies and IngredientSet methods survive.
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
      // Unread by the workbench, but its snapshot must match every other pass's (issue 1228).
      resolveComponentForItem: findMatchingComponent,
    });
    return this._alchemyListingBuilder;
  },

  /** Through crafting's owner gate, so a non-owner viewer gets a denied, empty listing. */
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
   * Owner-scoped like `craftRecipe`; `CraftingEngine#craftAlchemy` matches every enabled recipe,
   * known or not, and otherwise fizzles with no roll. `interactive` prompts on a matched brew only.
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

  setSelectedAlchemySystemId: (id) => setSetting(SETTING_KEYS.LAST_ALCHEMY_SYSTEM, id ?? ''),

  setSelectedCraftingActorId: (id) => setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, id ?? ''),

  setCraftingComponentSourceIds: (ids) =>
    setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES, Array.isArray(ids) ? ids : []),

  toggleFavouriteRecipe(recipeId) {
    const current = this.getFavouriteRecipeIds();
    if (!recipeId) return current;
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    setSetting(SETTING_KEYS.FAVOURITE_RECIPES, next);
    return next;
  },

  /** Must be awaited: a user-scoped `set` is a replicated write that can reject. */
  async setProgressiveResultOrder(key, orderedIds) {
    const current = this.getProgressiveResultOrder();
    if (!key) return current;
    const next = { ...current, [key]: Array.isArray(orderedIds) ? orderedIds : [] };
    await setSetting(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, next);
    return next;
  },

  /** Client-scoped and view-only: no saved data, engine listing or GM configuration changes. */
  setHideUnavailableEnvironments: (value) =>
    setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true),

  /**
   * The one player-triggerable advance boundary. A non-owner gets a "needs owner" message, not a
   * throw. The recipe comes from the resolved run, never the caller (issue 966).
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
    // A run gone since render must not fall through to `craft()` as a fresh craft.
    if (!run?.recipeId) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NoRun') };
    }
    return this.craft(actor, run.recipeId, {
      runId,
      componentSourceActors: resolved.componentSourceActors,
      interactive,
    });
  },

  /** `advanceCraftingRun`'s ownership guard (issue 848): the refund writes to the source actors. */
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
        // Some inputs, or the currency refund, could not be restored.
        key = 'FABRICATE.App.Journal.Actions.CancelledPartial';
      }
      return { ...result, message: localizeGathering(key) };
    }
    return result;
  },

  /**
   * Craft for an Actor document, never an id; {@link Fabricate#craftRecipe} takes ids. A ready,
   * fully supplied stage runs in one call; new starts use version 1 through active-GM authority,
   * and waiting or unresolved stages stay in the Journal without spending editable materials.
   * Resuming an unversioned run keeps its legacy contract. A secret check uses a generic prompt and
   * GM private posting with no player roll-data handoff; Foundry's whisper is not confidential.
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

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

  /** Through `deleteRecipes` (issue 1132), so this API and the GM studio reach the same things. */
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
