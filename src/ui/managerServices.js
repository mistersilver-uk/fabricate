/**
 * The manager shell's Foundry-facing service bag, composed from eight group factories.
 *
 * `io` carries the shell's own collaborators as call-time thunks, and the bag is rebuilt on every
 * `_buildServices()` call: `_adminStore` is null while the bag is built, so the store is reached
 * through `io.adminStore()` rather than captured. Every entry reads the world when it is called,
 * which is what lets `createManagerServices` run with no Foundry global defined at all — the
 * `DialogV2` and `FilePicker` lookups stay inside their thunks for that reason.
 */
import { tokenDocumentCenter } from '../canvas/regionHitTest.js';
import { isPlayerCharacterActor } from '../config/playerCharacterTypes.js';
import { getSetting, setSetting } from '../config/settings.js';
import { getTokenSceneUuid } from '../gatheringBootstrapAdapters.js';
import { CompendiumImporter } from '../systems/CompendiumImporter.js';
import { prepareForImport, validateImportData } from '../systems/CraftingSystemExporter.js';
import { descriptionTextCandidate, plainTextDescription } from '../utils/plainTextDescription.js';

import { choiceDialog, confirmDialog } from './foundryCompat.js';
import { buildImportReportContent } from './presenters/importReportContent.js';
import {
  enrichToHtml,
  localize,
  resolveItemSourceSnapshot,
  subscribeSceneChange,
  subscribeTravelMarkerMove,
} from './svelte/util/foundryBridge.js';
import { normalizeSceneOption } from './svelte/util/sceneImages.js';
import { filterActorUuidsInsideRegion, readSceneRegions } from './svelte/util/sceneRegions.js';

// Foundry's canonical non-GM roster. GMs are filtered FIRST because
// `Document#testUserPermission` short-circuits every GM to OWNER; `Actor#isOwner` and
// `Document#permission` are `game.user`-scoped and unusable here. The fallback applies the role
// floor too, so it agrees with `Users#players` (`!u.isGM && u.hasRole('PLAYER')`).
function playerUsers() {
  const players = game.users?.players;
  if (Array.isArray(players)) return players;

  const PLAYER = globalThis.CONST?.USER_ROLES?.PLAYER ?? 1;
  return [...(game.users?.contents || [])].filter((user) => {
    if (user?.isGM === true) return false;
    if (typeof user?.hasRole === 'function') return user.hasRole('PLAYER') === true;
    return Number(user?.role ?? 0) >= Number(PLAYER);
  });
}

