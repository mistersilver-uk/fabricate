/**
 * The Foundry edge of the region-first interactable model: one singleton wiring `dropCanvasData`,
 * the `tokenEnter`/`tokenExit` seam, the `controlToken` re-trigger and the "interact here"
 * keybinding to the pure modules that hold every decision. Spawning is GM-only, transaction-like.
 * The behaviour events run on EVERY connected client, so the prompt shows only where
 * {@link InteractableManager#_shouldPromptForEnter} says and the mutation routes to the active
 * GM — which is what stops N prompts and double-writes.
 */

import { getSetting, SETTING_KEYS } from '../config/settings.js';
import { resolvedComponentsFor, resolvedToolsFor } from '../systems/scopedEntityReads.js';
import { getFabricateAppClass, getInteractionPromptAppClass } from '../ui/appFactory.js';

import { promptDropEnvironment } from './environmentDialog.js';
import { resolveDropEnvironment } from './environmentResolution.js';
import { buildInteractableDragPayload } from './interactableDragPayload.js';
import {
  denialMessage,
  openGrant as openGrantLocally,
  requestActivation,
  validateAndGrant as validateActivationAndGrant,
} from './interactableGrant.js';
import { resolveItemUuidToTool } from './interactableItemResolution.js';
import {
  DEFAULT_INTERACTABLE_IMG,
  canControlActor,
  dropPoint,
  firstInteractableBehavior,
  gridSizeFrom,
  iconTextureFor,
  regionRectangleFor,
  screenCenterToScene,
  shouldPromptForEnter,
  tokenInsideRegion,
  viewCenterFrom,
} from './interactablePredicates.js';
import {
  classifyInteractableDrop,
  buildRegionSpawnRequest,
  parseInteractableSourceUuid,
} from './interactableResolution.js';
import { INTERACTABLE_SOCKET } from './interactableSocket.js';
import {
  interactHere,
  onRegionEnter as raiseEnterPrompt,
  onRegionExit as dismissExitPrompt,
  promptForTokenInsideRegion as promptInsideRegion,
  repromptAfterClose,
} from './regionEnterPrompt.js';
import {
  regionEnvironmentIdsAtPoint,
  interactableBehaviorsContainingToken,
} from './regionHitTest.js';
import { buildInteractableRegionFlags } from './regions/interactableDeletion.js';
import {
  buildInteractableBehaviorSystem,
  isInteractableRegionBehavior,
  buildLinkedVisualFlags,
} from './regions/interactableRegionFlags.js';

/** Client keybinding id for the "interact here" re-trigger. */
const INTERACT_KEYBINDING = 'fabricateInteractHere';

/**
 * The activation collaborators, each a function invoked where the manager's own `globalThis` read
 * used to happen. Nothing is resolved here: the singleton is built during page parse, before
 * `game`, `canvas`, `ui.notifications` or `game.time` exist, so a captured value is permanently
 * undefined in production and no test that installs its fakes first can see it.
 */
function promptCollaborators(manager) {
  return {
    getPromptAppClass: () => manager._getPromptAppClass?.(),
    currentUser: () => globalThis.game?.user,
    currentUserId: () => globalThis.game?.user?.id ?? null,
    viewedScene: () => globalThis.canvas?.scene,
    getScene: (sceneId) => globalThis.game?.scenes?.get?.(String(sceneId)),
    controlledTokens: () => globalThis.canvas?.tokens?.controlled ?? [],
    requestActivation: (behavior, ctx) => manager._requestActivation(behavior, ctx),
    behaviorsContainingToken: (token) =>
      interactableBehaviorsContainingToken({
        scene: globalThis.canvas?.scene,
        token,
        isInteractableBehavior: isInteractableRegionBehavior,
      }),
    promptForTokenInsideRegion: (token) => manager._promptForTokenInsideRegion(token),
  };
}

