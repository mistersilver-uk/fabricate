import SvelteApplicationMixin from './svelte/SvelteApplicationMixin.svelte.js';
import CraftingSystemManagerRoot from './svelte/apps/manager/CraftingSystemManagerRoot.svelte';
import { createAdminStore } from './svelte/stores/adminStore.js';
import { getSetting, setSetting } from '../config/settings.js';
import { confirmDialog, renderDialog, choiceDialog } from './foundryCompat.js';
import { registerCraftingSystemManagerApp } from './appFactory.js';
import { SvelteComponentEditorApp } from './SvelteComponentEditorApp.svelte.js';
import { get } from 'svelte/store';
import { resolveDropUuid, resolveDropData, folderIdFromDropData } from './svelte/util/dropUtils.js';
import {
  localize,
  subscribeSceneChange,
  subscribeTravelMarkerMove,
  enrichToHtml,
  resolveItemSourceSnapshot,
} from './svelte/util/foundryBridge.js';
import { normalizeSceneOption } from './svelte/util/sceneImages.js';
import { readSceneRegions, filterActorUuidsInsideRegion } from './svelte/util/sceneRegions.js';
import { getTokenSceneUuid } from '../gatheringBootstrapAdapters.js';
import { tokenDocumentCenter } from '../canvas/regionHitTest.js';
import { validateImportData, prepareForImport } from '../systems/CraftingSystemExporter.js';
import {
  collectWorldFolderGroups,
  collectPackFolderGroups,
  applyFolderImportDecisions,
  hasRealFolderGroups,
} from './svelte/util/importFolderGroups.js';
import { CompendiumImporter } from '../systems/CompendiumImporter.js';
import { buildImportReportContent } from '../systems/importReportContent.js';
import { matchRecipeItemDefinition } from '../utils/sourceUuid.js';
import { getFabricateFlag } from '../config/flags.js';
import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';
import { managerExtensions } from './managerExtensions.js';
import { readStackQuantity } from '../systems/itemStackQuantity.js';
import {
  KNOWLEDGE_MESSAGES,
  deleteOwnedRecipeItemCopy,
  eraseLearnedRecipeEntry,
  expendOwnedRecipeItemUse,
  resetActorKnowledgeState,
} from './svelte/apps/manager/knowledge/knowledgeMutations.js';

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
  return getFolderCollectionValues(folders).find((folder) => folder?.id === id) || null;
}

function resolveDroppedFolder(data, folders) {
  // Foundry v13 folder drags emit { type: 'Folder', uuid: 'Folder.<id>' }. Prefer the
  // UUID resolver (handles world folders synchronously) and fall back to id lookup so
  // legacy { type: 'Folder', id } drag data keeps working.
  if (data?.uuid && typeof globalThis.fromUuidSync === 'function') {
    const byUuid = globalThis.fromUuidSync(data.uuid);
    if (byUuid) return byUuid;
  }
  return getFolderById(folders, folderIdFromDropData(data));
}

function folderDocumentType(folder) {
  return folder?.documentType || folder?.type || folder?.folderDocumentType || '';
}

function folderChildFolders(folder, folders) {
  const explicitChildren = Array.isArray(folder?.children) ? folder.children : [];
  const explicitFolderChildren = explicitChildren
    .map((child) => child?.folder || child)
    .filter((child) => child && child !== folder);
  const collectionChildren = getFolderCollectionValues(folders).filter(
    (candidate) =>
      candidate?.folder?.id === folder?.id ||
      candidate?.parent?.id === folder?.id ||
      candidate?.parent === folder?.id
  );
  return [...explicitFolderChildren, ...collectionChildren];
}

function collectFolderItems(folder, folders, visited = new Set()) {
  if (!folder?.id || visited.has(folder.id)) return [];
  visited.add(folder.id);
  if (folderDocumentType(folder) && folderDocumentType(folder) !== 'Item') return [];

  const directItems = (folder.contents || []).filter(
    (document) => document?.documentName === 'Item' && document?.uuid
  );
  const nestedItems = folderChildFolders(folder, folders).flatMap((child) =>
    collectFolderItems(child, folders, visited)
  );
  return [...directItems, ...nestedItems];
}

// A Folder living inside a compendium pack does not expose live Item documents. Its `.contents`
// are the pack's index entries (each carrying an authoritative `.uuid`, but no `.documentName`),
// and its descendants live in `pack.folders` rather than `game.folders` — so collectFolderItems
// cannot walk it. Enumerate the folder plus every descendant via getSubfolders(true) and read each
// index entry's uuid. Gate on Item-typed folders to mirror the world-folder behaviour.
function collectCompendiumFolderItemUuids(folder) {
  if (!folder) return [];
  if (folderDocumentType(folder) && folderDocumentType(folder) !== 'Item') return [];
  const subfolders = typeof folder.getSubfolders === 'function' ? folder.getSubfolders(true) : [];
  return [folder, ...subfolders]
    .flatMap((current) => current?.contents || [])
    .map((entry) => entry?.uuid)
    .filter(Boolean);
}

