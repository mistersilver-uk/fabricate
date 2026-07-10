// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';

import { RecipeManager } from './systems/RecipeManager.js';
import { CompendiumImporter } from './systems/CompendiumImporter.js';
import { CraftingEngine } from './systems/CraftingEngine.js';
import { CraftingSystemManager } from './systems/CraftingSystemManager.js';
import { CraftingRunManager } from './systems/CraftingRunManager.js';
import { RunJournalBuilder } from './systems/RunJournalBuilder.js';
import { SalvageRunManager } from './systems/SalvageRunManager.js';
import { GatheringEnvironmentStore } from './systems/GatheringEnvironmentStore.js';
import { GatheringRealmStore } from './systems/GatheringRealmStore.js';
import { GatheringPartyStore } from './systems/GatheringPartyStore.js';
import { GatheringLocationService } from './systems/GatheringLocationService.js';
import { revealGatheringRealm, hideGatheringRealm, getDiscoveredRealmIdsForSystem } from './systems/gatheringRealmDiscovery.js';
import { buildLocationSummaryForViewer } from './systems/gatheringLocation.js';
import { isGatheringRealmsEnabled } from './systems/gatheringRealms.js';
import { GatheringRunManager } from './systems/GatheringRunManager.js';
import { GatheringGateAndCheckEvaluator } from './systems/GatheringGateAndCheckEvaluator.js';
import { GatheringRichStateService } from './systems/GatheringRichStateService.js';
import { secondsPerUnitFromCalendar, daysPerYearFromCalendar } from './systems/foundryCalendar.js';
import { resolveAdvanceSources } from './systems/advanceCraftingSources.js';
import { GatheringEngine } from './systems/GatheringEngine.js';
import { GatheringHookPublisher } from './systems/GatheringHookPublisher.js';
import { EVENT_SCENE_SOCKET, createEventSceneTrigger, routeEventSceneSocketMessage } from './systems/eventSceneCoordinator.js';
import { renderDialog, viewScene, localize as bridgeLocalize } from './ui/svelte/util/foundryBridge.js';
import { RecipeVisibilityService } from './systems/RecipeVisibilityService.js';
import { ResolutionModeService } from './systems/ResolutionModeService.js';
import { CraftingListingBuilder } from './systems/CraftingListingBuilder.js';
import { InventoryListingBuilder } from './systems/InventoryListingBuilder.js';
import { resolveCheckFormulaDisplay } from './systems/checkRoll.js';
import { SignatureValidator } from './systems/SignatureValidator.js';
import { Recipe } from './models/Recipe.js';
import { Ingredient } from './models/Ingredient.js';
import { IngredientGroup } from './models/IngredientGroup.js';
import { MacroExecutor } from './utils/MacroExecutor.js';
import { findStackableMatch } from './utils/sourceUuid.js';
import {
  callGatheringRuntimeWithCurrentViewer,
  createGatheringSceneAccess,
  createGatheringSelectableActorsGetter,
  evaluateGatheringExpression,
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import { sceneRegionUuidsContainingToken } from './canvas/regionHitTest.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import { createToolBreakageRuntime } from './toolBreakageRuntime.js';
import {
  getFabricateAppClass,
  getCraftingSystemManagerAppClass,
  getInteractableBrowserAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass
} from './ui/appFactory.js';
import { addInteractableSceneControl } from './ui/interactableSceneControl.js';
import { applyCurrentFabricateTheme } from './ui/theme.js';
import { findItemsDirectoryActionsContainer, syncGatheringDirectoryButton } from './ui/itemsDirectoryButtons.js';
import { buildCompendiumImportContextOption, promptSelectCraftingSystem } from './ui/compendiumDirectoryContext.js';
import { registerFabricateSettings, getSetting, setSetting, SETTING_KEYS, FABRICATE_SETTINGS_NAMESPACE, RECIPE_ITEM_FLAG_STAMP_TARGET } from './config/settings.js';
import { handleFabricateSettingChange } from './config/settingChangeBridge.js';
import { FABRICATE_HOOKS } from './config/hooks.js';
import { MigrationRunner } from './migration/MigrationRunner.js';
import { buildMigrationRecoveryPrompt } from './migration/migrationRecoveryPrompt.js';
import { ItemPilesIntegration } from './integrations/ItemPilesIntegration.js';
import {
  ActorInventoryCoinSpender,
  ActorPropertyCoinSpender,
} from './systems/CoinSpenders.js';
import { Pf2eInventoryCoinAdapter } from './systems/Pf2eInventoryCoinAdapter.js';
import { cleanupStalePreferences, isGatheringActorSelectableByUser } from './config/preferencesCleanup.js';
import { registerFragmentDiscoveryHook } from './systems/FragmentDiscoveryHook.js';
import { registerRecipeItemLearningHook } from './systems/RecipeItemLearningHook.js';
import { InteractableManager } from './canvas/InteractableManager.js';
import {
  handleInteractableSocketMessage,
  applyInteractableBehaviorUpdate,
  resolveInteractableBehaviorByRef,
  writeInteractableBehaviorNode
} from './canvas/interactableSocketBridge.js';
import { registerInteractableRegionBehavior } from './canvas/regions/FabricateInteractableRegionBehavior.js';
import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
  buildUnconfiguredSentinelPatch
} from './canvas/regions/interactableCreationGuard.js';
import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem
} from './canvas/regions/interactableRegionFlags.js';
import { syncInteractableMarkers } from './canvas/regions/interactableMarkerDepletion.js';
import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry
} from './canvas/regions/interactableConfigSheet.js';
import * as CraftingSystemExporter from './systems/CraftingSystemExporter.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/SvelteCraftingSystemManagerApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';
import './ui/InteractablesManagerApp.svelte.js';

let gatheringEngine = null;

/**
 * Resolve a stored gathering actor preference against Foundry's actor collection.
 *
 * @param {string} actorId Actor id from the client preference.
 * @returns {Actor|null} Resolved actor, or null when stale.
 */
function resolveGatheringActor(actorId) {
  return game.actors?.get?.(actorId) ?? null;
}

/**
 * Check whether the current user may select an actor for gathering.
 *
 * @param {Actor} actor Candidate gathering actor.
 * @returns {boolean} True when the actor is selectable by the current user.
 */
function isSelectableGatheringActor(actor) {
  return isGatheringActorSelectableByUser(actor, game.user);
}

const getGatheringSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: isGatheringActorSelectableByUser
});

/**
 * The current dnd5e/pf2e implementation of the **player-character concept**.
 *
 * "Player character" is a concept: the actor type(s) a system designates as
 * player characters. This predicate is the documented seam for future
 * per-system extension/configuration. `'character'` is the dnd5e/pf2e actor
 * type and is NOT asserted as a universal truth — systems whose player-character
 * actor type differs are a known limitation of this iteration (their PCs will not
 * appear in the actor-selection bar), and re-pointing this predicate is the
 * intended extension point.
 *
 * @param {Actor} actor Candidate actor.
 * @returns {boolean} True when the actor is a player character.
 */
function isPlayerCharacterActor(actor) {
  return actor?.type === 'character';
}

/**
 * Selection predicate for the actor-selection top bar.
 *
 * Combines the ownership rule reused for gathering attempt authorization
 * (`isGatheringActorSelectableByUser`: player owns / GM sees all) AND the
 * player-character concept (`isPlayerCharacterActor`). This narrows the bar's
 * list to player characters WITHOUT modifying attempt authorization — an owned
 * non-player-character actor stays attempt-authorized but is absent from the bar.
 *
 * @param {object} payload
 * @param {Actor} payload.actor Candidate actor.
 * @param {User} payload.viewer Foundry user the selection is for.
 * @returns {boolean} True when the actor is a selectable player character.
 */
function isSelectableBarActor({ actor, viewer } = {}) {
  return isGatheringActorSelectableByUser(actor, viewer) && isPlayerCharacterActor(actor);
}

const getBarSelectableActors = createGatheringSelectableActorsGetter({
  getActors: () => game.actors,
  getCurrentUser: () => game.user,
  isSelectable: (actor, viewer) => isSelectableBarActor({ actor, viewer })
});

function getGatheringRunViewer({ run } = {}) {
  const userId = run?.userId;
  return game.users?.get?.(userId) ?? { id: userId ?? null, isGM: false };
}

function isCurrentWorldPaused() {
  return game.paused === true;
}

/**
 * Execute a gathering macro through the shared macro runner.
 *
 * @param {string} macroUuid Macro document UUID.
 * @param {object} context Gathering macro context.
 * @returns {Promise<*>} Macro result.
 */
async function runGatheringMacro(macroUuid, context = {}) {
  return MacroExecutor.run(macroUuid, context);
}

function createGatheringToolBreakage({ craftingSystemManager, evaluateExpression }) {
  return createToolBreakageRuntime({
    matchTools: ({ actor, system, task, tools = [], presentTools = null }) =>
      matchGatheringTools({ actor, system, task, tools, craftingSystemManager, presentTools }),
    buildItemRef: (actor, item) => gatheringRunItemRef(actor, item),
    resolveReplacementSource: ({ componentId, system }) =>
      resolveGatheringResultSource({ componentId, quantity: 1 }, system, craftingSystemManager),
    evaluateExpression
  });
}

function createGatheringResultCreator(craftingSystemManager) {
  return {
    async plan({ actor, system, resultGroups = [] } = {}) {
      return flattenGatheringResults(resultGroups)
        .map(result => {
          const source = resolveGatheringResultSource(result, system, craftingSystemManager);
          return source ? gatheringRunItemRef(actor, source, result.quantity) : null;
        })
        .filter(Boolean);
    },

    async create({ actor, system, resultGroups = [] } = {}) {
      const created = [];
      for (const result of flattenGatheringResults(resultGroups)) {
        const source = resolveGatheringResultSource(result, system, craftingSystemManager);
        if (!source) continue;

        const itemData = source.toObject?.() ?? {
          name: source.name ?? 'Gathered Item',
          img: source.img ?? 'icons/svg/item-bag.svg',
          type: source.type ?? 'loot',
          system: source.system ? globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system } : {}
        };
        itemData.system ??= {};
        if (itemData.system.quantity !== undefined || result.quantity) {
          itemData.system.quantity = Number(result.quantity || 1);
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Stack onto an existing matching item (same source UUID chain) that uses
        // a quantity field, rather than creating a duplicate document.
        const existing = findStackableMatch(normalizeFoundryCollection(actor.items), source);
        if (existing) {
          const next = Number(existing.system?.quantity || 0) + Number(result.quantity || 1);
          await existing.update({ 'system.quantity': next });
          created.push(gatheringRunItemRef(actor, existing, result.quantity));
          continue;
        }

        const [item] = await actor.createEmbeddedDocuments('Item', [itemData]);
        if (item) created.push(gatheringRunItemRef(actor, item, result.quantity));
      }
      return created;
    }
  };
}

function createGatheringFailureFeedback() {
  return {
    async apply({ failureOutcome, actor, viewer, system, environment, task, outcome, checkResult } = {}) {
      if (failureOutcome?.mode === 'macro') {
        try {
          return await runGatheringMacro(failureOutcome.macroUuid, {
            kind: 'gatheringFailure',
            actor,
            viewer,
            system,
            environment,
            task,
            outcome,
            checkResult
          });
        } catch (err) {
          console.error('Fabricate | Gathering failure-feedback macro failed:', err);
          const fallback = game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
          ui.notifications?.warn?.(fallback);
          return { message: fallback, error: err?.message || 'Macro threw' };
        }
      }
      const message = failureOutcome?.text || game.i18n?.localize?.('FABRICATE.Gathering.FailureDefault') || 'Gathering produced no results.';
      ui.notifications?.warn?.(message);
      return { message };
    }
  };
}

function fabricateEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function eventScenePromptText(key, fallback, data) {
  const i18n = game?.i18n;
  if (!i18n) return fallback;
  if (data) return i18n.format?.(key, data) ?? fallback;
  const out = i18n.localize?.(key);
  return out && out !== key ? out : fallback;
}

