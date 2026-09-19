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
import { resolveItemUuidToTool } from './interactableItemResolution.js';
import {
  DEFAULT_INTERACTABLE_IMG,
  canControlActor,
  dropPoint,
  eventToken,
  firstInteractableBehavior,
  gridSizeFrom,
  iconTextureFor,
  ownsToken,
  regionRectangleFor,
  sceneTokenDocs,
  screenCenterToScene,
  shouldPromptForEnter,
  tokenInsideRegion,
  viewCenterFrom,
} from './interactablePredicates.js';
import {
  classifyInteractableDrop,
  buildRegionSpawnRequest,
  buildActiveCanvasTool,
  parseInteractableSourceUuid,
} from './interactableResolution.js';
import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_ACTIVATION_GRANTED,
  INTERACTABLE_ACTIVATION_DENIED,
} from './interactableSocket.js';
import {
  regionEnvironmentIdsAtPoint,
  interactableBehaviorsContainingToken,
  selectRepromptTokenDoc,
} from './regionHitTest.js';
import { buildInteractableRegionFlags } from './regions/interactableDeletion.js';
import {
  shouldPromptOnEnter,
  buildActivationRequest,
  validateActivationRequest,
  describeGrant,
  activationDenialMessageKey,
} from './regions/interactableRegionActivation.js';
import {
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
  isInteractableRegionBehavior,
  buildLinkedVisualFlags,
} from './regions/interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from './regions/interactableRegionNodeAdapter.js';

