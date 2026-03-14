import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import RecipeEditorRoot from './svelte/apps/editor/RecipeEditorRoot.svelte';
import { createEditorStore } from './svelte/stores/editorStore.js';
import { registerSvelteRecipeEditorApp } from './appFactory.js';
import { resolveDropData, resolveDropUuid } from './svelte/util/dropUtils.js';
import { confirmDialog, localize } from './svelte/util/foundryBridge.js';

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
          this._parentApp._adminStore?.refresh?.();
          this._parentApp.render?.();
        }
      },
      notify: (type, msg) => ui.notifications[type]?.(msg),
      confirmDialog: (options) => confirmDialog(options),
      localize: (key, data) => localize(key, data),
      copyToClipboard: async (text) => {
        if (foundry?.utils?.copyPlainText) {
          await foundry.utils.copyPlainText(text);
        } else {
          await navigator.clipboard.writeText(text);
        }
      },
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
      getRecipeItemDefinitions: (systemId) => {
        if (!systemId) return [];
        const manager = game?.fabricate?.getCraftingSystemManager?.();
        const definitions = manager?.getRecipeItemDefinitions?.(systemId) ?? [];
        return definitions.map(definition => {
          let source = null;
          let sourceMissing = false;
          if (definition?.sourceItemUuid) {
            try {
              source = fromUuidSync(definition.sourceItemUuid);
              sourceMissing = !source;
            } catch {
              sourceMissing = true;
            }
          }
          return {
            ...definition,
            img: source?.img || definition.img,
            hasSourceUuid: !!definition?.sourceItemUuid,
            sourceUuidDisplay: definition?.sourceItemUuid || localize('FABRICATE.Admin.Items.NoSourceUuid'),
            sourceMissing
          };
        });
      },
      getRecipeItemUsage: (systemId, recipeItemId) => {
        if (!systemId || !recipeItemId) return [];
        return game?.fabricate?.getCraftingSystemManager?.()
          ?.getRecipesUsingRecipeItemDefinition?.(systemId, recipeItemId) ?? [];
      },
      deleteRecipeItemDefinition: async (systemId, recipeItemId) => {
        if (!systemId || !recipeItemId) return { deleted: false, affectedRecipes: [] };
        return game?.fabricate?.getCraftingSystemManager?.()
          ?.deleteRecipeItemDefinition?.(systemId, recipeItemId);
      },
      assignRecipeItemFromDrop: async (data, systemId) => {
        const manager = game?.fabricate?.getCraftingSystemManager?.();
        if (!manager || !systemId) return null;

        if (data?.type === 'recipeItem' && data?.recipeItemId) {
          return manager.getRecipeItemDefinition?.(systemId, data.recipeItemId) ?? null;
        }

        const dropInfo = resolveDropData(data);
        if (dropInfo.type && dropInfo.type !== 'Item' && dropInfo.type !== 'Compendium') {
          ui.notifications.warn(localize('FABRICATE.Editor.LinkedItem.DropInvalid'));
          return null;
        }

        const uuid = resolveDropUuid(data);
        if (!uuid) {
          ui.notifications.warn(localize('FABRICATE.Editor.LinkedItem.DropInvalid'));
          return null;
        }

        try {
          const result = await manager.addRecipeItemFromUuid(systemId, uuid);
          return result.item ?? null;
        } catch (err) {
          console.error('Fabricate | Failed to assign recipe item:', err);
          ui.notifications.error(localize('FABRICATE.Editor.Notifications.LinkedItemCreateFailed'));
          return null;
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