// GM-side prompt: choose which active players to pull to a dropped event's
// linked scene. The GM also views the scene; selected players are pulled via
// the module socket. Lives here (not the engine) because it is Foundry glue.
async function showEventScenePrompt({ sceneUuid, eventName } = {}) {
  const scene = typeof fromUuid === 'function' ? await fromUuid(sceneUuid) : null;
  if (!scene) {
    ui.notifications?.warn?.(eventScenePromptText(
      'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Missing',
      'The event\'s linked scene could not be found.'
    ));
    return;
  }
  const sceneName = scene.name || sceneUuid;
  const players = Array.from(game.users?.contents || []).filter(user => user?.active && !user?.isGM);
  const intro = eventScenePromptText(
    'FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Intro',
    `${eventName || 'An event'} dropped. Move players to ${sceneName}?`,
    { event: eventName || 'An event', scene: sceneName }
  );
  const rows = players.length === 0
    ? `<p class="notes">${fabricateEscapeHtml(eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.NoPlayers', 'No active players to move.'))}</p>`
    : players.map(user => `<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" class="fab-pull-player" value="${fabricateEscapeHtml(user.id)}" checked /> ${fabricateEscapeHtml(user.name)}</label>`).join('');
  const content = `<div style="display:flex;flex-direction:column;gap:6px;"><p>${fabricateEscapeHtml(intro)}</p>${rows}</div>`;
  renderDialog({
    title: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Title', 'An event occurred'),
    content,
    default: 'move',
    buttons: {
      move: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Move', 'Move players'),
        callback: (html) => {
          const root = html?.[0] ?? html;
          const userIds = root
            ? Array.from(root.querySelectorAll('.fab-pull-player:checked')).map(input => input.value)
            : [];
          void viewScene(sceneUuid);
          if (userIds.length > 0) {
            game.socket?.emit(EVENT_SCENE_SOCKET, { action: 'pullToScene', sceneUuid, userIds });
          }
        }
      },
      cancel: {
        label: eventScenePromptText('FABRICATE.Admin.Manager.Environment.Events.EventScenePrompt.Cancel', 'Cancel')
      }
    }
  });
}

function flattenGatheringResults(resultGroups = []) {
  return resultGroups.flatMap(group => Array.isArray(group?.results) ? group.results : []);
}

function resolveGatheringResultSource(result, system, craftingSystemManager) {
  if (result?.itemUuid) return resolveUuidSync(result.itemUuid);
  const componentId = result?.componentId || result?.systemItemId;
  const component = (system?.components ?? []).find(entry => entry.id === componentId)
    ?? craftingSystemManager?.getSystem?.(system?.id)?.components?.find(entry => entry.id === componentId)
    ?? null;
  if (!component) return null;
  if (component.sourceUuid) return resolveUuidSync(component.sourceUuid) ?? component;
  return component;
}

function resolveUuidSync(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return null;
  try {
    return globalThis.fromUuidSync(uuid) ?? null;
  } catch (_err) {
    return null;
  }
}

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

function gatheringRunItemRef(actor, item, quantity = 1) {
  return {
    actorUuid: actor?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.sourceUuid ?? null,
    quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1
  };
}

function localizeGathering(key, data = {}) {
  return game.i18n?.format?.(key, data) ?? game.i18n?.localize?.(key) ?? key;
}

/**
 * Dispatch startup/updateWorldTime processing for crafting, salvage, and gathering.
 *
 * Gathering timed completion is delegated to the module-internal GatheringEngine;
 * the raw engine is intentionally not exposed through `game.fabricate`.
 *
 * @param {number} worldTime Current Foundry world time.
 * @returns {Promise<void[]>} Promise that settles after every guarded processor settles.
 */
function processFabricateWorldTime(worldTime = Number(game.time?.worldTime || 0)) {
  return Promise.all(processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: () => game.fabricate?.getCraftingRunManager?.()?.processWorldTime?.(worldTime)
    },
    {
      label: 'Salvage',
      callback: () => game.fabricate?.getCraftingEngine?.()?.processPendingSalvageRuns?.(worldTime)
    },
    {
      label: 'Gathering',
      callback: () => gatheringEngine?.processWorldTime?.(worldTime)
    }
  ]));
}

/**
 * Fabricate - Universal Crafting System
 * Main module entry point
 */

// Tracks which deprecated API names have already warned so the notice fires
// once per old name rather than on every call.
const _deprecationWarned = new Set();

/**
 * Emit a one-time console deprecation notice for a renamed public API method.
 * Used by the `*Region*` → `*Realm*` delegates so existing macros/modules keep
 * working while nudging callers to the canonical name. Never throws.
 *
 * @param {string} oldName the deprecated method/helper name
 * @param {string} newName the canonical replacement
 */
function deprecate(oldName, newName) {
  if (_deprecationWarned.has(oldName)) return;
  _deprecationWarned.add(oldName);
  console.warn(`Fabricate: ${oldName} is deprecated; use ${newName} instead.`);
}

