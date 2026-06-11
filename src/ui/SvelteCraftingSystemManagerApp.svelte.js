import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import CraftingSystemManagerRoot from './svelte/apps/manager/CraftingSystemManagerRoot.svelte';
import { createAdminStore } from './svelte/stores/adminStore.js';
import { getSetting, setSetting } from '../config/settings.js';
import { confirmDialog, renderDialog, choiceDialog } from './foundryCompat.js';
import { registerCraftingSystemManagerApp } from './appFactory.js';
import { SvelteComponentEditorApp } from './SvelteComponentEditorApp.svelte.js';
import { get } from 'svelte/store';
import { resolveDropUuid, resolveDropData } from './svelte/util/dropUtils.js';
import { localize, subscribeSceneChange, subscribeTravelMarkerMove } from './svelte/util/foundryBridge.js';
import { normalizeSceneOption } from './svelte/util/sceneImages.js';
import { readSceneRegions, filterActorUuidsInsideRegion } from './svelte/util/sceneRegions.js';
import { getTokenSceneUuid } from '../gatheringBootstrapAdapters.js';
import { tokenDocumentCenter } from '../canvas/regionHitTest.js';
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

export class SvelteCraftingSystemManagerApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = CraftingSystemManagerRoot;
  static _pendingReadyOpen = false;

  _adminStore = null;
  _services = null;
  _confirmDiscardDirtyEssenceDraft = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-crafting-system-manager',
    classes: ['fabricate', 'crafting-system-manager'],
    tag: 'div',
    window: {
      title: 'FABRICATE.Admin.Manager.WindowTitle',
      icon: 'fa-solid fa-layer-group',
      resizable: true
    },
    position: {
      width: 1280,
      height: 940
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
      getGatheringPartyStore: () => game?.fabricate?.getGatheringPartyStore?.() ?? null,
      getGatheringRegionStore: () => game?.fabricate?.getGatheringRegionStore?.() ?? null,
      getGatheringLocationService: () => game?.fabricate?.getGatheringLocationService?.() ?? null,
      getCurrentSceneRegions: () =>
        readSceneRegions(game?.scenes?.current ?? game?.scene ?? globalThis.canvas?.scene ?? null),
      subscribeSceneChange: (handler) => subscribeSceneChange(handler),
      subscribeTravelMarkerMove: (handler) => subscribeTravelMarkerMove(handler),
      // Of the given actor uuids, return those whose token currently sits inside
      // the Foundry Scene Region identified by `sceneRegionUuid`. Backs the Map
      // Region Links auto-update of party current regions on (un)link. Returns []
      // when Foundry globals / the region are unavailable (headless / no canvas).
      getActorUuidsInSceneRegion: (sceneRegionUuid, actorUuids) => {
        const resolveSync = globalThis.fromUuidSync;
        if (typeof resolveSync !== 'function' || !sceneRegionUuid || !Array.isArray(actorUuids)) return [];
        let regionDoc = null;
        try {
          regionDoc = resolveSync(String(sceneRegionUuid));
        } catch (_) {
          regionDoc = null;
        }
        if (!regionDoc) return [];
        const sceneUuid = regionDoc?.parent?.uuid ?? '';
        return filterActorUuidsInsideRegion({
          regionDoc,
          actorUuids,
          resolveActorTokenCenter: (actorUuid) => {
            let actor = null;
            try {
              actor = resolveSync(String(actorUuid));
            } catch (_) {
              actor = null;
            }
            const token = actor?.getActiveTokens?.(false, true)?.find(candidate =>
              getTokenSceneUuid(candidate) === sceneUuid
            ) ?? null;
            if (!token) return null;
            // Use the DOCUMENT-derived centre so a just-moved marker resolves to its
            // new position (the placeable centre lags during the move animation).
            return tokenDocumentCenter(token);
          }
        });
      },
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
      onFabricateDataChanged: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const hooks = globalThis.Hooks;
        if (typeof hooks?.on !== 'function') return () => {};

        const systemListener = (...args) => callback('systems', ...args);
        const recipeListener = (...args) => callback('recipes', ...args);
        hooks.on('fabricate.craftingSystemsChanged', systemListener);
        hooks.on('fabricate.recipesChanged', recipeListener);

        return () => {
          hooks?.off?.('fabricate.craftingSystemsChanged', systemListener);
          hooks?.off?.('fabricate.recipesChanged', recipeListener);
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
          .map(scene => normalizeSceneOption(scene))
          .filter(scene => scene.uuid && scene.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      getActorOptions: () =>
        Array.from(game.actors?.contents || [])
          .map(actor => ({
            uuid: actor.uuid,
            id: actor.id,
            name: actor.name,
            img: actor.img || '',
            type: actor.type || ''
          }))
          .filter(actor => actor.uuid && actor.name)
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
      choiceDialog: (options) => choiceDialog(options),
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
            const message = `${verb} "${summary.system.name}" with ${summary.components.total} components, ${summary.recipes.imported} imported recipes, ${summary.recipes.skipped} skipped recipes, and ${summary.recipes.errors.length} failed recipes.`;
            if (summary.recipes.errors.length > 0) {
              ui.notifications.warn(message);
            } else {
              ui.notifications.info(message);
            }
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

    const notifySingleSourceFallback = (fallbacks = []) => {
      const fallback = Array.isArray(fallbacks) ? fallbacks[0] : null;
      if (!fallback) return;
      ui.notifications.warn(localize('FABRICATE.Admin.Items.SourceFallbackWarning', {
        name: fallback.itemName || fallback.fallbackUuid,
        brokenUuid: fallback.brokenUuid,
        fallbackUuid: fallback.fallbackUuid
      }));
    };

    const notifyBulkSourceFallback = (fallbacks = []) => {
      const count = Array.isArray(fallbacks) ? fallbacks.length : 0;
      if (count <= 0) return;
      ui.notifications.warn(localize('FABRICATE.Admin.Items.SourceFallbackSummary', {
        count
      }));
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
        notifySingleSourceFallback(result.sourceFallbacks);
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
            notifyBulkSourceFallback(result.sourceFallbacks);
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
            const sourceFallbacks = [];
            for (const folderItem of folderItems) {
              const result = await systemManager.addItemFromUuid(systemId, folderItem.uuid);
              if (result.action === 'added') added++;
              else if (result.action === 'updated') updated++;
              else skipped++;
              if (Array.isArray(result.sourceFallbacks)) sourceFallbacks.push(...result.sourceFallbacks);
            }
            ui.notifications.info(localize('FABRICATE.Admin.Items.FolderImportSummary', {
              added,
              updated,
              skipped,
              total: folderItems.length,
              name: folder.name || data.id
            }));
            notifyBulkSourceFallback(sourceFallbacks);
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
            const result = await systemManager.replaceItemSource(systemId, itemId, uuid);
            const item = result.item;
            ui.notifications.info(localize('FABRICATE.Admin.Items.SourceReplaced', {
              name: item.name
            }));
            notifySingleSourceFallback(result.sourceFallbacks);
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
        onEditComponent: async (itemId) => {
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId || !itemId) return;
          SvelteComponentEditorApp.show(itemId, systemId, this);
        },
        confirmDiscardEssenceDraft: () => confirmDialog({
          title: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyTitle'),
          content: `<p>${localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyContent')}</p>`,
          yes: {
            label: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyConfirm'),
            callback: () => true
          },
          no: {
            label: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyCancel'),
            callback: () => false
          }
        }),
        confirmDirtyToolsNavigation: async () => {
          const action = await choiceDialog({
            title: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Title'),
            content: `<p>${localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Content')}</p>`,
            choices: [
              {
                action: 'save',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.SaveAll'),
                icon: 'fas fa-save'
              },
              {
                action: 'discard',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Discard'),
                icon: 'fas fa-trash'
              },
              {
                action: 'cancel',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Cancel'),
                icon: 'fas fa-times'
              }
            ],
            defaultAction: 'save'
          });
          return action === 'cancel' ? false : action;
        },
        registerEssenceDirtyGuard: (guard) => {
          this._confirmDiscardDirtyEssenceDraft = typeof guard === 'function' ? guard : null;
        },
        // Gathering economy authoring + manual state controls (GM-only).
        getGatheringEconomy: (opts = {}) => game?.fabricate?.getGatheringEconomy?.(opts) ?? null,
        // The economy panel persists straight to the gathering-config setting, so
        // after a limitation-FLAG change refresh the store's reactive copy — the
        // task editor derives its stamina/nodes gating from viewState.gatheringConfig
        // and would otherwise stay stale until the app reopens. Skipped when only the
        // stamina expressions change (both flags unchanged) to avoid per-keystroke
        // churn.
        setGatheringEconomy: async (opts = {}) => {
          const prevEconomy = get(this._adminStore?.viewState)?.gatheringConfig?.systems?.[opts?.systemId]?.economy;
          const prevStamina = prevEconomy?.stamina?.enabled === true;
          const prevNodes = prevEconomy?.nodes?.enabled === true;
          const nextStamina = opts?.economy?.stamina?.enabled === true;
          const nextNodes = opts?.economy?.nodes?.enabled === true;
          const result = await game?.fabricate?.setGatheringEconomy?.(opts);
          if (nextStamina !== prevStamina || nextNodes !== prevNodes) this._adminStore?.refreshGatheringConfig?.();
          return result;
        },
        getGatheringStaminaState: (opts = {}) => game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
        rollGatheringStamina: (opts = {}) => game?.fabricate?.rollGatheringStamina?.(opts),
        setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
        adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
        restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts)
      }
    };
  }

  async close(options) {
    const canCloseEssence = await this._confirmDiscardDirtyEssenceDraft?.();
    if (canCloseEssence === false) return this;

    if (this._adminStore) {
      const action = await this._adminStore.confirmDiscardDirtyEnvironmentDraft?.();
      if (action === 'cancel') return this;
      if (action === 'save') {
        const result = await this._adminStore.saveEnvironmentDraft?.();
        if (result && result.ok === false) return this;
      }
    }

    this._confirmDiscardDirtyEssenceDraft = null;
    if (this._adminStore) {
      this._adminStore.destroy();
      this._adminStore = null;
      this._services = null;
    }
    return super.close(options);
  }

  static show() {
    if (!game.user.isGM) {
      ui.notifications.error(localize('FABRICATE.Admin.Manager.GMOnly'));
      return null;
    }

    if (!this._isFabricateReady()) {
      ui.notifications.warn(localize('FABRICATE.Admin.Manager.StartupPending'));
      if (!SvelteCraftingSystemManagerApp._pendingReadyOpen) {
        SvelteCraftingSystemManagerApp._pendingReadyOpen = true;
        const openWhenReady = () => {
          // Clear the latch FIRST so an early/missed readiness signal can never
          // permanently block future launches. Re-check readiness before opening:
          // a stale signal just leaves the gate re-armable on the next click.
          SvelteCraftingSystemManagerApp._pendingReadyOpen = false;
          if (!game.user?.isGM) return;
          if (!SvelteCraftingSystemManagerApp._isFabricateReady()) return;
          const app = new SvelteCraftingSystemManagerApp();
          app.render(true);
        };
        // Prefer the replay-safe readiness promise so a launch attempted AFTER
        // startup already finished still resolves and opens — the one-shot
        // `fabricate.ready` Hook would have been spent and never fire again, which is
        // exactly the "still loading" stall this guards against. Fall back to the
        // Hook (then to clearing the latch) when the promise API is unavailable.
        const whenReady = game?.fabricate?.whenReady;
        const hooks = globalThis.Hooks;
        if (typeof whenReady === 'function') {
          Promise.resolve(whenReady.call(game.fabricate))
            .then(openWhenReady)
            .catch(() => { SvelteCraftingSystemManagerApp._pendingReadyOpen = false; });
        } else if (typeof hooks?.once === 'function') {
          hooks.once('fabricate.ready', openWhenReady);
        } else {
          SvelteCraftingSystemManagerApp._pendingReadyOpen = false;
        }
      }
      return null;
    }

    const app = new SvelteCraftingSystemManagerApp();
    app.render(true);
    return app;
  }

  static _isFabricateReady() {
    const fabricate = game?.fabricate;
    return fabricate?.ready === true
      && fabricate?.getRecipeManager?.()?.initialized === true
      && fabricate?.getCraftingSystemManager?.()?.initialized === true;
  }
}

registerCraftingSystemManagerApp(SvelteCraftingSystemManagerApp);
