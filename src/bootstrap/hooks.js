/**
 * Every Foundry hook the entry registers. `init`, `getCompendiumContextOptions` and
 * `getSceneControlButtons` stay at module scope: Foundry builds those surfaces once, before
 * `ready`, so a `ready`-time registration loses first paint. `io` carries what the entry retains.
 */

import { InteractableManager } from '../canvas/InteractableManager.js';
import { registerInteractableRegionBehavior } from '../canvas/regions/FabricateInteractableRegionBehavior.js';
import {
  assignInteractableConfigSheet,
  resolveInteractableConfigTarget,
  shouldOfferInteractableConfigEntry,
} from '../canvas/regions/interactableConfigSheet.js';
import {
  evaluateInteractableCreate,
  neutralizeInheritedLinkedVisual,
  buildUnconfiguredSentinelPatch,
} from '../canvas/regions/interactableCreationGuard.js';
import {
  isInteractableRegionBehavior,
  readInteractableBehaviorSystem,
} from '../canvas/regions/interactableRegionFlags.js';
import { notifyUnresolvedItemDescriptions } from '../config/repairItemData.js';
import { handleFabricateSettingChange } from '../config/settingChangeBridge.js';
import { getSetting, SETTING_KEYS, FABRICATE_SETTINGS_NAMESPACE } from '../config/settings.js';
import { stackQuantityPathPresetFor } from '../config/stackQuantityPathPresets.js';
import {
  configureItemStackQuantityPath,
  probeStackQuantityPath,
  stackQuantityAdvisory,
} from '../systems/itemStackQuantity.js';
import { runContainersChanged } from '../systems/runFlagInvalidation.js';
import {
  getFabricateAppClass,
  getInteractableBrowserAppClass,
  getInteractableConfigAppClass,
  getInteractablesManagerAppClass,
} from '../ui/appFactory.js';
import {
  buildCompendiumImportContextOption,
  promptSelectCraftingSystem,
} from '../ui/compendiumDirectoryContext.js';
import { addInteractableSceneControl } from '../ui/interactableSceneControl.js';
import {
  findItemsDirectoryActionsContainer,
  syncGatheringDirectoryButton,
} from '../ui/itemsDirectoryButtons.js';
import { localize as bridgeLocalize } from '../ui/svelte/util/foundryBridge.js';
import { openDeferredApp } from '../utils/deferredEntryNotice.js';

import { installSocketRouter } from './socketRouter.js';

/**
 * Configure the stack-quantity accessor, then optionally probe it (issue 1024). Re-configure before
 * the probe; the re-configure is ungated, since the engine path must be live everywhere, while the
 * notification is GM-only.
 */
export function applyItemStackQuantityPathSetting({ notify = false } = {}) {
  let stored = null;
  try {
    stored = getSetting(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH);
  } catch {
    // Unreadable: the accessor keeps its current path, and never throws.
  }
  const path = configureItemStackQuantityPath(stored);
  if (!notify || game.user?.isGM !== true) return path;

  // `game.items` only: a world whose items all live in compendia and on sheets yields `'no-items'`,
  // silence rather than a clean bill of health. The suggestion is the active system's preset.
  const report = probeStackQuantityPath(game.items ?? [], {
    path,
    defaultPath: stackQuantityPathPresetFor(game.system?.id),
  });
  const message = describeStackQuantityProbe(report);
  // Permanent: the last defence against a typo'd path destroying stacks, which the write guard
  // cannot see because all four consume sites call `item.delete()` instead of `item.update(...)`.
  if (message) ui.notifications?.warn?.(message, { permanent: true });
  return path;
}

/** The i18n edge for `stackQuantityAdvisory`; `null` when healthy. */
function describeStackQuantityProbe(report) {
  const advisory = stackQuantityAdvisory(report);
  if (!advisory) return null;
  return game.i18n?.format?.(advisory.key, advisory.data) ?? advisory.key;
}

// The Interactable CONFIG entries. Idempotent, so safe from both `init` and the `ready` backstop.
function registerFabricateConfig() {
  // A no-op when the Foundry region APIs are unavailable.
  registerInteractableRegionBehavior(CONFIG);

  // Core `RegionBehaviorConfig` is the sheet: `InteractableConfigApp` is an ApplicationV2, not a
  // DocumentSheet, so registering it leaves `behavior.sheet` null and breaks the edit pencil.
  try {
    const DocumentSheetConfig =
      foundry?.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
    const RegionBehavior =
      foundry?.documents?.RegionBehavior ??
      CONFIG?.RegionBehavior?.documentClass ??
      globalThis.RegionBehavior;
    const RegionBehaviorConfig = globalThis.foundry?.applications?.sheets?.RegionBehaviorConfig;
    if (typeof RegionBehaviorConfig === 'function') {
      assignInteractableConfigSheet({
        registrar: DocumentSheetConfig,
        RegionBehavior,
        SheetClass: RegionBehaviorConfig,
      });
    }
  } catch {
    // A sheet-registration shape mismatch must not break init.
  }
}

