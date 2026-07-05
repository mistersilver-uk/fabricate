import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import FabricateAppRoot from './svelte/apps/FabricateAppRoot.svelte';
import { registerFabricateApp } from './appFactory.js';
import { isAlchemyTabAvailable } from './svelte/util/alchemyTabAvailability.js';
import { createActorBarStore } from './svelte/stores/actorBarStore.svelte.js';
import { createCraftingStore } from './svelte/stores/craftingStore.svelte.js';
import { createCraftingSourcesStore } from './svelte/stores/craftingSourcesStore.svelte.js';
import { createInventoryStore } from './svelte/stores/inventoryStore.svelte.js';
import { createJournalStore } from './svelte/stores/journalStore.svelte.js';
import { notifyWarn, localize, confirmDialog } from './svelte/util/foundryBridge.js';

const VALID_TABS = new Set(['crafting', 'alchemy', 'gathering', 'journal', 'inventory']);
const DEFAULT_TAB = 'crafting';

/**
 * Normalize a scene-interactable ref to `{sceneId, regionId, behaviorId}` (issue
 * 302), or null when any id is missing.
 *
 * @param {object|null} ref
 * @returns {{sceneId:string, regionId:string, behaviorId:string}|null}
 */
function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = typeof ref.sceneId === 'string' ? ref.sceneId : null;
  const regionId = typeof ref.regionId === 'string' ? ref.regionId : null;
  const behaviorId = typeof ref.behaviorId === 'string' ? ref.behaviorId : null;
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

/**
 * The unified Fabricate window: a single shared application with a full-height
 * left navigation (Crafting, Gathering, Journal, Inventory). Tab content is an
 * empty placeholder shell for now.
 *
 * The Alchemy tab is conditional: it appears only when an enabled alchemy
 * crafting system has at least one recipe (see {@link isAlchemyTabAvailable}),
 * and is re-evaluated live while the window is open.
 *
 * Both the "Craft Item" and "Gathering" sidebar buttons target this one window
 * via {@link SvelteFabricateApp.show}; the button decides which tab to open.
 */