class Fabricate {
  constructor() {
    this.recipeManager = null;
    this.craftingEngine = null;
    this.craftingSystemManager = null;
    this.craftingRunManager = null;
    this.salvageRunManager = null;
    this._runJournalBuilder = null;
    this.gatheringEnvironmentStore = null;
    this.gatheringRichStateService = null;
    this.gatheringRunManager = null;
    this.gatheringGateAndCheckEvaluator = null;
    this.recipeVisibilityService = null;
    this.resolutionModeService = null;
    // Lazily-built player-facing crafting listing projector (issue: player
    // Crafting tab). Constructed on first read once the managers exist.
    this._craftingListingBuilder = null;
    // Lazily-built player-facing inventory listing projector (player Inventory
    // tab). Constructed on first read once the managers exist.
    this._inventoryListingBuilder = null;
    this.itemPilesIntegration = null;
    this.actorInventoryCoinSpender = null;
    this.actorPropertyCoinSpender = null;
    this.compendiumImporter = null;
    this.ready = false;
    // Replay-safe readiness signal: resolves once `initialize()` completes and
    // `this.ready` flips true. Unlike the one-shot `fabricate.ready` Hook, awaiting
    // this settled promise works even when readiness was reached before the caller
    // subscribed — so a late manager launch can never latch on a spent event.
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });
  }

  /**
   * Replay-safe readiness: resolves when the module has finished initializing.
   * Resolves immediately if startup already completed.
   * @returns {Promise<void>}
   */
  whenReady() {
    return this._readyPromise;
  }

  /**
   * Initialize the module
   */
  async initialize() {
    console.log('Fabricate | Initializing...');

    // Register settings
    this.registerSettings();
    applyCurrentFabricateTheme(getSetting, SETTING_KEYS.THEME);
    // Run data migrations before managers load persisted data
    await this._runMigrations();
    // Create managers
    this.recipeManager = new RecipeManager();
    this.craftingSystemManager = new CraftingSystemManager(this.recipeManager);
    this.craftingRunManager = new CraftingRunManager();
    this.salvageRunManager = new SalvageRunManager();
    this.gatheringRunManager = new GatheringRunManager();
    this.gatheringGateAndCheckEvaluator = new GatheringGateAndCheckEvaluator({
      evaluateExpression: evaluateGatheringExpression
    });
    this.recipeVisibilityService = new RecipeVisibilityService(this.recipeManager, this.craftingSystemManager);
    this.resolutionModeService = new ResolutionModeService(this.craftingSystemManager);
    this.itemPilesIntegration = new ItemPilesIntegration();
    this.itemPilesIntegration.detect();
    // The generic actor-inventory spender resolves a per-system coin adapter by
    // game.system.id; pf2e is the sole registered adapter (an internal map, not a plugin
    // registry). The actor-property spender is generic and needs no system-specific wiring.
    this.actorInventoryCoinSpender = new ActorInventoryCoinSpender({
      adapters: new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]),
    });
    this.actorPropertyCoinSpender = new ActorPropertyCoinSpender();
    this.compendiumImporter = new CompendiumImporter(this.craftingSystemManager, this.recipeManager);
    this.craftingEngine = new CraftingEngine(
      this.recipeManager,
      this.craftingRunManager,
      this.resolutionModeService,
      this.itemPilesIntegration,
      this.salvageRunManager,
      this.actorInventoryCoinSpender,
      this.actorPropertyCoinSpender
    );

    // Initialize recipe manager
    await this.recipeManager.initialize();
    await this.craftingSystemManager.initialize();
    this.gatheringEnvironmentStore = new GatheringEnvironmentStore({
      systemManager: this.craftingSystemManager,
      runCleanup: {
        removeRunsForSystem: (systemId) => this.gatheringRunManager.removeRunsForSystem(systemId),
        removeRunsForEnvironment: (environmentId) => this.gatheringRunManager.removeRunsForEnvironment(environmentId),
        removeRunsForTask: (taskId, options) => this.gatheringRunManager.removeRunsForTask(taskId, options)
      }
    });
    this.gatheringEnvironmentStore.load();
    // Per-system gathering realms + Fabricate-managed parties + current-realm
    // resolver for location-aware gathering. Parties persist to a world setting;
    // realms live on the crafting system via the realm store's updateSystem
    // seam. The resolver is constructor-injected into the engine (not imported).
    this.gatheringRealmStore = new GatheringRealmStore({ systemManager: this.craftingSystemManager });
    this.gatheringPartyStore = new GatheringPartyStore({
      getSetting,
      setSetting,
      randomID: () => foundry.utils.randomID(),
      getUserId: () => game.user?.id || null,
      now: () => Date.now()
    });
    this.gatheringPartyStore.load();
    this.gatheringLocationService = new GatheringLocationService({
      partyStore: this.gatheringPartyStore,
      systemManager: this.craftingSystemManager,
      // Live token-derived sensing: which Scene Region UUIDs the party's travel
      // marker token currently sits inside, across the marker's own scene(s).
      // Prefer Foundry's AUTHORITATIVE membership (V13 `TokenDocument#regions`),
      // maintained by the core region system and not subject to the move-animation
      // lag that makes position hit-testing report the region the token just left.
      // Fall back to position hit-testing only when membership is unavailable.
      senseSceneRegions: (travelActorUuid) => {
        const resolve = globalThis.fromUuidSync;
        if (typeof resolve !== 'function' || !travelActorUuid) return [];
        let actor = null;
        try { actor = resolve(String(travelActorUuid)); } catch (_) { actor = null; }
        const tokens = actor?.getActiveTokens?.(false, true) || [];
        const uuids = new Set();
        for (const token of tokens) {
          const memberRegions = token?.regions;
          let matched = false;
          if (memberRegions && typeof memberRegions[Symbol.iterator] === 'function') {
            for (const region of memberRegions) {
              if (region?.uuid) { uuids.add(String(region.uuid)); matched = true; }
            }
          }
          if (matched) continue;
          const scene = token?.parent ?? token?.scene ?? null;
          for (const uuid of sceneRegionUuidsContainingToken({ scene, token })) uuids.add(uuid);
        }
        return uuids;
      }
    });
    this.gatheringRichStateService = new GatheringRichStateService({
      environmentStore: this.gatheringEnvironmentStore,
      getSetting,
      setSetting,
      settingKey: SETTING_KEYS.GATHERING_CONFIG,
      nowWorldTime: () => Number(game.time?.worldTime || 0),
      getUserId: () => game.user?.id || null,
      hooks: Hooks,
      evaluateExpression: evaluateGatheringExpression,
      // Calendar-aware regen/respawn intervals: day/week lengths track the active
      // Foundry V13 world calendar (falls back to the Earth table when none).
      // Resolved per call so a mid-session calendar reconfig is picked up.
      secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null),
      // Interactable-scoped node seams (issue 302): resolve a behaviour by ref and
      // route its scoped-node write through the active GM.
      resolveRegionBehavior: (ref) => resolveInteractableBehaviorByRef(ref),
      writeInteractableBehavior: (ref, patch) => writeInteractableBehaviorNode(ref, patch)
    });
    gatheringEngine = new GatheringEngine({
      environmentStore: this.gatheringEnvironmentStore,
      runManager: this.gatheringRunManager,
      richState: this.gatheringRichStateService,
      evaluator: this.gatheringGateAndCheckEvaluator,
      systemManager: this.craftingSystemManager,
      getSelectableActors: getGatheringSelectableActors,
      isActorSelectable: ({ actor, viewer }) => isGatheringActorSelectableByUser(actor, viewer),
      isGamePaused: isCurrentWorldPaused,
      sceneAccess: createGatheringSceneAccess({
        getCurrentScene: () => game.scenes?.current ?? game.scene ?? globalThis.canvas?.scene ?? null
      }),
      toolAvailability: createGatheringToolAvailability({
        craftingSystemManager: this.craftingSystemManager,
        evaluator: this.gatheringGateAndCheckEvaluator
      }),
      resultCreator: createGatheringResultCreator(this.craftingSystemManager),
      toolBreakage: createGatheringToolBreakage({
        craftingSystemManager: this.craftingSystemManager,
        evaluateExpression: evaluateGatheringExpression
      }),
      failureFeedback: createGatheringFailureFeedback(),
      // Publishes the documented public `fabricate.gathering.*` integration hooks
      // on terminal completion for other module authors to subscribe to.
      hookPublisher: new GatheringHookPublisher({
        hooks: Hooks,
        nowWorldTime: () => Number(game.time?.worldTime || 0)
      }),
      eventSceneTrigger: createEventSceneTrigger({
        isGM: () => !!game.user?.isGM,
        emitPrompt: ({ sceneUuid, eventName }) => game.socket?.emit(EVENT_SCENE_SOCKET, {
          action: 'eventScenePrompt', sceneUuid, eventName, requestedBy: game.user?.id
        }),
        showPrompt: showEventScenePrompt
      }),
      getRunViewer: getGatheringRunViewer,
      locationResolver: this.gatheringLocationService,
      localize: localizeGathering,
      // Interactable-scoped node respawn enumeration (issue 302): scan scenes for
      // scoped-node behaviours and route the changed `system.node` write through the
      // active GM (same edge the config panel uses).
      scenes: () => game.scenes ?? null,
      applyInteractableBehaviorUpdate: (ref, update) =>
        applyInteractableBehaviorUpdate({
          sceneId: ref?.sceneId,
          regionId: ref?.regionId,
          behaviorId: ref?.behaviorId,
          update
        })
    });
    const validRecipes = new Set(this.recipeManager.getRecipes({}).map(r => r.id));
    const validSystems = new Set(this.craftingSystemManager.getSystems().map(s => s.id));
    const validSalvageComponentsBySystem = new Map(
      this.craftingSystemManager.getSystems().map(system => [
        system.id,
        new Set((system.components || []).map(component => component.id))
      ])
    );
    await this.craftingRunManager.cleanupInvalidRuns(validRecipes, validSystems);
    // Prune legacy phantom crafting runs: a single-step recipe with no time
    // requirement can never legitimately persist an active run, so any such run left
    // in the active store predates the craft() cleanup guard and is stranded.
    await this.craftingRunManager.pruneInstantaneousActiveRuns((id) =>
      this.recipeManager.getRecipe(id)
    );
    await this.salvageRunManager.cleanupInvalidRuns(validSystems, validSalvageComponentsBySystem);
    await this.recipeVisibilityService.cleanupLearnedRecipes(validRecipes);
    await cleanupStalePreferences(validSystems, validRecipes, getSetting, setSetting, {
      resolveGatheringActor,
      isSelectableGatheringActor
    });

    registerFragmentDiscoveryHook(this.craftingSystemManager, this.recipeVisibilityService);
    registerRecipeItemLearningHook(this.recipeVisibilityService);

    this.ready = true;
    this._resolveReady?.();
    console.log('Fabricate | Ready');
  }

  /**
   * Run versioned startup data migrations via MigrationRunner.
   */
  async _runMigrations() {
    const runner = new MigrationRunner({
      getSetting,
      setSetting,
      // GM-only interactive recovery prompt (DialogV2). The runner invokes this
      // seam on a fatal abort with { downgradeTo, documents, label }; we build a
      // Foundry-free config via the pure helper and open DialogV2 here. The
      // "Keep existing data" choice is the default and matches the runner's
      // already-applied behavior (rollback, persist nothing, version unchanged).
      // The fix/retry choice is informational only: retry is explicit and
      // user-initiated — the GM fixes/deletes the failed documents and RELOADS
      // Foundry, at which point migrations re-run automatically because
      // migrationVersion was not advanced. There is NO same-pass auto-retry.
      promptRecovery: (context) => this._promptMigrationRecovery(context)
    });
    const summary = await runner.run();

    // Aborted pass: a fatal migration error rolled the in-memory data back and
    // persisted nothing (migrationVersion is unchanged). Surface a GM-facing error
    // notification and return early WITHOUT firing any success notices. Detailed
    // per-document recovery guidance is already emitted to the console by the runner.
    if (summary?.aborted === true) {
      if (game.user?.isGM) {
        const message = game.i18n?.localize?.('FABRICATE.Migration.Aborted.Notice')
          || 'Fabricate migration aborted. Your existing data has been kept unchanged. See the console (F12) for per-document recovery guidance.';
        ui.notifications?.error?.(message);
      }
      return;
    }

    // One-time GM-facing notice: when the 0.6.0 migration actually converted catalysts into
    // shared library Tools, tell the GM (so they know where the catalyst data went). GM-only
    // and only when something was migrated; the pure migration stays free of edge effects.
    const migratedCount = Number(summary?.migratedCatalystCount || 0);
    if (migratedCount > 0 && game.user?.isGM) {
      const message = game.i18n?.format?.('FABRICATE.Migration.CatalystsToTools.Notice', { count: migratedCount })
        || `Fabricate migrated ${migratedCount} catalyst(s) to the Tools library. Find them under the Tools tab.`;
      ui.notifications?.info?.(message);
    }

    // One-time GM-facing notice: when the 0.9.0 migration unified legacy realms on
    // one or more systems, name them so the GM can re-enable Travel & Realms (the
    // subsystem stays disabled by default) and knows realm-scoped records may now
    // appear in more environments. GM-only; only when something was migrated.
    const unifiedRegionSystems = Array.isArray(summary?.unifiedRegionSystems) ? summary.unifiedRegionSystems : [];
    if (unifiedRegionSystems.length > 0 && game.user?.isGM) {
      const systemList = unifiedRegionSystems.join(', ');
      const message = game.i18n?.format?.('FABRICATE.Migration.UnifyRegions.Notice', { systems: systemList })
        || `Fabricate unified gathering realms for: ${systemList}. Travel & Realms is disabled by default — enable it per system. Realm-scoped tasks/events may now appear in more environments.`;
      ui.notifications?.info?.(message);
    }

    // One-time GM-facing notice: when the 1.6.0 migration removed the legacy routed
    // result-selection providers, dropping roll-table references (the draw mechanism
    // is gone) and stripping gathering-task result selections. Name the affected
    // recipes/tasks so the GM can reconfigure them; routed gathering tasks now resolve
    // via the system gathering check, so the GM must populate
    // `gatheringCraftingCheck.routed.rollFormula` for any stripped task. GM-only; only
    // when something was actually dropped or stripped.
    const removedProviders = summary?.removedResultSelectionProviders ?? null;
    const droppedRollTableRecipes = Array.isArray(removedProviders?.droppedRollTableRecipes)
      ? removedProviders.droppedRollTableRecipes : [];
    const strippedGatheringTasks = Array.isArray(removedProviders?.strippedGatheringTasks)
      ? removedProviders.strippedGatheringTasks : [];
    if ((droppedRollTableRecipes.length > 0 || strippedGatheringTasks.length > 0) && game.user?.isGM) {
      // Console recovery log naming the affected recipes/tasks. Routed gathering tasks now
      // resolve via the system gathering check, so the GM must populate
      // `gatheringCraftingCheck.routed.rollFormula` for any stripped task. The localized GM
      // toast + lang key ride PR-2 of #424 (the UI PR that carries screenshot evidence).
      console.warn(
        'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
          'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
        { droppedRollTableRecipes, strippedGatheringTasks }
      );
    }
  }

  /**
   * Thin Foundry edge for the GM migration-abort recovery prompt.
   *
   * GM-only and defensive (never throws): a failure to open the dialog must not
   * break startup — the console guidance and the aborted error notification
   * already covered the GM. Builds the dialog config via the pure
   * `buildMigrationRecoveryPrompt` helper, then opens `DialogV2` with both
   * choices and "Keep existing data" pre-selected as the default.
   *
   * @param {{ downgradeTo?: string|null, documents?: object[], label?: string }} context
   *   abort context from the MigrationRunner `promptRecovery` seam.
   */
  async _promptMigrationRecovery(context) {
    try {
      if (!game.user?.isGM) return;
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      if (!DialogV2?.wait && !DialogV2?.prompt) return;

      const localize = (key, data) =>
        data ? game.i18n?.format?.(key, data) ?? key : game.i18n?.localize?.(key) ?? key;
      const config = buildMigrationRecoveryPrompt(context, localize);

      const buttons = config.buttons.map((button) => ({
        action: button.action,
        label: button.label,
        default: button.default
      }));

      // DialogV2.wait resolves to the chosen action; both choices are
      // informational here (the runner already kept existing data). Closing the
      // dialog is equivalent to "Keep existing data".
      await DialogV2.wait({
        window: { title: config.title },
        content: config.content,
        buttons,
        default: config.default,
        rejectClose: false
      });
    } catch (error) {
      console.warn(`Fabricate | Failed to present migration recovery prompt: ${error?.message ?? error}`);
    }
  }

  /**
   * Register module settings
   */
  registerSettings() {
    registerFabricateSettings();
  }

  /**
   * Get the recipe manager instance
   */
  getRecipeManager() {
    return this.recipeManager;
  }

  /**
   * Get the crafting engine instance
   */
  getCraftingEngine() {
    return this.craftingEngine;
  }

  /**
   * Get the crafting system manager instance
   */
  getCraftingSystemManager() {
    return this.craftingSystemManager;
  }

  /**
   * Get the crafting run manager instance
   */
  getCraftingRunManager() {
    return this.craftingRunManager;
  }

  getSalvageRunManager() {
    return this.salvageRunManager;
  }

  /**
   * Get the gathering environment store.
   *
   * This exposes persisted environment management without exposing the
   * module-internal GatheringEngine.
   *
   * @returns {GatheringEnvironmentStore|null}
   */
  getGatheringEnvironmentStore() {
    return this.gatheringEnvironmentStore;
  }

  /**
   * Get the Fabricate-managed gathering party store (world-level parties).
   *
   * @returns {GatheringPartyStore|null}
   */
  getGatheringPartyStore() {
    this._requireReady();
    return this.gatheringPartyStore;
  }

  /**
   * Get the per-system gathering realm store.
   *
   * @returns {GatheringRealmStore|null}
   */
  getGatheringRealmStore() {
    this._requireReady();
    return this.gatheringRealmStore;
  }

  /**
   * @deprecated Use {@link getGatheringRealmStore}.
   * @returns {GatheringRealmStore|null}
   */
  getGatheringRegionStore() {
    deprecate('getGatheringRegionStore', 'getGatheringRealmStore');
    return this.getGatheringRealmStore();
  }

  /**
   * Get the current-realm resolver used for location-aware gathering.
   *
   * @returns {GatheringLocationService|null}
   */
  getGatheringLocationService() {
    this._requireReady();
    return this.gatheringLocationService;
  }

  /**
   * Read redaction-safe current-realm evidence for a selected actor and system.
   * Player-callable: the result reports only the resolved source token and
   * disclosure-safe realm display data, never raw secret realm records.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string }} options
   * @returns {{ resolved: boolean, source: string, realms: object[], realmIds: string[], staleRealmIds: string[] }|null}
   */
  getGatheringLocationForActor({ actorId = null, actor = null, systemId = null } = {}) {
    this._requireReady();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId) return null;
    // Realm/travel disabled for this system ⇒ no location surface at all.
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    const context = this.gatheringLocationService?.buildCurrentRealmContext({ actor: resolvedActor, systemId });
    if (!context) return null;
    const isGM = game.user?.isGM === true;
    const system = this.craftingSystemManager?.getSystem(systemId);
    const revealMode = system?.gatheringRealmSettings?.revealMode || 'manual';
    const discoveredRealmIds = getDiscoveredRealmIdsForSystem(resolvedActor, systemId);
    return buildLocationSummaryForViewer({ context, isGM, revealMode, discoveredRealmIds });
  }

  /**
   * Set a party's manual current-realm override for one crafting system. GM-only.
   *
   * @param {{ partyId: string, systemId: string, realmIds?: string[] }} options
   * @returns {Promise<object|null>}
   */
  setGatheringPartyRealmOverride({ partyId = null, systemId = null, realmIds = [] } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled ⇒ no-op (no override writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.setCurrentRealmOverride(partyId, systemId, realmIds);
  }

  /**
   * @deprecated Use {@link setGatheringPartyRealmOverride}.
   * @param {{ partyId: string, systemId: string, regionIds?: string[] }} options
   * @returns {Promise<object|null>}
   */
  setGatheringPartyRegionOverride({ partyId = null, systemId = null, regionIds = [] } = {}) {
    deprecate('setGatheringPartyRegionOverride', 'setGatheringPartyRealmOverride');
    return this.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: regionIds });
  }

  /**
   * Clear a party's current-realm override for one crafting system (stamped,
   * empties realmIds). GM-only.
   *
   * @param {{ partyId: string, systemId: string }} options
   * @returns {Promise<object|null>}
   */
  clearGatheringPartyRealmOverride({ partyId = null, systemId = null } = {}) {
    this._requireReady();
    this._requireGM();
    if (!partyId || !systemId) return null;
    // Realm/travel disabled ⇒ no-op (no override writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return null;
    return this.gatheringPartyStore?.clearCurrentRealmOverride(partyId, systemId);
  }

  /**
   * @deprecated Use {@link clearGatheringPartyRealmOverride}.
   * @param {{ partyId: string, systemId: string }} options
   * @returns {Promise<object|null>}
   */
  clearGatheringPartyRegionOverride({ partyId = null, systemId = null } = {}) {
    deprecate('clearGatheringPartyRegionOverride', 'clearGatheringPartyRealmOverride');
    return this.clearGatheringPartyRealmOverride({ partyId, systemId });
  }

  /**
   * Reveal a realm's discovery on an actor. GM-only; validates the realm
   * belongs to the referenced crafting system before writing.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string, realmId: string, source?: string, partyId?: string }} options
   * @returns {Promise<boolean>}
   */
  revealGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null, source = 'manual', partyId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    const system = this.craftingSystemManager?.getSystem(systemId);
    // Realm/travel disabled ⇒ no-op (no discovery writes).
    if (!isGatheringRealmsEnabled(system)) return Promise.resolve(false);
    return revealGatheringRealm(resolvedActor, {
      systemId,
      realmId,
      source,
      partyId,
      validateRealmInSystem: system,
      now: () => Date.now()
    });
  }

  /**
   * @deprecated Use {@link revealGatheringRealmForActor}.
   * @param {{ actorId?: string, actor?: object, systemId: string, regionId: string, source?: string, partyId?: string }} options
   * @returns {Promise<boolean>}
   */
  revealGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null, source = 'manual', partyId = null } = {}) {
    deprecate('revealGatheringRegionForActor', 'revealGatheringRealmForActor');
    return this.revealGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId, source, partyId });
  }

  /**
   * Hide (remove) a realm's discovery on an actor. GM-only.
   *
   * @param {{ actorId?: string, actor?: object, systemId: string, realmId: string }} options
   * @returns {Promise<boolean>}
   */
  hideGatheringRealmForActor({ actorId = null, actor = null, systemId = null, realmId = null } = {}) {
    this._requireReady();
    this._requireGM();
    const resolvedActor = actor || (actorId ? game.actors?.get(actorId) : null);
    if (!resolvedActor || !systemId || !realmId) return Promise.resolve(false);
    // Realm/travel disabled ⇒ no-op (no discovery writes).
    if (!isGatheringRealmsEnabled(this.craftingSystemManager?.getSystem(systemId))) return Promise.resolve(false);
    return hideGatheringRealm(resolvedActor, { systemId, realmId });
  }

  /**
   * @deprecated Use {@link hideGatheringRealmForActor}.
   * @param {{ actorId?: string, actor?: object, systemId: string, regionId: string }} options
   * @returns {Promise<boolean>}
   */
  hideGatheringRegionForActor({ actorId = null, actor = null, systemId = null, regionId = null } = {}) {
    deprecate('hideGatheringRegionForActor', 'hideGatheringRealmForActor');
    return this.hideGatheringRealmForActor({ actorId, actor, systemId, realmId: regionId });
  }

  /**
   * Get the gathering run manager.
   *
   * @returns {GatheringRunManager|null}
   */
  getGatheringRunManager() {
    return this.gatheringRunManager;
  }

  /**
   * Get the gathering gate/check evaluator.
   *
   * @returns {GatheringGateAndCheckEvaluator|null}
   */
  getGatheringGateAndCheckEvaluator() {
    return this.gatheringGateAndCheckEvaluator;
  }

  getGatheringRichStateService() {
    return this.gatheringRichStateService;
  }

  /**
   * Get the recipe visibility service instance
   */
  getRecipeVisibilityService() {
    return this.recipeVisibilityService;
  }

  getResolutionModeService() {
    return this.resolutionModeService;
  }

  getItemPilesIntegration() {
    return this.itemPilesIntegration;
  }

  getActorInventoryCoinSpender() {
    return this.actorInventoryCoinSpender;
  }

  getActorPropertyCoinSpender() {
    return this.actorPropertyCoinSpender;
  }

  getCompendiumImporter() {
    return this.compendiumImporter;
  }

  /**
   * Merge caller `options` with the persisted remembered-actor default.
   *
   * A TRUTHY `options.rememberedActorId` overrides; a `null`/`undefined`/empty
   * id falls back to the persisted last-gathering selection
   * ({@link Fabricate#getSelectedGatheringActorId}). This matters because the UI
   * passes `rememberedActorId: store.selectedActorId ?? null`, and on a fresh
   * open that selection is `null` before the actor bar settles. Previously a
   * spread (`{ rememberedActorId: persisted, ...options }`) let that explicit
   * `null` clobber the persisted default, so the engine resolved its last-resort
   * `selectableActors[0]` (an arbitrary first actor) instead of the displayed
   * one — the wrong-actor bug where every required tool reads "missing" until you
   * reselect the actor. Coalescing here keeps the displayed/persisted actor as
   * the default for the listing, the attempt, and the drop breakdown alike.
   *
   * @param {object} [options]
   * @returns {object} `options` with `rememberedActorId` defaulted.
   */
  _withRememberedActorDefault(options = {}) {
    return {
      ...options,
      rememberedActorId: options.rememberedActorId || this.getSelectedGatheringActorId() || null,
    };
  }

  /**
   * List gathering environments/tasks for the current user and selected actor.
   *
   * The internal GatheringEngine receives the current Foundry user as viewer,
   * regardless of any viewer supplied by the caller.
   *
   * When `options.rememberedActorId` is omitted (or otherwise absent), it
   * defaults to the persisted last-gathering selection
   * ({@link Fabricate#getSelectedGatheringActorId}) so a fresh listing honors
   * the remembered actor. A truthy `rememberedActorId` in `options` overrides
   * that default; a `null` or omitted id falls back to the persisted selection
   * (it does NOT force the engine's arbitrary first-selectable-actor fallback).
   * The engine resolves the id against its OWNERSHIP
   * selectable list, not the narrower player-character list used by the actor
   * selection bar, so a legacy persisted owned non-player-character id is still
   * honored for that fetch.
   *
   * @param {object} [options] Gathering listing options.
   * @param {string|null} [options.rememberedActorId] Actor id to list for;
   *   defaults to the persisted last-gathering selection when omitted.
   * @returns {*} Gathering listing result with attemptability metadata.
   */
  listGatheringForActor(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve against the persisted last-gathering selection by default; an
    // explicit (truthy) actor id still overrides. See _withRememberedActorDefault.
    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'listForActor', withRememberedActor, () => game.user);
  }

  /**
   * List the actors the current user may select as a gathering actor in the
   * unified-window actor selection bar.
   *
   * Returns the user's selectable **player characters** — owned for non-GM
   * users, all for GMs, narrowed by the player-character concept
   * ({@link isPlayerCharacterActor}). The result is redaction-safe display data:
   * each record contains ONLY `{ id, uuid, name, img }` and no other actor
   * internals. This selection predicate is distinct from gathering attempt
   * authorization and does not expand it.
   *
   * @returns {Array<{id: string|null, uuid: string|null, name: string, img: string|null}>}
   */
  listSelectableActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null
    }));
  }

  /**
   * Read the persisted remembered gathering-actor selection.
   *
   * Reads the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced. Returns an empty string when unset.
   *
   * @returns {string} The persisted actor id, or '' when unset.
   */
  getSelectedGatheringActorId() {
    return getSetting(SETTING_KEYS.LAST_GATHERING_ACTOR) || '';
  }

  /**
   * Persist the remembered gathering-actor selection.
   *
   * Writes the existing `LAST_GATHERING_ACTOR` client setting; no new key is
   * introduced.
   *
   * @param {string} id Actor id to persist.
   * @returns {*} The setSetting result.
   */
  setSelectedGatheringActorId(id) {
    return setSetting(SETTING_KEYS.LAST_GATHERING_ACTOR, id ?? '');
  }

  /**
   * Lazily build (and cache) the {@link CraftingListingBuilder} that projects the
   * crafting backend into redaction-safe player listing models. Mirrors the
   * gathering listing path: a one-directional read-side collaborator wired with
   * the existing managers/services so GM and player viewers resolve through one
   * code path. The builder imports no Foundry globals — `localize` and
   * `nowWorldTime` are injected here.
   *
   * @returns {CraftingListingBuilder}
   * @private
   */
  _getCraftingListingBuilder() {
    if (this._craftingListingBuilder) return this._craftingListingBuilder;
    this._craftingListingBuilder = new CraftingListingBuilder({
      recipeManager: this.recipeManager,
      recipeVisibility: this.recipeVisibilityService,
      resolutionModeService: this.resolutionModeService,
      craftingSystemManager: this.craftingSystemManager,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      resolveCheckFormula: (formula, actor) => resolveCheckFormulaDisplay(formula, actor),
    });
    return this._craftingListingBuilder;
  }

  /**
   * Resolve a stored crafting actor preference against Foundry's actor
   * collection. Returns null when the id is empty or stale.
   *
   * Defense-in-depth: for a non-GM viewer the resolved actor must pass the same
   * ownership predicate the gathering attempt path uses, so a stale or
   * console-supplied id the current user does not own can never have its
   * inventory read by the listing projection. A GM resolves any extant actor.
   *
   * @param {string|null} actorId
   * @returns {Actor|null}
   * @private
   */
  _resolveCraftingActor(actorId) {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    if (!actor) return null;
    if (game.user?.isGM === true) return actor;
    return isGatheringActorSelectableByUser(actor, game.user) ? actor : null;
  }

  /**
   * Resolve the effective crafting actor + component-source actors for a listing
   * or craft, applying the persisted defaults. A truthy `rememberedActorId`
   * overrides the persisted selection; component-source ids default to the
   * persisted set. Stale/non-extant ids resolve to nothing.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId]
   * @param {string[]|null} [options.componentSourceActorIds]
   * @returns {{ craftingActor: Actor|null, componentSourceActors: Actor[] }}
   * @private
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
  }

  /**
   * Build the player-facing Crafting listing for the current user and selected
   * crafting actor + component sources. The current Foundry user is always the
   * viewer (GM bypass is honoured by the visibility service), regardless of any
   * caller-supplied viewer.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Crafting actor id; defaults
   *   to the persisted last-crafting selection when omitted.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory
   *   source actor ids; defaults to the persisted component-source set.
   * @returns {object} Redaction-safe crafting listing model.
   */
  listCraftingForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getCraftingListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Lazily build (and cache) the {@link InventoryListingBuilder} that projects the
   * owned-component view for the player Inventory tab. Mirrors
   * {@link Fabricate#_getCraftingListingBuilder}: a Foundry-global-free read-side
   * collaborator wired with the existing managers — `localize` and `nowWorldTime`
   * are injected here. `recipeVisibility` is injected so a non-GM viewer's used-by
   * list never names an undiscovered (teaser) recipe.
   *
   * @returns {InventoryListingBuilder}
   * @private
   */
  _getInventoryListingBuilder() {
    if (this._inventoryListingBuilder) return this._inventoryListingBuilder;
    this._inventoryListingBuilder = new InventoryListingBuilder({
      recipeManager: this.recipeManager,
      craftingSystemManager: this.craftingSystemManager,
      recipeVisibility: this.recipeVisibilityService,
      localize: (key, data) =>
        data !== undefined
          ? (game.i18n?.format?.(key, data) ?? key)
          : (game.i18n?.localize?.(key) ?? key),
      nowWorldTime: () => game.time?.worldTime ?? 0,
      // Gathering tasks live in the `gatheringConfig` setting (keyed by system id),
      // not on the system object — surface them for the "produced by" gathering index.
      getGatheringTasksForSystem: (systemId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
    });
    return this._inventoryListingBuilder;
  }

  /**
   * Build the player-facing Inventory listing for the current user's selected
   * crafting actor + component-source actors. Reuses the crafting selection
   * (same persisted actor + component sources) so the Inventory and Crafting tabs
   * agree on what the player owns. The current Foundry user is always the viewer.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Crafting actor id; defaults
   *   to the persisted last-crafting selection when omitted.
   * @param {string[]|null} [options.componentSourceActorIds] Additional inventory
   *   source actor ids; defaults to the persisted component-source set.
   * @returns {object} Inventory listing model (owned components + essence rows).
   */
  listInventoryForActor(options = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources(options);
    return this._getInventoryListingBuilder().buildListing({
      craftingActor,
      componentSourceActors,
      viewer: game.user,
    });
  }

  /**
   * Learn one recipe from an owned recipe-item "book" for the player Inventory
   * learn affordance. Resolves the crafting actor + component sources (same scope
   * the inventory listing was computed for), then delegates to the visibility
   * service, which enforces the per-document learn budget for capped systems and
   * leaves uncapped books intact.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id (defaults to the
   *   persisted selection).
   * @param {string} options.recipeId Recipe to learn.
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
   */
  async learnRecipeFromInventory({ actorId = null, recipeId = null, componentSourceActorIds = null } = {}) {
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
  }

  /**
   * Craft a recipe for the current selection, delegating to {@link Fabricate#craft}.
   * Resolves the crafting actor + component sources from the supplied ids (or the
   * persisted defaults) so the attempt uses the same inventory scope the listing
   * was computed for.
   *
   * @param {object} options
   * @param {string|null} [options.actorId] Crafting actor id.
   * @param {string} options.recipeId Recipe id.
   * @param {string|null} [options.ingredientSetId] Chosen ingredient set id.
   * @param {string[]|null} [options.componentSourceActorIds] Source actor ids.
   * @param {boolean} [options.interactive] When true, prompt the player with the
   *   confirm-roll dialog (optional situational modifier) and post the roll to chat
   *   so Dice So Nice animates it. Defaults to false so macros and automation keep
   *   the original silent behaviour. The Fabricate Crafting tab passes true. A
   *   dismissed prompt returns `{ success: false, cancelled: true }` with zero
   *   mutation (no ingredients, currency, or tools consumed, no run created).
   * @returns {Promise<{success: boolean, results: Array|null, message: string, cancelled?: boolean}>}
   */
  async craftRecipe({ actorId = null, recipeId, ingredientSetId = null, componentSourceActorIds = null, interactive = false } = {}) {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources({
      rememberedActorId: actorId,
      componentSourceActorIds,
    });
    if (!craftingActor) {
      return { success: false, results: null, message: 'No crafting actor selected' };
    }
    const sources = componentSourceActors.length > 0 ? componentSourceActors : [craftingActor];
    // `interactive` (UI-triggered craft) opts into the confirm-roll dialog + chat
    // post; omitted/false for macros/automation so they stay silent (no API break).
    return await this.craft(craftingActor, recipeId, {
      componentSourceActors: sources,
      ingredientSetId,
      interactive,
    });
  }

  /**
   * List the actors the current user may select as crafting/component-source
   * actors. Filtered exactly like the actor-selection bar
   * (`getBarSelectableActors` → owned player characters; a GM sees all) so the
   * component-source picker offers the same characters as the crafting-actor
   * selector — not owned non-character actors. Returns redaction-safe display data
   * only — each record carries `{ id, uuid, name, img }`.
   *
   * @returns {Array<{id: string|null, uuid: string|null, name: string, img: string|null}>}
   */
  listCraftingSourceActors() {
    this._requireReady();
    return getBarSelectableActors({ viewer: game.user }).map((actor) => ({
      id: actor?.id ?? actor?.uuid ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      img: actor?.img ?? null,
    }));
  }

  /**
   * Resolve the current selection's component-source actors as real Foundry actor
   * objects (crafting actor + persisted sources), for the pure shopping-list
   * aggregator. Owner-scoped via the persisted ids only — no widening of access.
   *
   * @returns {Actor[]}
   */
  getCraftingSourceActors() {
    this._requireReady();
    const { craftingActor, componentSourceActors } = this._resolveCraftingSources();
    const actors = componentSourceActors.length > 0 ? componentSourceActors : [];
    if (craftingActor && !actors.includes(craftingActor)) actors.unshift(craftingActor);
    return actors;
  }

  /**
   * Read the persisted remembered crafting-actor selection (`LAST_CRAFTING_ACTOR`
   * client setting). Returns an empty string when unset.
   *
   * @returns {string}
   */
  getSelectedCraftingActorId() {
    return getSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR) || '';
  }

  /**
   * Persist the remembered crafting-actor selection (`LAST_CRAFTING_ACTOR`).
   *
   * @param {string} id Actor id to persist.
   * @returns {*}
   */
  setSelectedCraftingActorId(id) {
    return setSetting(SETTING_KEYS.LAST_CRAFTING_ACTOR, id ?? '');
  }

  /**
   * Read the persisted component-source actor ids (`LAST_COMPONENT_SOURCES`).
   *
   * @returns {string[]}
   */
  getCraftingComponentSourceIds() {
    const ids = getSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES);
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * Persist the component-source actor ids (`LAST_COMPONENT_SOURCES`).
   *
   * @param {string[]} ids Actor ids to persist.
   * @returns {*}
   */
  setCraftingComponentSourceIds(ids) {
    return setSetting(SETTING_KEYS.LAST_COMPONENT_SOURCES, Array.isArray(ids) ? ids : []);
  }

  /**
   * The player's favourite recipe ids (client-scoped, `FAVOURITE_RECIPES`).
   *
   * @returns {string[]}
   */
  getFavouriteRecipeIds() {
    const ids = getSetting(SETTING_KEYS.FAVOURITE_RECIPES);
    return Array.isArray(ids) ? ids : [];
  }

  /**
   * Toggle a recipe's favourite state and persist the updated id list.
   *
   * @param {string} recipeId The recipe id to add/remove.
   * @returns {string[]} The updated favourite id list (unchanged if `recipeId` is falsy).
   */
  toggleFavouriteRecipe(recipeId) {
    const current = this.getFavouriteRecipeIds();
    if (!recipeId) return current;
    const next = current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : [...current, recipeId];
    setSetting(SETTING_KEYS.FAVOURITE_RECIPES, next);
    return next;
  }

  /**
   * Whether the player has opted to hide unavailable (locked) gathering
   * environments in the Environments column.
   *
   * Backed by the `GATHERING_HIDE_UNAVAILABLE` setting, which is
   * `scope: 'client'`. A client-scoped setting persists in that browser's
   * `localStorage`, so this preference is per client/device, not per user.
   * The same account on a second device or browser starts at the default
   * (off). Defaults to false (show all).
   *
   * @returns {boolean}
   */
  getHideUnavailableEnvironments() {
    // Boolean() rather than `=== true`: the setting is registered `type: Boolean`
    // so the value is already boolean, and the strict compare trips a static-analysis
    // false positive (game.settings.get is not typed as boolean).
    return Boolean(getSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE));
  }

  /**
   * Persist the player's "hide unavailable environments" preference.
   *
   * Writes the client-scoped `GATHERING_HIDE_UNAVAILABLE` setting, so the
   * choice is remembered per client/device (`localStorage`) and does not
   * follow the user account to another device. This is a view-only preference
   * and changes no saved data, the engine listing, or GM configuration.
   *
   * @param {boolean} value Whether to hide unavailable (locked) environments.
   * @returns {Promise<boolean>}
   */
  setHideUnavailableEnvironments(value) {
    return setSetting(SETTING_KEYS.GATHERING_HIDE_UNAVAILABLE, value === true);
  }

  /**
   * Start a gathering attempt for the current user.
   *
   * The raw GatheringEngine remains module-internal so all public attempts use
   * current-user viewer enforcement.
   *
   * @param {object} options Gathering start-attempt options.
   * @param {boolean} [options.interactive] When true, prompt the player with the
   *   confirm-roll dialog (optional situational modifier) and post the roll to chat
   *   so Dice So Nice animates it, for the routed and progressive check paths.
   *   Defaults to false so macros and automation stay silent. The Fabricate
   *   Gathering view passes true. The d100 immediate gathering mode never prompts
   *   (its roll runs outside the shared check seam), and timed gathering tasks never
   *   prompt (they resolve at GM-gated world-time maturation). A dismissed prompt
   *   returns a quiet `{ accepted: false, cancelled: true }` result with zero
   *   mutation and no notification.
   * @returns {*} Gathering start-attempt result.
   */
  startGatheringAttempt(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Resolve the SAME actor the listing/availability was computed for: default
    // to the persisted selection, an explicit (truthy) id overrides. Without this
    // the engine falls back to selectableActors[0] and silently mis-gates the
    // attempt — the player-app "nothing happens" bug. See _withRememberedActorDefault.
    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'startAttempt', withRememberedActor, () => game.user);
  }

  /**
   * Lazily compute the per-drop "What you might find" breakdown for one task the
   * player has opened in the gathering inspector. Defaults the remembered actor
   * to the persisted selection (explicit `rememberedActorId` overrides) and
   * enforces the current Foundry user as the viewer.
   *
   * @param {object} options { environmentId, taskId, rememberedActorId? }
   * @returns {*} Drop-breakdown result ({ resolutionMode, awardMode, awardLimit, eventPolicy, drops }).
   */
  getGatheringDropBreakdown(options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    const withRememberedActor = this._withRememberedActorDefault(options);

    return callGatheringRuntimeWithCurrentViewer(gatheringEngine, 'getTaskDropBreakdown', withRememberedActor, () => game.user);
  }

  inspectGatheringEnvironmentState(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.inspectEnvironment(options.environmentId) ?? null;
  }

  restockGatheringNode(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.restockNode(options);
  }

  updateGatheringConditions(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.updateConditions(options);
  }

  /**
   * Read current gathering conditions and configured tag vocabularies.
   *
   * This public API is safe for player-facing callers. It exposes global
   * weather/time-of-day state and available gathering tags, but not GM-only
   * library internals.
   *
   * @returns {{weather: string, timeOfDay: string, vocabularies: object}|undefined}
   */
  getGatheringConditions() {
    this._requireReady();
    return this.gatheringRichStateService?.getConditions();
  }

  /**
   * Set the current global gathering weather tag.
   *
   * @param {string} weatherTag Configured weather tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringWeather(weatherTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setWeather(weatherTag);
  }

  /**
   * Set the current global gathering time-of-day tag.
   *
   * @param {string} timeOfDayTag Configured time-of-day tag.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringTimeOfDay(timeOfDayTag) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setTimeOfDay(timeOfDayTag);
  }

  /**
   * Atomically update global gathering conditions.
   *
   * Omitted fields keep their current values. Mutations require a GM user,
   * validate tags through the rich state service, persist the setting, and
   * dispatch the gathering condition update hook.
   *
   * @param {{weather?: string, timeOfDay?: string}} conditions Condition updates.
   * @returns {*} Updated gathering conditions.
   */
  setGatheringConditions(conditions = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setConditions(conditions);
  }

  setGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    // Legacy API back-compat: a `{ provider: 'external' }` argument maps to a
    // read-only max. The service also tolerates the legacy value, but mapping
    // it here keeps the public boundary on the `maxReadOnly` vocabulary.
    const { provider, ...rest } = options;
    const mapped =
      provider === undefined ? rest : { ...rest, maxReadOnly: provider === 'external' };
    return this.gatheringRichStateService?.setActorStamina(actor, mapped);
  }

  adjustGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    return this.gatheringRichStateService?.adjustActorStamina(actor, options);
  }

  /**
   * Read a crafting system's gathering economy block (mode + stamina regen).
   * Player-safe — the mode and regen cadence are surfaced in the player UI.
   *
   * @param {{systemId: string}} options
   * @returns {{mode: string, stamina: {regen: object}}|null}
   */
  getGatheringEconomy(options = {}) {
    this._requireReady();
    return this.gatheringRichStateService?.systemEconomy(options.systemId) ?? null;
  }

  /**
   * Set a crafting system's gathering economy block. GM-only.
   *
   * @param {{systemId: string, economy: object}} options
   * @returns {Promise<object|null>} The normalized economy block.
   */
  setGatheringEconomy(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.setSystemEconomy(options);
  }

  /**
   * List the stamina pools of player-owned actors for one crafting system, for
   * the GM "Gathering State" panel. GM-only.
   *
   * @param {{systemId: string}} options
   * @returns {Array<{actorId: string, name: string, img: string, current: number|null, max: number|null, maxReadOnly: boolean}>}
   */
  getGatheringStaminaState(options = {}) {
    this._requireReady();
    this._requireGM();
    const systemId = options.systemId;
    const service = this.gatheringRichStateService;
    if (!service || !systemId) return [];
    // Characters only — exclude NPCs (and other non-character actor types). A
    // character with no rolled pool yet reports max: null (the panel offers Roll).
    return Array.from(game.actors?.contents ?? [])
      .filter(actor => actor?.type === 'character')
      .map(actor => {
        const stamina = service.getActorStamina(actor, systemId);
        return { actorId: actor.id, name: actor.name, img: actor.img, ...stamina };
      });
  }

  /**
   * (Re)roll a character's stamina pool from the system max/start expression
   * templates and persist it. GM-only; used by the panel's Roll/Reset control.
   *
   * @param {{systemId: string, actorId: string}} options
   * @returns {Promise<object|null>} The materialized pool, or null.
   */
  rollGatheringStamina(options = {}) {
    this._requireReady();
    this._requireGM();
    const actor = options.actor || (options.actorId ? game.actors?.get(options.actorId) : null);
    if (!actor) return null;
    return this.gatheringRichStateService?.seedActorStaminaIfNeeded({ actor, systemId: options.systemId, force: true });
  }

  revealGatheringTask(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.revealTask(options.actor, options);
  }

  clearGatheringTaskReveal(options = {}) {
    this._requireReady();
    this._requireGM();
    return this.gatheringRichStateService?.clearReveal(options.actor, options);
  }

  _requireReady() {
    if (!this.ready) throw new Error('Fabricate not initialized');
  }

  _requireGM() {
    if (game.user?.isGM !== true) throw new Error('Gathering rich state changes require a GM user');
  }

  /**
   * Current world time in seconds (the Foundry-facing read seam). Lives on this
   * edge so the Journal store and pure UI utils stay free of `game.*`.
   *
   * @returns {number}
   */
  getWorldTime() {
    return Number(game.time?.worldTime || 0);
  }

  /**
   * Calendar components (`{ year, day, hour, minute, … }`) for an absolute world
   * time, via the V13 calendar's `timeToComponents`. Augmented with `daysPerYear`
   * (when derivable) so the pure {@link worldTimeLabel} util can compose a
   * monotonic, 1-based absolute campaign day from the within-year `day` (which
   * resets each year) without itself touching `game.*`. Returns null when no
   * calendar is configured.
   *
   * @param {number} [worldTime] Defaults to the current world time.
   * @returns {object|null}
   */
  getWorldTimeComponents(worldTime = this.getWorldTime()) {
    const calendar = game.time?.calendar ?? null;
    if (typeof calendar?.timeToComponents !== 'function') return null;
    try {
      const components = calendar.timeToComponents(Number(worldTime) || 0);
      if (!components || typeof components !== 'object') return null;
      const daysPerYear = daysPerYearFromCalendar(calendar);
      if (daysPerYear !== null) components.daysPerYear = daysPerYear;
      return components;
    } catch {
      return null;
    }
  }

  /**
   * Lazily construct the singleton {@link RunJournalBuilder}, wired to the real
   * run managers and services. Held on the instance so a fresh builder is not
   * rebuilt per listing call.
   * @private
   * @returns {RunJournalBuilder}
   */
  _getRunJournalBuilder() {
    if (!this._runJournalBuilder) {
      this._runJournalBuilder = new RunJournalBuilder({
        craftingRunManager: this.craftingRunManager,
        salvageRunManager: this.salvageRunManager,
        gatheringRunSource: this.gatheringRunManager,
        recipeManager: this.recipeManager,
        resolutionModeService: this.resolutionModeService,
        recipeVisibility: this.recipeVisibilityService,
        getSystem: (systemId) => this.craftingSystemManager?.getSystem(systemId) ?? null,
        getTool: (systemId, toolId) => this._resolveJournalTool(systemId, toolId),
        getGatheringTask: (environmentId, taskId) =>
          this._resolveJournalGatheringTask(environmentId, taskId),
        getRecipeItemImg: (systemId, recipeItemId) =>
          this.craftingSystemManager?.getRecipeItemDefinition?.(systemId, recipeItemId)?.img ?? null,
        getResultItem: (itemUuid) => this._resolveJournalResultItem(itemUuid),
        getViewer: () => game.user,
        localize: (key, data) => localizeGathering(key, data),
        nowWorldTime: () => this.getWorldTime(),
      });
    }
    return this._runJournalBuilder;
  }

  /**
   * Resolve a system library tool to `{ id, name, img }` for the Journal step
   * detail. The display name prefers the tool's authored label, falling back to
   * the referenced component's name, then the raw id.
   * @private
   */
  _resolveJournalTool(systemId, toolId) {
    const system = this.craftingSystemManager?.getSystem(systemId);
    if (!system || !toolId) return null;
    const tool = (system.tools || []).find((entry) => entry?.id === toolId);
    if (!tool) return null;
    const component = (system.components || []).find((entry) => entry?.id === tool.componentId);
    return {
      id: tool.id,
      name: tool.label || component?.name || tool.id,
      img: component?.img || null,
    };
  }

  /**
   * Resolve a gathering run's task to `{ name, img }` for the Journal, via the
   * COMPOSED environment (`_findEnvironment`), which carries the authored task
   * name/image — the raw environment store does not. Mirrors how a crafting run
   * resolves its recipe name/image. Returns null when the environment or task
   * cannot be resolved (the Journal then falls back to the raw task id + default).
   * @private
   */
  _resolveJournalGatheringTask(environmentId, taskId) {
    if (!environmentId || !taskId) return null;
    const environment = gatheringEngine?._findEnvironment?.(environmentId);
    const tasks = Array.isArray(environment?.tasks) ? environment.tasks : [];
    const task = tasks.find((entry) => entry?.id === taskId);
    return task ? { name: task.name, img: task.img } : null;
  }

  /**
   * Resolve a run's awarded/created result item to `{ name, img }` by its recorded
   * uuid, so the Journal can label produced items — including history recorded
   * before name/img were captured at award time. Best-effort + synchronous
   * (`fromUuidSync`); returns null when the item is gone or unresolvable.
   * @private
   */
  _resolveJournalResultItem(itemUuid) {
    if (!itemUuid || typeof fromUuidSync !== 'function') return null;
    let doc = null;
    try {
      doc = fromUuidSync(itemUuid);
    } catch {
      doc = null;
    }
    return doc ? { name: doc.name ?? null, img: doc.img ?? null } : null;
  }

  /**
   * Resolve the selected actor for the Journal against the bar-selectable list,
   * preferring a remembered id (by `id` or `uuid`), then the first selectable.
   * Mirrors the gathering listing's remembered-actor seam.
   * @private
   */
  _resolveJournalActor(rememberedActorId) {
    const selectable = getBarSelectableActors({ viewer: game.user });
    if (selectable.length === 0) return null;
    if (rememberedActorId) {
      const wanted = String(rememberedActorId);
      const match = selectable.find((actor) => actor?.id === wanted || actor?.uuid === wanted);
      if (match) return match;
    }
    return selectable[0];
  }

  /**
   * Build the unified Journal listing (active + terminal runs) for the current
   * user's selected actor. Resolves the actor via the same remembered-actor seam
   * as {@link Fabricate#listGatheringForActor}.
   *
   * @param {object} [options]
   * @param {string|null} [options.rememberedActorId] Actor id to list for.
   * @returns {object} The JournalListing.
   */
  listJournalForActor(options = {}) {
    this._requireReady();
    const { rememberedActorId } = this._withRememberedActorDefault(options);
    const actor = this._resolveJournalActor(rememberedActorId);
    return this._getRunJournalBuilder().buildListing({ actor, viewer: game.user });
  }

  /**
   * Advance a crafting run's current step — the single player-triggerable run
   * advance boundary. The run's persisted `componentSourceActorUuids` are UUIDs
   * (NOT ids), so they resolve via `fromUuidSync` (falsy entries filtered, with an
   * `[actor]` fallback when none resolve). Because `craft()` writes directly to
   * the source actors (no socket-to-GM relay), a non-owner of any source actor
   * cannot advance the run — that case returns a clear "needs owner" message
   * instead of throwing.
   *
   * @param {object} options
   * @param {string} options.actorId World-actor id the run is keyed to.
   * @param {string} options.runId Active run id.
   * @param {string} options.recipeId Recipe id to craft.
   * @param {boolean} [options.interactive] When true (a player "Trigger Next Step"
   *   click), prompt the interactive roll dialog + post the roll to chat. Defaults
   *   false so automated/headless advances stay silent.
   * @returns {Promise<object>} The craft result, or a `{ success: false, message }`.
   */
  async advanceCraftingRun({ actorId, runId, recipeId, interactive = false } = {}) {
    this._requireReady();
    const actor = game.actors?.get(actorId);
    const run = actor ? (this.craftingRunManager?.getActiveRun(actor, runId) ?? null) : null;
    const resolved = resolveAdvanceSources({ actor, run, fromUuid: globalThis.fromUuidSync });
    if (resolved.blocked) {
      return { success: false, message: localizeGathering('FABRICATE.App.Journal.Actions.NeedsOwner') };
    }
    return this.craft(actor, recipeId, {
      runId,
      componentSourceActors: resolved.componentSourceActors,
      interactive,
    });
  }

  /**
   * Quick craft helper - craft a recipe for an actor
   * @param {Actor} actor - The actor performing the craft
   * @param {string|Recipe} recipe - Recipe ID or Recipe object
   * @param {Object} options - Crafting options
   */
  async craft(actor, recipe, options = {}) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    // Get recipe object if ID was provided
    if (typeof recipe === 'string') {
      recipe = this.recipeManager.getRecipe(recipe);
      if (!recipe) {
        throw new Error(`Recipe ${recipe} not found`);
      }
    }

    const componentSourceActors = Array.isArray(options.componentSourceActors)
      ? options.componentSourceActors.filter(Boolean)
      : [actor];

    const ingredientSetId = options.ingredientSetId || null;

    return await this.craftingEngine.craft(
      actor,
      componentSourceActors,
      recipe,
      ingredientSetId,
      options
    );
  }

  /**
   * Delete a recipe by ID.
   * @param {string} recipeId - The recipe ID to delete
   */
  async deleteRecipe(recipeId) {
    if (!this.ready) {
      throw new Error('Fabricate not initialized');
    }

    return await this.recipeManager.deleteRecipe(recipeId);
  }
}