function grantCollaborators(manager) {
  return {
    getAppClass: () => manager._getAppClass?.(),
    resolveBehavior: (request) => manager._resolveBehavior(request),
    emit: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    isActiveGM: () => globalThis.game?.user === globalThis.game?.users?.activeGM,
    hasActiveGM: () => !!globalThis.game?.users?.activeGM,
    currentUserId: () => globalThis.game?.user?.id ?? null,
    worldTime: () => Number(globalThis.game?.time?.worldTime || 0),
    getUser: (userId) => globalThis.game?.users?.get?.(String(userId ?? '')),
    canControlActor: (userId, actorId) => manager._userCanControlActor(userId, actorId),
    sourceExists: (system) => manager._sourceExists(system),
    environmentExists: (environmentId) => manager._environmentExists(environmentId),
    tokenInside: (behavior, actorId, userId) =>
      manager._tokenInsideRegion(behavior, actorId, userId),
    resolutionDeps: () => manager._resolutionDeps(),
    notifyWarn: (message) => globalThis.ui?.notifications?.warn?.(message),
    localize: (key) => globalThis.game?.i18n?.localize?.(key),
    now: () => Date.now(),
    onGrantClose: (args) => manager._repromptAfterInteractableClose(args),
    validateAndGrant: (request) => manager.validateAndGrant(request),
    openGrant: (payload) => manager.openGrant(payload),
  };
}

class InteractableManager {
  constructor({
    getAppClass = getFabricateAppClass,
    getPromptAppClass = getInteractionPromptAppClass,
    regionEnvironmentIdsAtPoint: regionHitTest = regionEnvironmentIdsAtPoint,
    promptDropEnvironment: promptEnvironment = promptDropEnvironment,
  } = {}) {
    this._getAppClass = getAppClass;
    this._getPromptAppClass = getPromptAppClass;
    this._regionEnvironmentIdsAtPoint = regionHitTest;
    this._promptDropEnvironment = promptEnvironment;
    this._grantDeps = grantCollaborators(this);
    this._promptDeps = promptCollaborators(this);
    // Bind hook bodies once so they can be added/removed by identity.
    this._onDrop = this._onDrop.bind(this);
    this._onControlToken = this._onControlToken.bind(this);
  }

  /** Install the canvas hooks and the client keybinding. Idempotent. */
  register() {
    if (this._registered) return;
    const hooks = globalThis.Hooks;
    if (hooks?.on) {
      hooks.on('dropCanvasData', this._onDrop);
      // A token already INSIDE a region on scene load never fires `tokenEnter`, so re-raise the
      // prompt when the player controls one.
      hooks.on('controlToken', this._onControlToken);
    }
    this._registerKeybinding();
    this._registered = true;
  }

  /** Register "Fabricate: interact here". A no-op when the keybindings API is unavailable. */
  _registerKeybinding() {
    const keybindings = globalThis.game?.keybindings;
    if (typeof keybindings?.register !== 'function') return;
    try {
      keybindings.register('fabricate', INTERACT_KEYBINDING, {
        name: 'FABRICATE.Canvas.Interactable.Keybinding.Name',
        hint: 'FABRICATE.Canvas.Interactable.Keybinding.Hint',
        editable: [{ key: 'KeyE' }],
        onDown: () => {
          this._interactHere();
          return true;
        },
        restricted: false,
      });
    } catch {
      // Defensive: a keybinding registration must never break init.
    }
  }

  // --- Drop → Region + Behaviour + linked Tile --------------------------------

