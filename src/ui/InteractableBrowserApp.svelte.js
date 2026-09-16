import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import InteractableBrowserRoot from './svelte/apps/InteractableBrowserRoot.svelte';
import { registerInteractableBrowserApp } from './appFactory.js';
import { InteractableManager } from '../canvas/InteractableManager.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';
import {
  listSystemOptions,
  listSystemTools,
  listSystemTasks,
  getSystemComponent,
} from './interactableSourceLibrary.js';

// The GM interactable browser: a GM-only singleton listing the draggable Tools and Gathering Tasks
// of the selected crafting system. A drag and the keyboard "Place on current scene" fallback both
// route through the SAME `InteractableManager` spawn pipeline as a real drop, and every library
// read is delegated to the sources the Manager library and `InteractableManager` already use.
export class InteractableBrowserApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = InteractableBrowserRoot;

  // Single shared instance so the scene-control button re-focuses one window.
  static _instance = null;

  // The in-flight render, so concurrent `show()` calls coalesce onto ONE window.
  static _renderPromise = null;

  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-interactable-browser',
    // `fabricate-app` is the shared area class, adopted at the FRAME (issue 1520): `resolveOverlayHost`
    // needs a positioned ancestor, and the frame is the only one outside the clipped
    // `.window-content`. The size floor is not this class — it is on `fabricate-app-window`.
    classes: ['fabricate', 'fabricate-interactable-browser-app', 'fabricate-app'],
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

  // The SAME bag the Manage-Interactables promote picker uses, so both surfaces enumerate from one
  // source of truth.
  _sourceDeps() {
    return {
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getGatheringConfig: () => getSetting(SETTING_KEYS.GATHERING_CONFIG),
    };
  }

  _buildServices() {
    return {
      listSystems: () => listSystemOptions(this._sourceDeps()),
      listToolsForSystem: (systemId) => listSystemTools(this._sourceDeps(), systemId),
      // The SAME `system.components` source `ToolsBrowserView` resolves a tool's display name from.
      getComponentForSystem: (systemId, componentId) =>
        getSystemComponent(this._sourceDeps(), systemId, componentId),
      listTasksForSystem: (systemId) => listSystemTasks(this._sourceDeps(), systemId),
      // The a11y fallback routes the SHARED spawn pipeline at the view centre, never a divergent
      // placement path: `visualMode: 'none'` is the region-only spawn, `'marker'` the linked Tile.
      placeOnScene: ({ interactableType, systemId, referenceId, visualMode = 'marker' } = {}) =>
        InteractableManager.instance?.placeInteractableAtViewCenter?.({
          interactableType,
          systemId,
          referenceId,
          visualMode
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
      InteractableBrowserApp._renderPromise = null;
    }
    return super.close(options);
  }

  _onClose(options) {
    if (InteractableBrowserApp._instance === this) {
      InteractableBrowserApp._instance = null;
      InteractableBrowserApp._renderPromise = null;
    }
    super._onClose(options);
  }

  // RE-ENTRANCY: the V13 scene-control button fires its launch handler 2-3 times per activation, so
  // concurrent calls arrive mid-render. Guarding on `rendered` alone was not enough — a second call
  // constructed a SECOND instance and the two renders collided in `_updatePosition`. Any existing
  // instance, rendering OR rendered, is awaited and returned; only a null `_instance` constructs.
  static async show() {
    const existing = InteractableBrowserApp._instance;
    if (existing) {
      // Re-focus a finished window; await the tracked promise for an in-flight one.
      if (existing.rendered) existing.bringToFront();
      else if (InteractableBrowserApp._renderPromise) await InteractableBrowserApp._renderPromise;
      return existing;
    }
    const app = new InteractableBrowserApp();
    InteractableBrowserApp._instance = app;
    const renderPromise = Promise.resolve(app.render(true));
    InteractableBrowserApp._renderPromise = renderPromise;
    try {
      await renderPromise;
    } catch (err) {
      // A REJECTED render must not leave `_instance` pointing at the dead app, or a later `show()`
      // returns it and never re-renders. Cleared only when both still point at THIS attempt, since
      // a concurrent close or show may have moved on; the rejection is rethrown.
      if (InteractableBrowserApp._instance === app) {
        InteractableBrowserApp._instance = null;
      }
      if (InteractableBrowserApp._renderPromise === renderPromise) {
        InteractableBrowserApp._renderPromise = null;
      }
      throw err;
    } finally {
      if (InteractableBrowserApp._renderPromise === renderPromise) {
        InteractableBrowserApp._renderPromise = null;
      }
    }
    return app;
  }
}

// Registered through the factory so the scene-control hook launches this class without a static
// import chain that would need the Svelte compiler in Node; `main.js` imports this for the effect.
registerInteractableBrowserApp(InteractableBrowserApp);
