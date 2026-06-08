import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import InteractableBrowserRoot from './svelte/apps/InteractableBrowserRoot.svelte';
import { registerInteractableBrowserApp } from './appFactory.js';
import { InteractableManager } from '../canvas/InteractableManager.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';

/**
 * The GM "component browser" (Phase 7): a lightweight ApplicationV2 listing the
 * draggable Tools and Gathering Tasks of the active/selected crafting system so
 * a GM can place them on the canvas. Each browser row is a placement source —
 * drag it onto the canvas, or use the keyboard-accessible "Place on current
 * scene" button (the a11y fallback). Both route through the SAME spawn pipeline
 * as a real drop (`InteractableManager`): tools spawn directly; gathering tasks
 * run the env-resolution precedence.
 *
 * SINGLETON, mirroring {@link SvelteFabricateApp}: `static _instance`,
 * `static async show()` (re-focus or create+render), `close()` clears the
 * singleton. GM-only — launched from the Foundry V13 scene-control button.
 *
 * Library reads are delegated to the live Fabricate API
 * (`game.fabricate.getCraftingSystemManager()` for systems + per-system Tools)
 * and the persisted gathering config (per-system tasks) — the SAME sources the
 * Manager tool/task library and `InteractableManager` already read — rather than
 * duplicating data access.
 */
export class InteractableBrowserApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = InteractableBrowserRoot;

  // Single shared instance so the scene-control button re-focuses one window.
  static _instance = null;

  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-interactable-browser',
    classes: ['fabricate', 'fabricate-interactable-browser-app'],
    tag: 'div',
    window: {
      title: 'FABRICATE.Canvas.Browser.Title',
      icon: 'fas fa-mortar-pestle',
      resizable: true
    },
    position: {
      width: 420,
      height: 620
    }
  };

  /**
   * Build the services bag passed to the Svelte root. Reuses the existing
   * per-system Tool/Task library reads; the placement seam delegates to the
   * shared {@link InteractableManager} singleton (the same spawn pipeline a real
   * canvas drop uses).
   *
   * @returns {object}
   */
  _buildServices() {
    return {
      // Crafting systems (id + name), via the live system manager.
      listSystems: () => {
        const systems = game?.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
        return Array.from(systems).map((system) => ({ id: system?.id, name: system?.name }));
      },
      // Per-system Tool library (the same source ToolsBrowserView reads).
      listToolsForSystem: (systemId) => {
        if (!systemId) return [];
        const system = game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId);
        return Array.isArray(system?.tools) ? system.tools : [];
      },
      // Per-system managed component lookup ({ id, name, img }), the SAME
      // `system.components` source ToolsBrowserView resolves a tool's display
      // name/image from when the tool's own `label` is empty.
      getComponentForSystem: (systemId, componentId) => {
        if (!systemId || !componentId) return null;
        const system = game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId);
        const components = Array.isArray(system?.components) ? system.components : [];
        const component = components.find((item) => String(item?.id) === String(componentId));
        return component ? { id: component.id, name: component.name, img: component.img } : null;
      },
      // Per-system gathering library tasks, from the persisted gathering config
      // (the same source InteractableManager._readLibraryTasks reads).
      listTasksForSystem: (systemId) => {
        if (!systemId) return [];
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return Array.isArray(tasks) ? tasks : [];
      },
      // Click-to-place a11y fallback: route through the shared spawn pipeline at
      // the current scene's view center. NOT a divergent placement path.
      placeOnScene: ({ interactableType, systemId, referenceId } = {}) =>
        InteractableManager.instance?.placeInteractableAtViewCenter?.({
          interactableType,
          systemId,
          referenceId
        })
    };
  }

  _prepareSvelteProps() {
    if (!this._services) {
      this._services = this._buildServices();
    }
    return { services: this._services };
  }

  async close(options) {
    if (InteractableBrowserApp._instance === this) {
      InteractableBrowserApp._instance = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    if (InteractableBrowserApp._instance === this) {
      InteractableBrowserApp._instance = null;
    }
    super._onClose(options);
  }

  /**
   * Open (or re-focus) the shared Interactable browser window.
   *
   * @returns {Promise<InteractableBrowserApp>}
   */
  static async show() {
    const existing = InteractableBrowserApp._instance;
    if (existing?.rendered) {
      existing.bringToFront();
      return existing;
    }
    const app = new InteractableBrowserApp();
    InteractableBrowserApp._instance = app;
    await app.render(true);
    return app;
  }
}

// Register with the factory so the scene-control hook can launch this class
// without a static import chain that requires the Svelte compiler in Node.
// This file is imported as a side-effect by main.js, triggering registration.
registerInteractableBrowserApp(InteractableBrowserApp);
