import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import RecipeEditorRoot from './svelte/apps/editor/RecipeEditorRoot.svelte';
import { createEditorStore } from './svelte/stores/editorStore.js';
import { registerSvelteRecipeEditorApp } from './appFactory.js';
import { get } from 'svelte/store';

export class SvelteRecipeEditorApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = RecipeEditorRoot;

  _editorStore = null;
  _services = null;
  _recipe = null;
  _craftingSystemId = null;
  _parentApp = null;

  constructor(recipe = null, options = {}) {
    super(options);
    this._recipe = recipe;
    this._craftingSystemId = options.craftingSystemId || recipe?.craftingSystemId || null;
    this._parentApp = options.parentApp || null;
  }

  static DEFAULT_OPTIONS = {
    id: 'fabricate-recipe-editor',
    classes: ['fabricate', 'recipe-editor-app'],
    tag: 'div',
    window: {
      title: 'Recipe Editor',
      icon: 'fa-solid fa-flask',
      resizable: true
    },
    position: {
      width: 1080,
      height: 780
    }
  };

  _buildServices() {
    return {
      randomID: () => foundry.utils.randomID(),
      getSystem: (systemId) => game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId) ?? null,
      getItems: (systemId, search) => game?.fabricate?.getCraftingSystemManager?.()?.getItems?.(systemId, search) ?? [],
      saveRecipe: async (payload, existingId) => {
        const manager = game.fabricate.getRecipeManager();
        if (existingId) {
          await manager.updateRecipe(existingId, payload);
        } else {
          await manager.createRecipe(payload);
        }
      },
      onClose: () => {
        this.close();
        if (this._parentApp) {
          this._parentApp.render?.();
        }
      },
      notify: (type, msg) => ui.notifications[type]?.(msg),
      getNonGMUsers: () =>
        Array.from(game.users?.contents || [])
          .filter(u => !u.isGM)
          .map(u => ({ id: u.id, name: u.name })),
      resolveItem: (uuid) => {
        try {
          return fromUuidSync(uuid);
        } catch {
          return null;
        }
      },
      getSystemTags: (systemId) => {
        if (!systemId) return [];
        const system = game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId);
        return system?.itemTags || [];
      },
      getEssenceDefinitions: (systemId) => {
        if (!systemId) return [];
        return game?.fabricate?.getCraftingSystemManager?.()?.getEssenceDefinitions?.(systemId) ?? [];
      },
      browseLinkedItem: async () => {
        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (!DialogV2) {
          ui.notifications.warn('Dialog API not available.');
          return;
        }
        const uuid = await DialogV2.prompt({
          window: { title: 'Select Linked Recipe Item' },
          content: '<div class="form-group"><label>Item UUID</label><input type="text" name="uuid" placeholder="Paste or type item UUID" /></div>',
          ok: {
            label: 'Confirm',
            callback: (event, button, dialog) => {
              return button.form?.elements?.uuid?.value?.trim() || '';
            }
          },
          rejectClose: false
        });
        if (uuid) {
          this._editorStore.setLinkedRecipeItemUuid(uuid);
        }
      },
      createLinkedItem: async () => {
        const store = this._editorStore;
        const draft = store.draft;
        const draftVal = draft.subscribe ? get(draft) : {};
        if (draftVal.linkedRecipeItemUuid) {
          ui.notifications.warn('A linked recipe item UUID is already set. Clear it first to create a new one.');
          return;
        }
        const recipeName = draftVal.name || 'Unnamed Recipe';
        const itemData = {
          name: `Recipe: ${recipeName}`,
          type: 'loot',
          img: draftVal.img || 'icons/svg/item-bag.svg'
        };
        try {
          const item = await Item.create(itemData, { parent: null });
          store.setLinkedRecipeItemUuid(item.uuid);
          ui.notifications.info(`Created world item "${item.name}" and linked it to this recipe.`);
        } catch (err) {
          console.error('Fabricate | Failed to create linked recipe item:', err);
          ui.notifications.error('Failed to create recipe item. Check console for details.');
        }
      }
    };
  }

  _prepareSvelteProps(context) {
    if (!this._editorStore) {
      this._services = this._buildServices();
      this._editorStore = createEditorStore(this._services, {
        recipe: this._recipe,
        craftingSystemId: this._craftingSystemId
      });
    }
    return {
      store: this._editorStore,
      services: this._services
    };
  }

  async close(options) {
    this._editorStore?.destroy?.();
    this._editorStore = null;
    this._services = null;
    return super.close(options);
  }

  static show(recipe = null, parentApp = null, craftingSystemId = null) {
    if (!game.user.isGM) {
      ui.notifications.error('Only GMs can manage recipes.');
      return null;
    }
    const app = new SvelteRecipeEditorApp(recipe, { parentApp, craftingSystemId });
    app.render(true);
    return app;
  }
}

// Self-register with the factory
registerSvelteRecipeEditorApp(SvelteRecipeEditorApp);
