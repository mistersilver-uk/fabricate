import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import RecipeManagerRoot from './svelte/apps/RecipeManagerRoot.svelte';
import { createAdminStore } from './svelte/stores/adminStore.js';
import { getSetting, setSetting, SETTING_KEYS } from '../config/settings.js';
import { confirmDialog } from './foundryCompat.js';
import { getRecipeEditorAppClass, registerSvelteRecipeManagerApp } from './appFactory.js';
import { SvelteComponentEditorApp } from './SvelteComponentEditorApp.svelte.js';
import { get } from 'svelte/store';
import { resolveDropUuid, resolveDropData } from './svelte/util/dropUtils.js';
import { localize } from './svelte/util/foundryBridge.js';
import { validateImportData, prepareForImport } from '../systems/CraftingSystemExporter.js';
import { CompendiumImporter } from '../systems/CompendiumImporter.js';

function getFolderCollectionValues(folders) {
  if (!folders) return [];
  if (Array.isArray(folders)) return folders;
  if (folders instanceof Map) return Array.from(folders.values());
  if (typeof folders.values === 'function') return Array.from(folders.values());
  if (Array.isArray(folders.contents)) return folders.contents;
  return [];
}

function getFolderById(folders, id) {
  if (!folders || !id) return null;
  if (typeof folders.get === 'function') return folders.get(id) || null;
  return getFolderCollectionValues(folders).find(folder => folder?.id === id) || null;
}

function folderDocumentType(folder) {
  return folder?.documentType || folder?.type || folder?.folderDocumentType || '';
}

function folderChildFolders(folder, folders) {
  const explicitChildren = Array.isArray(folder?.children) ? folder.children : [];
  const explicitFolderChildren = explicitChildren
    .map(child => child?.folder || child)
    .filter(child => child && child !== folder);
  const collectionChildren = getFolderCollectionValues(folders)
    .filter(candidate => candidate?.folder?.id === folder?.id || candidate?.parent?.id === folder?.id || candidate?.parent === folder?.id);
  return [...explicitFolderChildren, ...collectionChildren];
}

