import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import FabricateAppRoot from './svelte/apps/FabricateAppRoot.svelte';
import { registerFabricateApp } from './appFactory.js';
import { isAlchemyTabAvailable } from './svelte/util/alchemyTabAvailability.js';
import { createActorBarStore } from './svelte/stores/actorBarStore.svelte.js';
import { createCraftingStore } from './svelte/stores/craftingStore.svelte.js';
import { createCraftingSourcesStore } from './svelte/stores/craftingSourcesStore.svelte.js';
import { createInventoryStore } from './svelte/stores/inventoryStore.svelte.js';
import { createAlchemyStore } from './svelte/stores/alchemyStore.svelte.js';
import { createJournalStore } from './svelte/stores/journalStore.svelte.js';
import { notifyWarn, localize, confirmDialog } from './svelte/util/foundryBridge.js';
// Reused rather than re-authored, so the bulk salvage/destroy progress toast cannot drift from the
// compendium import's (issue 859).
import { createDefaultProgressReporter } from '../systems/CompendiumImporter.js';
import {
  authorityUnavailableAvailability,
  authorityUnavailableRefusal,
} from '../systems/journalRunCommands.js';
import { playerExtensions } from './playerExtensions.js';
import {
  buildRouteKey,
  deriveExtensionSurfaces,
  isCoreTabId,
  isPlayerSurfaceAvailable,
  parseRouteKey,
  resolveActiveTab,
} from './playerNavModel.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';

const CORE_TABS = new Set(['crafting', 'alchemy', 'gathering', 'journal', 'inventory']);
const DEFAULT_TAB = 'crafting';

// Read LIVE at every gate decision, and handed to `playerNavModel.js` as a boolean, which is what
// keeps that module the UI-free leaf it is documented to be. Not cached: the derivations below run
// on every window open and registry publication anyway, and a cached value would leave a world
// whose setting changed mid-session wrong until reload.
function isExperimentalFeaturesEnabled() {
  return getSetting(SETTING_KEYS.EXPERIMENTAL_FEATURES) === true;
}

// A LIVE predicate rather than a frozen set (issue 1198), because the answer changes when a
// companion registers. `isCoreTabId` is STRUCTURAL — true of any non-empty string that is not a
// provider route key — so it is intersected with this window's own Core ids rather than trusted
// alone; without that, an unknown id such as `bogus` would be accepted everywhere.
function isOfferedTab(tab) {
  if (typeof tab !== 'string' || tab === '') return false;
  if (isCoreTabId(tab)) return CORE_TABS.has(tab);
  const route = parseRouteKey(tab);
  if (!route) return false;
  // The gate is repeated HERE because this is the one route test reading the REGISTRY rather than
  // the derived snapshot: without it a gated surface would be missing from the rail and still
  // reachable programmatically — unlinked rather than unreachable.
  if (
    !isPlayerSurfaceAvailable(route.surfaceId, {
      experimentalFeaturesEnabled: isExperimentalFeaturesEnabled(),
    })
  ) {
    return false;
  }
  const provider = playerExtensions.getPlayerNavProvider(route.surfaceId);
  return Boolean(provider?.tabs?.some((providerTab) => providerTab.id === route.tabId));
}

// Alchemy is included UNCONDITIONALLY: its availability is `_refreshAlchemy`'s concern, and
// handling it in two places would let the two disagree.
function offeredRoutes(extensionSurfaces) {
  const routes = [...CORE_TABS].map((id) => ({ routeKey: id }));
  for (const { surfaceId, provider } of extensionSurfaces) {
    for (const tab of provider?.tabs ?? []) {
      routes.push({ routeKey: buildRouteKey(surfaceId, tab.id) });
    }
  }
  return routes;
}

function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = typeof ref.sceneId === 'string' ? ref.sceneId : null;
  const regionId = typeof ref.regionId === 'string' ? ref.regionId : null;
  const behaviorId = typeof ref.behaviorId === 'string' ? ref.behaviorId : null;
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