// Create global instance
const fabricate = new Fabricate();

// Register the init-time Foundry CONFIG entries for the canvas Interactable
// foundation. Defensive + idempotent: every call no-ops when the underlying API is
// missing or already registered, so it is safe to run from BOTH the `init` and
// `ready` hooks — the latter is a backstop for when a late module evaluation (e.g.
// the Vite dev server delivering the source entry after Foundry's `init` event)
// causes the `init` hook callback to be registered for an already-spent event and
// never run.
function registerFabricateConfig() {
  // Register the region-first `fabricate.interactable` Region Behaviour data model
  // + its type icon/label. Defensive + idempotent: no-ops when the Foundry region
  // APIs are unavailable (e.g. an older core), so it is safe to call unconditionally.
  registerInteractableRegionBehavior(CONFIG);

  // Register the CORE schema-driven RegionBehaviorConfig as the document sheet for
  // the `fabricate.interactable` RegionBehavior subtype (V13). Our rich
  // `InteractableConfigApp` is an ApplicationV2 + SvelteApplicationMixin, NOT a
  // DocumentSheet, so registering it left `behavior.sheet` null and broke the edit
  // pencil. The core sheet renders our behaviour fields (plus the `events`
  // multi-select) and makes `behavior.sheet` resolve. Our rich panel stays
  // reachable via the Tile/Token HUD entry + scene-control opener
  // (`getInteractableConfigAppClass().show(ref)`). Resolved defensively via
  // globalThis — a no-op when the API shape differs, so it never throws into init.
  try {
    const DocumentSheetConfig = foundry?.applications?.apps?.DocumentSheetConfig
      ?? globalThis.DocumentSheetConfig;
    const RegionBehavior = foundry?.documents?.RegionBehavior
      ?? CONFIG?.RegionBehavior?.documentClass
      ?? globalThis.RegionBehavior;
    const RegionBehaviorConfig = globalThis.foundry?.applications?.sheets?.RegionBehaviorConfig;
    if (typeof RegionBehaviorConfig === 'function') {
      assignInteractableConfigSheet({
        registrar: DocumentSheetConfig,
        RegionBehavior,
        SheetClass: RegionBehaviorConfig
      });
    }
  } catch (_error) {
    // Defensive: a sheet-registration shape mismatch must not break init.
  }
}