function invalidateRunCachesForActorUpdate(fabricate, actor, changes) {
  if (!actor?.id) return;
  const changed = runContainersChanged(changes, foundry.utils.hasProperty);
  if (changed.length === 0) return;
  // Crafting and salvage key on `actor.id`, gathering on the uuid.
  const invalidators = {
    crafting: () => fabricate.craftingRunManager?.invalidateCache(actor.id),
    salvage: () => fabricate.salvageRunManager?.invalidateCache(actor.id),
    gathering: () => fabricate.gatheringRunManager?.invalidateCache(actor.uuid ?? actor.id),
  };
  for (const key of changed) {
    invalidators[key]?.();
  }
}

// A GM-only config button on a linked visual's Tile or Token HUD; it never touches an actor.
function installInteractableConfigHudEntry(hud, element, { localizeKey }) {
  try {
    const document = hud?.object?.document ?? hud?.document ?? null;
    if (!shouldOfferInteractableConfigEntry(document, { isGM: game.user?.isGM === true })) return;

    const target = resolveInteractableConfigTarget(document, {
      resolveRegion: (regionUuid) => {
        const region = fromUuidSync?.(regionUuid) ?? null;
        const regionId = region?.id ?? region?._id ?? null;
        const sceneId = region?.parent?.id ?? region?.parent?._id ?? null;
        return regionId && sceneId ? { sceneId, regionId } : null;
      },
    });
    if (!target) return;

    const root = element instanceof HTMLElement ? element : (element?.[0] ?? null);
    const column = root?.querySelector?.('.col.left') ?? root?.querySelector?.('.col') ?? root;
    if (!column?.append) return;

    const out = game.i18n?.localize?.(localizeKey);
    const label = out && out !== localizeKey ? out : 'Configure Fabricate Interactable';

    const button = globalThis.document.createElement('button');
    button.type = 'button';
    button.className = 'control-icon fabricate-interactable-config-hud';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="fas fa-sliders"></i>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void getInteractableConfigAppClass().show(target);
    });
    column.append(button);
  } catch {
    // A HUD augmentation must never throw into Foundry's render.
  }
}

/** Stamp the unconfigured sentinel; `updateSource` is V13's preCreate in-place mutation seam. */
function applyUnconfiguredSentinelStamp(document) {
  const system = readInteractableBehaviorSystem(document) ?? document?.system ?? {};
  const sentinel = buildUnconfiguredSentinelPatch(system);
  if (!sentinel.changed || typeof document?.updateSource !== 'function') {
    return false;
  }
  document.updateSource(sentinel.patch);
  return true;
}

/** INFO, not an error: creation succeeded and the interactable only needs configuring. */
function notifyUnconfiguredInteractableCreated() {
  const out = game.i18n?.localize?.('FABRICATE.Canvas.Interactable.Create.Unconfigured');
  const message =
    out && out !== 'FABRICATE.Canvas.Interactable.Create.Unconfigured'
      ? out
      : 'Created an unconfigured Fabricate interactable. Configure its source (type, system, tool/task) from the Interactable config panel; it stays inert until then.';
  ui.notifications?.info?.(message);
}

/** A fresh interactable NEVER inherits another's marker link; type-agnostic, so the caller gates it. */
function neutralizeInheritedInteractableLink(document) {
  const neutralised = neutralizeInheritedLinkedVisual(document?.system);
  if (neutralised.changed && typeof document?.updateSource === 'function') {
    document.updateSource({
      'system.linkedVisual.uuid': neutralised.patch.linkedVisual.uuid,
      'system.linkedVisual.documentName': neutralised.patch.linkedVisual.documentName,
    });
  }
}

