import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import RecipeManagerRoot from './svelte/apps/RecipeManagerRoot.svelte';
import { createAdminStore } from './svelte/stores/adminStore.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { confirmDialog } from './foundryCompat.js';
import { getRecipeEditorAppClass, registerSvelteRecipeManagerApp } from './appFactory.js';

export class SvelteRecipeManagerApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = RecipeManagerRoot;

  _adminStore = null;
  _services = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-recipe-manager',
    classes: ['fabricate', 'recipe-manager-app'],
    tag: 'div',
    window: {
      title: 'Crafting Admin',
      icon: 'fa-solid fa-book',
      resizable: true
    },
    position: {
      width: 980,
      height: 760
    }
  };

  _buildServices() {
    return {
      getSetting: (key) => getSetting(key),
      setSetting: async (key, value) => setSetting(key, value),
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getScriptMacros: () =>
        Array.from(game.macros?.contents || [])
          .filter(m => (m.type || '').toLowerCase() === 'script')
          .map(m => ({ uuid: m.uuid, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      notify: {
        info: (msg) => ui.notifications.info(msg),
        warn: (msg) => ui.notifications.warn(msg),
        error: (msg) => ui.notifications.error(msg)
      },
      confirmDialog: (options) => confirmDialog(options),
      openRecipeEditor: (recipe, actorId, systemId) => {
        getRecipeEditorAppClass().show(recipe, this, systemId);
      },
      renderImportDialog: async (systemId) => {
        // Delegate to existing import flow on the HBS app
        // TODO: build Svelte import dialog
      },
      copyToClipboard: async (text) => {
        if (foundry?.utils?.copyPlainText) {
          await foundry.utils.copyPlainText(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
      }
    };
  }

  _prepareSvelteProps(context) {
    if (!this._adminStore) {
      this._services = this._buildServices();
      this._adminStore = createAdminStore(this._services);
    }
    return {
      store: this._adminStore,
      services: {
        onDropItem: async (data) => {
          const uuid = data?.uuid;
          if (!uuid) {
            ui.notifications.warn('Drop an Item document from sidebar or compendium.');
            return;
          }
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = this._adminStore.selectedSystemId
            ? /** @type {string} */ (/** @type {any} */ (this._adminStore.selectedSystemId).get?.() ?? '')
            : '';
          if (!systemId) return;
          await systemManager.addItemFromUuid(systemId, uuid);
          await this._adminStore.refresh();
        },
        onEditRecipe: (recipeId) => {
          const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
          if (!recipe) return;
          getRecipeEditorAppClass().show(recipe, this, recipe.craftingSystemId);
        },
        onEditComponent: (itemId) => {
          // TODO: build Svelte item editor dialog
        }
      }
    };
  }

  async close(options) {
    if (this._adminStore) {
      this._adminStore.destroy();
      this._adminStore = null;
      this._services = null;
    }
    return super.close(options);
  }

  static show() {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage crafting systems.');
      return null;
    }
    const app = new SvelteRecipeManagerApp();
    app.render(true);
    return app;
  }
}

// Self-register with the factory
registerSvelteRecipeManagerApp(SvelteRecipeManagerApp);