// `playerUsers()` is GM-free by construction, so GAMEMASTER and ASSISTANT are unreachable here.
function userRoleLabel(role) {
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
function userColor(user) {
  const color = user?.color;
  if (!color) return '';
  return typeof color === 'string' ? color : color.css || color.toString?.() || '';
}

/**
 * Who controls this actor. The relation is a SET, not a single user:
 * `RecipeVisibilityService._viewerControlsCharacter` grants access to any viewer whose assigned
 * character is this actor OR who holds Foundry OWNER on it, and `getUserLevel` falls through to
 * `ownership.default`, which `sharedWithAllPlayers` reports.
 */
export function describeAccessActor(actor) {
  const LEVELS = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS || {
    NONE: 0,
    LIMITED: 1,
    OBSERVER: 2,
    OWNER: 3,
  };
  const controlledBy = playerUsers()
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

/** The module settings seam and the world stores the manager reaches through `game.fabricate`. */
function worldStoreServices() {
  return {
    getSetting: (key) => getSetting(key),
    setSetting: async (key, value) => setSetting(key, value),
    getCraftingSystemManager: () => game?.fabricate?.getCraftingSystemManager?.() ?? null,
    getRecipeManager: () => game?.fabricate?.getRecipeManager?.() ?? null,
    getGatheringEnvironmentStore: () => game?.fabricate?.getGatheringEnvironmentStore?.() ?? null,
    getGatheringPartyStore: () => game?.fabricate?.getGatheringPartyStore?.() ?? null,
    getCurrencyConfigStore: () => game?.fabricate?.getCurrencyConfigStore?.() ?? null,
    getCharacterLibrariesStore: () => game?.fabricate?.getCharacterLibrariesStore?.() ?? null,
    // The three world-scope entity stores (issue 1364) are also what the Export button hands
    // `buildExportPayload`; every parameter after `version` is defaulted, so a slice missing here
    // exports empty from this path alone and nothing reports it.
    getComponentScopeStore: () => game?.fabricate?.getComponentScopeStore?.() ?? null,
    getEssenceScopeStore: () => game?.fabricate?.getEssenceScopeStore?.() ?? null,
    getToolScopeStore: () => game?.fabricate?.getToolScopeStore?.() ?? null,
    // Without this the vocabulary leg is `null` forever and `projectWorldVocabulary` publishes a
    // legitimate-looking `{available: false, total: 0}`, which no adminStore unit test can see
    // (issue 1392). `tests/components/manager-contract.test.js` parses this property's AST.
    getVocabularyScopeStore: () => game?.fabricate?.getVocabularyScopeStore?.() ?? null,
    getGatheringRealmStore: () => game?.fabricate?.getGatheringRealmStore?.() ?? null,
    getGatheringLocationService: () => game?.fabricate?.getGatheringLocationService?.() ?? null,
  };
}

/**
 * Readiness, the module and system identity, and the two Fabricate hook subscriptions.
 *
 * Both handlers are constructed inside the body of the service that subscribes, never in this
 * factory body: `Hooks.off` matches on strict reference identity and returns silently on a miss,
 * so one handler shared across subscribing calls would leak a listener with no diagnostic.
 */
function readinessServices() {
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
    getFoundrySystemId: () => game?.system?.id || '',
    getModuleVersion: () => game.modules?.get('fabricate')?.version || '0.0.0',
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
  };
}

/** The current scene, its regions, the scene and macro option lists, and the two canvas hooks. */
function sceneServices() {
  return {
    getCurrentSceneRegions: () =>
      readSceneRegions(game?.scenes?.current ?? game?.scene ?? globalThis.canvas?.scene ?? null),
    subscribeSceneChange: (handler) => subscribeSceneChange(handler),
    subscribeTravelMarkerMove: (handler) => subscribeTravelMarkerMove(handler),
    // Of the given actor uuids, those whose token sits inside the named Scene Region right now.
    // Answers [] when the Foundry globals or the region are unavailable (headless / no canvas).
    getActorUuidsInSceneRegion: (sceneRegionUuid, actorUuids) => {
      const resolveSync = globalThis.fromUuidSync;
      if (typeof resolveSync !== 'function' || !sceneRegionUuid || !Array.isArray(actorUuids))
        return [];
      // `fromUuidSync` defaults to `strict: true` and THROWS for an embedded document inside a
      // compendium, which a compendium-sourced party member reaches; the catch must assign null
      // rather than leave the binding undefined.
      let regionDoc;
      try {
        regionDoc = resolveSync(String(sceneRegionUuid));
      } catch {
        regionDoc = null;
      }
      if (!regionDoc) return [];
      const sceneUuid = regionDoc?.parent?.uuid ?? '';
      return filterActorUuidsInsideRegion({
        regionDoc,
        actorUuids,
        resolveActorTokenCenter: (actorUuid) => {
          let actor;
          try {
            actor = resolveSync(String(actorUuid));
          } catch {
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
    getScriptMacros: () =>
      [...(game.macros?.contents || [])]
        .filter((m) => (m.type || '').toLowerCase() === 'script')
        .map((m) => ({ uuid: m.uuid, name: m.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    getSceneOptions: () =>
      Array.from(game.scenes?.contents || [], (scene) => normalizeSceneOption(scene))
        .filter((scene) => scene.uuid && scene.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** The user and actor rosters the Access surface and the party pickers read. */
function rosterServices() {
  return {
    // Non-GM world users, name-sorted, for the Access tab's grantable Players list and the recipe
    // editor's context rail. `User#isGM` is `hasRole(ASSISTANT)`, so Assistant GMs are dropped
    // too; a GM viewer passes `_isRecipeVisibleByAccessGrant` before it ever reads `playerIds`.
    getWorldUsers: () =>
      playerUsers()
        .map((user) => ({
          id: user.id,
          name: user.name,
          role: userRoleLabel(user.role),
          color: userColor(user),
          avatar: user.avatar || user.img || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // The Access tab's grantable Characters roster under `restricted` visibility. Membership is
    // the shared, GM-configurable predicate (issue 1024), deliberately not on `game.fabricate`.
    getPlayerCharacterActors: () =>
      [...(game.actors?.contents || [])]
        .filter((actor) => isPlayerCharacterActor(actor))
        .map((actor) => describeAccessActor(actor))
        .filter((actor) => actor.id && actor.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // Every world actor, deliberately NOT the filtered roster above: the runtime access predicate
    // applies no type filter, so resolving the editor's granted ids over the filtered list would
    // drop a grant from display and under-report who has access.
    getAccessCharacterActors: () =>
      Array.from(game.actors?.contents || [], (actor) => describeAccessActor(actor))
        .filter((actor) => actor.id && actor.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // The raw actor DOCUMENTS (issue 1132): `buildLearnedRecipeActorIndex` reads each actor's
    // flags and `isOwner`, neither of which survives `describeAccessActor`. Unsorted and
    // unfiltered on purpose, because the shared selector owns the scope.
    //
    // `Array.from`, never a spread: the `|| game.actors` fallback leg admits an operand that is
    // neither iterable nor carries `.contents`, over which `Array.from` answers `[]` where a
    // spread throws `TypeError`. The identity projection keeps that spelling under
    // `unicorn/prefer-spread`, which reports only the single-argument call.
    getWorldActors: () => Array.from(game.actors?.contents || game.actors || [], (actor) => actor),
  };
}

/** The projections the editors read: world Items, actor options, roll data and Tool sources. */
function actorProjectionServices() {
  return {
    // Every world actor, each carrying a projected `isPlayerCharacter` so the party member picker
    // narrows without a component importing the predicate. The raw `type` field is deliberately
    // absent (issue 1024): while it is present, a hardcoded type comparison can grow back.
    getActorOptions: () =>
      Array.from(game.actors?.contents || [], (actor) => ({
        uuid: actor.uuid,
        id: actor.id,
        name: actor.name,
        img: actor.img || '',
        isPlayerCharacter: isPlayerCharacterActor(actor),
      }))
        .filter((actor) => actor.uuid && actor.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // The spelling `characterPrerequisites.js` requires of every call site:
    // `actor?.getRollData?.() ?? actor?.system ?? {}`, because `ActorPF2e#getRollData()` answers
    // `{actor: this}` alone, so a bare `actor.system` read fails every prerequisite silently. It
    // answers `null`, not `{}`, for an unresolvable uuid, so "no actor" is distinguishable.
    getActorRollData: async (actorUuid) => {
      const actor = await fromUuid(String(actorUuid || ''));
      if (!actor) return null;
      return actor.getRollData?.() ?? actor.system ?? {};
    },
    // Game-world Items for linked-Item previews. `description` is part of the projection because
    // the world Tools Catalogue reads it as the second rung of a Tool's description (issue 1373).
    // It is deliberately NOT enriched: enrichment is async and per-document, so running it over
    // every Item would put a full pass behind opening a catalogue.
    getWorldItemOptions: () =>
      Array.from(game.items?.contents || [], (item) => ({
        uuid: item.uuid,
        name: item.name,
        img: item.img || '',
        type: item.type || '',
        description: plainTextDescription(
          descriptionTextCandidate(item?.system?.description?.value) ||
            descriptionTextCandidate(item?.system?.description) ||
            ''
        ),
      }))
        .filter((item) => item.uuid && item.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    resolveToolSource: (uuid) => resolveItemSourceSnapshot(uuid),
  };
}

/** Notifications, localization, the dialog primitives, the clipboard and the file download. */
function dialogServices() {
  return {
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
        } catch (error) {
          ui.notifications.warn(
            error?.message || localize('FABRICATE.Admin.Environments.ImagePickerUnavailable')
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
    // The component-browser live-description fallback (issue 800), so a compendium-linked
    // component with no stored description renders names rather than raw `@UUID[…]`.
    enrichToHtml: (raw, options) => enrichToHtml(raw, options),
    copyToClipboard: async (text) => {
      const clipboard = game?.clipboard;
      if (!clipboard?.copyPlainText) {
        throw new Error('Foundry clipboard helper is unavailable');
      }
      await clipboard.copyPlainText(text);
    },
    downloadFile: async (json, filename) => {
      if (typeof saveDataToFile === 'function') {
        saveDataToFile(json, 'application/json', filename);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    },
  };
}

const SYSTEM_IMPORT_FORM = `
          <p>Select a Fabricate system JSON file to import.</p>
          <input type="file" name="importFile" accept=".json" style="width:100%; margin-bottom: 0.5rem;" />
          <fieldset style="margin-top: 0.5rem;">
            <legend>Conflict handling</legend>
            <label><input type="radio" name="conflictMode" value="skip" checked /> Skip if system already exists</label><br/>
            <label><input type="radio" name="conflictMode" value="overwrite" /> Overwrite existing system and recipes</label><br/>
            <label><input type="radio" name="conflictMode" value="copy" /> Import as new copy</label>
          </fieldset>
        `;

/** Ask the GM for a system export file and a conflict mode, or `null` when there is nothing to do. */
async function promptSystemImportFile() {
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) {
    ui.notifications.warn('Dialog API not available.');
    return null;
  }
  const result = await DialogV2.prompt({
    window: { title: 'Import Crafting System' },
    content: SYSTEM_IMPORT_FORM,
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
  return { file: result.file, conflictMode: result.conflictMode };
}

/**
 * Parse, validate and persist one system export. This is the only work whose failure is an
 * "Import failed" toast; the post-success report assembly is deliberately outside it, so a render
 * error is never misreported as a failed import.
 */
async function runSystemImport({ file, conflictMode }) {
  try {
    const data = JSON.parse(await file.text());

    const validation = validateImportData(data);
    if (!validation.valid) {
      ui.notifications.error(`Invalid file: ${validation.errors.join('; ')}`);
      return null;
    }
    for (const warning of validation.warnings) ui.notifications.warn(warning);

    const mode = conflictMode === 'copy' ? 'copy' : 'keep';
    // The DESTINATION world's entity roster (issue 1364). Copy mode requires it: without it every
    // incoming component mints a fresh id and the world doubles every record it already holds.
    const worldEntityIndex = {
      components: game.fabricate.getComponentScopeStore?.()?.listEntities?.() ?? [],
      essences: game.fabricate.getEssenceScopeStore?.()?.listEntities?.() ?? [],
      tools: game.fabricate.getToolScopeStore?.()?.listEntities?.() ?? [],
    };
    const packData = prepareForImport(data, mode, { worldEntityIndex });

    const systemManager = game.fabricate.getCraftingSystemManager();
    const recipeManager = game.fabricate.getRecipeManager();
    const importer = new CompendiumImporter(systemManager, recipeManager, {
      environmentStore: game.fabricate.getGatheringEnvironmentStore?.() ?? null,
      getSetting: (key) => getSetting(key),
      setSetting: (key, value) => setSetting(key, value),
      isGM: () => game.user?.isGM === true,
      // The importer fails CLOSED on an absent seam, so a lazy lookup would make a broken
      // accessor present as a successful import that merged nothing (issue 1364).
      componentScopeStore: game.fabricate.getComponentScopeStore?.() ?? null,
      essenceScopeStore: game.fabricate.getEssenceScopeStore?.() ?? null,
      toolScopeStore: game.fabricate.getToolScopeStore?.() ?? null,
    });
    return await importer.importFromPackData(packData, {
      overwriteExisting: conflictMode === 'overwrite',
    });
  } catch (error) {
    // Hard failures stay on the DISTINCT error-toast path (never the report).
    ui.notifications.error(`Import failed: ${error.message}`);
    return null;
  }
}

/**
 * Announce one completed import and assemble the GM-readable report, or `null` for an
 * already-existing system that was skipped. The admin-store refresh is unguarded on purpose: it
 * sits outside the import's `try`, so a null store throws out of the service rather than being
 * reported as a failed import.
 */
async function reportSystemImport(summary, io) {
  if (summary.system.skipped) {
    // "already exists — skipped" stays a toast; it does NOT open the report.
    ui.notifications.info(`System "${summary.system.name}" already exists — skipped.`);
    await io.adminStore().refresh();
    return null;
  }

  const verb = summary.collisions.some((c) => c.type === 'system' && c.resolution === 'overwritten')
    ? 'Updated'
    : 'Imported';
  const message = `${verb} "${summary.system.name}" with ${summary.components.total} components, ${summary.recipes.imported} imported recipes, ${summary.recipes.skipped} skipped recipes, and ${summary.recipes.errors.length} failed recipes.`;
  if (summary.recipes.errors.length > 0) {
    ui.notifications.warn(message);
  } else {
    ui.notifications.info(message);
  }

  await io.adminStore().refresh();

  const buildReport = io.importReportBuilder ?? buildImportReportContent;
  return buildReport(summary, (key, data) => localize(key, data));
}

/** The two import dialogs. Both refresh the admin store; only one does so inside its `try`. */
function importServices(io) {
  return {
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
          callback: (event, button) => {
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
          await io.adminStore().refresh();
        } catch (error) {
          ui.notifications.error(`Import failed: ${error.message}`);
        }
      }
    },
    // Resolves to the assembled report content for `ImportReportModal` to render, or `null` when
    // there is nothing to report (no dialog API, cancelled, failed, or an existing system that
    // was skipped). This hands DATA to the UI, never a hand-escaped HTML string (issue 877).
    renderSystemImportDialog: async () => {
      const request = await promptSystemImportFile();
      if (!request) return null;
      const summary = await runSystemImport(request);
      if (!summary) return null;
      return reportSystemImport(summary, io);
    },
  };
}

/**
 * The GM Knowledge surface seam (issue 785). The reads and writes stay at the shell edge, because
 * the roster resolution and the GM gate both need `game`; `adminStore` derives and
 * `knowledgeStudio` projects.
 */
function knowledgeServices(io) {
  return {
    getKnowledgeSnapshot: (systemId) => io.knowledgeSnapshot(systemId),
    expendRecipeItemUse: (options) => io.expendRecipeItemUse(options),
    deleteOwnedRecipeItem: (options) => io.deleteOwnedRecipeItem(options),
    eraseLearnedRecipe: (options) => io.eraseLearnedRecipe(options),
    resetActorKnowledge: (options) => io.resetActorKnowledge(options),
  };
}

/**
 * The manager's whole service bag.
 *
 * @param {object} io The shell's collaborators, each a call-time thunk: `adminStore()`, the
 *   knowledge snapshot and its four mutations, and an optional `importReportBuilder`.
 */
export function createManagerServices(io) {
  return {
    ...worldStoreServices(),
    ...sceneServices(),
    ...readinessServices(),
    ...rosterServices(),
    ...actorProjectionServices(),
    ...knowledgeServices(io),
    ...dialogServices(),
    ...importServices(io),
  };
}