// Bind the public Fabricate API onto the live `game.fabricate` global. Pure
// assignment, so it is idempotent and safe to call from BOTH the `init` and `ready`
// hooks. The `ready` call is the backstop that fixes the "still loading" stall: if a
// late module evaluation makes the `init` hook callback fire-for-an-already-spent
// event (so `game.fabricate` is never assigned), the manager would otherwise read an
// undefined global forever despite `fabricate.initialize()` having completed.
function bindFabricateGlobal() {
  // Make API available globally
  game.fabricate = fabricate;
  // Expose the canvas interactable manager singleton so the region behaviour event
  // handlers (`FabricateInteractableRegionBehavior.static events`) can resolve
  // `game.fabricate.interactableManager` to dispatch onRegionEnter/onRegionExit.
  // The handler bodies are added in Phase 1c; the reference must resolve now.
  game.fabricate.interactableManager = InteractableManager.instance;
  game.fabricate.gathering = {
    getConditions: () => fabricate.getGatheringConditions(),
    setWeather: (weatherTag) => fabricate.setGatheringWeather(weatherTag),
    setTimeOfDay: (timeOfDayTag) => fabricate.setGatheringTimeOfDay(timeOfDayTag),
    setConditions: (conditions) => fabricate.setGatheringConditions(conditions),
    getPartyStore: () => fabricate.getGatheringPartyStore(),
    getRealmStore: () => fabricate.getGatheringRealmStore(),
    getLocationService: () => fabricate.getGatheringLocationService(),
    getLocationForActor: (options) => fabricate.getGatheringLocationForActor(options),
    setPartyRealmOverride: (options) => fabricate.setGatheringPartyRealmOverride(options),
    clearPartyRealmOverride: (options) => fabricate.clearGatheringPartyRealmOverride(options),
    revealRealmForActor: (options) => fabricate.revealGatheringRealmForActor(options),
    hideRealmForActor: (options) => fabricate.hideGatheringRealmForActor(options),
    // DEPRECATED region-named helper aliases — forward to the realm method and
    // warn once. Kept so existing macros/modules keep working.
    getRegionStore: () => { deprecate('gathering.getRegionStore', 'gathering.getRealmStore'); return fabricate.getGatheringRealmStore(); },
    setPartyRegionOverride: (options) => { deprecate('gathering.setPartyRegionOverride', 'gathering.setPartyRealmOverride'); return fabricate.setGatheringPartyRealmOverride({ ...options, realmIds: options?.realmIds ?? options?.regionIds }); },
    clearPartyRegionOverride: (options) => { deprecate('gathering.clearPartyRegionOverride', 'gathering.clearPartyRealmOverride'); return fabricate.clearGatheringPartyRealmOverride(options); },
    revealRegionForActor: (options) => { deprecate('gathering.revealRegionForActor', 'gathering.revealRealmForActor'); return fabricate.revealGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); },
    hideRegionForActor: (options) => { deprecate('gathering.hideRegionForActor', 'gathering.hideRealmForActor'); return fabricate.hideGatheringRealmForActor({ ...options, realmId: options?.realmId ?? options?.regionId }); }
  };

  // Expose classes for advanced users
  game.fabricate.api = {
    Recipe,
    Ingredient,
    IngredientGroup,
    RecipeManager,
    CraftingEngine,
    getFabricateAppClass,
    getCraftingSystemManagerAppClass,
    getInteractableConfigAppClass,
    getInteractablesManagerAppClass,
    CraftingSystemManager,
    CraftingRunManager,
    SalvageRunManager,
    GatheringEnvironmentStore,
    GatheringRealmStore,
    // DEPRECATED alias for backwards compatibility — same class.
    GatheringRegionStore: GatheringRealmStore,
    GatheringPartyStore,
    GatheringLocationService,
    GatheringRunManager,
    GatheringGateAndCheckEvaluator,
    GatheringEngine,
    RecipeVisibilityService,
    ResolutionModeService,
    SignatureValidator,
    ItemPilesIntegration,
    CompendiumImporter,
    CraftingSystemExporter,
    // Public hook names module authors can subscribe to, e.g.
    // `Hooks.on(game.fabricate.api.HOOKS.gathering.ATTEMPT_COMPLETED, handler)`.
    HOOKS: FABRICATE_HOOKS
  };

  game.fabricate.importFromPack = (packData, options) =>
    fabricate.compendiumImporter?.importFromPackData(packData, options);
  game.fabricate.getCompendiumImporter = () => fabricate.compendiumImporter;

  game.fabricate.exportSystem = (systemId) => {
    const systemManager = fabricate.craftingSystemManager;
    const recipeManager = fabricate.recipeManager;
    if (!systemManager || !recipeManager) throw new Error('Fabricate not initialized');
    const system = systemManager.getSystem(systemId);
    if (!system) throw new Error(`System "${systemId}" not found`);
    const recipes = recipeManager.getRecipes({ craftingSystemId: systemId }).map(r => r.toJSON());
    const version = game.modules?.get('fabricate')?.version || '0.0.0';
    return CraftingSystemExporter.buildExportPayload(system, recipes, version);
  };

  game.fabricate.importSystemFromFile = async (file, options = {}) => {
    const text = typeof file === 'string' ? file : await file.text();
    const data = JSON.parse(text);
    const validation = CraftingSystemExporter.validateImportData(data);
    if (!validation.valid) throw new Error(`Invalid import data: ${validation.errors.join('; ')}`);
    const mode = options.copyMode ? 'copy' : 'keep';
    const packData = CraftingSystemExporter.prepareForImport(data, mode);
    return fabricate.compendiumImporter.importFromPackData(packData, {
      overwriteExisting: options.overwriteExisting || false
    });
  };
}

