/**
 * Every Foundry hook the entry registers. `init`, `getCompendiumContextOptions` and
 * `getSceneControlButtons` stay at MODULE scope: Foundry builds those surfaces once, before
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
 * Push the configured item stack-quantity path into the accessor, then optionally probe it and warn
 * the GM (issue 1024). ORDER IS LOAD-BEARING: re-configure BEFORE the probe. The re-configure is
 * UNGATED, the engine path having to be live everywhere, while the notification is GM-only.
 */
export function applyItemStackQuantityPathSetting({ notify = false } = {}) {
  let stored = null;
  try {
    stored = getSetting(SETTING_KEYS.ITEM_STACK_QUANTITY_PATH);
  } catch {
    // Unregistered or unreadable: `configureItemStackQuantityPath` keeps the current path rather
    // than storing a falsy one, and never throws.
  }
  const path = configureItemStackQuantityPath(stored);
  if (!notify || game.user?.isGM !== true) return path;

  // `game.items` ONLY, a bounded read-only scan, and THAT SCOPE IS A REAL LIMIT: a world whose items
  // all live in compendia and on sheets yields `'no-items'`, which is SILENCE and never a clean bill
  // of health. The suggested correction is the ACTIVE SYSTEM's preset, not the built-in default.
  const report = probeStackQuantityPath(game.items ?? [], {
    path,
    defaultPath: stackQuantityPathPresetFor(game.system?.id),
  });
  const message = describeStackQuantityProbe(report);
  // PERMANENT: subject to the scope caveat above, this is the remaining defence against a typo'd
  // path destroying stacks. The object-valued write guard cannot see the failure, because all four
  // consume sites take `item.delete()` INSTEAD of `item.update(...)`.
  if (message) ui.notifications?.warn?.(message, { permanent: true });
  return path;
}

/**
 * The GM-facing advisory for a stack-quantity probe result, or `null` when healthy: THE DECISION is
 * `stackQuantityAdvisory`'s and this is the i18n edge. The string names the CONSEQUENCE plainly.
 */
function describeStackQuantityProbe(report) {
  const advisory = stackQuantityAdvisory(report);
  if (!advisory) return null;
  return game.i18n?.format?.(advisory.key, advisory.data) ?? advisory.key;
}

// The init-time Foundry CONFIG entries for the canvas Interactable foundation. Idempotent, so it is
// safe from BOTH `init` and `ready`, the latter backstopping a late module evaluation.
function registerFabricateConfig() {
  // Register the region-first `fabricate.interactable` data model and its type icon. Defensive and
  // idempotent: a no-op when the Foundry region APIs are unavailable.
  registerInteractableRegionBehavior(CONFIG);

  // The CORE schema-driven `RegionBehaviorConfig` as the document sheet for `fabricate.interactable`:
  // the rich `InteractableConfigApp` is an ApplicationV2, NOT a DocumentSheet, so registering it
  // left `behavior.sheet` null and broke the edit pencil. The rich panel stays on the HUD entry.
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
    // Defensive: a sheet-registration shape mismatch must not break init.
  }
}

function invalidateRunCachesForActorUpdate(fabricate, actor, changes) {
  if (!actor?.id) return;
  const changed = runContainersChanged(changes, foundry.utils.hasProperty);
  if (changed.length === 0) return;
  // The crafting and salvage caches key on `actor.id` and the gathering cache on the actor uuid, so
  // each manager is passed the key it stores under.
  const invalidators = {
    crafting: () => fabricate.craftingRunManager?.invalidateCache(actor.id),
    salvage: () => fabricate.salvageRunManager?.invalidateCache(actor.id),
    gathering: () => fabricate.gatheringRunManager?.invalidateCache(actor.uuid ?? actor.id),
  };
  for (const key of changed) {
    invalidators[key]?.();
  }
}

// owning behaviour from the reverse linked-visual flags. Shared by both HUDs; it never touches an
// actor.
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
    if (!column?.appendChild) return;

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
    // Defensive: a HUD augmentation must never throw into Foundry's render.
  }
}

