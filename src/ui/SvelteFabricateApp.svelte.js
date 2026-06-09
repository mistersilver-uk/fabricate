import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import FabricateAppRoot from './svelte/apps/FabricateAppRoot.svelte';
import { registerFabricateApp } from './appFactory.js';
import { isAlchemyTabAvailable } from './svelte/util/alchemyTabAvailability.js';
import { createActorBarStore } from './svelte/stores/actorBarStore.svelte.js';
import { scopeNodeStateOverride } from './nodeStateOverrideScope.js';

const VALID_TABS = new Set(['crafting', 'alchemy', 'gathering', 'journal', 'inventory']);
const DEFAULT_TAB = 'crafting';

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
  // Session-scoped per-region node-state adapter. When a gathering-task region
  // activation is granted, the behaviour's own node adapter is injected here so
  // the gathering listing/attempt read/write the behaviour's `system.node` state
  // (not `environment.nodeRuntime[taskId]`). The adapter also scopes the session
  // to one environment+task. Cleared on close.
  _nodeStateOverride = null;
  _scopedEnvironmentId = null;
  _scopedTaskId = null;

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

  constructor(options = {}) {
    super(options);
    if (VALID_TABS.has(options.activeTab)) {
      this._activeTab = options.activeTab;
    }
    if (options.activeCanvasTool) {
      this._activeCanvasTool = options.activeCanvasTool;
    }
    if (options.nodeStateOverride) {
      this._nodeStateOverride = options.nodeStateOverride;
    }
    if (typeof options.environmentId === 'string') {
      this._scopedEnvironmentId = options.environmentId;
    }
    if (typeof options.taskId === 'string') {
      this._scopedTaskId = options.taskId;
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
    // Inject the per-region node-state adapter into attempts (and listing) when
    // the session is scoped to a placed gathering-task region, but ONLY for the
    // scoped environment+task — a region's node must not leak into any other listed
    // task. With no region session the override is null (inert).
    const nodeStateOverrideFor = (opts = {}) => scopeNodeStateOverride({
      override: this._nodeStateOverride,
      scopedEnvironmentId: this._scopedEnvironmentId,
      scopedTaskId: this._scopedTaskId,
      environmentId: opts.environmentId,
      taskId: opts.taskId
    });
    const services = {
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getActiveCanvasTool: () => this._activeCanvasTool ?? null,
      listGatheringForActor: (opts = {}) => {
        // Thread the SCOPED per-region node override into the listing so the
        // behaviour's OWN current/max/depleted/respawnEta surface for the scoped
        // task — without it, a depleted node shows "available" then blocks on
        // attempt. The engine applies the override ONLY to the scoped env+task
        // (the guard below scopes it), so it never leaks into other listed tasks.
        const nodeStateOverride = this._nodeStateOverride ?? null;
        return game?.fabricate?.listGatheringForActor?.({
          presentTools: presentTools(),
          ...(nodeStateOverride
            ? {
                nodeStateOverride,
                nodeStateOverrideScope: {
                  environmentId: this._scopedEnvironmentId,
                  taskId: this._scopedTaskId
                }
              }
            : {}),
          ...opts
        }) ?? null;
      },
      startGatheringAttempt: (opts = {}) => {
        const nodeStateOverride = nodeStateOverrideFor(opts);
        return game?.fabricate?.startGatheringAttempt?.({
          presentTools: presentTools(),
          ...(nodeStateOverride ? { nodeStateOverride } : {}),
          ...opts
        }) ?? null;
      },
      getGatheringDropBreakdown: (opts = {}) => game?.fabricate?.getGatheringDropBreakdown?.(opts) ?? null,
      listSelectableActors: () => game?.fabricate?.listSelectableActors?.() ?? [],
      getSelectedActorId: () => game?.fabricate?.getSelectedGatheringActorId?.() ?? '',
      setSelectedActorId: (id) => game?.fabricate?.setSelectedGatheringActorId?.(id),
      getGatheringConditions: () => game?.fabricate?.getGatheringConditions?.() ?? null,
      // GM economy authoring + manual state controls (Manager app).
      getGatheringEconomy: (opts = {}) => game?.fabricate?.getGatheringEconomy?.(opts) ?? null,
      setGatheringEconomy: (opts = {}) => game?.fabricate?.setGatheringEconomy?.(opts),
      getGatheringStaminaState: (opts = {}) => game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
      setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
      adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
      restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts)
    };
    // One shared actor-bar store instance, reused across renders, so the shell
    // and the gathering tab read/write the same reactive selection state.
    services.actorBar = createActorBarStore({ services });
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
      activeCanvasTool: this._activeCanvasTool
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
    // Destroy the session-scoped canvas-tool + per-region node context so the
    // singleton does not leak them into the next manual open.
    this._activeCanvasTool = null;
    this._nodeStateOverride = null;
    this._scopedEnvironmentId = null;
    this._scopedTaskId = null;
    if (SvelteFabricateApp._instance === this) {
      SvelteFabricateApp._instance = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    this._removeHooks();
    this._activeCanvasTool = null; // safety net mirroring close().
    this._nodeStateOverride = null;
    this._scopedEnvironmentId = null;
    this._scopedTaskId = null;
    super._onClose(options);
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
   * @param {object|null} [options.nodeStateOverride] Per-region node-state adapter
   *   injected by a granted gathering-task region activation. Scopes the gathering
   *   session to one environment+task so the attempt/listing read/write the
   *   behaviour's own `system.node` state (routed through the active-GM socket).
   * @param {string} [options.environmentId] Scoped environment (gathering-task region).
   * @param {string} [options.taskId] Scoped task (gathering-task region).
   * @returns {Promise<SvelteFabricateApp>}
   */
  static async show(tab = DEFAULT_TAB, { activeCanvasTool, nodeStateOverride, environmentId, taskId } = {}) {
    const initialTab = VALID_TABS.has(tab) ? tab : DEFAULT_TAB;
    const nextCanvasTool = activeCanvasTool ?? null;
    const nextNodeOverride = nodeStateOverride ?? null;
    const nextEnvironmentId = typeof environmentId === 'string' ? environmentId : null;
    const nextTaskId = typeof taskId === 'string' ? taskId : null;
    const existing = SvelteFabricateApp._instance;
    if (existing?.rendered) {
      // Re-show REPLACES the session-scoped canvas tool + per-region node context
      // (set when supplied, cleared when not) so a manual re-open never inherits
      // a stale station context.
      existing._activeCanvasTool = nextCanvasTool;
      existing._nodeStateOverride = nextNodeOverride;
      existing._scopedEnvironmentId = nextEnvironmentId;
      existing._scopedTaskId = nextTaskId;
      // Push the replaced tool to the mounted tree so the status chip updates.
      existing.updateProps({ activeCanvasTool: nextCanvasTool });
      existing._selectTab(initialTab);
      existing.bringToFront();
      return existing;
    }
    const app = new SvelteFabricateApp({
      activeTab: initialTab,
      activeCanvasTool: nextCanvasTool,
      nodeStateOverride: nextNodeOverride,
      environmentId: nextEnvironmentId,
      taskId: nextTaskId
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