// Hook into Foundry's initialization
Hooks.once('init', async () => {
  console.log('Fabricate | Init Hook');
  registerFabricateConfig();
  bindFabricateGlobal();
});

// GM-only Compendium Directory bulk-import action. Registered at module
// top-level (NOT in the `ready` body): the CompendiumDirectory entry context
// menu is built exactly once in `_onFirstRender`, which runs during the sidebar
// force-render BEFORE `Hooks.callAll('ready')`, so a `ready`-body listener could
// miss the one-time build. This differs from the `renderItemDirectory`
// header-button wiring below, which legitimately re-runs on every render.
// The listener MUTATES `contextOptions` in place and returns nothing.
Hooks.on('getCompendiumContextOptions', (application, contextOptions) => {
  contextOptions.push(buildCompendiumImportContextOption({
    localize: bridgeLocalize,
    isGM: () => game.user?.isGM,
    isItemPack: (id) => game.packs.get(id)?.documentName === 'Item',
    getPackName: (id) => {
      const pack = game.packs.get(id);
      return pack?.title ?? pack?.metadata?.label ?? id;
    },
    getSystems: () => game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [],
    promptSelectSystem: promptSelectCraftingSystem,
    importPack: (systemId, packId) => game.fabricate.getCraftingSystemManager().addItemsFromPack(systemId, packId),
    notify: ui.notifications
  }));
});