/**
 * Stamp the unconfigured sentinel onto any identity field the empty-system instantiation left empty;
 * `updateSource` is the V13 preCreate seam, a preCreate hook mutating the source in place.
 */
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

/**
 * Add the system-agnostic Craft button to the Items Directory header, injecting when an element
 * exists — `ready` can precede the sidebar's first render, so `renderItemDirectory` retries per
 * rendered sidebar or popout instance.
 */
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
          // SWALLOWING (issue 1565): nothing awaits a click handler, so the wrapper reports the
          // failure rather than leaving an unhandled rejection as the user's only signal.
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
  {
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

    return false; // Prevent the message from being sent to chat
  }
}

/** The `ready` startup sequence, ahead of every `ready`-time registration. */
async function runReadyStartupSequence(io) {
  // Issue 1565: FIRST, because it depends on nothing Fabricate has built and a client on a stale
  // entry script may fail below. In the `ready` body, not `initialize()`, which the View Lab calls.
  io.reportStaleEntryScript();
  // Backstop for the `init` a late module evaluation can miss. Both helpers are idempotent, so this
  // guarantees `game.fabricate` and the Interactable CONFIG exist before readiness flips.
  registerFabricateConfig();
  io.bindFabricateGlobal();
  await io.fabricate.initialize();
  await io.processFabricateWorldTime();
  await io.runRecipeItemFlagAutoStamp();
  await io.runComponentFlagAutoStamp();
  // AFTER the MigrationRunner, which persists the `1.15.0` tool source-ref migration at init, and
  // after the component stamp: this reads the migration-populated tool refs.
  await io.runToolFlagAutoStamp();
  // Issue 600: re-stamp durable component identity onto owned items resolving by name only. AFTER
  // the source-side stamp, so a fresh drag inherits the flag first.
  await io.runOwnedItemComponentIdentityRestamp();
  // Issue 1363: remap the identity flags the `1.30.0` re-key invalidated. AFTER the source-side
  // stamps and the owned-item restamp, neither of which reaches this population.
  await io.runWorldScopeIdentityFlagRemap();
  // Issue 1654: remap the essence references the `1.34.0` merge invalidated. AFTER the `1.30.0`
  // remap — both rewrite the same run containers, and this one writes a forced replacement.
  await io.runWorldEssenceMergeFlagRemap();

  // Issue 800: a GM-only cue for a world whose stored descriptions predate write-time resolution.
  // A DETECTOR only — it rewrites nothing and self-clears once the GM has run Repair Item Data.
  notifyUnresolvedItemDescriptions();

  // Issue 1024: the GM-only advisory for a stack-quantity path that resolves nothing, or reads on
  // the prepared document but is absent from `_source` so every write is discarded. The path was
  // configured during `initialize()`; this adds the world scan, which needs `game.items`.
  applyItemStackQuantityPathSetting({ notify: true });

  // Wire the region-first canvas Interactable foundation: drop interception, the region-enter
  // prompt, the controlToken re-trigger and the interact keybinding. `register()` is idempotent.
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
  // Env-node-driven marker swap: a depleting or recharging task node flips every linked Tile marker
  // to or from `depletedBehavior.swapImage`, and both the gather decrement and the world-time
  // respawn write `fabricate.gatheringEnvironments`, so reacting to that setting covers BOTH. THE
  // HANDLER TAKES THE `Setting` DOCUMENT ONLY, the two hooks differing in their second argument;
  // collaborators are resolved PER CALL and shared so the two listeners cannot drift.
  const fabricateSettingChangeTargets = () => ({
    craftingSystemManager: fabricate.craftingSystemManager,
    recipeManager: fabricate.recipeManager,
    gatheringEnvironmentStore: fabricate.gatheringEnvironmentStore,
    currencyConfigStore: fabricate.currencyConfigStore,
    travelStore: fabricate.gatheringRealmStore,
    characterLibrariesStore: fabricate.characterLibrariesStore,
    // Issue 1359. Without these three the bridge legs receive `undefined` and NO-OP silently — the
    // key still counts as handled — so the client's corpus stays at its boot value all session.
    componentScopeStore: fabricate.componentScopeStore,
    essenceScopeStore: fabricate.essenceScopeStore,
    toolScopeStore: fabricate.toolScopeStore,
    // Issue 1392. Same silent failure as the three above.
    worldVocabularyStore: fabricate.worldVocabularyStore,
    callAll: (hook, payload) => Hooks.callAll(hook, payload),
  });
  const handleFabricateSettingDocumentChange = (setting) => {
    try {
      const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.id ?? ''}`;
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.GATHERING_ENVIRONMENTS}`) {
        void io.runInteractableMarkerSync();
      }
      if (key === `${FABRICATE_SETTINGS_NAMESPACE}.${SETTING_KEYS.ITEM_STACK_QUANTITY_PATH}`) {
        // Re-configure, THEN probe: the setting is runtime-mutable, and a startup-only probe would
        // separate the advisory from the typo by an arbitrary amount of destroyed inventory.
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
      // Cross-client refresh: `craftingSystemsChanged` / `recipesChanged` fire only on the GM's
      // client, while the setting hooks fire everywhere the replicated world setting lands, so
      // reload the stale in-memory manager here and re-emit the local hook.
      handleFabricateSettingChange(key, fabricateSettingChangeTargets());
    } catch (error) {
      console.error('Fabricate | Failed to handle a Fabricate setting change', error);
    }
  };
  Hooks.on('updateSetting', handleFabricateSettingDocumentChange);
  // THE FIRST EVER WRITE TO A WORLD SETTING IS A CREATE, NOT AN UPDATE (issue 1024), so without this
  // a first-time value propagates to nobody until reload. BOTH LEGS SHARE ONE LISTENER.
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
 * The thirteen `ready`-time registrations, in the order they ship. The two eager calls are
 * interleaved rather than hoisted: the sidebar has already rendered when `ready` fires, and
 * `canvasReady` has already fired, so each must run once at its own position.
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
  });

  // GM-only Compendium Directory bulk-import action, at module top-level and NOT in the `ready` body:
  // that context menu is built once in `_onFirstRender`, BEFORE `ready`. It MUTATES in place.
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

  // Cross-client run-cache coherence (issues 733 + 739): the run managers cache an actor's runs and
  // never learn of another client's write, so the stale cache is dropped when the synced document
  // lands. THE KEY FILTER IS LOAD-BEARING — `updateActor` also fires on every HP tick.
  Hooks.on('updateActor', (actor, changes) => {
    invalidateRunCachesForActorUpdate(fabricate, actor, changes);
  });

  // GM-only scene-control button launching the Interactable browser. Foundry V13 passes `controls` as
  // a keyed RECORD, not the pre-V13 array, and the pure seam mutates that record.
  Hooks.on('getSceneControlButtons', (controls) => {
    addInteractableSceneControl(controls, {
      isGM: game.user?.isGM === true,
      onClick: () => getInteractableBrowserAppClass().show(),
      // The Manage Interactables panel (issue 335): a sibling GM-only tool listing every interactable
      // on the scene and promoting regions.
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

  // The `fabricate.interactable` Region Behaviour creation edge (issues 334 + 342). An empty `system`
  // is VALID-but-UNCONFIGURED since #342, so the create is ALLOWED and the behaviour is born inert.
  // AN INHERITED MARKER LINK IS NEUTRALISED HERE, region duplication cloning `linkedVisual` verbatim.
  Hooks.on('preCreateRegionBehavior', (document) => {
    try {
      // The decision seam always allows through now; it is referenced so the edge keeps one decision
      // point and a future cancellation policy has a home.
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
      // Defensive: a guard error must never block an unrelated behaviour creation.
      return;
    }
  });

  Hooks.on('chatMessage', (chatLog, message) => handleCraftChatCommand(fabricate, message));
}