export class SvelteFabricateApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = FabricateAppRoot;

  // Single shared instance so both buttons re-focus the same window.
  static _instance = null;

  _activeTab = DEFAULT_TAB;
  _services = null;
  _hookIds = null;
  // Session-scoped canvas Tool. When the GM grants activation of a Tool-station
  // interactable region (the controlling player walked their token in and clicked
  // Interact), the station Tool is injected here as a virtual-present tool: a
  // `{ componentId, systemId, toolId, label }` shape that crafting/gathering
  // prerequisite checks treat as satisfied WITHOUT the actor owning the item,
  // and which is excluded from breakage/usage. Cleared on close.
  _activeCanvasTool = null;
  // Session-scoped environment+task for a gathering-task interactable shortcut.
  // When a gathering-task region activation is granted the gathering view
  // auto-selects this environment+task on open. Cleared on close.
  _scopedEnvironmentId = null;
  _scopedTaskId = null;
  // Session-scoped actor for an interactable activation. When a region activation
  // is granted the interacting actor (the token the player walked in) becomes the
  // default-selected actor in the top bar (when selectable). Cleared on close.
  _scopedActorId = null;
  // Session-scoped scene-interactable ref ({sceneId, regionId, behaviorId}) for a
  // gathering-task interactable that owns its own scoped node pool (issue 302).
  // Threaded into the gathering attempt so it decrements that scoped pool. Cleared
  // on close.
  _scopedInteractableRef = null;
  // One-shot close callback set by a canvas interactable activation (issue 332):
  // when this session opened from clicking Interact, the manager registers a
  // handler here so closing the window re-raises the Interact prompt if the token
  // is still in the originating region. Invoked once (defensively) and cleared on
  // close so a later manual open never re-fires it.
  _onCloseCallback = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-app',
    classes: ['fabricate', 'fabricate-app'],
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

  // Minimum window size enforced on the resizable Fabricate window so it can
  // never shrink below the point where the gathering view's three columns (each
  // floored at 280px) get clipped. Derived from the column minimums: the ~84px
  // nav rail + 3 x 280px columns + 2 gutters + content padding + window chrome
  // round up to a 1024x640 floor that keeps all three columns usable before the
  // narrow-width stacking breakpoint takes over. ApplicationV2 V13 does NOT
  // accept `minWidth`/`minHeight` inside the (non-extensible) `position` option
  // (assigning to it throws), so the floor is enforced two ways: a
  // `min-width`/`min-height` on the app root (.fabricate-app, styles/fabricate.css)
  // which is what visually stops the drag handle, and the `_updatePosition` clamp
  // below which is the single ApplicationV2 position-transform hook applied by
  // BOTH `setPosition()` and drag-resize.
  static MIN_WINDOW_WIDTH = 1024;
  static MIN_WINDOW_HEIGHT = 640;

  /**
   * Clamp the window up to the configured minimum size. `_updatePosition` is the
   * V13 ApplicationV2 hook that translates a requested position into the resolved
   * applied position; it is invoked by BOTH programmatic `setPosition()` and the
   * drag-resize handler, and its return value is what gets applied. We override
   * it (rather than the pointer-only `_onResize` drag handler, whose return value
   * V13 does not consume) so the minimum-size floor is real for every code path.
   *
   * We mutate `width`/`height` on the resolved position only — never
   * `minWidth`/`minHeight`, which V13's non-extensible `position` rejects with a
   * throw. The CSS floor on the app root is the belt-and-suspenders partner that
   * makes the drag handle stop visually.
   *
   * @param {object} position Requested `{width, height, ...}` positioning data.
   * @returns {object} The resolved, clamped position.
   */
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
    if (VALID_TABS.has(options.activeTab)) {
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
    // Derive the system-scoped virtual-present tool payload from the active
    // canvas Tool. When a Tool station is active, BOTH its componentId AND its
    // owning crafting system are threaded into the gathering listing/attempt API
    // as `presentTools = { systemId, componentIds }`. The prerequisite check
    // treats the componentId as present without an owned item, but ONLY for tasks
    // in the matching crafting system — componentId is a per-system id, so a tool
    // from system A must not satisfy a system-B task whose required tool shares
    // the same componentId string. The engine excludes a virtual match from
    // breakage/usage. This is the single app→engine threading boundary for the
    // gathering surface. With no active tool the payload is null (inert).
    const presentTools = () => {
      const componentId = this._activeCanvasTool?.componentId;
      const systemId = this._activeCanvasTool?.systemId;
      return componentId && systemId ? { systemId, componentIds: [componentId] } : null;
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
        // Thread the session-scoped interactable ref (issue 302) unless the caller
        // overrode it. Inert when null (the engine uses the environment scope).
        interactableRef: this._scopedInteractableRef,
        ...opts
      }) ?? null,
      getGatheringDropBreakdown: (opts = {}) => game?.fabricate?.getGatheringDropBreakdown?.(opts) ?? null,
      // Player Crafting tab seams. The listing/craft/source reads mirror the
      // gathering seams: every Foundry-facing call routes through the
      // `game.fabricate` facade so the stores stay Foundry-free.
      listCraftingForActor: (opts = {}) => game?.fabricate?.listCraftingForActor?.(opts) ?? null,
      // Player Inventory tab seam — owned components/essences across the shared
      // crafting source actors. Foundry-free store consumes this wrapper only.
      listInventoryForActor: (opts = {}) => game?.fabricate?.listInventoryForActor?.(opts) ?? null,
      craftRecipe: (opts = {}) => game?.fabricate?.craftRecipe?.(opts) ?? null,
      // Pre-craft confirmation seams (issue 61). The confirm routes through the
      // DialogV2 bridge (never globalThis.confirm); the skip getter/setter read and
      // persist the client-scope `skipCraftConfirmation` setting via the facade.
      confirmDialog: (options) => confirmDialog(options),
      getSkipCraftConfirmation: () => game?.fabricate?.getSkipCraftConfirmation?.() === true,
      setSkipCraftConfirmation: (value) => game?.fabricate?.setSkipCraftConfirmation?.(value),
      // Localization seam for store-owned dialog strings (matches the Manager
      // services bag), so the Foundry-free stores stay off `game.i18n`.
      localize: (key, data) => localize(key, data),
      listCraftingSourceActors: () => game?.fabricate?.listCraftingSourceActors?.() ?? [],
      getCraftingSourceActors: () => game?.fabricate?.getCraftingSourceActors?.() ?? [],
      getSelectedCraftingActorId: () => game?.fabricate?.getSelectedCraftingActorId?.() ?? '',
      setSelectedCraftingActorId: (id) => game?.fabricate?.setSelectedCraftingActorId?.(id),
      getCraftingComponentSourceIds: () => game?.fabricate?.getCraftingComponentSourceIds?.() ?? [],
      setCraftingComponentSourceIds: (ids) => game?.fabricate?.setCraftingComponentSourceIds?.(ids),
      getFavouriteRecipeIds: () => game?.fabricate?.getFavouriteRecipeIds?.() ?? [],
      toggleFavouriteRecipe: (id) => game?.fabricate?.toggleFavouriteRecipe?.(id) ?? [],
      // Player-facing notification seam (a failed craft surfaces as a warning).
      notify: (message) => notifyWarn(message),
      // Localized generic craft-failure message for a thrown craft (the engine can
      // throw on the currency-payment macro path, producing no result message).
      craftErrorMessage: () => localize('FABRICATE.App.Crafting.Notify.CraftFailed'),
      listSelectableActors: () => game?.fabricate?.listSelectableActors?.() ?? [],
      getSelectedActorId: () => game?.fabricate?.getSelectedGatheringActorId?.() ?? '',
      setSelectedActorId: (id) => game?.fabricate?.setSelectedGatheringActorId?.(id),
      getGatheringConditions: () => game?.fabricate?.getGatheringConditions?.() ?? null,
      // Player-facing Journal seams. The store/components never touch Foundry
      // globals; these wrappers are the single Foundry-facing edge.
      listJournalForActor: (opts = {}) => game?.fabricate?.listJournalForActor?.(opts) ?? null,
      advanceCraftingRun: (opts = {}) => game?.fabricate?.advanceCraftingRun?.(opts) ?? null,
      getWorldTime: () => game?.fabricate?.getWorldTime?.() ?? 0,
      getWorldTimeComponents: (worldTime) =>
        game?.fabricate?.getWorldTimeComponents?.(worldTime) ?? null,
      // GM economy authoring + manual state controls (Manager app).
      getGatheringEconomy: (opts = {}) => game?.fabricate?.getGatheringEconomy?.(opts) ?? null,
      setGatheringEconomy: (opts = {}) => game?.fabricate?.setGatheringEconomy?.(opts),
      getGatheringStaminaState: (opts = {}) => game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
      setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
      adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
      restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts),
      // Whether the given actor uuid is some party's travel-marker actor. Lets the
      // gathering view ignore movement of ordinary tokens and only re-resolve the
      // live current region when an actual travel marker moves.
      isTravelMarkerActor: (actorUuid) => {
        if (!actorUuid) return false;
        const parties = game?.fabricate?.getGatheringPartyStore?.()?.list?.() ?? [];
        return (Array.isArray(parties) ? parties : [])
          .some(party => party?.travelActorUuid && String(party.travelActorUuid) === String(actorUuid));
      }
    };
    // One shared actor-bar store instance, reused across renders, so the shell
    // and the gathering tab read/write the same reactive selection state.
    services.actorBar = createActorBarStore({ services });
    // Player Crafting tab stores. The component-sources store is created first so
    // the crafting store can read the current source ids off it when it loads.
    services.craftingSources = createCraftingSourcesStore({ services });
    services.crafting = createCraftingStore({ services });
    // Player Inventory tab store. Shares the crafting source/actor selection (it
    // reads the same seams + sibling craftingSources store) so both tabs agree on
    // what the player owns.
    services.inventory = createInventoryStore({ services });
    // Cross-tab navigation for the Inventory tab's "Pin for Crafting" / used-by
    // links: select the recipe in the shared crafting store, then switch to the
    // Crafting tab. Both stores are the same singletons the Crafting tab reads, so
    // the selection is already applied when that tab renders.
    services.navigateToCraftingRecipe = (recipeId) => {
      if (recipeId) services.crafting?.select?.(recipeId);
      this._selectTab('crafting');
    };
    // One shared journal store instance so the nav badge (shell) and the Journal
    // tab read the same reactive run state.
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
      // Session-scoped canvas Tool, surfaced reactively so the shell can render a
      // status chip naming the active station tool (Phase 4 SHOULD-FIX 3). Null
      // when no Tool station is active.
      activeCanvasTool: this._activeCanvasTool,
      // Session-scoped environment + task for a gathering-task interactable
      // shortcut: when a canvas gathering-task region activation is granted, the
      // gathering view auto-selects this environment + task on open. Null on a
      // plain manual open.
      scopedEnvironmentId: this._scopedEnvironmentId,
      scopedTaskId: this._scopedTaskId,
      // Session-scoped interacting actor: when a region activation is granted the
      // shell seeds this actor as the default top-bar selection (once per distinct
      // value). Null on a plain manual open.
      scopedActorId: this._scopedActorId
    };
  }

  /** Switch the active tab, reactively updating the mounted component. */
  _selectTab(tab) {
    if (!VALID_TABS.has(tab) || tab === this._activeTab) {
      return;
    }
    this._activeTab = tab;
    this.updateProps({ activeTab: tab });
  }

  /**
   * Re-evaluate Alchemy tab availability (e.g. after systems or recipes change)
   * and push it to the mounted component. If the Alchemy tab disappears while
   * active, fall back to the default tab.
   */
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
      recipes: Hooks.on('fabricate.recipesChanged', () => this._refreshAlchemy())
    };
  }

  _removeHooks() {
    if (!this._hookIds) {
      return;
    }
    Hooks.off('fabricate.craftingSystemsChanged', this._hookIds.systems);
    Hooks.off('fabricate.recipesChanged', this._hookIds.recipes);
    this._hookIds = null;
  }

  async close(options) {
    this._removeHooks();
    // Destroy the session-scoped canvas-tool + scoped env/task context so the
    // singleton does not leak them into the next manual open.
    this._activeCanvasTool = null;
    this._scopedEnvironmentId = null;
    this._scopedTaskId = null;
    this._scopedActorId = null;
    this._scopedInteractableRef = null;
    if (SvelteFabricateApp._instance === this) {
      SvelteFabricateApp._instance = null;
    }
    const result = await super.close(options);
    // Fire the canvas re-prompt callback AFTER the window has fully closed (issue
    // 332) so the Interact prompt re-appears against a settled canvas. One-shot
    // and no-throw — a handler error must never break the close.
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
    super._onClose(options);
    // Safety net mirroring close(): if the window is torn down via the _onClose
    // lifecycle without our close() override (e.g. a forced teardown), still fire
    // the one-shot re-prompt callback.
    this._fireCloseCallback();
  }

  /**
   * Invoke the one-shot interactable-close callback exactly once, then clear it
   * (issue 332). Defensive: never throws — a re-prompt failure must not break the
   * window close. Safe to call from both close() and _onClose().
   */
  _fireCloseCallback() {
    const callback = this._onCloseCallback;
    this._onCloseCallback = null;
    if (typeof callback !== 'function') return;
    try {
      callback();
    } catch {
      // A re-prompt failure must never break the window close.
    }
  }

  /**
   * Open (or re-focus) the shared Fabricate window on the requested tab.
   *
   * `activeCanvasTool` semantics: the active canvas tool is session-scoped and is
   * REPLACED on every `show`, including re-show of the live singleton. An explicit
   * `show('crafting', { activeCanvasTool })` sets it; a plain `show('crafting')`
   * CLEARS it — a fresh manual open (or a manual re-open of the existing window)
   * has no canvas tool, so it must not silently inherit a station tool from a
   * prior interactable activation. The context is also cleared on close.
   *
   * @param {string} [tab='crafting'] One of crafting/gathering/journal/inventory.
   * @param {object} [options]
   * @param {object|null} [options.activeCanvasTool] Virtual-present Tool injected
   *   by a granted Tool-station region activation: `{ componentId, systemId, toolId, label }`.
   * @param {string} [options.environmentId] Scoped environment (gathering-task region).
   * @param {string} [options.taskId] Scoped task (gathering-task region).
   * @param {string} [options.actorId] Scoped interacting actor — seeds the default
   *   top-bar selection (set when supplied, cleared when not, like the tool/env/task
   *   context).
   * @param {object} [options.interactableRef] Scoped scene-interactable ref
   *   (`{sceneId, regionId, behaviorId}`) for a gathering-task interactable that
   *   owns its own node pool (issue 302); threaded into the attempt.
   * @param {() => void} [options.onClose] One-shot callback invoked once the
   *   window closes (issue 332). Set by a canvas interactable activation so the
   *   Interact prompt re-appears when the activating token is still in the region;
   *   REPLACED on every show (set when supplied, cleared when not) so a later
   *   manual open never re-fires a stale interactable re-prompt.
   * @returns {Promise<SvelteFabricateApp>}
   */
  static async show(tab = DEFAULT_TAB, { activeCanvasTool, environmentId, taskId, actorId, interactableRef, onClose } = {}) {
    const initialTab = VALID_TABS.has(tab) ? tab : DEFAULT_TAB;
    const nextCanvasTool = activeCanvasTool ?? null;
    const nextEnvironmentId = typeof environmentId === 'string' ? environmentId : null;
    const nextTaskId = typeof taskId === 'string' ? taskId : null;
    const nextActorId = typeof actorId === 'string' ? actorId : null;
    const nextInteractableRef = normalizeInteractableRef(interactableRef);
    const nextOnClose = typeof onClose === 'function' ? onClose : null;
    const existing = SvelteFabricateApp._instance;
    if (existing?.rendered) {
      // Re-show REPLACES the session-scoped canvas tool + scoped env/task/actor/ref
      // context (set when supplied, cleared when not) so a manual re-open never
      // inherits a stale station context.
      existing._activeCanvasTool = nextCanvasTool;
      existing._scopedEnvironmentId = nextEnvironmentId;
      existing._scopedTaskId = nextTaskId;
      existing._scopedActorId = nextActorId;
      existing._scopedInteractableRef = nextInteractableRef;
      // Replace the one-shot close re-prompt callback too (issue 332): a fresh
      // interactable activation re-arms it; a plain re-open clears it.
      existing._onCloseCallback = nextOnClose;
      // Push the replaced tool + scoped env/task/actor to the mounted tree so the
      // status chip updates, the gathering view re-auto-selects the scoped env+task,
      // and a re-interaction with a different actor re-seeds the selection.
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

// Register with the factory so getFabricateAppClass() can return this class.
// This file is imported as a side-effect by main.js, which triggers this
// registration at module load time.
registerFabricateApp(SvelteFabricateApp);