// Hook into Foundry's ready event
Hooks.once('ready', async () => {
  // Backstop for a missed `init` (e.g. the Vite dev server evaluating the source
  // entry after Foundry's `init` event already fired, so the `init` hook callback
  // was registered for a spent event and never ran). Both helpers are idempotent, so
  // re-running them here guarantees `game.fabricate` and the canvas Interactable
  // CONFIG are always present before `initialize()` flips readiness — otherwise the
  // manager would read an undefined global and stall on "still loading" forever.
  registerFabricateConfig();
  bindFabricateGlobal();
  await fabricate.initialize();
  await processFabricateWorldTime();
  await runRecipeItemFlagAutoStamp();

  // Wire the canvas Interactable foundation (region-first: drop interception
  // that spawns a Scene Region + `fabricate.interactable` behaviour + linked
  // marker, the region-enter presence prompt, the controlToken re-trigger, and
  // the "interact here" keybinding). Idempotent — register() no-ops on repeat
  // calls.
  InteractableManager.instance.register();

  game.socket?.on(EVENT_SCENE_SOCKET, (payload) => {
    // Defensive: the event router shares the `module.fabricate` channel with the
    // canvas Interactable round-trip. Guard it so a throw on an event payload can
    // never prevent a non-event Interactable payload from reaching
    // handleInteractableSocketMessage below.
    try {
      routeEventSceneSocketMessage(payload, {
        currentUserId: () => game.user?.id,
        isActiveGM: () => game.user === game.users?.activeGM,
        showPrompt: showEventScenePrompt,
        viewSceneForSelf: (uuid) => viewScene(uuid)
      });
    } catch (_error) {
      // Defensive: an event-route throw must never block the Interactable payload
      // from reaching handleInteractableSocketMessage below.
    }
    // Same `module.fabricate` channel also carries the canvas Interactable
    // node-update action (player → active GM token-flag write) AND the region-first
    // activation round-trip. Only the active GM applies node/behaviour writes +
    // validates activation; only the targeted user opens a granted session. The
    // validate/grant + open bodies are the manager's region-first activation seams.
    handleInteractableSocketMessage(payload, {
      validateAndGrant: (request) => InteractableManager.instance.validateAndGrant(request),
      openGrant: (grant) => InteractableManager.instance.openGrant(grant),
      notifyDenied: (reason) => InteractableManager.instance.notifyActivationDenied(reason)
    });
  });

  addModuleButtonsToItemsDirectory();
  Hooks.on('fabricate.craftingSystemsChanged', () => addModuleButtonsToItemsDirectory());
  Hooks.on('renderItemDirectory', () => addModuleButtonsToItemsDirectory());
  Hooks.on('updateItem', (item, changes) => {
    void fabricate.craftingSystemManager?.refreshComponentMetadataForUpdatedItem(item, changes);
  });

  // Env-node-driven marker swap: when an environment's task node depletes (or
  // recharges) every linked Tile marker for that (environment, task) flips its
  // image to/from the task's `depletedBehavior.swapImage`. The env `nodeRuntime`
  // is persisted under the `fabricate.gatheringEnvironments` world setting — both a
  // gather decrement and the world-time respawn write it — so reacting to that
  // setting change covers depletion AND recharge. canvasReady does the initial sync
  // to the current node state when a scene loads. Active-GM-gated inside the sync.
  Hooks.on('updateSetting', (setting) => {
    const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.id ?? ''}`;
    if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`) {
      void runInteractableMarkerSync();
    }
    // Cross-client refresh: `craftingSystemsChanged` / `recipesChanged` are local
    // `Hooks.callAll`s fired only on the GM's client. `updateSetting` fires on every
    // client when the replicated world setting lands, so reload the stale in-memory
    // manager here and re-emit the local change hook so open player apps refresh.
    handleFabricateSettingChange(key, {
      craftingSystemManager: fabricate.craftingSystemManager,
      recipeManager: fabricate.recipeManager,
      callAll: (hook, payload) => Hooks.callAll(hook, payload),
    });
  });
  Hooks.on('canvasReady', () => {
    void runInteractableMarkerSync();
  });
  void runInteractableMarkerSync();

  Hooks.callAll('fabricate.ready');
});

/**
 * Issue 555 R3 — one-shot, primary-GM-gated backfill that stamps the durable
 * `flags.fabricate.recipeItemDefinitionId` (and strips stale `_stats.duplicateSource`)
 * on every registered recipe-item definition's writable source Item. Keyed by the
 * `RECIPE_ITEM_FLAG_STAMP_VERSION` world setting so it runs exactly once per world.
 * Sources only — owned copies inherit the flag on future drags and are otherwise
 * covered by the manual "Repair item data" action. This is NOT a MigrationRunner entry:
 * that runner reads and writes only settings-data payloads and has no Item handle, so it
 * cannot write Item flags.
 */
async function runRecipeItemFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION)) >= RECIPE_ITEM_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampRecipeItemSources) return;
    const summary = await manager.autoStampRecipeItemSources();
    console.debug?.('Fabricate | recipe-item durable-flag auto-stamp complete', summary);
    await setSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION, RECIPE_ITEM_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | recipe-item durable-flag auto-stamp failed', error);
  }
}

/**
 * Run the env-node-driven marker image sync across all scenes. Resolves the live
 * environment from the gathering env store and the library task from the gathering
 * config setting (mirroring InteractableManager's task resolution), and applies the
 * tile texture/flag write directly as the active GM (no-op for non-GM clients).
 */
async function runInteractableMarkerSync() {
  try {
    const environmentStore = fabricate?.getGatheringEnvironmentStore?.() ?? null;
    await syncInteractableMarkers({
      scenes: game.scenes,
      isActiveGM: () => game.user === game.users?.activeGM,
      resolveEnvironment: (environmentId) => environmentStore?.get?.(environmentId) ?? null,
      resolveTask: (systemId, taskId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return (Array.isArray(tasks) ? tasks : []).find(task => task?.id === taskId) ?? null;
      },
      applyTileImage: (tile, update) => tile?.update?.(update)
    });
  } catch (_error) {
    // Defensive: marker sync must never throw into a hook body.
  }
}

