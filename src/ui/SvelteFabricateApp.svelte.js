import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import FabricateAppRoot from './svelte/apps/FabricateAppRoot.svelte';
import { registerFabricateApp } from './appFactory.js';
import { isAlchemyTabAvailable } from './svelte/util/alchemyTabAvailability.js';

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
  }

  _buildServices() {
    return {
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null
    };
  }

  _prepareSvelteProps() {
    if (!this._services) {
      this._services = this._buildServices();
    }
    return {
      activeTab: this._activeTab,
      showAlchemy: isAlchemyTabAvailable(this._services),
      onSelectTab: (tab) => this._selectTab(tab)
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
    if (SvelteFabricateApp._instance === this) {
      SvelteFabricateApp._instance = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    this._removeHooks();
    super._onClose(options);
  }

  /**
   * Open (or re-focus) the shared Fabricate window on the requested tab.
   * @param {string} [tab='crafting'] One of crafting/gathering/journal/inventory.
   * @returns {Promise<SvelteFabricateApp>}
   */
  static async show(tab = DEFAULT_TAB) {
    const initialTab = VALID_TABS.has(tab) ? tab : DEFAULT_TAB;
    const existing = SvelteFabricateApp._instance;
    if (existing?.rendered) {
      existing._selectTab(initialTab);
      existing.bringToFront();
      return existing;
    }
    const app = new SvelteFabricateApp({ activeTab: initialTab });
    SvelteFabricateApp._instance = app;
    await app.render(true);
    return app;
  }
}

// Register with the factory so getFabricateAppClass() can return this class.
// This file is imported as a side-effect by main.js, which triggers this
// registration at module load time.
registerFabricateApp(SvelteFabricateApp);