// The unified player window: one shared application over a full-height nav rail (Crafting,
// Gathering, Journal, Inventory, and the conditional Alchemy tab). This class owns the active tab
// and wires every service seam the tab views call. The Alchemy tab appears only when an enabled
// alchemy crafting system has at least one recipe, re-evaluated live while the window is open.
// Journal services route versioned actions through active-GM commands and confirm the
// single-GM-session prerequisite before explicit authority setup; one shared Journal store feeds
// both the tab and the nav badge. Both the "Craft Item" and "Gathering" sidebar buttons target
// this one window, and the button decides which tab opens.
export class SvelteFabricateApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = FabricateAppRoot;

  // Single shared instance so both buttons re-focus the same window.
  static _instance = null;

  _activeTab = DEFAULT_TAB;
  _services = null;
  _hookIds = null;
  // The window's SOLE player-extension subscription (issue 1198), beside the Foundry hook ids
  // because it shares their lifetime.
  _playerExtensionsUnsubscribe = null;
  // Session-scoped: a granted Tool-station activation injects the station Tool here as a
  // VIRTUAL-PRESENT tool, which prerequisite checks treat as satisfied without the actor owning the
  // item and which is excluded from breakage and usage. Cleared on close.
  _activeCanvasTool = null;
  // A granted gathering-task activation makes the gathering view auto-select this pair on open.
  _scopedEnvironmentId = null;
  _scopedTaskId = null;
  // The interacting actor becomes the default top-bar selection, when selectable.
  _scopedActorId = null;
  // Threaded into the gathering attempt so it decrements that interactable's OWN node pool
  // (issue 302) rather than the environment's.
  _scopedInteractableRef = null;
  // Set by a canvas activation (issue 332) so closing re-raises the Interact prompt while the token
  // is still in the region. REPLACED on every `show` and invoked ONCE, so a later manual open never
  // re-fires a stale re-prompt.
  _onCloseCallback = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-app',
    classes: ['fabricate', 'fabricate-app', 'fabricate-app-window'],
    tag: 'div',
    window: {
      title: 'FABRICATE.App.Title',
      icon: 'fa-solid fa-flask',
      resizable: true
    },
    position: {
      width: 1280,
      height: 860
    }
  };

  // Derived from the gathering view's column minimums, so the three columns cannot be clipped.
  // ApplicationV2 V13 THROWS on `minWidth`/`minHeight` inside its non-extensible `position`, so the
  // floor is enforced twice: a CSS floor on `.fabricate.fabricate-app-window`, which is what stops
  // the drag handle visually, and the `_updatePosition` clamp below, the one position-transform
  // hook both `setPosition()` and drag-resize pass through.
  // THE FLOOR IS ON `fabricate-app-window`, NOT the shared `fabricate-app` area class (issue 1520):
  // the three canvas windows adopted that class at 420, 480 and 560 wide, and a CSS floor beats the
  // inline `width` Foundry writes onto a frame, so it would have painted all of them at this floor.
  static MIN_WINDOW_WIDTH = 1024;
  static MIN_WINDOW_HEIGHT = 640;

  // Overridden rather than `_onResize`, whose return value V13 does not consume, so the floor is
  // real on every code path. Only `width`/`height` are mutated — never `minWidth`/`minHeight`,
  // which the non-extensible `position` rejects with a throw.
  _updatePosition(position) {
    const result = super._updatePosition(position);
    if (result && typeof result === 'object') {
      if (typeof result.width === 'number') {
        result.width = Math.max(result.width, SvelteFabricateApp.MIN_WINDOW_WIDTH);
      }
      if (typeof result.height === 'number') {
        result.height = Math.max(result.height, SvelteFabricateApp.MIN_WINDOW_HEIGHT);
      }
    }
    return result;
  }

  constructor(options = {}) {
    super(options);
    if (isOfferedTab(options.activeTab)) {
      this._activeTab = options.activeTab;
    }
    if (options.activeCanvasTool) {
      this._activeCanvasTool = options.activeCanvasTool;
    }
    if (typeof options.environmentId === 'string') {
      this._scopedEnvironmentId = options.environmentId;
    }
    if (typeof options.taskId === 'string') {
      this._scopedTaskId = options.taskId;
    }
    if (typeof options.actorId === 'string') {
      this._scopedActorId = options.actorId;
    }
    if (options.interactableRef && typeof options.interactableRef === 'object') {
      this._scopedInteractableRef = normalizeInteractableRef(options.interactableRef);
    }
    if (typeof options.onClose === 'function') {
      this._onCloseCallback = options.onClose;
    }
  }

  _buildServices() {
    // BOTH the componentId and its owning system are threaded, because componentId is a PER-SYSTEM
    // id: a tool from system A must not satisfy a system-B task whose required tool happens to
    // share the string. The payload also carries the station's library TOOL id (issue 1119), since
    // an item-sourced Tool has no componentId and a componentId-only payload was inert for every
    // station the Tool Studio can author. This is the single app-to-engine threading boundary here.
    const presentTools = () => {
      const componentId = this._activeCanvasTool?.componentId;
      const toolId = this._activeCanvasTool?.toolId;
      const systemId = this._activeCanvasTool?.systemId;
      if (!systemId || (!componentId && !toolId)) return null;
      return {
        systemId,
        componentIds: componentId ? [componentId] : [],
        toolIds: toolId ? [toolId] : [],
      };
    };
    const services = {
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getActiveCanvasTool: () => this._activeCanvasTool ?? null,
      listGatheringForActor: (opts = {}) => game?.fabricate?.listGatheringForActor?.({
        presentTools: presentTools(),
        ...opts
      }) ?? null,
      startGatheringAttempt: (opts = {}) => game?.fabricate?.startGatheringAttempt?.({
        presentTools: presentTools(),
        // Inert when null, where the engine uses the environment scope instead (issue 302).
        interactableRef: this._scopedInteractableRef,
        ...opts
      }) ?? null,
      getGatheringDropBreakdown: (opts = {}) => game?.fabricate?.getGatheringDropBreakdown?.(opts) ?? null,
      // Every Foundry-facing call routes through the `game.fabricate` facade, so stores stay
      // Foundry-free. That is the rule for every seam in this bag.
      listCraftingForActor: (opts = {}) => game?.fabricate?.listCraftingForActor?.(opts) ?? null,
      // Synchronous, because the store's `selectedRecipe` $derived reads it without an async
      // round-trip; null when the facade is absent or the viewer may not see the recipe.
      hydrateCraftingRecipe: (opts = {}) => game?.fabricate?.hydrateCraftingRecipe?.(opts) ?? null,
      listInventoryForActor: (opts = {}) => game?.fabricate?.listInventoryForActor?.(opts) ?? null,
      // Learn one recipe from an owned recipe-item book (Inventory learn button).
      learnRecipeFromInventory: (opts = {}) =>
        game?.fabricate?.learnRecipeFromInventory?.(opts) ?? null,
      craftRecipe: (opts = {}) => game?.fabricate?.craftRecipe?.(opts) ?? null,
      // An ACTOR ID, never a uuid, so the facade's `_resolveCraftingSources` gate — the only
      // ownership check on this path — is not bypassed (issue 675).
      salvageComponent: (opts = {}) => game?.fabricate?.salvageComponent?.(opts) ?? null,
      salvageComponents: (opts = {}) => game?.fabricate?.salvageComponents?.(opts) ?? null,
      destroyComponents: (opts = {}) => game?.fabricate?.destroyComponents?.(opts) ?? null,
      // A pure pass-through, exposed identically by the manager app: bulk destroy's consequence
      // sentence cannot fit a button label, so the caller composes the full confirm copy.
      confirmDialog: (options) => confirmDialog(options),
      // FRESH per bulk run, never a shared singleton: a second run would otherwise update the
      // first run's already-dismissed toast (issue 859).
      createProgressReporter: () => createDefaultProgressReporter(),
      // Synchronous, so the store's `selectedCraftability` $derived reads it without a round-trip.
      evaluateSelectedSet: (opts = {}) => game?.fabricate?.evaluateSelectedSet?.(opts) ?? null,
      listAlchemyForActor: (opts = {}) => game?.fabricate?.listAlchemyForActor?.(opts) ?? null,
      submitAlchemyAttempt: (opts = {}) => game?.fabricate?.submitAlchemyAttempt?.(opts) ?? null,
      getSelectedAlchemySystemId: () => game?.fabricate?.getSelectedAlchemySystemId?.() ?? '',
      setSelectedAlchemySystemId: (id) => game?.fabricate?.setSelectedAlchemySystemId?.(id),
      listCraftingSourceActors: () => game?.fabricate?.listCraftingSourceActors?.() ?? [],
      getCraftingSourceActors: () => game?.fabricate?.getCraftingSourceActors?.() ?? [],
      getSelectedCraftingActorId: () => game?.fabricate?.getSelectedCraftingActorId?.() ?? '',
      setSelectedCraftingActorId: (id) => game?.fabricate?.setSelectedCraftingActorId?.(id),
      getCraftingComponentSourceIds: () => game?.fabricate?.getCraftingComponentSourceIds?.() ?? [],
      setCraftingComponentSourceIds: (ids) => game?.fabricate?.setCraftingComponentSourceIds?.(ids),
      getFavouriteRecipeIds: () => game?.fabricate?.getFavouriteRecipeIds?.() ?? [],
      toggleFavouriteRecipe: (id) => game?.fabricate?.toggleFavouriteRecipe?.(id) ?? [],
      // The setter's promise is RETURNED, not dropped: under `scope: user` this is a replicated
      // document write that can reject, and the store's revert-and-announce path needs to see it.
      getProgressiveResultOrder: () => game?.fabricate?.getProgressiveResultOrder?.() ?? {},
      setProgressiveResultOrder: (key, order) =>
        game?.fabricate?.setProgressiveResultOrder?.(key, order),
      // A live region, because a keyboard user reordering by chevron never sees a toast.
      progressiveOrderRevertMessage: () =>
        localize('FABRICATE.App.Crafting.Detail.StageOrderSaveFailed'),
      // Player-facing notification seam (a failed craft surfaces as a warning).
      notify: (message) => notifyWarn(message),
      // For a THROWN craft: the engine can throw on the currency-payment macro path, with no
      // result message to report.
      craftErrorMessage: () => localize('FABRICATE.App.Crafting.Notify.CraftFailed'),
      // The stores stay Foundry-free, so the i18n lookup an authority refusal needs
      // (`{success:false, reason}` carries no `message`) arrives as a seam too.
      localize: (key, data) => localize(key, data),
      listSelectableActors: () => game?.fabricate?.listSelectableActors?.() ?? [],
      getSelectedActorId: () => game?.fabricate?.getSelectedGatheringActorId?.() ?? '',
      setSelectedActorId: (id) => game?.fabricate?.setSelectedGatheringActorId?.(id),
      // CLIENT-scoped, so it persists per device rather than per user account; the getter defaults
      // to false, showing all, when the facade is unavailable.
      getHideUnavailableEnvironments: () =>
        game?.fabricate?.getHideUnavailableEnvironments?.() ?? false,
      setHideUnavailableEnvironments: (value) =>
        game?.fabricate?.setHideUnavailableEnvironments?.(value),
      getGatheringConditions: () => game?.fabricate?.getGatheringConditions?.() ?? null,
      listJournalForActor: (opts = {}) => game?.fabricate?.listJournalForActor?.(opts) ?? null,
      executeJournalRunCommand: (opts = {}) =>
        game?.fabricate?.executeJournalRunCommand?.(opts) ?? null,
      dismissJournalRun: (opts = {}) => game?.fabricate?.dismissJournalRun?.(opts) ?? null,
      getDismissedJournalRunKeys: (opts = {}) =>
        game?.fabricate?.getDismissedJournalRunKeys?.(opts) ?? new Set(),
      getJournalRunAuthorityAvailability: () =>
        game?.fabricate?.getJournalRunAuthorityAvailability?.()
        ?? authorityUnavailableAvailability(),
      // Active-GM manual disposition of a retained execution claim (issue 1648). The
      // authority itself refuses a non-active-GM caller, so this seam adds no authorization.
      reconcileJournalRunAuthority: (opts = {}) =>
        game?.fabricate?.reconcileJournalRunAuthority?.(opts)
        ?? Promise.resolve(authorityUnavailableRefusal()),
      advanceCraftingRun: (opts = {}) => game?.fabricate?.advanceCraftingRun?.(opts) ?? null,
      cancelCraftingRun: (opts = {}) => game?.fabricate?.cancelCraftingRun?.(opts) ?? null,
      getWorldTime: () => game?.fabricate?.getWorldTime?.() ?? 0,
      getWorldTimeComponents: (worldTime) =>
        game?.fabricate?.getWorldTimeComponents?.(worldTime) ?? null,
      getGatheringEconomy: (opts = {}) => game?.fabricate?.getGatheringEconomy?.(opts) ?? null,
      setGatheringEconomy: (opts = {}) => game?.fabricate?.setGatheringEconomy?.(opts),
      getGatheringStaminaState: (opts = {}) => game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
      setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
      adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
      restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts),
      // Lets the gathering view re-resolve the live region only when a real travel marker moves.
      isTravelMarkerActor: (actorUuid) => {
        if (!actorUuid) return false;
        const parties = game?.fabricate?.getGatheringPartyStore?.()?.list?.() ?? [];
        return (Array.isArray(parties) ? parties : [])
          .some(party => party?.travelActorUuid && String(party.travelActorUuid) === String(actorUuid));
      }
    };
    // One instance across renders, so the shell and the gathering tab share one selection state.
    services.actorBar = createActorBarStore({ services });
    // The component-sources store is created FIRST, so the crafting store can read the current
    // source ids off it as it loads.
    services.craftingSources = createCraftingSourcesStore({ services });
    services.crafting = createCraftingStore({ services });
    services.inventory = createInventoryStore({ services });
    // All three tab stores read the SAME actor and source selection, so they agree on what the
    // player owns; only the workbench and discipline state is local to this one.
    services.alchemy = createAlchemyStore({ services });
    // Both stores are the singletons the Crafting tab reads, so the selection is already applied
    // by the time that tab renders.
    services.navigateToCraftingRecipe = (recipeId) => {
      if (recipeId) services.crafting?.select?.(recipeId);
      this._selectTab('crafting');
    };
    services.journal = createJournalStore({ services });
    return services;
  }

  _prepareSvelteProps() {
    if (!this._services) {
      this._services = this._buildServices();
    }
    return {
      activeTab: this._activeTab,
      showAlchemy: isAlchemyTabAvailable(this._services),
      onSelectTab: (tab) => this._selectTab(tab),
      services: this._services,
      activeCanvasTool: this._activeCanvasTool,
      scopedEnvironmentId: this._scopedEnvironmentId,
      scopedTaskId: this._scopedTaskId,
      scopedActorId: this._scopedActorId,
      // SEEDED here, not merely refreshed on publication (issue 1198): `_registerHooks()` runs
      // from `_onRender`, after this method, so a companion following the documented contract —
      // register during your own `init` — would otherwise have no tabs on first open and, if it
      // never re-registers, none at all. DERIVED rather than read off a field, because a key
      // present here is re-assigned over the reactive props on every re-render.
      extensionSurfaces: deriveExtensionSurfaces(playerExtensions, {
        experimentalFeaturesEnabled: isExperimentalFeaturesEnabled(),
      }),
      playerExtensions
    };
  }

  _selectTab(tab) {
    if (!isOfferedTab(tab) || tab === this._activeTab) {
      return;
    }
    this._activeTab = tab;
    this.updateProps({ activeTab: tab });
  }

  // An Alchemy tab that disappears while ACTIVE falls back to the default tab.
  _refreshAlchemy() {
    if (!this._services) {
      return;
    }
    const showAlchemy = isAlchemyTabAvailable(this._services);
    if (!showAlchemy && this._activeTab === 'alchemy') {
      this._activeTab = DEFAULT_TAB;
    }
    this.updateProps({ showAlchemy, activeTab: this._activeTab });
  }

  // Called on every registry publication, which is also when a changed `experimentalFeatures`
  // setting first reaches an already-open window, because the gate is read at derivation rather
  // than pushed. The active route falls back to the default Core tab when the new set no longer
  // offers it, which is why an unregistered companion leaves the user on Crafting (issue 1198).
  _refreshExtensionSurfaces() {
    const extensionSurfaces = deriveExtensionSurfaces(playerExtensions, {
      experimentalFeaturesEnabled: isExperimentalFeaturesEnabled(),
    });
    this._activeTab = resolveActiveTab(
      this._activeTab,
      offeredRoutes(extensionSurfaces),
      DEFAULT_TAB
    );
    this.updateProps({ extensionSurfaces, activeTab: this._activeTab });
  }

  // The bar seeds ONCE at load, so without this a player whose only owned actor just became a
  // player character keeps an empty bar until reload (issue 1024).
  _refreshSelectableActors() {
    this._services?.actorBar?.refreshSelectableActors?.();
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._registerHooks();
  }

  _registerHooks() {
    if (this._hookIds) {
      return;
    }
    this._hookIds = {
      systems: Hooks.on('fabricate.craftingSystemsChanged', () => this._refreshAlchemy()),
      recipes: Hooks.on('fabricate.recipesChanged', () => this._refreshAlchemy()),
      playerCharacterTypes: Hooks.on('fabricate.playerCharacterTypesChanged', () =>
        this._refreshSelectableActors()
      )
    };
    // EXACTLY ONE subscriber per registry, per window: `FabricateAppRoot` subscribes to nothing and
    // takes the snapshot as a prop, so the rail and the panel cannot disagree about what exists.
    this._playerExtensionsUnsubscribe = playerExtensions.subscribeSurfaceIds(() =>
      this._refreshExtensionSurfaces()
    );
  }

  _removeHooks() {
    this._playerExtensionsUnsubscribe?.();
    this._playerExtensionsUnsubscribe = null;
    if (!this._hookIds) {
      return;
    }
    Hooks.off('fabricate.craftingSystemsChanged', this._hookIds.systems);
    Hooks.off('fabricate.recipesChanged', this._hookIds.recipes);
    Hooks.off('fabricate.playerCharacterTypesChanged', this._hookIds.playerCharacterTypes);
    this._hookIds = null;
  }

  async close(options) {
    this._removeHooks();
    // So the singleton does not leak this session's context into the next manual open.
    this._activeCanvasTool = null;
    this._scopedEnvironmentId = null;
    this._scopedTaskId = null;
    this._scopedActorId = null;
    this._scopedInteractableRef = null;
    if (SvelteFabricateApp._instance === this) {
      SvelteFabricateApp._instance = null;
    }
    // Without this a player who reorders and closes inside the debounce window loses it silently.
    this._flushPendingOrderWrite();
    // Disposed BEFORE `super.close()` unmounts the Svelte root, so the mount target is still
    // connected: `destroy_effect` removes the effect's DOM before running teardowns, so every
    // `onDestroy` would otherwise run against a detached target. This is the window-close HALF of
    // that rule; `FabricateAppRoot`'s surface `$effect.pre` is the other caller.
    this._svelteComponent?.disposePlayerProvidersBeforeRemoval?.();
    const result = await super.close(options);
    // AFTER the window has fully closed, so the Interact prompt re-appears against a settled
    // canvas. One-shot and no-throw: a handler error must never break the close.
    this._fireCloseCallback();
    return result;
  }

  _onClose(options) {
    this._removeHooks();
    this._activeCanvasTool = null; // safety net mirroring close().
    this._scopedEnvironmentId = null;
    this._scopedTaskId = null;
    this._scopedActorId = null;
    this._scopedInteractableRef = null;
    // A forced teardown bypasses the `close()` override, and a pending write must survive it.
    this._flushPendingOrderWrite();
    super._onClose(options);
    // The same safety net for the one-shot re-prompt callback.
    this._fireCloseCallback();
  }

  // Reorder writes are debounced because each is a replicated document write, which leaves a window
  // where the chosen order exists only in memory. Safe from both `close()` and `_onClose()`: each
  // store's flush is a no-op with nothing pending, so a double call writes once. It flushes BOTH
  // progressive-order writers and is the only teardown net either has.
  // Deliberately NOT awaited and never throwing: a rejected write is the store's own business, and
  // a teardown must not be blocked by it. The `try/catch` catches only SYNCHRONOUS throws and `void`
  // discards the promise, so both stores report failure by RETURN STATUS rather than rejecting; the
  // `.catch()` below is the second line of defence.
  _flushPendingOrderWrite() {
    try {
      const noop = () => {};
      void this._services?.crafting?.flushProgressiveOrder?.()?.catch?.(noop);
      void this._services?.inventory?.flushSalvageOrder?.()?.catch?.(noop);
    } catch {
      // A failed order write must never break the window close.
    }
  }

  _fireCloseCallback() {
    const callback = this._onCloseCallback;
    this._onCloseCallback = null;
    if (typeof callback !== 'function') return;
    try {
      callback();
    } catch {
      // Never throws: a re-prompt failure must not break the window close.
    }
  }

  // The session-scoped canvas tool is REPLACED on every `show`, including a re-show of the live
  // singleton: an explicit one sets it, a plain `show(tab)` CLEARS it, because a manual open must
  // not silently inherit a station tool from a prior interactable activation.
  static async show(tab = DEFAULT_TAB, { activeCanvasTool, environmentId, taskId, actorId, interactableRef, onClose } = {}) {
    const initialTab = isOfferedTab(tab) ? tab : DEFAULT_TAB;
    const nextCanvasTool = activeCanvasTool ?? null;
    const nextEnvironmentId = typeof environmentId === 'string' ? environmentId : null;
    const nextTaskId = typeof taskId === 'string' ? taskId : null;
    const nextActorId = typeof actorId === 'string' ? actorId : null;
    const nextInteractableRef = normalizeInteractableRef(interactableRef);
    const nextOnClose = typeof onClose === 'function' ? onClose : null;
    const existing = SvelteFabricateApp._instance;
    if (existing?.rendered) {
      existing._activeCanvasTool = nextCanvasTool;
      existing._scopedEnvironmentId = nextEnvironmentId;
      existing._scopedTaskId = nextTaskId;
      existing._scopedActorId = nextActorId;
      existing._scopedInteractableRef = nextInteractableRef;
      // The one-shot re-prompt callback is replaced on the same rule (issue 332).
      existing._onCloseCallback = nextOnClose;
      existing.updateProps({
        activeCanvasTool: nextCanvasTool,
        scopedEnvironmentId: nextEnvironmentId,
        scopedTaskId: nextTaskId,
        scopedActorId: nextActorId
      });
      existing._selectTab(initialTab);
      existing.bringToFront();
      return existing;
    }
    const app = new SvelteFabricateApp({
      activeTab: initialTab,
      activeCanvasTool: nextCanvasTool,
      environmentId: nextEnvironmentId,
      taskId: nextTaskId,
      actorId: nextActorId,
      interactableRef: nextInteractableRef,
      onClose: nextOnClose
    });
    SvelteFabricateApp._instance = app;
    await app.render(true);
    return app;
  }
}

// Registered so `getFabricateAppClass()` can return this class; `main.js` imports this file for
// the side effect.
registerFabricateApp(SvelteFabricateApp);