Hooks.on('updateWorldTime', (worldTime) => {
  void processFabricateWorldTime(worldTime);
});

// GM-only scene-control button (Phase 7): adds a Fabricate control group whose
// single button launches the Interactable browser app. Foundry V13 passes
// `controls` as an OBJECT-of-controls (keyed record), NOT the pre-V13 array; the
// pure `addInteractableSceneControl` seam mutates that record. The hook body
// here is the thin edge supplying the GM gate, the localizer, and the launch
// callback.
Hooks.on('getSceneControlButtons', (controls) => {
  addInteractableSceneControl(controls, {
    isGM: game.user?.isGM === true,
    onClick: () => getInteractableBrowserAppClass().show(),
    // The Manage Interactables panel (issue 335): a sibling GM-only tool that
    // lists/manages every interactable on the scene and promotes regions.
    onManageClick: () => getInteractablesManagerAppClass().show(),
    localize: (key, fallback) => {
      const out = game.i18n?.localize?.(key);
      return out && out !== key ? out : fallback;
    }
  });
});

// GM-only discoverability: a "Configure Fabricate Interactable" button on a
// placeable's HUD when that placeable is a linked Fabricate interactable visual.
// It resolves the owning behaviour from the document's reverse linked-visual flags
// and opens the rich config panel. The pure gate + target resolution live in
// `interactableConfigSheet.js`; this helper is the thin Foundry edge shared by the
// Tile HUD (Phase 2) and the Token HUD (Phase 5) — only the host HUD + the
// localization key differ. This NEVER touches a token's actor: it only opens the
// behaviour config panel.
function installInteractableConfigHudEntry(hud, element, { localizeKey }) {
  try {
    const document = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(document, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(document, {
      resolveRegion: (regionUuid) => {
        const region = fromUuidSync?.(regionUuid) ?? null;
        const regionId = region?.id ?? region?._id ?? null;
        const sceneId = region?.parent?.id ?? region?.parent?._id ?? null;
        return regionId && sceneId ? { sceneId, regionId } : null;
      }
    });
    if (!target) return;

    const root = element instanceof HTMLElement ? element : element?.[0] ?? null;
    const column = root?.querySelector?.('.col.left') ?? root?.querySelector?.('.col') ?? root;
    if (!column?.appendChild) return;

    const out = game.i18n?.localize?.(localizeKey);
    const label = out && out !== localizeKey ? out : 'Configure Fabricate Interactable';

    const button = window.document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon fabricate-interactable-config-hud';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="fas fa-sliders"></i>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void getInteractableConfigAppClass().show(target);
    });
    column.appendChild(button);
  } catch (_error) {
    // Defensive: a HUD augmentation must never throw into Foundry's render.
  }
}

Hooks.on('renderTileHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromTile' });
});

Hooks.on('renderTokenHUD', (hud, element) => {
  installInteractableConfigHudEntry(hud, element, { localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromToken' });
});

// `fabricate.interactable` Region Behaviour creation edge (issues 334 + 342).
//
// The native Region → Behaviors "+ Add Behavior → Fabricate Interactable" path
// instantiates the DataModel with an empty `system`. Since issue 342 the three
// identity fields carry unconfigured-sentinel `initial`s, so this instantiates a
// VALID-but-UNCONFIGURED behaviour (no DataModelValidationError). This edge now
// ALLOWS that create (it reverses #334's cancellation): it defensively stamps the
// sentinel (belt-and-suspenders if Foundry's empty-system instantiation does not
// apply the nested initials) and shows the GM an INFO notice pointing at the
// Interactable config panel. The behaviour is born inert (concealed, never grants
// activation) until the GM configures its identity there.
//
// Foundry's region duplication still clones an interactable behaviour's
// `linkedVisual` verbatim, so the copy would point at the original's marker; that
// inherited link is neutralised here (the region-duplication footgun is KEPT). All
// decisions are pure (`interactableCreationGuard.js` / `interactableRegionFlags.js`);
// this is the thin, no-throw Foundry edge. NEVER interferes with any
// non-interactable behaviour subtype.
Hooks.on('preCreateRegionBehavior', (document) => {
  try {
    // The decision seam is always allow-through now; reference it so the edge
    // keeps a single decision point (and a future cancellation policy has a home).
    evaluateInteractableCreate(document);
    if (!isInteractableRegionBehavior(document)) {
      return undefined;
    }

    // Defensively stamp the unconfigured sentinel + notify, then neutralise an
    // inherited marker link. Each step is a thin local orchestrator over a pure
    // decision helper, so this edge stays simple and no-throw.
    if (applyUnconfiguredSentinelStamp(document)) {
      notifyUnconfiguredInteractableCreated();
    }
    neutralizeInheritedInteractableLink(document);
    return undefined;
  } catch (_error) {
    // Defensive: a guard error must never block an unrelated behaviour creation.
    return undefined;
  }
});

/**
 * Defensively stamp the unconfigured sentinel onto any identity field the
 * empty-system instantiation left empty, so the persisted behaviour is always a
 * recognisable UNCONFIGURED interactable. `updateSource` is the correct preCreate
 * mutation seam in V13 (preCreate hooks mutate the document source in place; they
 * do not return create data).
 *
 * @param {object} document  The preCreate `RegionBehavior` document.
 * @returns {boolean}  `true` when an unconfigured sentinel patch was applied.
 */
function applyUnconfiguredSentinelStamp(document) {
  const system = readInteractableBehaviorSystem(document) ?? document?.system ?? {};
  const sentinel = buildUnconfiguredSentinelPatch(system);
  if (!sentinel.changed || typeof document?.updateSource !== 'function') {
    return false;
  }
  document.updateSource(sentinel.patch);
  return true;
}

/**
 * Guide the GM to the supported configuration surface. INFO (not an error):
 * creation succeeded; the interactable just needs configuring.
 */
function notifyUnconfiguredInteractableCreated() {
  const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Create.Unconfigured');
  const message =
    out && out !== 'FABRICATE.Canvas.Interactable.Create.Unconfigured'
      ? out
      : 'Created an unconfigured Fabricate interactable. Configure its source (type, system, tool/task) from the Interactable config panel; it stays inert until then.';
  ui.notifications?.info?.(message);
}

/**
 * Product rule: a freshly-created interactable never inherits another
 * interactable's marker link (region-duplication case). Clear an inherited
 * linkedVisual link so the copy is born region-only. The pure neutralisation
 * helper is type-agnostic, so it is gated to interactable behaviours by the caller.
 *
 * @param {object} document  The preCreate `RegionBehavior` document.
 */
function neutralizeInheritedInteractableLink(document) {
  const neutralised = neutralizeInheritedLinkedVisual(document?.system);
  if (neutralised.changed && typeof document?.updateSource === 'function') {
    document.updateSource({
      'system.linkedVisual.uuid': neutralised.patch.linkedVisual.uuid,
      'system.linkedVisual.documentName': neutralised.patch.linkedVisual.documentName
    });
  }
}

/**
 * System-agnostic crafting button integration
 * Add Craft button to Items Directory sidebar (works with all game systems)
 */

/**
 * Add the Craft button to Items Directory header
 * Since sidebar is already rendered at module init, we inject directly
 */
function addModuleButtonsToItemsDirectory() {
  const itemsDir = ui.items;
  if (!itemsDir?.element) {
    console.error('Fabricate | Items directory not found or not rendered');
    return;
  }

  const header = itemsDir.element.querySelector('.directory-header, header');
  if (!header) {
    console.error('Fabricate | Items directory header not found');
    return;
  }

  const actionsContainer = findItemsDirectoryActionsContainer(itemsDir, document);
  if (!actionsContainer) {
    console.error('Fabricate | Items directory actions container not found');
    return;
  }

  // Add craft button for all users
  const craftExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
    .some(btn =>
      btn.dataset.fabricateAction === 'craft' ||
      btn.textContent?.includes('Craft Item')
    );
  if (!craftExists) {
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () => getFabricateAppClass().show('crafting'));
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  syncGatheringDirectoryButton({
    itemsDirectory: itemsDir,
    enabled: hasGatheringEnabledSystems(),
    createButton: () => createHeaderButton('Gathering', 'fas fa-leaf', 'gathering', () => getFabricateAppClass().show('gathering')),
    documentRef: document
  });

  // Add recipe manager button for GMs only
  if (game.user?.isGM) {
    const managerExists = Array.from(actionsContainer.querySelectorAll('button.create-document'))
      .some(btn =>
        btn.dataset.fabricateAction === 'manage' ||
        btn.textContent?.includes('Manage Crafting Systems')
      );
    if (!managerExists) {
      const managerButton = createHeaderButton(
        'Manage Crafting Systems',
        'fas fa-book',
        'manage',
        () => getCraftingSystemManagerAppClass().show()
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
}

function hasGatheringEnabledSystems() {
  const systems = game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return Array.from(systems).some(system => system?.features?.gathering === true);
}

/**
 * Create a sidebar header button that matches Foundry style
 * @private
 */
function createHeaderButton(labelText, iconClass, actionId, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.tooltip = labelText;
  button.dataset.fabricateAction = actionId;
  button.setAttribute('aria-label', labelText);

  const icon = document.createElement('i');
  icon.className = iconClass;
  button.appendChild(icon);

  const label = document.createElement('span');
  label.textContent = labelText;
  button.appendChild(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });

  return button;
}

// Chat command for quick crafting (for testing)
Hooks.on('chatMessage', (chatLog, message, chatData) => {
  // Check for /craft command
  if (message.startsWith('/craft')) {
    const parts = message.split(' ');
    if (parts.length < 2) {
      ui.notifications.warn('Usage: /craft <recipe-name>');
      return false;
    }

    const recipeName = parts.slice(1).join(' ');
    const actor = game.user.character;

    if (!actor) {
      ui.notifications.error('No character selected');
      return false;
    }

    // Find recipe by name
    const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
    if (recipes.length === 0) {
      ui.notifications.error(`Recipe "${recipeName}" not found`);
      return false;
    }

    const recipe = recipes[0];

    // Attempt to craft
    fabricate.craft(actor, recipe).then(result => {
      if (result.success) {
        ui.notifications.info(result.message);
      } else {
        ui.notifications.error(result.message);
      }
    }).catch(err => {
      ui.notifications.error(err.message);
      console.error('Fabricate | Crafting error:', err);
    });

    return false; // Prevent the message from being sent to chat
  }
});

// Macro helper
globalThis.fabricate = {
  /**
   * Create a simple recipe
   * @example
   * fabricate.createSimpleRecipe('Iron Sword', [
   *   { itemId: 'ironIngot', quantity: 2 },
   *   { itemId: 'wood', quantity: 1 }
   * ], { itemId: 'ironSword', quantity: 1 });
   */
  createSimpleRecipe: async (name, ingredients, result) => {
    const { Recipe } = game.fabricate.api;
    const recipe = Recipe.createSimple(name, ingredients, result);
    return await game.fabricate.getRecipeManager().createRecipe(recipe.toJSON());
  },

  /**
   * Craft an item
   * @example
   * fabricate.craft(game.user.character, 'recipeId');
   */
  craft: async (actor, recipeId, options) => {
    return await game.fabricate.craft(actor, recipeId, options);
  },

  /**
   * List all recipes
   */
  listRecipes: (filters = {}) => {
    return game.fabricate.getRecipeManager().getRecipes(filters);
  },

  /**
   * Delete a recipe by ID
   */
  deleteRecipe: async (recipeId) => {
    return await game.fabricate.deleteRecipe(recipeId);
  },

  /**
   * Get recipes available to an actor
   */
  getAvailableRecipes: (actorOrActors) => {
    const actors = Array.isArray(actorOrActors) ? actorOrActors : [actorOrActors];
    return game.fabricate.getRecipeManager().getAvailableRecipes(actors.filter(Boolean));
  },

  /**
   * Open the GM crafting system manager
   */
  openRecipeManager: () => {
    return getCraftingSystemManagerAppClass().show();
  },

  /**
   * List crafting systems
   */
  listCraftingSystems: () => {
    return game.fabricate.getCraftingSystemManager().getSystems();
  },

  exportSystem: (systemId) => {
    return game.fabricate.exportSystem(systemId);
  },

  importSystemFromFile: async (file, options) => {
    return game.fabricate.importSystemFromFile(file, options);
  }
};

export const __test = {
  createGatheringToolAvailability,
  createGatheringToolBreakage,
  matchGatheringTools
};

export default fabricate;