export class SvelteCraftingSystemManagerApp extends SvelteApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static SVELTE_COMPONENT = CraftingSystemManagerRoot;
  static _pendingReadyOpen = false;

  _adminStore = null;
  _services = null;
  _confirmDiscardDirtyEssenceDraft = null;
  _confirmDiscardDirtyToolDraft = null;
  // Foundry user CRUD hook registrations, torn down on close, that keep the
  // per-recipe restriction allow-list current when players change while open.
  _userHooks = null;

  static DEFAULT_OPTIONS = {
    id: 'fabricate-crafting-system-manager',
    classes: ['fabricate', 'crafting-system-manager'],
    tag: 'div',
    window: {
      title: 'FABRICATE.Admin.Manager.WindowTitle',
      icon: 'fa-solid fa-layer-group',
      resizable: true,
    },
    position: {
      width: 1280,
      height: 940,
    },
  };

  _buildServices() {
    const managerInitialized = (manager) => manager?.initialized === true;
    const isFabricateReady = () => {
      const fabricate = game?.fabricate;
      return (
        fabricate?.ready === true &&
        managerInitialized(fabricate?.getRecipeManager?.()) &&
        managerInitialized(fabricate?.getCraftingSystemManager?.())
      );
    };

    return {
      getSetting: (key) => getSetting(key),
      setSetting: async (key, value) => setSetting(key, value),
      getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
      getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
      getGatheringEnvironmentStore: () => game?.fabricate?.getGatheringEnvironmentStore?.() ?? null,
      getGatheringPartyStore: () => game?.fabricate?.getGatheringPartyStore?.() ?? null,
      getGatheringRealmStore: () => game?.fabricate?.getGatheringRealmStore?.() ?? null,
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
        if (typeof resolveSync !== 'function' || !sceneRegionUuid || !Array.isArray(actorUuids))
          return [];
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
            const token =
              actor
                ?.getActiveTokens?.(false, true)
                ?.find((candidate) => getTokenSceneUuid(candidate) === sceneUuid) ?? null;
            if (!token) return null;
            // Use the DOCUMENT-derived centre so a just-moved marker resolves to its
            // new position (the placeable centre lags during the move animation).
            return tokenDocumentCenter(token);
          },
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
        // Issue 1024: the GM who ticks a new player-character actor type is the one
        // GUARANTEED to be looking at stale data — the settings sidebar sits over an
        // open manager — so the Access, Knowledge and party rosters must republish.
        const playerCharacterTypeListener = (...args) => callback('playerCharacterTypes', ...args);
        hooks.on('fabricate.craftingSystemsChanged', systemListener);
        hooks.on('fabricate.recipesChanged', recipeListener);
        hooks.on('fabricate.playerCharacterTypesChanged', playerCharacterTypeListener);

        return () => {
          hooks?.off?.('fabricate.craftingSystemsChanged', systemListener);
          hooks?.off?.('fabricate.recipesChanged', recipeListener);
          hooks?.off?.('fabricate.playerCharacterTypesChanged', playerCharacterTypeListener);
        };
      },
      setGatheringConditions: async (conditions) =>
        game?.fabricate?.gathering?.setConditions?.(conditions),
      getScriptMacros: () =>
        Array.from(game.macros?.contents || [])
          .filter((m) => (m.type || '').toLowerCase() === 'script')
          .map((m) => ({ uuid: m.uuid, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      getSceneOptions: () =>
        Array.from(game.scenes?.contents || [])
          .map((scene) => normalizeSceneOption(scene))
          .filter((scene) => scene.uuid && scene.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      // Non-GM world users ({ id, name, role, color, avatar }), name-sorted: the
      // Access tab's grantable Players list and the recipe editor's context rail.
      //
      // Sourced from `game.users.players` — Foundry's canonical NON-GM roster —
      // not `game.users.contents`. The old comment already claimed GMs were
      // excluded while the code returned every user, so the Access tab offered GMs
      // as grantable targets and granting one did nothing (a GM viewer already
      // passes `_isRecipeVisibleByAccessGrant` before it ever reads `playerIds`).
      // `User#isGM` is `hasRole(ASSISTANT)`, so this drops Assistant GMs too.
      getWorldUsers: () =>
        this._playerUsers()
          .map((user) => ({
            id: user.id,
            name: user.name,
            role: this._userRoleLabel(user.role),
            color: this._userColor(user),
            avatar: user.avatar || user.img || '',
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      // EVERY world actor (the travel-marker drop zone accepts any of them), each
      // carrying a PROJECTED `isPlayerCharacter` boolean so the party member picker can
      // narrow to player characters without a `.svelte` component importing the
      // predicate — which would also drag `playerCharacterTypes.js` into every mounted
      // component test's raw-module allowlist. The raw `type` field is deliberately
      // GONE (issue 1024): while it is present, a hardcoded actor-type comparison has
      // something to grow back out of.
      getActorOptions: () =>
        Array.from(game.actors?.contents || [])
          .map((actor) => ({
            uuid: actor.uuid,
            id: actor.id,
            name: actor.name,
            img: actor.img || '',
            isPlayerCharacter: isPlayerCharacterActor(actor),
          }))
          .filter((actor) => actor.uuid && actor.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      // Player-character actors, name-sorted, for the Access tab's grantable
      // Characters roster under the `restricted` visibility mode. Membership is the
      // shared, GM-CONFIGURABLE player-character predicate (issue 1024), imported
      // directly: this is a `.svelte.js` app module rather than a component, so no
      // injection seam is needed, and the predicate is deliberately NOT published on
      // `game.fabricate`. Each entry carries its control set — see
      // `_describeAccessActor`.
      getPlayerCharacterActors: () =>
        Array.from(game.actors?.contents || [])
          .filter((actor) => isPlayerCharacterActor(actor))
          .map((actor) => this._describeAccessActor(actor))
          .filter((actor) => actor.id && actor.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      // EVERY world actor, name-sorted — deliberately NOT the
      // `isPlayerCharacterActor`-filtered roster above. The runtime access predicate
      // (`RecipeVisibilityService._viewerControlsCharacter`) applies no type filter,
      // so a grant naming an actor outside the PC roster is still honoured by the
      // engine. The recipe editor's context rail resolves granted character ids over
      // THIS list; resolving over the filtered roster would drop such a grant from
      // display and under-report who has access.
      getAccessCharacterActors: () =>
        Array.from(game.actors?.contents || [])
          .map((actor) => this._describeAccessActor(actor))
          .filter((actor) => actor.id && actor.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      // The raw actor DOCUMENTS, not a projection (issue 1132). `adminStore` builds the
      // learned-knowledge index through the shared `buildLearnedRecipeActorIndex`, which
      // reads each actor's flags through `getFabricateFlag` and filters by `isOwner` —
      // neither survives `_describeAccessActor`'s projection, and the store must not reach
      // `game.*` itself. Unsorted and unfiltered on purpose: the shared selector owns the
      // scope, so a second filter here could only make the two disagree.
      getWorldActors: () => Array.from(game.actors?.contents || game.actors || []),
      // Game-world Items ({ uuid, name, img, type }), name-sorted, for resolving
      // linked Item previews after drag-and-drop.
      getWorldItemOptions: () =>
        Array.from(game.items?.contents || [])
          .map((item) => ({
            uuid: item.uuid,
            name: item.name,
            img: item.img || '',
            type: item.type || '',
          }))
          .filter((item) => item.uuid && item.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      resolveToolSource: (uuid) => resolveItemSourceSnapshot(uuid),
      // --- GM Knowledge surface seam (issue 785) ---
      //
      // Every Foundry-facing read and write for the Knowledge surface lives here:
      // actor/item enumeration, `matchRecipeItemDefinition` (its tier-1 durable
      // identity read needs the LIVE Item document), cap resolution, and the four
      // mutations. `adminStore` derives; `knowledgeStudio` projects.
      getKnowledgeSnapshot: (systemId) => this._buildKnowledgeSnapshot(systemId),
      expendRecipeItemUse: (options) => this._expendRecipeItemUse(options),
      deleteOwnedRecipeItem: (options) => this._deleteOwnedRecipeItem(options),
      eraseLearnedRecipe: (options) => this._eraseLearnedRecipe(options),
      resetActorKnowledge: (options) => this._resetActorKnowledge(options),
      pickImagePath: async (currentPath = '') => {
        const FilePickerClass =
          foundry?.applications?.apps?.FilePicker?.implementation ||
          foundry?.applications?.apps?.FilePicker ||
          globalThis.FilePicker;
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
              close: () => settle(null),
            });
            picker.render(true);
          } catch (err) {
            ui.notifications.warn(
              err?.message || localize('FABRICATE.Admin.Environments.ImagePickerUnavailable')
            );
            settle(null);
          }
        });
      },
      notify: {
        info: (msg) => ui.notifications.info(msg),
        warn: (msg) => ui.notifications.warn(msg),
        error: (msg) => ui.notifications.error(msg),
      },
      localize: (key, data) => localize(key, data),
      confirmDialog: (options) => confirmDialog(options),
      choiceDialog: (options) => choiceDialog(options),
      // Issue 800: the component-browser live-description FALLBACK resolves through
      // Foundry's enricher, so a compendium-linked component with no stored
      // description renders the referenced items' names rather than raw `@UUID[…]`.
      // Absent in tests, where the store falls back to the raw text.
      enrichToHtml: (raw, options) => enrichToHtml(raw, options),
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
            },
          },
          rejectClose: false,
        });
        if (result) {
          try {
            const data = JSON.parse(result.raw).map((r) => ({ ...r, craftingSystemId: systemId }));
            await game.fabricate.getRecipeManager().importRecipes(data, result.overwrite);
            await this._adminStore.refresh();
          } catch (err) {
            ui.notifications.error(`Import failed: ${err.message}`);
          }
        }
      },
      copyToClipboard: async (text) => {
        const clipboard = game?.clipboard;
        if (!clipboard?.copyPlainText) {
          throw new Error('Foundry clipboard helper is unavailable');
        }
        await clipboard.copyPlainText(text);
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
      // Resolves to the assembled post-import report content (the pure
      // `buildImportReportContent` output) so the Svelte manager root can render it in
      // the shared `ManagerModal` chrome, or to `null` when there is nothing to report
      // (no dialog API, cancelled, failed, or an already-existing system that was
      // skipped). This service no longer renders the report itself: issue 877 replaced
      // the raw-HTML DialogV2 with `ImportReportModal`, so the app shell hands DATA to
      // the UI instead of a hand-escaped HTML string.
      renderSystemImportDialog: async () => {
        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (!DialogV2) {
          ui.notifications.warn('Dialog API not available.');
          return null;
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
              const conflictMode =
                button.form?.querySelector('input[name="conflictMode"]:checked')?.value || 'skip';
              return { file, conflictMode };
            },
          },
          rejectClose: false,
        });
        if (!result || !result.file) return null;

        // The import itself (parse → validate → persist) is the only work whose
        // failure is an "Import failed" toast; the post-success report render is
        // deliberately OUTSIDE this try so a render error is never misreported as
        // a failed import.
        let summary;
        try {
          const text = await result.file.text();
          const data = JSON.parse(text);

          const validation = validateImportData(data);
          if (!validation.valid) {
            ui.notifications.error(`Invalid file: ${validation.errors.join('; ')}`);
            return null;
          }
          if (validation.warnings.length > 0) {
            for (const w of validation.warnings) ui.notifications.warn(w);
          }

          const mode = result.conflictMode === 'copy' ? 'copy' : 'keep';
          const packData = prepareForImport(data, mode);

          const systemManager = game.fabricate.getCraftingSystemManager();
          const recipeManager = game.fabricate.getRecipeManager();
          const importer = new CompendiumImporter(systemManager, recipeManager, {
            environmentStore: game.fabricate.getGatheringEnvironmentStore?.() ?? null,
            getSetting: (key) => getSetting(key),
            setSetting: (key, value) => setSetting(key, value),
            isGM: () => game.user?.isGM === true,
          });
          summary = await importer.importFromPackData(packData, {
            overwriteExisting: result.conflictMode === 'overwrite',
          });
        } catch (err) {
          // Hard failures stay on the DISTINCT error-toast path (never the report).
          ui.notifications.error(`Import failed: ${err.message}`);
          return null;
        }

        if (summary.system.skipped) {
          // "already exists — skipped" stays a toast; it does NOT open the report.
          ui.notifications.info(`System "${summary.system.name}" already exists — skipped.`);
          await this._adminStore.refresh();
          return null;
        }

        const verb = summary.collisions.some(
          (c) => c.type === 'system' && c.resolution === 'overwritten'
        )
          ? 'Updated'
          : 'Imported';
        const message = `${verb} "${summary.system.name}" with ${summary.components.total} components, ${summary.recipes.imported} imported recipes, ${summary.recipes.skipped} skipped recipes, and ${summary.recipes.errors.length} failed recipes.`;
        if (summary.recipes.errors.length > 0) {
          ui.notifications.warn(message);
        } else {
          ui.notifications.info(message);
        }

        await this._adminStore.refresh();

        // Post-import GM-readable report. Assembly stays here (pure + Foundry-free);
        // the manager root renders the returned content in `ImportReportModal`.
        return buildImportReportContent(summary, (key, data) => localize(key, data));
      },
    };
  }

  _prepareSvelteProps(context) {
    if (!this._adminStore) {
      this._services = this._buildServices();
      this._adminStore = createAdminStore(this._services);
      this._registerUserHooks();
    }

    const resolveSingleItemDropUuid = (data) => {
      const dropInfo = resolveDropData(data);
      if (dropInfo.type && dropInfo.type !== 'Item' && dropInfo.type !== 'Compendium') {
        ui.notifications.warn(
          localize('FABRICATE.Admin.Items.DropNotAnItem', {
            type: dropInfo.type,
          })
        );
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
      ui.notifications.warn(
        localize('FABRICATE.Admin.Items.SourceFallbackWarning', {
          name: fallback.itemName || fallback.fallbackUuid,
          brokenUuid: fallback.brokenUuid,
          fallbackUuid: fallback.fallbackUuid,
        })
      );
    };

    const notifyBulkSourceFallback = (fallbacks = []) => {
      const count = Array.isArray(fallbacks) ? fallbacks.length : 0;
      if (count <= 0) return;
      ui.notifications.warn(
        localize('FABRICATE.Admin.Items.SourceFallbackSummary', {
          count,
        })
      );
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
          ui.notifications.info(
            localize('FABRICATE.Admin.Items.ItemUpdated', {
              name: result.item.name,
            })
          );
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
      managerExtensions,
      services: {
        importSingleManagedItemFromDrop,
        pickImagePath: this._services.pickImagePath,
        getSetting: this._services.getSetting,
        setSetting: this._services.setSetting,
        getWorldItemOptions: this._services.getWorldItemOptions,
        resolveToolSource: this._services.resolveToolSource,
        // Folder-aware bulk-import (issue 771): resolve a folder / whole-pack drop into
        // per-folder groups the mapping modal seeds from. Returns null for every drop
        // that should keep today's one-shot behavior (single item, no real folders, an
        // unresolved/empty/non-Item folder) so `dropComponent` falls through to
        // `onDropItem`. Compendium membership is read from `pack.index[].folder` +
        // `pack.folders` (no document load, no world-only `getSubfolders`).
        collectImportFolderGroups: async (data) => {
          const systemId = get(this._adminStore.selectedSystemId) || '';
          if (!systemId) return null;
          const unfiledName = localize('FABRICATE.Admin.Items.ImportMapping.Unfiled');
          const groupsWithFolders = (groups) => (hasRealFolderGroups(groups) ? { groups } : null);

          // Whole compendium pack drop.
          if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
            const pack = game.packs?.get?.(data.collection);
            if (!pack || pack.metadata?.type !== 'Item') return null;
            try {
              await pack.getIndex();
            } catch {
              /* index may already be loaded */
            }
            return groupsWithFolders(collectPackFolderGroups(pack, { unfiledName }));
          }

          // Folder drop (world folder or in-pack folder).
          if (data?.type === 'Folder') {
            const folder = resolveDroppedFolder(data, game.folders);
            if (!folder) return null;
            const docType = folderDocumentType(folder);
            // A compendium-DIRECTORY folder groups packs, not items (descope 2c): no
            // item-level grouping exists, so skip it with a notice. Return the `handled`
            // sentinel — NOT null — so `dropComponent` does not fall through to
            // `onDropItem` and fire a SECOND (FolderEmpty) toast for the same drop.
            if (docType === 'Compendium') {
              ui.notifications.info(
                localize('FABRICATE.Admin.Items.ImportMapping.CompendiumDirectorySkipped')
              );
              return { handled: true };
            }
            if (folder.pack) {
              const pack = game.packs?.get?.(folder.pack);
              if (!pack || pack.metadata?.type !== 'Item') return null;
              try {
                await pack.getIndex();
              } catch {
                /* best effort */
              }
              return groupsWithFolders(
                collectPackFolderGroups(pack, { rootFolderId: folder.id, unfiledName })
              );
            }
            if (docType && docType !== 'Item') return null;
            return groupsWithFolders(collectWorldFolderGroups(folder, game.folders));
          }

          return null;
        },
        // Commit the mapping modal's per-folder decisions: import each non-skipped
        // folder's items, then apply that folder's category/tags to the freshly imported
        // component set via the shared set-apply primitive. The whole run — every folder's
        // items and every folder's set-apply — costs ONE `craftingSystems` write (issue
        // 1086), not one per item plus one per folder.
        commitImportFolderMapping: async (systemId, decisions) => {
          const systemManager = game.fabricate.getCraftingSystemManager();
          if (!systemId) {
            ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
            return;
          }
          const summary = await applyFolderImportDecisions(
            systemManager,
            systemId,
            decisions || []
          );
          ui.notifications.info(
            localize('FABRICATE.Admin.Items.ImportMapping.Summary', {
              added: summary.added,
              updated: summary.updated,
              skipped: summary.skipped,
              total: summary.total,
            })
          );
          notifyBulkSourceFallback(summary.sourceFallbacks);
          await this._adminStore.refresh();
        },
        onDropItem: async (data) => {
          const systemManager = game.fabricate.getCraftingSystemManager();
          const systemId = get(this._adminStore.selectedSystemId) || '';

          // Phase 2: Bulk compendium pack drop
          // Foundry v13 shape: { type: "Compendium", collection: "world.pack-name" }
          if (data?.type === 'Compendium' && data?.collection && !data?.uuid) {
            const packId = data.collection;
            if (!packId || !systemId) {
              if (!systemId)
                ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
              return;
            }
            const result = await systemManager.addItemsFromPack(systemId, packId);
            ui.notifications.info(
              localize('FABRICATE.Admin.Items.BulkImportUpdated', {
                added: result.added,
                updated: result.updated,
                skipped: result.skipped,
                total: result.total,
              })
            );
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
            const folder = resolveDroppedFolder(data, game.folders);
            if (!folder) {
              ui.notifications.warn(localize('FABRICATE.Admin.Items.FolderNotResolved'));
              return;
            }
            // Compendium folders expose pack index entries (resolved here to uuids); world folders
            // expose live Item documents traversed via collectFolderItems. `folder.pack` is the
            // packId string for compendium folders and null/undefined for world folders.
            const itemUuids = folder.pack
              ? collectCompendiumFolderItemUuids(folder)
              : collectFolderItems(folder, game.folders).map((folderItem) => folderItem.uuid);
            if (itemUuids.length === 0) {
              ui.notifications.info(
                localize('FABRICATE.Admin.Items.FolderEmpty', {
                  name: folder.name || data.id,
                })
              );
              return;
            }
            // One unmapped decision — no category, no tags — is exactly this flat folder
            // import, so it delegates to the shared commit loop rather than carrying a
            // second copy of it. That is what gives the plain folder drop the single
            // batched `craftingSystems` write the mapping commit has (issue 1086): this
            // branch used to save the whole corpus once per imported item.
            const { added, updated, skipped, sourceFallbacks } = await applyFolderImportDecisions(
              systemManager,
              systemId,
              [{ itemUuids }]
            );
            ui.notifications.info(
              localize('FABRICATE.Admin.Items.FolderImportSummary', {
                added,
                updated,
                skipped,
                total: itemUuids.length,
                name: folder.name || data.id,
              })
            );
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
            if (!systemId)
              ui.notifications.warn(localize('FABRICATE.Admin.Items.DropNoSystemSelected'));
            return;
          }

          const uuid = resolveSingleItemDropUuid(data);
          if (!uuid) return;

          try {
            const result = await systemManager.replaceItemSource(systemId, itemId, uuid);
            const item = result.item;
            ui.notifications.info(
              localize('FABRICATE.Admin.Items.SourceReplaced', {
                name: item.name,
              })
            );
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
            await systemManager.updateItem(systemId, itemId, { originItemUuid: null });
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
        confirmDiscardEssenceDraft: () =>
          confirmDialog({
            title: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyTitle'),
            content: `<p>${localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyContent')}</p>`,
            yes: {
              label: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyConfirm'),
              callback: () => true,
            },
            no: {
              label: localize('FABRICATE.Admin.Manager.Essence.DiscardDirtyCancel'),
              callback: () => false,
            },
          }),
        confirmDirtyToolsNavigation: async () => {
          const action = await choiceDialog({
            title: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Title'),
            content: `<p>${localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Content')}</p>`,
            choices: [
              {
                action: 'save',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Save'),
                icon: 'fas fa-save',
              },
              {
                action: 'discard',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.Discard'),
                icon: 'fas fa-trash',
              },
              {
                action: 'cancel',
                label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.KeepEditing'),
                icon: 'fas fa-times',
              },
            ],
            defaultAction: 'save',
          });
          return action === 'cancel' ? false : action;
        },
        confirmDeleteTool: ({ tool } = {}) =>
          confirmDialog({
            title: localize('FABRICATE.Admin.Manager.Tools.DeleteConfirm.Title'),
            content: `<p>${localize('FABRICATE.Admin.Manager.Tools.DeleteConfirm.Content').replace('{name}', tool?.label || tool?.name || '')}</p>`,
            yes: {
              label: localize('FABRICATE.Admin.Manager.Tools.Delete'),
              callback: () => true,
            },
            no: {
              label: localize('FABRICATE.Admin.Manager.Tools.NavigationDirty.KeepEditing'),
              callback: () => false,
            },
          }),
        registerEssenceDirtyGuard: (guard) => {
          this._confirmDiscardDirtyEssenceDraft = typeof guard === 'function' ? guard : null;
        },
        registerToolDirtyGuard: (guard) => {
          this._confirmDiscardDirtyToolDraft = typeof guard === 'function' ? guard : null;
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
          const prevEconomy = get(this._adminStore?.viewState)?.gatheringConfig?.systems?.[
            opts?.systemId
          ]?.economy;
          const prevStamina = prevEconomy?.stamina?.enabled === true;
          const prevNodes = prevEconomy?.nodes?.enabled === true;
          const prevResolution = prevEconomy?.resolutionMode ?? 'd100';
          const nextStamina = opts?.economy?.stamina?.enabled === true;
          const nextNodes = opts?.economy?.nodes?.enabled === true;
          const nextResolution = opts?.economy?.resolutionMode ?? 'd100';
          const result = await game?.fabricate?.setGatheringEconomy?.(opts);
          if (
            nextStamina !== prevStamina ||
            nextNodes !== prevNodes ||
            nextResolution !== prevResolution
          )
            this._adminStore?.refreshGatheringConfig?.();
          return result;
        },
        getGatheringStaminaState: (opts = {}) =>
          game?.fabricate?.getGatheringStaminaState?.(opts) ?? [],
        rollGatheringStamina: (opts = {}) => game?.fabricate?.rollGatheringStamina?.(opts),
        setGatheringStamina: (opts = {}) => game?.fabricate?.setGatheringStamina?.(opts),
        adjustGatheringStamina: (opts = {}) => game?.fabricate?.adjustGatheringStamina?.(opts),
        restockGatheringNode: (opts = {}) => game?.fabricate?.restockGatheringNode?.(opts),
      },
    };
  }

  // Foundry's canonical NON-GM roster. Filtering GMs out FIRST is load-bearing:
  // `Document#testUserPermission` short-circuits every GM (Assistant included, since
  // `User#isGM` is `hasRole(ASSISTANT)`) to OWNER, so testing before filtering would
  // report every actor as controlled by every GM. Never use `Actor#isOwner` /
  // `Document#permission` here — both are `game.user`-scoped and always true on the
  // GM's own client.
  //
  // The fallback must agree with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`), so
  // it applies the ROLE floor too: a role-NONE user is not a player and cannot be
  // granted a recipe, and admitting one here would offer the GM a grantable target the
  // engine ignores.
  _playerUsers() {
    const players = game.users?.players;
    if (Array.isArray(players)) return players;

    const PLAYER = globalThis.CONST?.USER_ROLES?.PLAYER ?? 1;
    return Array.from(game.users?.contents || []).filter((user) => {
      if (user?.isGM === true) return false;
      if (typeof user?.hasRole === 'function') return user.hasRole('PLAYER') === true;
      return Number(user?.role ?? 0) >= Number(PLAYER);
    });
  }

  // Every roster this labels comes from `_playerUsers()`, which is GM-free by
  // construction — so GAMEMASTER and ASSISTANT are unreachable here and are not
  // enumerated. What remains are the two roles a grantable user can actually hold.
  _userRoleLabel(role) {
    const USER_ROLES = globalThis.CONST?.USER_ROLES || { NONE: 0, PLAYER: 1, TRUSTED: 2 };
    const loc = (key, fallback) => {
      const translated = game?.i18n?.localize?.(key);
      return translated && translated !== key ? translated : fallback;
    };
    if (role === USER_ROLES.TRUSTED) return loc('USER.RoleTrusted', 'Trusted Player');
    if (role === USER_ROLES.PLAYER) return loc('USER.RolePlayer', 'Player');
    return loc('USER.RoleNone', 'None');
  }

  // Foundry `User#color` is a Color (v11+) or a plain string on older cores.
  _userColor(user) {
    const color = user?.color;
    if (!color) return '';
    return typeof color === 'string' ? color : color.css || color.toString?.() || '';
  }

  // Who controls this actor, as Fabricate's runtime defines it. The relation is a
  // SET, not a single user: `RecipeVisibilityService._viewerControlsCharacter`
  // grants access to any viewer whose ASSIGNED character is this actor OR who holds
  // Foundry OWNER on it — a union, not a fallback chain. A singular "played by"
  // field cannot represent that and would silently under-report access, which is the
  // worst possible failure in a GM access surface.
  //
  // `sharedWithAllPlayers` covers the case that makes it a correctness bug rather
  // than a nicety: `getUserLevel` falls through to `ownership.default`, and a GM can
  // set the "All Players" row to Owner through core UI (routine for party actors).
  // Then the grant genuinely reaches the whole table, and the rail must say so
  // instead of naming one player.
  //
  // `User#character` is a resolved `Actor | null` (there is no `characterId`; it
  // self-heals to null on actor deletion) and is not schema-unique, so 0..N users
  // may be assigned the same actor.
  _describeAccessActor(actor) {
    const LEVELS = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS || {
      NONE: 0,
      LIMITED: 1,
      OBSERVER: 2,
      OWNER: 3,
    };
    const controlledBy = this._playerUsers()
      .map((user) => {
        const assigned = !!user.character && user.character.id === actor.id;
        const owner = actor.testUserPermission?.(user, 'OWNER') === true;
        if (!assigned && !owner) return null;
        return {
          id: user.id,
          name: user.name,
          avatar: user.avatar || user.img || '',
          assigned,
        };
      })
      .filter(Boolean)
      // Assigned-first, then by name — the assigned player is the one the GM means.
      .sort((a, b) =>
        a.assigned === b.assigned ? a.name.localeCompare(b.name) : a.assigned ? -1 : 1
      );

    const defaultLevel = Number(actor.ownership?.default ?? LEVELS.NONE);
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img || '',
      controlledBy,
      sharedWithAllPlayers: Number.isFinite(defaultLevel) && defaultLevel >= Number(LEVELS.OWNER),
    };
  }

  // ---------------------------------------------------------------------------
  // GM Knowledge surface seam (issue 785)
  // ---------------------------------------------------------------------------

  _recipeVisibilityService() {
    return game?.fabricate?.getRecipeVisibilityService?.() ?? null;
  }

  // Caps MUST resolve through the engine's reader, never raw `definition.caps` —
  // `_getRecipeItemCaps` folds every legacy derivation (`destroyWhenExhausted` →
  // `whenSpent`, `limitRecipes`/`maxRecipes` → `limitLearning`/`learnsAllowed`,
  // `learningMode` → `learnScope`) that the projection's derivations assume.
  // `_capsForDefinition` is the definition-only extraction of it.
  _recipeItemCaps(service, definition) {
    if (typeof service?._capsForDefinition === 'function') {
      return service._capsForDefinition(definition);
    }
    if (typeof service?._getRecipeItemCaps === 'function') {
      return service._getRecipeItemCaps(null, definition);
    }
    return { item: {}, learn: {} };
  }

  // The Knowledge roster is player characters only — the SAME predicate the Access
  // surface roster uses. An NPC's knowledge state stays reachable through
  // `game.fabricate.resetActorKnowledge`. Returns LIVE Actor documents, because
  // the projection needs `actor.items` and the actor's flags.
  _knowledgeRosterActors() {
    return Array.from(game.actors?.contents || [])
      .filter((actor) => isPlayerCharacterActor(actor))
      .filter((actor) => actor?.id && actor?.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Enumerate one system's runtime knowledge state across the player-character
   * roster. Returns PLAIN data only — every derivation (remaining/spent/inert,
   * the source-name ladder, the D8 hazard) belongs to `knowledgeStudio`.
   *
   * @param {string} systemId
   * @returns {{systemId: string, definitionCount: number, characters: object[]}}
   */
  _buildKnowledgeSnapshot(systemId) {
    const fabricate = game?.fabricate;
    const system = systemId ? fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId) : null;
    const definitions = Array.isArray(system?.recipeItemDefinitions)
      ? system.recipeItemDefinitions
      : [];
    const service = this._recipeVisibilityService();

    const capsById = new Map();
    const recipeCountById = new Map();
    // Rung 2 of the learned-source ladder: the MEMBER recipe-item definition name,
    // which is what survives deletion of the copy a recipe was learned from.
    const definitionNameByRecipeId = new Map();
    for (const definition of definitions) {
      const id = String(definition?.id || '');
      const memberIds = Array.isArray(definition?.recipeIds) ? definition.recipeIds : [];
      capsById.set(id, this._recipeItemCaps(service, definition));
      recipeCountById.set(id, memberIds.length);
      for (const recipeId of memberIds) {
        const key = String(recipeId);
        if (!definitionNameByRecipeId.has(key)) {
          definitionNameByRecipeId.set(key, definition?.name || '');
        }
      }
    }

    const context = {
      systemId: String(systemId || ''),
      definitions,
      capsById,
      recipeCountById,
      definitionNameByRecipeId,
      recipeManager: fabricate?.getRecipeManager?.() ?? null,
    };
    return {
      systemId: context.systemId,
      definitionCount: definitions.length,
      characters: this._knowledgeRosterActors().map((actor) =>
        this._describeKnowledgeActor(actor, context)
      ),
    };
  }

  _describeKnowledgeActor(actor, context) {
    const items = Array.from(actor.items || []);
    return {
      id: actor.id,
      name: actor.name,
      img: actor.img || '',
      ownedCopies: this._collectKnowledgeOwnedCopies(items, context),
      ...this._collectKnowledgeLearnedEntries(actor, items, context),
    };
  }

  _collectKnowledgeOwnedCopies(items, context) {
    const copies = [];
    for (const item of items) {
      const { definition, tier } = matchRecipeItemDefinition(
        item,
        context.definitions,
        context.systemId
      );
      if (!definition) continue;
      const definitionId = String(definition.id || '');
      const caps = context.capsById.get(definitionId) || { item: {}, learn: {} };
      const usage = getFabricateFlag(item, 'recipeItemUsage', {}) || {};
      copies.push({
        itemId: item.id,
        itemUuid: item.uuid || '',
        name: item.name || '',
        img: item.img || '',
        quantity: readStackQuantity(item),
        timesUsed: usage.timesUsed,
        inert: usage.inert === true,
        matchTier: tier,
        definitionId,
        definitionName: definition.name || '',
        recipeCount: context.recipeCountById.get(definitionId) || 0,
        limitUses: caps.item?.limitUses === true,
        maxUses: caps.item?.maxUses,
        learnScope: caps.learn?.learnScope || 'perInstance',
      });
    }
    return copies;
  }

  // `learnedRecipes` is system-AGNOSTIC while definitions are per-system, so an
  // entry belonging to another system, or to a recipe that no longer resolves at
  // all, becomes a roll-up rather than a row. The orphan roll-up is the only
  // pointer to the all-systems reset grain, which is the only grain that can
  // clear those keys (`forgetSystemLearnedRecipes` leaves them in place).
  _collectKnowledgeLearnedEntries(actor, items, context) {
    const learnedMap = getFabricateFlag(actor, 'learnedRecipes', {}) || {};
    const ownedByUuid = new Map(items.map((item) => [item.uuid, item]));
    const learnedRecipes = [];
    let otherSystemCount = 0;
    let orphanCount = 0;

    for (const [recipeId, entry] of Object.entries(learnedMap)) {
      const recipe = context.recipeManager?.getRecipe?.(recipeId) || null;
      if (!recipe) {
        orphanCount += 1;
        continue;
      }
      if (String(recipe.craftingSystemId || '') !== context.systemId) {
        otherSystemCount += 1;
        continue;
      }
      const sourceItemUuid = entry?.sourceItemUuid || null;
      const ownedSource = sourceItemUuid ? ownedByUuid.get(sourceItemUuid) || null : null;
      const sourceDefinition = ownedSource
        ? matchRecipeItemDefinition(ownedSource, context.definitions, context.systemId).definition
        : null;
      const sourceCaps = sourceDefinition
        ? context.capsById.get(String(sourceDefinition.id || ''))
        : null;
      learnedRecipes.push({
        recipeId: String(recipeId),
        recipeName: recipe.name || '',
        recipeImg: recipe.img || '',
        recipeCategory: recipe.category || '',
        craftingSystemId: recipe.craftingSystemId || '',
        learnedAt: entry?.learnedAt || 0,
        sourceItemUuid,
        sourceOwned: !!ownedSource,
        sourceItemName: ownedSource?.name || '',
        sourceDefinitionName: context.definitionNameByRecipeId.get(String(recipeId)) || '',
        // Only a CAPPED book consumes learn budget, so only a capped book can
        // release any on erase.
        sourceCapped: sourceCaps?.learn?.limitLearning === true,
      });
    }
    return { learnedRecipes, otherSystemCount, orphanCount };
  }

  // GM gate for every Knowledge mutation. `isGM`, NOT `activeGM`: this is a
  // single-client, user-initiated mutation from a GM-only Application, so there is
  // no N-client duplicate-execution risk, and `activeGM` would lock out the
  // assistant GMs `SvelteCraftingSystemManagerApp.show()` already admits. Foundry
  // authorises the writes for an assistant too (`testUserPermission` short-circuits
  // any `isGM` to OWNER). The merged `resetActorKnowledge` gates identically.
  _knowledgeActor(actorId) {
    if (game.user?.isGM !== true)
      return { denied: { success: false, message: KNOWLEDGE_MESSAGES.gmOnly } };
    const actor = game.actors?.get?.(actorId);
    if (!actor) return { denied: { success: false, message: KNOWLEDGE_MESSAGES.noActor } };
    return { actor };
  }

  // Prefer the definition the projected row already resolved, so the GM's click
  // acts on exactly the book the row displayed; fall back to a live match when the
  // row is stale.
  _resolveKnowledgeDefinition({ item, definitionId, systemId }) {
    const definitions = Array.isArray(
      game?.fabricate?.getCraftingSystemManager?.()?.getSystem?.(systemId)?.recipeItemDefinitions
    )
      ? game.fabricate.getCraftingSystemManager().getSystem(systemId).recipeItemDefinitions
      : [];
    const named = definitionId
      ? definitions.find((definition) => String(definition?.id) === String(definitionId))
      : null;
    return named || matchRecipeItemDefinition(item, definitions, systemId).definition;
  }

  // Resolve the GM-nominated copy on the GM-nominated actor. Every seam mutation
  // takes document IDS, never uuids, and a target that vanished between render and
  // click yields a result shape rather than a throw past a store that expects one.
  _knowledgeTarget(actorId, itemId) {
    const { actor, denied } = this._knowledgeActor(actorId);
    if (denied) return { denied };
    const item = actor.items?.get?.(itemId);
    if (!item) return { denied: { success: false, message: KNOWLEDGE_MESSAGES.noItem } };
    return { actor, item };
  }

  /**
   * Spend one charge of an owned recipe-item copy. Applies no visibility or
   * knowledge-mode gate: the GM named the copy.
   */
  async _expendRecipeItemUse({ actorId, itemId, definitionId, systemId } = {}) {
    const { actor, item, denied } = this._knowledgeTarget(actorId, itemId);
    if (denied) return denied;
    return await expendOwnedRecipeItemUse({
      actor,
      item,
      service: this._recipeVisibilityService(),
      definition: this._resolveKnowledgeDefinition({ item, definitionId, systemId }),
    });
  }

  /** Delete one owned copy — whole document, never a stack decrement. */
  async _deleteOwnedRecipeItem({ actorId, itemId } = {}) {
    const { item, denied } = this._knowledgeTarget(actorId, itemId);
    if (denied) return denied;
    return await deleteOwnedRecipeItemCopy({ item });
  }

  /** Erase one learned recipe through the merged issue 773 primitive. */
  async _eraseLearnedRecipe({ actorId, recipeId } = {}) {
    const { actor, denied } = this._knowledgeActor(actorId);
    if (denied) return denied;
    return await eraseLearnedRecipeEntry({
      actor,
      service: this._recipeVisibilityService(),
      recipeId,
    });
  }

  /** Both reset grains, routed through the merged GM API. */
  async _resetActorKnowledge({ actorId, systemId = null } = {}) {
    const { denied } = this._knowledgeActor(actorId);
    if (denied) return denied;
    return await resetActorKnowledgeState({
      reset: game?.fabricate?.resetActorKnowledge,
      thisArg: game?.fabricate,
      actorId,
      systemId,
    });
  }

  // Keep the access rosters (`worldUsers` + `accessCharacters`) live while the
  // manager is open: they back the Access tab's grantable lists and the recipe
  // editor's context rail. Each entry is `[hook, id]` so `_unregisterUserHooks` can
  // pair them off.
  //
  // Actor CRUD matters too — `controlledBy` / `sharedWithAllPlayers` derive from
  // `actor.ownership`, name and img — but `updateActor` is NOISY (every HP tick
  // fires it), so it is key-filtered on the `changed` diff. (`noHook` on core's
  // ownership dialog gates only the `pre*` hooks, so `updateActor` does fire.)
  // The Knowledge surface (issue 785) adds the item hooks. Nothing re-rendered on a
  // learn/expend/delete before it: `onFabricateDataChanged` hooks only
  // `craftingSystemsChanged` / `recipesChanged`, and `updateActor` is key-filtered.
  // `knowledgeActive` inside the store makes the noisy `updateItem` hook free while
  // the surface is closed, and while it is open the handlers coalesce through the
  // store's microtask scheduler so a burst of item writes collapses into one scan.
  //
  // The parent Actor CRUD refreshes are LOAD-BEARING, not belt-and-braces: hook
  // dispatch is per-operation-type only, and embedded documents are materialised
  // through `EmbeddedCollection#_initialize`, a path with NO lifecycle hook dispatch
  // — so an `Actor.create` carrying `items[]` from an import, duplicate or
  // compendium drop fires `createActor` and ZERO `createItem`; `deleteActor` is
  // symmetric.
  _registerUserHooks() {
    if (this._userHooks) return;
    const reproject = () => this._adminStore?.refreshAccessRosters?.();
    const reprojectKnowledge = () => this._adminStore?.scheduleKnowledgeRefresh?.();
    // `scheduleKnowledgeRefresh` is a TOTAL no-op unless the Knowledge surface is open, so
    // before this the learned-recipe index the Recipe Studio's delete card counts through
    // was rebuilt only by a full `refresh()`. With the studio open, a player learning from
    // a scroll left the card understating "Will be forgotten by N characters" (issue 1132,
    // review round). Marking is deliberately all this does: `updateActor` fires for EVERY
    // module's flag writes, so rebuilding the index here would be a world walk per foreign
    // write, and republishing to make it visible would re-derive the whole manager on the
    // same cadence. The store rebuilds on the next read that needs it.
    const markLearnerIndexStale = () => this._adminStore?.markLearnedRecipeIndexStale?.();
    const reprojectOnActorCrud = () => {
      reproject();
      markLearnerIndexStale();
      reprojectKnowledge();
    };
    const reprojectOnRelevantActorChange = (_actor, changed) => {
      const diff = changed || {};
      // `ownership` also moves the WRITABLE-actor set the index is built over, so it marks
      // the index stale as well as re-projecting the access rosters.
      if ('ownership' in diff) markLearnerIndexStale();
      if ('ownership' in diff || 'name' in diff || 'img' in diff) reproject();
      // Learned recipes, usage counts and learn counts all live under `flags`.
      if ('flags' in diff) {
        markLearnerIndexStale();
        reprojectKnowledge();
      }
    };
    // An Item embedded in a COMPENDIUM Actor also has an Actor parent and could
    // never change the projection. `Document#pack` falls back to `this.parent?.pack`,
    // so the compendium clause is readable straight off the embedded doc.
    const reprojectOnOwnedItemChange = (doc) => {
      if (doc?.parent?.documentName !== 'Actor') return;
      if (doc?.pack) return;
      reprojectKnowledge();
    };
    // Every entry is an `[hookName, id]` TUPLE — a bare id makes
    // `_unregisterUserHooks` destructure `undefined` and leak the listener across
    // every manager reopen.
    this._userHooks = [
      ...['createUser', 'updateUser', 'deleteUser'].map((hook) => [
        hook,
        Hooks.on(hook, reproject),
      ]),
      ...['createActor', 'deleteActor'].map((hook) => [hook, Hooks.on(hook, reprojectOnActorCrud)]),
      ['updateActor', Hooks.on('updateActor', reprojectOnRelevantActorChange)],
      ...['createItem', 'updateItem', 'deleteItem'].map((hook) => [
        hook,
        Hooks.on(hook, reprojectOnOwnedItemChange),
      ]),
    ];
  }

  _unregisterUserHooks() {
    if (!this._userHooks) return;
    for (const [hook, id] of this._userHooks) {
      Hooks.off(hook, id);
    }
    this._userHooks = null;
  }

  async close(options) {
    // Foundry and the smoke harness use `force` for lifecycle teardown where a
    // confirmation dialog cannot be serviced. Normal user-initiated closes keep
    // every dirty-draft guard below.
    if (!options?.force) {
      const canCloseTool = await this._confirmDiscardDirtyToolDraft?.();
      if (canCloseTool === false) return this;

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
    }

    this._confirmDiscardDirtyEssenceDraft = null;
    this._confirmDiscardDirtyToolDraft = null;
    this._unregisterUserHooks();
    // Companion UI owns its own DOM and cleanup. Dispose it before `super.close()`
    // unmounts the Svelte root, so its mount target is still connected.
    this._svelteComponent?.disposeDowntimeProviderBeforeRemoval?.();
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
            .catch(() => {
              SvelteCraftingSystemManagerApp._pendingReadyOpen = false;
            });
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
    return (
      fabricate?.ready === true &&
      fabricate?.getRecipeManager?.()?.initialized === true &&
      fabricate?.getCraftingSystemManager?.()?.initialized === true
    );
  }
}

registerCraftingSystemManagerApp(SvelteCraftingSystemManagerApp);