/** Client keybinding id for the "interact here" re-trigger. */
const INTERACT_KEYBINDING = 'fabricateInteractHere';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
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

  /**
   * `tokenEnter` seam, on every client. Prompts per {@link _shouldPromptForEnter} when the
   * behaviour is `regionEnter`-triggered and currently visible.
   */
  onRegionEnter(event, behavior) {
    const system = readInteractableBehaviorSystem(behavior);
    if (!system) return;
    if (system.activation?.trigger !== 'regionEnter') return;

    const token = eventToken(event);
    if (!this._shouldPromptForEnter(event, token)) return;

    // Gate the PROMPT on VISIBILITY, not eligibility: a LOCKED interactable still prompts, and
    // Interact routes the localized denial. Only DISABLED or HIDDEN suppresses it.
    if (!shouldPromptOnEnter(system)) return;

    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return;
    const actorId = token?.actor?.id ?? token?.actorId ?? null;

    const PromptApp = this._getPromptAppClass?.();
    void PromptApp?.show?.({
      behaviorRef: `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`,
      name: system.name || '',
      promptText: system.presentation?.promptText ?? null,
      onInteract: () =>
        this._requestActivation(behavior, {
          actorId,
          userId: globalThis.game?.user?.id ?? null,
          activationSource: 'regionEnter',
        }),
    });
  }

  /**
   * `tokenExit` seam: dismiss UNCONDITIONALLY. `PromptApp.dismiss(ref)` is ref-matched and a no-op
   * elsewhere, so the showing clients drop it however the token left — the stale-prompt case where
   * a GM staged a player's token and the player walks out.
   */
  onRegionExit(_event, behavior) {
    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return;
    const PromptApp = this._getPromptAppClass?.();
    void PromptApp?.dismiss?.(`${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`);
  }

  /** `controlToken` re-trigger for a token already inside, which `tokenEnter` never fires for. */
  _onControlToken(tokenPlaceable, controlled) {
    if (controlled !== true) return;
    this._promptForTokenInsideRegion(tokenPlaceable);
  }

  /** Keybinding "interact here": prompt for the controlled token's eligible region. */
  _interactHere() {
    const controlled = globalThis.canvas?.tokens?.controlled ?? [];
    const token = (Array.isArray(controlled) ? controlled : [])[0] ?? null;
    if (!token) return;
    this._promptForTokenInsideRegion(token);
  }

  /** Shared re-trigger body: {@link onRegionEnter} driven by control rather than a region event. */
  _promptForTokenInsideRegion(tokenPlaceable) {
    const tokenDoc = tokenPlaceable?.document ?? tokenPlaceable;
    if (!tokenDoc) return;
    if (!ownsToken(tokenDoc, { isGM: globalThis.game?.user?.isGM === true })) return;
    const scene = globalThis.canvas?.scene;
    const matches = interactableBehaviorsContainingToken({
      scene,
      token: tokenPlaceable,
      isInteractableBehavior: isInteractableRegionBehavior,
    });
    for (const { behavior } of matches) {
      const system = readInteractableBehaviorSystem(behavior);
      if (!system || system.activation?.trigger !== 'regionEnter') continue;
      // VISIBILITY gate, as in onRegionEnter: a locked interactable still re-prompts.
      if (!shouldPromptOnEnter(system)) continue;
      const ref = identifyRegionBehaviorRef(behavior);
      if (!ref) continue;
      const actorId = tokenDoc?.actor?.id ?? tokenDoc?.actorId ?? null;
      const PromptApp = this._getPromptAppClass?.();
      void PromptApp?.show?.({
        behaviorRef: `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`,
        name: system.name || '',
        promptText: system.presentation?.promptText ?? null,
        onInteract: () =>
          this._requestActivation(behavior, {
            actorId,
            userId: globalThis.game?.user?.id ?? null,
            activationSource: 'regionEnter',
          }),
      });
      return; // one prompt at a time.
    }
  }

  // --- Activation: request / validate-grant / open ---------------------------

  /** Grant locally (active GM) or emit for the active GM; with none connected, warn and abort. */
  _requestActivation(behavior, ctx = {}) {
    const system = readInteractableBehaviorSystem(behavior);
    const ref = identifyRegionBehaviorRef(behavior);
    if (!system || !ref) return;

    const request = buildActivationRequest(system, {
      regionId: ref.regionId,
      behaviorId: ref.behaviorId,
      sceneId: ref.sceneId,
      actorId: ctx.actorId ?? null,
      userId: ctx.userId ?? globalThis.game?.user?.id ?? null,
      activationSource: ctx.activationSource ?? 'regionEnter',
      ts: Date.now(),
    });

    if (isActiveGM()) {
      void this.validateAndGrant(request);
      return;
    }
    if (!globalThis.game?.users?.activeGM) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.NoActiveGM') ??
          'A GM must be online to gather here.'
      );
      return;
    }
    globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, request);
  }

  /**
   * Active-GM body for `interactableActivate`: resolve the target, compute the validation
   * collaborators, run {@link validateActivationRequest}, and on a pass emit the grant. No-throw.
   */
  async validateAndGrant(request) {
    if (!request || typeof request !== 'object') return false;
    const behavior = this._resolveBehavior(request);
    const system = readInteractableBehaviorSystem(behavior);
    if (!system) {
      // No behaviour system resolved (a deleted region). Tell the requester why, generically.
      this._routeActivationDenied(request.userId, null);
      return false;
    }

    const now = Number(globalThis.game?.time?.worldTime || 0);
    // `isGM` is the REQUESTING user's override status, not the validating GM's, so the
    // actor-control gate cannot be bypassed by a non-owning, non-GM player.
    const isGM = globalThis.game?.users?.get?.(String(request.userId ?? ''))?.isGM === true;
    const canControlActor = this._userCanControlActor(request.userId, request.actorId);
    const sourceExists = this._sourceExists(system);
    const environmentExists =
      system.interactableType === 'gatheringTask'
        ? this._environmentExists(system.environmentId)
        : true;
    const tokenInside = this._tokenInsideRegion(behavior, request.actorId, request.userId);
    const validation = validateActivationRequest(request, {
      behaviorSystem: system,
      now,
      isGM,
      canControlActor,
      sourceExists,
      environmentExists,
      tokenInside,
    });
    if (!validation.ok) {
      // Tell the requesting user WHY (localized) instead of failing silently.
      this._routeActivationDenied(request.userId, validation.reason);
      return false;
    }

    const grant = describeGrant(system);
    if (!grant) return false;

    // For a tool, resolve the live activeCanvasTool to thread into the grant.
    if (system.interactableType === 'tool') {
      const tool = this._resolutionDeps().getTool({
        systemId: system.systemId,
        toolId: system.toolId,
      });
      const activeCanvasTool = buildActiveCanvasTool({
        systemId: system.systemId,
        toolId: system.toolId,
        tool,
      });
      if (!activeCanvasTool) {
        // Say WHY. A bare `return false` here answered a station whose Tool no longer resolves
        // with NOTHING AT ALL, which is what hid the issue-1119 defect: the station places and
        // renders perfectly and only dies on activation.
        this._routeActivationDenied(request.userId, 'SOURCE_MISSING');
        return false;
      }
      grant.context = { ...grant.context, activeCanvasTool };
    }

    const payload = {
      action: INTERACTABLE_ACTIVATION_GRANTED,
      userId: request.userId,
      behaviorId: request.behaviorId,
      requestId: request.ts ? String(request.ts) : null,
      grant: {
        tab: grant.tab,
        context: grant.context,
        ref: {
          sceneId: request.sceneId,
          regionId: request.regionId,
          behaviorId: request.behaviorId,
        },
        interactableType: system.interactableType,
        environmentId: system.environmentId ?? null,
        taskId: system.taskId ?? null,
        // The interacting actor is the default selected actor in the granted session; already
        // ownership-validated above.
        actorId: request.actorId ?? null,
      },
    };
    // The requester opens the session locally; when the GM IS the requester, open it here, since
    // a socket emit never reaches its emitter.
    if (globalThis.game?.user?.id === request.userId) {
      this.openGrant(payload);
    } else {
      globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload);
    }
    return true;
  }

  /**
   * Local-user body for `interactableActivationGranted`: Crafting for a tool, Gathering scoped to
   * `{ environmentId, taskId }` for a task. `grant.ref` is threaded through as `interactableRef`
   * so an UNLINKED task decrements its own pool rather than the environment's (issue 302).
   */
  openGrant(payload) {
    const grant = payload?.grant;
    if (!grant || typeof grant !== 'object') {
      return;
    }
    const AppClass = this._getAppClass?.();
    if (!AppClass?.show) {
      return;
    }

    // The interacting actor becomes the default-selected actor in the opened session's top bar.
    const actorId = grant.actorId ?? null;

    if (grant.interactableType === 'tool') {
      const activeCanvasTool = grant.context?.activeCanvasTool ?? null;
      if (!activeCanvasTool) {
        return;
      }
      // A Tool station belongs to crafting: inject the station tool as virtual-present so
      // prerequisite checks pass without the actor owning the item.
      void AppClass.show('crafting', { activeCanvasTool, actorId });
      return;
    }

    if (grant.interactableType === 'gatheringTask') {
      const environmentId = grant.environmentId ?? grant.context?.environmentId ?? null;
      const taskId = grant.taskId ?? grant.context?.taskId ?? null;
      if (!environmentId || !taskId) {
        return;
      }
      // Always passed through: the engine falls back to the environment scope when the behaviour
      // is environment-scoped or gone (issue 302).
      const interactableRef =
        grant.ref && typeof grant.ref === 'object'
          ? {
              sceneId: grant.ref.sceneId ?? null,
              regionId: grant.ref.regionId ?? null,
              behaviorId: grant.ref.behaviorId ?? null,
            }
          : null;
      // On close, re-raise the prompt if the token is STILL inside, so a large region need not be
      // re-entered and an accidental close is recoverable. `_promptForTokenInsideRegion` re-applies
      // the hit-test, guard and ref-matching, so a token that has left is not re-prompted (332).
      const gatheringOptions = {
        environmentId,
        taskId,
        actorId,
        interactableRef,
        onClose: () => this._repromptAfterInteractableClose({ ref: grant.ref, actorId }),
      };
      Promise.resolve(AppClass.show('gathering', gatheringOptions)).catch(() => {});
    }
  }

  /**
   * Re-raise the prompt after a gathering session closes, iff the token is still inside (issue
   * 332), through {@link _promptForTokenInsideRegion}. No-throw: a close-handler error must never
   * break the app close.
   */
  _repromptAfterInteractableClose({ ref, actorId } = {}) {
    try {
      if (!ref || typeof ref !== 'object') return;
      const sceneId = ref.sceneId ?? null;
      if (!sceneId || !actorId) return;
      const scene =
        globalThis.game?.scenes?.get?.(String(sceneId)) ??
        (String(globalThis.canvas?.scene?.id ?? '') === String(sceneId)
          ? globalThis.canvas?.scene
          : null);
      // Only re-prompt for the scene being viewed; the toast and hit-test target the active canvas.
      if (!scene || String(globalThis.canvas?.scene?.id ?? '') !== String(scene.id ?? sceneId)) {
        return;
      }
      const tokenDoc = selectRepromptTokenDoc(sceneTokenDocs(scene), actorId);
      if (!tokenDoc) return;
      // Prefer the live placeable for its canvas centre; the document still resolves one.
      this._promptForTokenInsideRegion(tokenDoc.object ?? tokenDoc);
    } catch {
      // Defensive: never let a re-prompt failure break the window close.
    }
  }

  /** Route a DENIAL as grants are routed: notify here when the GM is the requester, else emit. */
  _routeActivationDenied(userId, reason) {
    if (globalThis.game?.user?.id === userId) {
      this.notifyActivationDenied(reason);
      return;
    }
    globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
      action: INTERACTABLE_ACTIVATION_DENIED,
      userId: userId ?? null,
      reason: reason ?? null,
    });
  }

  /** Local-user body for `interactableActivationDenied`: warn WHY. No-throw. */
  notifyActivationDenied(reason) {
    const key = activationDenialMessageKey(reason);
    const localize = globalThis.game?.i18n?.localize;
    const message = typeof localize === 'function' ? localize.call(globalThis.game.i18n, key) : key;
    globalThis.ui?.notifications?.warn?.(message);
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