/** `ready` can precede the sidebar's first render, so `renderItemDirectory` retries. */
function addModuleButtonsToItemsDirectory(io, itemsDir = ui.items) {
  if (!itemsDir?.element) {
    return;
  }

  const header = itemsDir.element.querySelector('.directory-header, header');
  if (!header) {
    console.error('Fabricate | Items directory header not found');
    return;
  }

  const actionsContainer = findItemsDirectoryActionsContainer(itemsDir, document);
  if (!actionsContainer) {
    console.error('Fabricate | Items directory actions container not found');
    return;
  }

  const craftExists = [...actionsContainer.querySelectorAll('button.create-document')].some(
    (btn) => btn.dataset.fabricateAction === 'craft' || btn.textContent?.includes('Craft Item')
  );
  if (!craftExists) {
    const craftButton = createHeaderButton('Craft Item', 'fas fa-hammer', 'craft', () =>
      getFabricateAppClass().show('crafting')
    );
    actionsContainer.insertBefore(craftButton, actionsContainer.firstChild);
  }

  syncGatheringDirectoryButton({
    itemsDirectory: itemsDir,
    enabled: hasGatheringEnabledSystems(),
    createButton: () =>
      createHeaderButton('Gathering', 'fas fa-leaf', 'gathering', () =>
        getFabricateAppClass().show('gathering')
      ),
    documentRef: document,
  });

  if (game.user?.isGM) {
    const managerExists = [...actionsContainer.querySelectorAll('button.create-document')].some(
      (btn) =>
        btn.dataset.fabricateAction === 'manage' ||
        btn.textContent?.includes('Manage Crafting Systems')
    );
    if (!managerExists) {
      const managerButton = createHeaderButton(
        'Manage Crafting Systems',
        'fas fa-book',
        'manage',
        () => {
          // Nothing awaits a click handler, so the wrapper reports a failure (issue 1565).
          void openDeferredApp(io.showCraftingSystemManagerApp, io.reportManagerLoadFailure);
        }
      );
      actionsContainer.insertBefore(managerButton, actionsContainer.firstChild);
    }
  }
}

function hasGatheringEnabledSystems() {
  const systems = game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [];
  return [...systems].some((system) => system?.features?.gathering === true);
}

function createHeaderButton(labelText, iconClass, actionId, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-document';
  button.dataset.tooltip = labelText;
  button.dataset.fabricateAction = actionId;
  button.setAttribute('aria-label', labelText);

  const icon = document.createElement('i');
  icon.className = iconClass;
  button.append(icon);

  const label = document.createElement('span');
  label.textContent = labelText;
  button.append(label);

  button.addEventListener('click', (event) => {
    event.preventDefault();
    onClick();
  });

  return button;
}

/** The `/craft <recipe-name>` chat command. Returns `false` to stop the message reaching chat. */
function handleCraftChatCommand(fabricate, message) {
  if (!message.startsWith('/craft')) return;
  const parts = message.split(' ');
  if (parts.length < 2) {
    ui.notifications.warn('Usage: /craft <recipe-name>');
    return false;
  }

  const recipeName = parts.slice(1).join(' ');
  const actor = game.user.character;

  if (!actor) {
    ui.notifications.error('No character selected');
    return false;
  }

  const recipes = fabricate.recipeManager.getRecipes({ search: recipeName });
  if (recipes.length === 0) {
    ui.notifications.error(`Recipe "${recipeName}" not found`);
    return false;
  }

  const recipe = recipes[0];

  fabricate
    .craft(actor, recipe)
    .then((result) => {
      if (result.success) {
        ui.notifications.info(result.message);
      } else {
        ui.notifications.error(result.message);
      }
    })
    .catch((error) => {
      ui.notifications.error(error.message);
      console.error('Fabricate | Crafting error:', error);
    });

  return false;
}

/** The `ready` startup sequence, ahead of every `ready`-time registration. */
async function runReadyStartupSequence(io) {
  // First (issue 1565): it depends on nothing built, and a stale client may fail below. Here, not
  // in `initialize()`, which the View Lab calls.
  io.reportStaleEntryScript();
  // Backstop for the `init` a late module evaluation can miss; both helpers are idempotent.
  registerFabricateConfig();
  io.bindFabricateGlobal();
  await io.fabricate.initialize();
  await io.processFabricateWorldTime();
  await io.runRecipeItemFlagAutoStamp();
  await io.runComponentFlagAutoStamp();
  // After the component stamp and the init-time `1.15.0` migration whose tool refs it reads.
  await io.runToolFlagAutoStamp();
  // After the source-side stamp, so a fresh drag inherits the flag first (issue 600).
  await io.runOwnedItemComponentIdentityRestamp();
  // After the stamps and the restamp, neither of which reaches this population (issue 1363).
  await io.runWorldScopeIdentityFlagRemap();
  // After the `1.30.0` remap: both rewrite the same run containers, this one by forced replacement.
  await io.runWorldEssenceMergeFlagRemap();

  // A GM-only detector for descriptions that predate write-time resolution (issue 800); it
  // rewrites nothing and self-clears once the GM runs Repair Item Data.
  notifyUnresolvedItemDescriptions();

  // The world scan needs `game.items`, so it waits for `ready` (issue 1024).
  applyItemStackQuantityPathSetting({ notify: true });

  // Drop interception, the region-enter prompt and the controlToken re-trigger; idempotent.
  InteractableManager.instance.register();
}

