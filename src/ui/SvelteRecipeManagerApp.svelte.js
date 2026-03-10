import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import RecipeManagerRoot from './svelte/apps/RecipeManagerRoot.svelte';
import { createAdminStore } from './svelte/stores/adminStore.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { confirmDialog } from './foundryCompat.js';
import { getRecipeEditorAppClass, registerSvelteRecipeManagerApp } from './appFactory.js';
import { get } from 'svelte/store';
import { resolveDropUuid, resolveDropData } from './svelte/util/dropUtils.js';
import { localize } from './svelte/util/foundryBridge.js';

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
        if (!systemId) {
          ui.notifications.warn('Create or select a crafting system first.');
          return;
        }
        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (!DialogV2) {
          ui.notifications.warn('Dialog API not available.');
          return;
        }
        const formContent = `
          <p>Paste recipe JSON array. Imported recipes will be assigned to the selected system.</p>
          <textarea name="importJson" rows="12" style="width:100%;"></textarea>
          <p><label><input type="checkbox" name="overwrite" /> Overwrite existing IDs</label></p>
        `;
        const result = await DialogV2.prompt({
          window: { title: 'Import Recipes' },
          content: formContent,
          ok: {
            label: 'Import',
            callback: (event, button, dialog) => {
              const raw = button.form?.elements?.importJson?.value || '';
              const overwrite = button.form?.elements?.overwrite?.checked || false;
              return { raw, overwrite };
            }
          },
          rejectClose: false
        });
        if (result) {
          try {
            const data = JSON.parse(result.raw).map(r => ({ ...r, craftingSystemId: systemId }));
            await game.fabricate.getRecipeManager().importRecipes(data, result.overwrite);
            await this._adminStore.refresh();
            ui.notifications.info(`Imported ${data.length} recipe(s).`);
          } catch (err) {
            ui.notifications.error(`Import failed: ${err.message}`);
          }
        }
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
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = get(this._adminStore.selectedSystemId) || '';

          // Phase 2: Bulk compendium pack drop
          // Foundry v13 shape: { type: "Compendium", collection: "world.pack-name" }
          if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
            const packId = data.collection;
            if (!packId || !systemId) {
              if (!systemId) ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
              return;
            }
            const result = await systemManager.addItemsFromPack(systemId, packId);
            ui.notifications.info(localize('FABRICATE.Admin.Items.BulkImportUpdated', {
              added: result.added,
              updated: result.updated,
              skipped: result.skipped,
              total: result.total
            }));
            await this._adminStore.refresh();
            return;
          }

          // Folder drop: expand to contained Items
          if (data?.type === 'Folder') {
            if (!systemId) {
              ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
              return;
            }
            const folder = game.folders?.get(data.id);
            if (!folder) return;
            // folder.contents contains the documents in the folder
            const folderItems = (folder.contents || []).filter(
              d => d.documentName === 'Item'
            );
            if (folderItems.length === 0) {
              ui.notifications.info(localize('FABRICATE.Admin.Items.FolderEmpty', {
                name: folder.name || data.id
              }));
              return;
            }
            let added = 0;
            let updated = 0;
            let skipped = 0;
            for (const folderItem of folderItems) {
              const result = await systemManager.addItemFromUuid(systemId, folderItem.uuid);
              if (result.action === 'added') added++;
              else if (result.action === 'updated') updated++;
              else skipped++;
            }
            ui.notifications.info(localize('FABRICATE.Admin.Items.FolderImportSummary', {
              added,
              name: folder.name || data.id
            }));
            await this._adminStore.refresh();
            return;
          }

          // Entity type guard: reject Actor and other non-Item types
          const dropInfo = resolveDropData(data);
          if (dropInfo.type && dropInfo.type !== 'Item' && dropInfo.type !== 'Compendium') {
            ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNotAnItem', {
              type: dropInfo.type
            }));
            return;
          }

          // Single item drop (world sidebar or compendium item)
          const uuid = resolveDropUuid(data);
          if (!uuid) {
            ui.notifications.warn(localize('FABRICATE.Admin.Items.DropInvalidItem'));
            return;
          }
          if (!systemId) {
            ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
            return;
          }
          const singleResult = await systemManager.addItemFromUuid(systemId, uuid);
          if (singleResult.action === 'updated') {
            ui.notifications.info(localize('FABRICATE.Admin.Items.ItemUpdated', {
              name: singleResult.item.name
            }));
          }
          await this._adminStore.refresh();
        },
        onEditRecipe: (recipeId) => {
          const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
          if (!recipe) return;
          getRecipeEditorAppClass().show(recipe, this, recipe.craftingSystemId);
        },
        onEditComponent: async (itemId) => {
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId || !itemId) return;
          const system = systemManager.getSystem(systemId);
          if (!system) return;
          const item = (system.items || []).find(i => i.id === itemId);
          if (!item) return;

          const advancedEnabled = system.advancedOptionsEnabled !== false;
          const showTags = advancedEnabled && system.features?.itemTags === true;
          const showEssences = advancedEnabled && system.features?.essences === true;

          const tagOptions = (system.itemTags || system.tags || []).map(tag => ({
            tag,
            checked: (item.tags || []).includes(tag)
          }));

          const essenceOptions = (system.essenceDefinitions || []).map(def => ({
            id: def.id,
            name: def.name,
            quantity: Number(item.essences?.[def.id] || 0)
          }));

          let formContent = '<form class="fabricate-item-editor">';
          formContent += `<h3>${item.name}</h3>`;
          formContent += '<p class="hint">Edit tags and essences for this component.</p>';

          if (showTags) {
            formContent += '<div class="form-group"><label>Tags</label>';
            if (tagOptions.length) {
              for (const opt of tagOptions) {
                formContent += `<label class="checkbox-row"><input type="checkbox" name="itemTag" value="${opt.tag}" ${opt.checked ? 'checked' : ''} /> ${opt.tag}</label>`;
              }
            } else {
              formContent += '<p class="hint">No tags defined in this system.</p>';
            }
            formContent += '</div>';
          }

          if (showEssences) {
            formContent += '<div class="form-group"><label>Essences</label>';
            if (essenceOptions.length) {
              for (const opt of essenceOptions) {
                formContent += `<label class="essence-row">${opt.name} <input type="number" name="essence.${opt.id}" min="0" value="${opt.quantity || ''}" /></label>`;
              }
            } else {
              formContent += '<p class="hint">No essences defined in this system.</p>';
            }
            formContent += '</div>';
          }

          if (!showTags && !showEssences) {
            formContent += '<p class="hint">Advanced options are disabled for this system.</p>';
          }
          formContent += '</form>';

          const DialogV2 = foundry.applications?.api?.DialogV2;
          if (!DialogV2) {
            ui.notifications.warn('Dialog API not available.');
            return;
          }

          const result = await DialogV2.prompt({
            window: { title: `Edit ${item.name}` },
            content: formContent,
            ok: {
              label: 'Save',
              callback: (event, button, dialog) => {
                const updates = {};
                if (showTags) {
                  updates.tags = Array.from(
                    button.form?.querySelectorAll('input[name="itemTag"]:checked') || []
                  ).map(el => el.value);
                }
                if (showEssences) {
                  const essences = {};
                  for (const opt of essenceOptions) {
                    const input = button.form?.querySelector(`input[name="essence.${opt.id}"]`);
                    const value = Number(input?.value || 0);
                    if (value > 0) essences[opt.id] = value;
                  }
                  updates.essences = essences;
                }
                return updates;
              }
            },
            rejectClose: false
          });

          if (result) {
            await systemManager.updateItem(systemId, itemId, result);
            await this._adminStore.refresh();
          }
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