function collectFolderItems(folder, folders, visited = new Set()) {
  if (!folder?.id || visited.has(folder.id)) return [];
  visited.add(folder.id);
  if (folderDocumentType(folder) && folderDocumentType(folder) !== 'Item') return [];

  const directItems = (folder.contents || []).filter(document => document?.documentName === 'Item' && document?.uuid);
  const nestedItems = folderChildFolders(folder, folders)
    .flatMap(child => collectFolderItems(child, folders, visited));
  return [...directItems, ...nestedItems];
}

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
    const managerInitialized = (manager) => manager?.initialized === true;
    const isFabricateReady = () => {
      const fabricate = game?.fabricate;
      return fabricate?.ready === true
        && managerInitialized(fabricate?.getRecipeManager?.())
        && managerInitialized(fabricate?.getCraftingSystemManager?.());
    };

    return {
      getSetting: (key) => getSetting(key),
      setSetting: async (key, value) => setSetting(key, value),
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getGatheringEnvironmentStore: () => game?.fabricate?.getGatheringEnvironmentStore?.() ?? null,
      getFoundrySystemId: () => game?.system?.id || '',
      isFabricateReady,
      onFabricateReady: (callback) => {
        if (typeof callback !== 'function') return () => {};
        if (isFabricateReady()) {
          callback();
          return () => {};
        }
        const hooks = globalThis.Hooks;
        if (typeof hooks?.once !== 'function') return () => {};

        let active = true;
        const wrapped = (...args) => {
          if (!active) return;
          active = false;
          callback(...args);
        };
        hooks.once('fabricate.ready', wrapped);
        return () => {
          if (!active) return;
          active = false;
          hooks?.off?.('fabricate.ready', wrapped);
        };
      },
      setGatheringConditions: async (conditions) => game?.fabricate?.gathering?.setConditions?.(conditions),
      getScriptMacros: () =>
        Array.from(game.macros?.contents || [])
          .filter(m => (m.type || '').toLowerCase() === 'script')
          .map(m => ({ uuid: m.uuid, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      getSceneOptions: () =>
        Array.from(game.scenes?.contents || [])
          .map(scene => ({
            uuid: scene.uuid,
            name: scene.name,
            img: scene.background?.src || scene.img || '',
            thumbnail: scene.thumbnail || scene.thumb || ''
          }))
          .filter(scene => scene.uuid && scene.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      getRollTableOptions: () =>
        Array.from(game.tables?.contents || [])
          .map(table => ({
            uuid: table.uuid,
            name: table.name,
            img: table.img || ''
          }))
          .filter(table => table.uuid && table.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      pickImagePath: async (currentPath = '') => {
        const FilePickerClass = foundry?.applications?.apps?.FilePicker?.implementation
          || foundry?.applications?.apps?.FilePicker
          || globalThis.FilePicker;
        if (!FilePickerClass) {
          ui.notifications.warn(localize('FABRICATE.Admin.Environments.ImagePickerUnavailable'));
          return null;
        }

        return new Promise((resolve) => {
          let settled = false;
          const settle = (path) => {
            if (settled) return;
            settled = true;
            resolve(path || null);
          };
          try {
            const picker = new FilePickerClass({
              type: 'image',
              current: currentPath || '',
              callback: (path) => settle(path),
              close: () => settle(null)
            });
            picker.render(true);
          } catch (err) {
            ui.notifications.warn(err?.message || localize('FABRICATE.Admin.Environments.ImagePickerUnavailable'));
            settle(null);
          }
        });
      },
      notify: {
        info: (msg) => ui.notifications.info(msg),
        warn: (msg) => ui.notifications.warn(msg),
        error: (msg) => ui.notifications.error(msg)
      },
      localize: (key, data) => localize(key, data),
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
      },
      getModuleVersion: () => game.modules?.get('fabricate')?.version || '0.0.0',
      downloadFile: async (json, filename) => {
        if (typeof saveDataToFile === 'function') {
          saveDataToFile(json, 'application/json', filename);
        } else {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      },
      renderSystemImportDialog: async () => {
        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (!DialogV2) {
          ui.notifications.warn('Dialog API not available.');
          return;
        }
        const formContent = `
          <p>Select a Fabricate system JSON file to import.</p>
          <input type="file" name="importFile" accept=".json" style="width:100%; margin-bottom: 0.5rem;" />
          <fieldset style="margin-top: 0.5rem;">
            <legend>Conflict handling</legend>
            <label><input type="radio" name="conflictMode" value="skip" checked /> Skip if system already exists</label><br/>
            <label><input type="radio" name="conflictMode" value="overwrite" /> Overwrite existing system and recipes</label><br/>
            <label><input type="radio" name="conflictMode" value="copy" /> Import as new copy</label>
          </fieldset>
        `;
        const result = await DialogV2.prompt({
          window: { title: 'Import Crafting System' },
          content: formContent,
          ok: {
            label: 'Import',
            callback: (event, button) => {
              const fileInput = button.form?.querySelector('input[name="importFile"]');
              const file = fileInput?.files?.[0] || null;
              const conflictMode = button.form?.querySelector('input[name="conflictMode"]:checked')?.value || 'skip';
              return { file, conflictMode };
            }
          },
          rejectClose: false
        });
        if (!result || !result.file) return;

        try {
          const text = await result.file.text();
          const data = JSON.parse(text);

          const validation = validateImportData(data);
          if (!validation.valid) {
            ui.notifications.error(`Invalid file: ${validation.errors.join('; ')}`);
            return;
          }
          if (validation.warnings.length > 0) {
            for (const w of validation.warnings) ui.notifications.warn(w);
          }

          const mode = result.conflictMode === 'copy' ? 'copy' : 'keep';
          const packData = prepareForImport(data, mode);

          const systemManager = game.fabricate.getCraftingSystemManager();
          const recipeManager = game.fabricate.getRecipeManager();
          const importer = new CompendiumImporter(systemManager, recipeManager);
          const summary = await importer.importFromPackData(packData, {
            overwriteExisting: result.conflictMode === 'overwrite'
          });

          if (summary.system.skipped) {
            ui.notifications.info(`System "${summary.system.name}" already exists — skipped.`);
          } else {
            const verb = summary.collisions.some(c => c.type === 'system' && c.resolution === 'overwritten')
              ? 'Updated' : 'Imported';
            ui.notifications.info(
              `${verb} "${summary.system.name}" with ${summary.components.total} components and ${summary.recipes.imported} recipes.`
            );
          }

          if (summary.recipes.errors.length > 0) {
            ui.notifications.warn(`${summary.recipes.errors.length} recipe(s) failed to import.`);
          }

          await this._adminStore.refresh();
        } catch (err) {
          ui.notifications.error(`Import failed: ${err.message}`);
        }
      }
    };
  }

  _prepareSvelteProps(context) {
    if (!this._adminStore) {
      this._services = this._buildServices();
      this._adminStore = createAdminStore(this._services);
    }

    const resolveSingleItemDropUuid = (data) => {
      const dropInfo = resolveDropData(data);
      if (dropInfo.type && dropInfo.type !== 'Item' && dropInfo.type !== 'Compendium') {
        ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNotAnItem', {
          type: dropInfo.type
        }));
        return null;
      }

      const uuid = resolveDropUuid(data);
      if (!uuid) {
        ui.notifications.warn(localize('FABRICATE.Admin.Items.DropInvalidItem'));
        return null;
      }

      return uuid;
    };

    const importSingleManagedItemFromDrop = async (data) => {
      const systemManager = game.fabricate.getCraftingSystemManager();
      const systemId = get(this._adminStore.selectedSystemId) || '';
      if (!systemId) {
        ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
        return null;
      }

      const uuid = resolveSingleItemDropUuid(data);
      if (!uuid) return null;

      try {
        const result = await systemManager.addItemFromUuid(systemId, uuid);
        if (result.action === 'updated') {
          ui.notifications.info(localize('FABRICATE.Admin.Items.ItemUpdated', {
            name: result.item.name
          }));
        }
        await this._adminStore.refresh();
        return result.item ?? null;
      } catch (err) {
        ui.notifications.warn(err.message || localize('FABRICATE.Admin.Items.DropInvalidItem'));
        return null;
      }
    };

    return {
      store: this._adminStore,
      services: {
        importSingleManagedItemFromDrop,
        pickImagePath: this._services.pickImagePath,
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
            const folder = getFolderById(game.folders, data.id);
            if (!folder) return;
            const folderItems = folderDocumentType(folder) && folderDocumentType(folder) !== 'Item'
              ? []
              : collectFolderItems(folder, game.folders);
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
              updated,
              skipped,
              total: folderItems.length,
              name: folder.name || data.id
            }));
            await this._adminStore.refresh();
            return;
          }

          // Single item drop (world sidebar or compendium item)
          await importSingleManagedItemFromDrop(data);
        },
        onReplaceSource: async (itemId, data) => {
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId || !itemId) {
            if (!systemId) ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
            return;
          }

          const uuid = resolveSingleItemDropUuid(data);
          if (!uuid) return;

          try {
            const item = await systemManager.replaceItemSource(systemId, itemId, uuid);
            ui.notifications.info(localize('FABRICATE.Admin.Items.SourceReplaced', {
              name: item.name
            }));
            await this._adminStore.refresh();
          } catch (err) {
            ui.notifications.warn(err.message || localize('FABRICATE.Admin.Items.ReplaceFailed'));
          }
        },
        onCopySourceUuid: async (uuid) => {
          if (!uuid) return;
          try {
            await this._services.copyToClipboard(uuid);
            ui.notifications.info(localize('FABRICATE.Admin.Items.SourceUuidCopied'));
          } catch (err) {
            ui.notifications.error(localize('FABRICATE.Admin.Items.SourceUuidCopyFailed'));
          }
        },
        onUnlinkSource: async (itemId) => {
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId || !itemId) return;
          try {
            await systemManager.updateItem(systemId, itemId, { sourceItemUuid: null });
            ui.notifications.info(localize('FABRICATE.Admin.Items.SourceUnlinked'));
            await this._adminStore.refresh();
          } catch (err) {
            ui.notifications.warn(err?.message || localize('FABRICATE.Admin.Items.UnlinkFailed'));
          }
        },
        onOpenSource: async (uuid) => {
          if (!uuid) return;
          try {
            const document = await fromUuid(uuid);
            if (!document) {
              ui.notifications.warn(localize('FABRICATE.Admin.Items.SourceNotFound'));
              return;
            }
            await document.sheet?.render?.(true);
          } catch (err) {
            ui.notifications.warn(err?.message || localize('FABRICATE.Admin.Items.SourceNotFound'));
          }
        },
        onEditRecipe: (recipeId) => {
          const recipe = game.fabricate.getRecipeManager().getRecipe(recipeId);
          if (!recipe) return;
          getRecipeEditorAppClass().show(recipe, this, recipe.craftingSystemId);
        },
        onEditComponent: async (itemId) => {
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId || !itemId) return;
          SvelteComponentEditorApp.show(itemId, systemId, this);
        }
      }
    };
  }

  async close(options) {
    if (this._adminStore) {
      const canClose = await this._adminStore.confirmDiscardDirtyEnvironmentDraft?.();
      if (!canClose) return this;

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