/** The Items Directory buttons: one eager injection, then a retry per rendered sidebar. */
function registerDirectoryButtonHooks(io) {
  const { fabricate } = io;
  addModuleButtonsToItemsDirectory(io);
  Hooks.on('fabricate.craftingSystemsChanged', () => addModuleButtonsToItemsDirectory(io));
  Hooks.on('renderItemDirectory', (app) => addModuleButtonsToItemsDirectory(io, app));
  Hooks.on('updateItem', (item, changes) => {
    void fabricate.craftingSystemManager?.refreshComponentMetadataForUpdatedItem(item, changes);
  });
}

/** The replicated-world-setting bridge, shared by the update and create legs. */
function registerSettingChangeBridge(io) {
  const { fabricate } = io;
  // The handler takes the `Setting` document only, since the two hooks differ in their second
  // argument; collaborators resolve per call, shared so the two listeners cannot drift.
  const fabricateSettingChangeTargets = () => ({
    craftingSystemManager: fabricate.craftingSystemManager,
    recipeManager: fabricate.recipeManager,
    gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore,
    currencyConfigStore: fabricate.currencyConfigStore,
    travelStore: fabricate.gatheringRealmStore,
    characterLibrariesStore: fabricate.characterLibrariesStore,
    // Issues 1359 and 1392: an omitted store no-ops silently, its key still counted as handled, so
    // the client's corpus stays at its boot value all session.
    componentScopeStore: fabricate.componentScopeStore,
    essenceScopeStore: fabricate.essenceScopeStore,
    toolScopeStore: fabricate.toolScopeStore,
    worldVocabularyStore: fabricate.worldVocabularyStore,
    callAll: (hook, payload) => Hooks.callAll(hook, payload),
  });
  const handleFabricateSettingDocumentChange = (setting) => {
    try {
      const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.id ?? ''}`;
      // Both the gather decrement and the world-time respawn write this setting, so the marker
      // swap covers depletion and recharge alike.
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`) {
        void io.runInteractableMarkerSync();
      }
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ITEM_STACK_QUANTITY_PATH}`) {
        // Runtime-mutable, so probe on change, not only at startup.
        applyItemStackQuantityPathSetting({ notify: true });
      }
      // Dismissals are `scope: 'user'`, so `updateSetting` delivers EVERY user's document to every
      // client. `Setting#user` is an id (`idOnly: true` on V14.365); the `.id` read stays honest.
      if (
        key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.JOURNAL_RUN_DISMISSALS}` &&
        (setting?.user?.id ?? setting?.user) === game.user?.id
      ) {
        Hooks.callAll('fabricate.journalDismissalsChanged');
      }
      // The change hooks fire only on the writing GM's client; the setting hooks fire everywhere,
      // so each client reloads its stale manager here and re-emits the local hook.
      handleFabricateSettingChange(key, fabricateSettingChangeTargets());
    } catch (error) {
      console.error('Fabricate | Failed to handle a Fabricate setting change', error);
    }
  };
  Hooks.on('updateSetting', handleFabricateSettingDocumentChange);
  // The first write to a world setting is a create, not an update (issue 1024).
  Hooks.on('createSetting', handleFabricateSettingDocumentChange);
}

/** The Journal authority refresh registrations, the canvas marker sync and its eager call. */
function registerJournalAuthorityHooks(io) {
  const { fabricate } = io;
  const refreshJournalRunAuthorityAvailability = () => {
    void fabricate.journalRunCommands?.refreshJournalRunAuthorityAvailability?.();
  };
  const bootstrapJournalRunAuthority = () => {
    void fabricate.journalRunCommands?.bootstrapJournalRunAuthority?.();
  };
  Hooks.on('createJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('updateJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('deleteJournalEntry', refreshJournalRunAuthorityAvailability);
  Hooks.on('createJournalEntryPage', refreshJournalRunAuthorityAvailability);
  Hooks.on('deleteJournalEntryPage', refreshJournalRunAuthorityAvailability);
  Hooks.on('updateUser', bootstrapJournalRunAuthority);
  Hooks.on('userConnected', bootstrapJournalRunAuthority);
  Hooks.on('canvasReady', () => {
    void io.runInteractableMarkerSync();
  });
  void io.runInteractableMarkerSync();
}

/**
 * The `ready`-time registrations, in shipped order. The two eager calls stay interleaved: the
 * sidebar has rendered and `canvasReady` has fired by `ready`, so each runs once in place.
 */
export async function registerReadyHooks(io) {
  await runReadyStartupSequence(io);
  installSocketRouter(io);
  registerDirectoryButtonHooks(io);
  registerSettingChangeBridge(io);
  registerJournalAuthorityHooks(io);
  Hooks.callAll('fabricate.ready');
}

/** Register every module-scope hook, in the shipped order. */
export function registerModuleHooks(io) {
  const { fabricate } = io;
  Hooks.once('init', async () => {
    console.log('Fabricate | Init Hook');
    registerFabricateConfig();
    io.bindFabricateGlobal();
    // Core refuses a keybinding registered after `init` (issues 1835, 1881).
    InteractableManager.instance.registerKeybinding();
  });

  // Not in `ready`: the menu is built once in `_onFirstRender`, before it. Mutates in place.
  Hooks.on('getCompendiumContextOptions', (application, contextOptions) => {
    contextOptions.push(
      buildCompendiumImportContextOption({
        localize: bridgeLocalize,
        isGM: () => game.user?.isGM,
        isItemPack: (id) => game.packs.get(id)?.documentName === 'Item',
        getPackName: (id) => {
          const pack = game.packs.get(id);
          return pack?.title ?? pack?.metadata?.label ?? id;
        },
        getSystems: () => game.fabricate?.getCraftingSystemManager?.()?.getSystems?.() ?? [],
        promptSelectSystem: promptSelectCraftingSystem,
        importPack: (systemId, packId) =>
          game.fabricate.getCraftingSystemManager().addItemsFromPack(systemId, packId),
        notify: ui.notifications,
      })
    );
  });

  Hooks.once('ready', () => registerReadyHooks(io));

  Hooks.on('updateWorldTime', (worldTime) => {
    void io.processFabricateWorldTime(worldTime);
  });

  // Drop a run cache when another client's write lands (issues 733, 739). The key filter is
  // load-bearing: `updateActor` also fires on every HP tick.
  Hooks.on('updateActor', (actor, changes) => {
    invalidateRunCachesForActorUpdate(fabricate, actor, changes);
  });

  // Foundry V13 passes `controls` as a keyed record, not the pre-V13 array; the seam mutates it.
  Hooks.on('getSceneControlButtons', (controls) => {
    addInteractableSceneControl(controls, {
      isGM: game.user?.isGM === true,
      onClick: () => getInteractableBrowserAppClass().show(),
      // Manage Interactables (issue 335).
      onManageClick: () => getInteractablesManagerAppClass().show(),
      localize: (key, fallback) => {
        const out = game.i18n?.localize?.(key);
        return out && out !== key ? out : fallback;
      },
    });
  });

  Hooks.on('renderTileHUD', (hud, element) => {
    installInteractableConfigHudEntry(hud, element, {
      localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromTile',
    });
  });

  Hooks.on('renderTokenHUD', (hud, element) => {
    installInteractableConfigHudEntry(hud, element, {
      localizeKey: 'FABRICATE.Canvas.Interactable.Config.OpenFromToken',
    });
  });

  // An empty `system` is valid but unconfigured (issues 334, 342), so the behaviour is born inert.
  // An inherited marker link is neutralised, since region duplication clones `linkedVisual`.
  Hooks.on('preCreateRegionBehavior', (document) => {
    try {
      // Always allows; kept as the edge's one decision point.
      evaluateInteractableCreate(document);
      if (!isInteractableRegionBehavior(document)) {
        return;
      }

      if (applyUnconfiguredSentinelStamp(document)) {
        notifyUnconfiguredInteractableCreated();
      }
      neutralizeInheritedInteractableLink(document);
      return;
    } catch {
      // A guard error must never block an unrelated behaviour creation.
      return;
    }
  });

  Hooks.on('chatMessage', (chatLog, message) => handleCraftChatCommand(fabricate, message));
}