  /** `dropCanvasData`: false suppresses Foundry's drop (GM-only); undefined lets it through. */
  _onDrop(_canvas, data) {
    const classification = classifyInteractableDrop(data, this._resolutionDeps());
    if (!classification) return; // not ours — let Foundry handle it.

    // Interactable spawning is GM-only.
    if (globalThis.game?.user?.isGM !== true) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.GMOnlySpawn') ??
          'Only a GM can place Fabricate interactables on the canvas.'
      );
      return false; // suppress: we recognized it but cannot spawn.
    }

    const point = dropPoint(data);
    // The browser's "Region only" action carries `fabricate.visualMode:'none'`; a drag defaults
    // to 'marker'.
    const visualMode = data?.fabricate?.visualMode === 'none' ? 'none' : 'marker';
    if (classification.interactableType !== 'gatheringTask') {
      const spawnRequest = this._buildRegionSpawnRequest({ classification, point, visualMode });
      void this._spawnInteractableRegion(spawnRequest);
      return false;
    }

    // Alt held during the drop forces the GM dialog (override tiers 1 + 2).
    const forceDialog =
      data?.altKey === true || globalThis.game?.keyboard?.isModifierActive?.('Alt') === true;
    void this._spawnGatheringTask({ classification, point, forceDialog, visualMode });
    return false; // suppress Foundry's default item-drop handling.
  }

  /** Click-to-place a11y fallback: the same payload through {@link _onDrop} at the view centre. */
  placeInteractableAtViewCenter({
    interactableType,
    systemId,
    referenceId,
    visualMode = 'marker',
  } = {}) {
    const payload = buildInteractableDragPayload({
      interactableType,
      systemId,
      referenceId,
      visualMode,
    });
    if (!payload) return false;
    const center = this._viewCenter();
    const data = { ...payload, x: center.x, y: center.y };
    return this._onDrop(globalThis.canvas, data) === false;
  }

  /** The spawn request from a classified drop, resolving icon texture and grid size at the edge. */
  _buildRegionSpawnRequest({ classification, point, environmentId, visualMode = 'marker' } = {}) {
    return buildRegionSpawnRequest({
      classification,
      point,
      environmentId: environmentId ?? undefined,
      texture: this._resolveIconTexture(classification),
      width: this._gridSize(),
      height: this._gridSize(),
      gridSize: this._gridSize(),
      visualMode,
      buildBehaviorSystem: (spawn) => buildInteractableBehaviorSystem(spawn),
    });
  }

  /** Resolve a dropped task's environment by precedence and spawn it; a cancelled dialog aborts. */
  async _spawnGatheringTask({ classification, point, forceDialog, visualMode = 'marker' }) {
    const deps = this._resolutionDeps();
    const task = deps.getTask({
      systemId: classification.systemId,
      taskId: classification.referenceId,
    });
    const environments = this._systemEnvironments(classification.systemId);
    const environmentExists = (id) => environments.some((env) => String(env.id) === String(id));

    const scene = globalThis.canvas?.scene;
    const regionEnvironmentIds = this._regionEnvironmentIdsAtPoint({ scene, point });
    const resolution = resolveDropEnvironment({
      regionEnvironmentIds,
      defaultEnvironmentId: task?.defaultEnvironmentId ?? null,
      forceDialog,
      environmentExists,
    });

    let environmentId = resolution.environmentId;
    if (resolution.needsDialog) {
      environmentId = await this._promptDropEnvironment({
        environments,
        defaultEnvironmentId: task?.defaultEnvironmentId ?? '',
        localize: (key, fallback) => globalThis.game?.i18n?.localize?.(key) ?? fallback,
      });
      if (!environmentId) return null; // cancel ⇒ abort.
    }

    if (resolution.notify && environmentId) {
      const env = environments.find((candidate) => String(candidate.id) === String(environmentId));
      const name = env?.name || environmentId;
      const message =
        globalThis.game?.i18n?.format?.('FABRICATE.Canvas.Interactable.EnvironmentAutoResolved', {
          environment: name,
        }) ?? `Resource node placed in environment "${name}".`;
      globalThis.ui?.notifications?.info?.(message);
    }

    const spawnRequest = this._buildRegionSpawnRequest({
      classification,
      point,
      environmentId: environmentId ?? undefined,
      visualMode,
    });
    return this._spawnInteractableRegion(spawnRequest);
  }

  /** The environments of one crafting system, as `{ id, name }` rows. */
  _systemEnvironments(systemId) {
    const environments =
      globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    return (Array.isArray(environments) ? environments : [])
      .filter((env) => String(env?.craftingSystemId ?? '') === String(systemId))
      .map((env) => ({ id: String(env.id), name: String(env.name ?? env.id) }));
  }

  /**
   * Create the Region and its linked Tile, transaction-like: an orphan of either is deleted when
   * its partner fails, and once both exist the `linkedVisual` ref is written back so relink,
   * recreate and missing-policy can resolve it. No-throw; GM-notify on failure.
   */
  async _spawnInteractableRegion(spawnRequest) {
    if (!spawnRequest) return null;
    const scene = globalThis.canvas?.scene;
    if (!scene?.createEmbeddedDocuments) return null;

    const { region, behaviorSystem, tile } = spawnRequest;
    const { x, y, width, height } = regionRectangleFor({
      tile,
      region,
      gridSize: this._gridSize(),
    });

    let regionDoc;
    try {
      const [created] = await scene.createEmbeddedDocuments('Region', [
        {
          name: region.name,
          shapes: [{ type: 'rectangle', x, y, width, height }],
          behaviors: [{ type: 'fabricate.interactable', system: behaviorSystem }],
          // Stamp region-level ownership: Fabricate CREATED this region, so its delete may take
          // the whole region. A PROMOTED region never gets this flag (issue 533).
          flags: buildInteractableRegionFlags(),
        },
      ]);
      regionDoc = created ?? null;
    } catch {
      regionDoc = null;
    }
    if (!regionDoc) {
      this._notifySpawnFailure();
      return null;
    }

    const behavior = firstInteractableBehavior(regionDoc);
    const regionUuid = typeof regionDoc?.uuid === 'string' ? regionDoc.uuid : null;
    const behaviorId = behavior?.id ?? behavior?._id ?? null;

    // Region-only: the builder returns `tile: null`, and the behaviour already carries
    // `linkedVisual.mode='none'` — there is no Tile, no orphan and no ref to write back.
    if (!tile) {
      return regionDoc;
    }

    // Create the linked Tile carrying the reverse flags; on failure delete the orphan Region.
    let tileDoc = null;
    if (regionUuid && behaviorId) {
      try {
        const { fabricate } = buildLinkedVisualFlags({ regionUuid, behaviorId });
        const tileData = {
          texture: { src: tile?.texture?.src || DEFAULT_INTERACTABLE_IMG },
          x: Number(tile?.x ?? 0),
          y: Number(tile?.y ?? 0),
          width: Number(tile?.width ?? this._gridSize()),
          height: Number(tile?.height ?? this._gridSize()),
          flags: { fabricate },
        };
        const TileDocument =
          globalThis.foundry?.documents?.TileDocument ?? globalThis.CONFIG?.Tile?.documentClass;
        if (TileDocument?.create) {
          tileDoc = (await TileDocument.create(tileData, { parent: scene })) ?? null;
        } else if (scene.createEmbeddedDocuments) {
          const [created] = await scene.createEmbeddedDocuments('Tile', [tileData]);
          tileDoc = created ?? null;
        }
      } catch {
        tileDoc = null;
      }
    }

    if (!tileDoc) {
      // Roll back the orphan Region so the failed spawn leaves no trace.
      try {
        await regionDoc.delete?.();
      } catch {
        /* tolerate. */
      }
      this._notifySpawnFailure();
      return null;
    }

    // Write the ref back. If THIS fails the interactable still works region-only, so keep the
    // orphan Tile — it points back at the region — rather than tearing down a working one.
    const tileUuid = typeof tileDoc?.uuid === 'string' ? tileDoc.uuid : null;
    if (behavior?.update && tileUuid) {
      try {
        await behavior.update({
          system: { linkedVisual: { uuid: tileUuid, documentName: 'Tile' } },
        });
      } catch {
        // Defensive: a working region-only interactable is acceptable.
      }
    }

    return regionDoc;
  }

  _notifySpawnFailure() {
    globalThis.ui?.notifications?.warn?.(
      globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.SpawnFailed') ??
        'Failed to place the Fabricate interactable on the canvas.'
    );
  }

  // --- Activation: region enter / exit ---------------------------------------

  /** `tokenEnter` seam, on every client: raise the Interact prompt where it belongs. */
  onRegionEnter(event, behavior) {
    raiseEnterPrompt(event, behavior, this._promptDeps);
  }

  /** `tokenExit` seam: dismiss by ref on every client, however the token left. */
  onRegionExit(event, behavior) {
    dismissExitPrompt(event, behavior, this._promptDeps);
  }

  /** `controlToken` re-trigger for a token already inside, which `tokenEnter` never fires for. */
  _onControlToken(tokenPlaceable, controlled) {
    if (controlled !== true) return;
    this._promptForTokenInsideRegion(tokenPlaceable);
  }

  _interactHere() {
    interactHere(this._promptDeps);
  }

  _promptForTokenInsideRegion(tokenPlaceable) {
    promptInsideRegion(tokenPlaceable, this._promptDeps);
  }

  _repromptAfterInteractableClose(args = {}) {
    repromptAfterClose(args, this._promptDeps);
  }

  // --- Activation: request / validate-grant / open ---------------------------

  _requestActivation(behavior, ctx = {}) {
    requestActivation(behavior, ctx, this._grantDeps);
  }

  async validateAndGrant(request) {
    return validateActivationAndGrant(request, this._grantDeps);
  }

  openGrant(payload) {
    openGrantLocally(payload, this._grantDeps);
  }

  /** Local-user body for `interactableActivationDenied`: warn WHY. No-throw. */
  notifyActivationDenied(reason) {
    this._grantDeps.notifyWarn(denialMessage(reason, this._grantDeps));
  }

  // --- Foundry-edge helpers (activation) -------------------------------------

  _resolveBehavior({ sceneId, regionId, behaviorId } = {}) {
    const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
    const region = scene?.regions?.get?.(String(regionId ?? ''));
    return region?.behaviors?.get?.(String(behaviorId ?? '')) ?? null;
  }

  _shouldPromptForEnter(event, token) {
    return shouldPromptForEnter({ event, token, currentUser: globalThis.game?.user });
  }

  _userCanControlActor(userId, actorId) {
    if (!actorId) return false;
    return canControlActor({
      actor: globalThis.game?.actors?.get?.(String(actorId)) ?? null,
      user: globalThis.game?.users?.get?.(String(userId ?? '')) ?? null,
    });
  }

  _sourceExists(system) {
    const parsed = parseInteractableSourceUuid(system?.sourceUuid);
    if (!parsed) return false;
    const deps = this._resolutionDeps();
    if (parsed.interactableType === 'tool') {
      return deps.getTool({ systemId: parsed.systemId, toolId: parsed.referenceId }) != null;
    }
    return deps.getTask({ systemId: parsed.systemId, taskId: parsed.referenceId }) != null;
  }

  _environmentExists(environmentId) {
    if (!environmentId) return false;
    const environments =
      globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    return (Array.isArray(environments) ? environments : []).some(
      (env) => String(env?.id) === String(environmentId)
    );
  }

  /**
   * Is the actor's token still inside? Runs on the ACTIVE GM's client for every player request, so
   * it may execute against a scene that client is not viewing and nothing canvas-rendered may be
   * consulted (`data-models/spec.md` § fabricate.interactable Region Behaviour, requirement 6).
   */
  _tokenInsideRegion(behavior, actorId, _userId) {
    return tokenInsideRegion({ behavior, actorId });
  }

  // --- Foundry-edge helpers (placement) --------------------------------------

  _viewCenter() {
    return viewCenterFrom({
      stageCenter: globalThis.canvas?.stage ? this._screenCenterToScene() : null,
      dimensions: globalThis.canvas?.scene?.dimensions ?? globalThis.canvas?.dimensions ?? null,
    });
  }

  _screenCenterToScene() {
    return screenCenterToScene({
      stage: globalThis.canvas?.stage,
      PointClass: globalThis.PIXI?.Point,
      width: globalThis.window?.innerWidth ?? 0,
      height: globalThis.window?.innerHeight ?? 0,
    });
  }

  _resolveIconTexture(classification) {
    const systemManager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
    const system = systemManager?.getSystem?.(classification?.systemId);
    return iconTextureFor({ classification, components: resolvedComponentsFor(system) });
  }

  _gridSize() {
    return gridSizeFrom(
      globalThis.canvas?.scene?.grid?.size,
      globalThis.canvas?.grid?.size,
      globalThis.canvas?.dimensions?.size
    );
  }

  _resolutionDeps() {
    const systemManager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
    return {
      getTool: ({ systemId, toolId }) => {
        const system = systemManager?.getSystem?.(systemId);
        return resolvedToolsFor(system).find((tool) => tool?.id === toolId) ?? null;
      },
      getTask: ({ systemId, taskId }) => {
        const tasks = this._readLibraryTasks(systemId);
        return tasks.find((task) => task?.id === taskId) ?? null;
      },
      resolveItemUuidToTool: (uuid) =>
        resolveItemUuidToTool(uuid, {
          resolveItem: (id) => globalThis.fromUuidSync?.(id) ?? null,
          getSystems: () => systemManager?.getSystems?.() ?? [],
        }),
    };
  }

  _readLibraryTasks(systemId) {
    if (!systemId) return [];
    const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  _registered = false;
}

/** The shared InteractableManager singleton. */
const instance = new InteractableManager();

// Expose the singleton as a static so callers use `InteractableManager.instance.register()`.
InteractableManager.instance = instance;

export { InteractableManager };

export default InteractableManager;

export { parseInteractableSourceUuid } from './interactableResolution.js';
