/**
 * Canvas Interactable foundation (region-first model).
 *
 * Singleton that wires Foundry canvas hooks + the `fabricate.interactable` Region
 * Behaviour event seam to the pure interactable logic:
 *  - `dropCanvasData` intercepts a dropped Fabricate Tool / Gathering Task,
 *    suppresses the default drop, and spawns a Scene REGION carrying a nested
 *    `fabricate.interactable` behaviour PLUS a linked Tile marker (no actor, no
 *    sheet). Spawning is GM-only and transaction-like (an orphan Region/Tile is
 *    cleaned up if its partner fails to create).
 *  - the behaviour's `static events.tokenEnter`/`tokenExit` run on EVERY connected
 *    client and delegate here to {@link InteractableManager#onRegionEnter} /
 *    {@link InteractableManager#onRegionExit}. The prompt is shown only on the
 *    controlling player's client (avoiding N prompts); the mutation routes to the
 *    active GM (avoiding double-writes).
 *  - a `controlToken` re-trigger (Foundry's `tokenEnter` does NOT fire for a token
 *    already inside on scene load) and a client keybinding "Fabricate: interact
 *    here" both re-raise the prompt for an eligible region the controlled token
 *    is standing in.
 *
 * All decision logic stays in the pure modules (`interactableResolution.js`,
 * `interactableRegionActivation.js`, `interactableRegionFlags.js`,
 * `linkedInteractableVisual.js`, `regionHitTest.js`); the hook / event bodies
 * here are the thin Foundry edge.
 *
 * The branch carries ONLY the region-first implementation: the abandoned
 * tile-CLICK machinery (stage double-click listener, hover/permission wraps,
 * tile pointer enablement, per-tile node adapter, tile world-time pass) and its
 * modules were removed in Phase 1d.
 */

import {
  classifyInteractableDrop,
  buildRegionSpawnRequest,
  buildActiveCanvasTool,
  parseInteractableSourceUuid
} from './interactableResolution.js';
import { resolveItemUuidToTool } from './interactableItemResolution.js';
import { buildInteractableDragPayload } from './interactableDragPayload.js';
import {
  buildInteractableBehaviorSystem,
  readInteractableBehaviorSystem,
  isInteractableRegionBehavior,
  buildLinkedVisualFlags
} from './regions/interactableRegionFlags.js';
import {
  evaluateActivationEligibility,
  buildActivationRequest,
  validateActivationRequest,
  describeGrant,
  activationDenialMessageKey
} from './regions/interactableRegionActivation.js';
import {
  identifyRegionBehaviorRef
} from './regions/interactableRegionNodeAdapter.js';
import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_ACTIVATE,
  INTERACTABLE_ACTIVATION_GRANTED,
  INTERACTABLE_ACTIVATION_DENIED
} from './interactableSocket.js';
import { resolveDropEnvironment } from './environmentResolution.js';
import { regionEnvironmentIdsAtPoint, interactableBehaviorsContainingToken } from './regionHitTest.js';
import { promptDropEnvironment } from './environmentDialog.js';
import { getFabricateAppClass, getInteractionPromptAppClass } from '../ui/appFactory.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';
/** Fallback tile image when no tool/task icon can be resolved. */
const DEFAULT_INTERACTABLE_IMG = 'icons/svg/item-bag.svg';

/** Client keybinding id for the "interact here" re-trigger. */
const INTERACT_KEYBINDING = 'fabricateInteractHere';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
}

class InteractableManager {
  /**
   * @param {object} [deps]
   * @param {() => Function} [deps.getAppClass] Resolver for the Fabricate app class
   *   (defaults to {@link getFabricateAppClass}).
   * @param {() => Function} [deps.getPromptAppClass] Resolver for the prompt app
   *   class (defaults to {@link getInteractionPromptAppClass}).
   * @param {(args: {scene: object, point: object}) => string[]} [deps.regionEnvironmentIdsAtPoint]
   * @param {(args: object) => Promise<string|null>} [deps.promptDropEnvironment]
   */
  constructor({
    getAppClass = getFabricateAppClass,
    getPromptAppClass = getInteractionPromptAppClass,
    regionEnvironmentIdsAtPoint: regionHitTest = regionEnvironmentIdsAtPoint,
    promptDropEnvironment: promptEnvironment = promptDropEnvironment
  } = {}) {
    this._registered = false;
    this._getAppClass = getAppClass;
    this._getPromptAppClass = getPromptAppClass;
    this._regionEnvironmentIdsAtPoint = regionHitTest;
    this._promptDropEnvironment = promptEnvironment;
    // Bind hook bodies once so they can be added/removed by identity.
    this._onDrop = this._onDrop.bind(this);
    this._onControlToken = this._onControlToken.bind(this);
  }

  /**
   * Install the region-first canvas hooks: the `dropCanvasData` interception
   * (now spawns a Region + behaviour + linked Tile) and the `controlToken`
   * re-trigger, plus the client keybinding. Idempotent.
   */
  register() {
    if (this._registered) return;
    const hooks = globalThis.Hooks;
    if (hooks?.on) {
      hooks.on('dropCanvasData', this._onDrop);
      // Re-trigger: a token already INSIDE an interactable region when the scene
      // loads never fires `tokenEnter`, so re-raise the prompt when the player
      // controls such a token.
      hooks.on('controlToken', this._onControlToken);
    }
    this._registerKeybinding();
    this._registered = true;
  }

  /**
   * Register the client keybinding "Fabricate: interact here" which re-raises the
   * prompt for an eligible region the controlled token stands in. Defensive — a
   * no-op when the keybindings API is unavailable.
   */
  _registerKeybinding() {
    const keybindings = globalThis.game?.keybindings;
    if (typeof keybindings?.register !== 'function') return;
    try {
      keybindings.register('fabricate', INTERACT_KEYBINDING, {
        name: 'FABRICATE.Canvas.Interactable.Keybinding.Name',
        hint: 'FABRICATE.Canvas.Interactable.Keybinding.Hint',
        editable: [{ key: 'KeyE' }],
        onDown: () => { this._interactHere(); return true; },
        restricted: false
      });
    } catch (_error) {
      // Defensive: a keybinding registration must never break init.
    }
  }

  // --- Drop → Region + Behaviour + linked Tile --------------------------------

  /**
   * `dropCanvasData` handler. Returns `false` to suppress Foundry's default drop
   * when the payload is a Fabricate interactable (GM-only); returns `undefined`
   * otherwise so Foundry handles the drop normally.
   *
   * @param {object} canvas
   * @param {object} data
   * @returns {boolean|undefined}
   */
  _onDrop(canvas, data) {
    const classification = classifyInteractableDrop(data, this._resolutionDeps());
    if (!classification) return undefined; // not ours — let Foundry handle it.

    // Interactable spawning is GM-only.
    if (globalThis.game?.user?.isGM !== true) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.GMOnlySpawn')
        ?? 'Only a GM can place Fabricate interactables on the canvas.'
      );
      return false; // suppress: we recognized it but cannot spawn.
    }

    const point = this._dropPoint(canvas, data);
    // Region-only (no marker): the browser's "Region only" action carries
    // `fabricate.visualMode:'none'`. A normal drag/drop defaults to 'marker'.
    const visualMode = data?.fabricate?.visualMode === 'none' ? 'none' : 'marker';
    if (classification.interactableType !== 'gatheringTask') {
      const spawnRequest = this._buildRegionSpawnRequest({ classification, point, visualMode });
      void this._spawnInteractableRegion(spawnRequest);
      return false;
    }

    // Alt held during the drop forces the GM dialog (override tiers 1 + 2).
    const forceDialog = data?.altKey === true || globalThis.game?.keyboard?.isModifierActive?.('Alt') === true;
    void this._spawnGatheringTask({ classification, point, forceDialog, visualMode });
    return false; // suppress Foundry's default item-drop handling.
  }

  /**
   * Click-to-place a11y fallback for the Interactable browser app: synthesize the
   * same drop payload and route it through {@link _onDrop} at the scene's view
   * center, reusing the GM gate, classification, and env-resolution precedence.
   *
   * @param {object} params
   * @param {'tool'|'gatheringTask'} params.interactableType
   * @param {string} params.systemId
   * @param {string} params.referenceId
   * @param {'marker'|'none'} [params.visualMode]  'none' ⇒ region-only (no marker).
   * @returns {boolean}
   */
  placeInteractableAtViewCenter({ interactableType, systemId, referenceId, visualMode = 'marker' } = {}) {
    const payload = buildInteractableDragPayload({ interactableType, systemId, referenceId, visualMode });
    if (!payload) return false;
    const center = this._viewCenter();
    const data = { ...payload, x: center.x, y: center.y };
    return this._onDrop(globalThis.canvas, data) === false;
  }

  /**
   * Build the pure region-spawn request from a classified drop, resolving the
   * icon texture + grid size at the edge and injecting the behaviour-system
   * builder.
   *
   * @param {object} params
   * @param {object} params.classification
   * @param {{x:number,y:number}} params.point
   * @param {string} [params.environmentId]
   * @param {'marker'|'none'} [params.visualMode]  'none' ⇒ region-only (no Tile).
   * @returns {object|null}
   */
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
      buildBehaviorSystem: (spawn) => buildInteractableBehaviorSystem(spawn)
    });
  }

  /**
   * Resolve a dropped gathering task's environment via the precedence chain and
   * spawn its region. Precedence: Scene Region auto-detect → task default → GM
   * dialog. A cancelled dialog aborts the spawn.
   *
   * @param {object} args
   * @returns {Promise<object|null>}
   */
  async _spawnGatheringTask({ classification, point, forceDialog, visualMode = 'marker' }) {
    const deps = this._resolutionDeps();
    const task = deps.getTask({ systemId: classification.systemId, taskId: classification.referenceId });
    const environments = this._systemEnvironments(classification.systemId);
    const environmentExists = (id) => environments.some((env) => String(env.id) === String(id));

    const scene = globalThis.canvas?.scene;
    const regionEnvironmentIds = this._regionEnvironmentIdsAtPoint({ scene, point });
    const resolution = resolveDropEnvironment({
      regionEnvironmentIds,
      defaultEnvironmentId: task?.defaultEnvironmentId ?? null,
      forceDialog,
      environmentExists
    });

    let environmentId = resolution.environmentId;
    if (resolution.needsDialog) {
      environmentId = await this._promptDropEnvironment({
        environments,
        defaultEnvironmentId: task?.defaultEnvironmentId ?? '',
        localize: (key, fallback) => globalThis.game?.i18n?.localize?.(key) ?? fallback
      });
      if (!environmentId) return null; // cancel ⇒ abort.
    }

    if (resolution.notify && environmentId) {
      const env = environments.find((candidate) => String(candidate.id) === String(environmentId));
      const name = env?.name || environmentId;
      const message = (globalThis.game?.i18n?.format?.(
        'FABRICATE.Canvas.Interactable.EnvironmentAutoResolved',
        { environment: name }
      )) ?? `Resource node placed in environment "${name}".`;
      globalThis.ui?.notifications?.info?.(message);
    }

    const spawnRequest = this._buildRegionSpawnRequest({
      classification,
      point,
      environmentId: environmentId ?? undefined,
      visualMode
    });
    return this._spawnInteractableRegion(spawnRequest);
  }

  /**
   * The environments of one crafting system, as `{ id, name }` rows.
   *
   * @param {string} systemId
   * @returns {Array<{ id: string, name: string }>}
   */
  _systemEnvironments(systemId) {
    const environments = globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    return (Array.isArray(environments) ? environments : [])
      .filter((env) => String(env?.craftingSystemId ?? '') === String(systemId))
      .map((env) => ({ id: String(env.id), name: String(env.name ?? env.id) }));
  }

  /**
   * Create the Region (with the nested `fabricate.interactable` behaviour) PLUS
   * the linked Tile marker, transaction-like: if the Tile create fails after the
   * Region exists, the orphan Region is deleted (and vice-versa). After both
   * exist, the behaviour's `linkedVisual.{uuid,documentName}` is written back so
   * the marker can be resolved (relink / recreate / missing-policy). No-throw;
   * GM-notify on failure.
   *
   * @param {object} spawnRequest  Result of {@link buildRegionSpawnRequest}.
   * @returns {Promise<object|null>} The created Region document, or null.
   */
  async _spawnInteractableRegion(spawnRequest) {
    if (!spawnRequest) return null;
    const scene = globalThis.canvas?.scene;
    if (!scene?.createEmbeddedDocuments) return null;

    const { region, behaviorSystem, tile } = spawnRequest;
    // The region area and the linked Tile marker must OVERLAY so a player walking
    // onto the visible marker is inside the region. The two anchor DIFFERENTLY in
    // Foundry V13 (empirically confirmed against live bounds): a Tile renders
    // CENTERED on its stored `x/y` (`tile.object.bounds.x === doc.x - width/2`),
    // while a Region rectangle SHAPE renders TOP-LEFT at its stored `x/y`. So when
    // a marker exists, the region rectangle's top-left must be the tile's top-left
    // — i.e. `tile.x - tile.width/2` — to cover the tile's footprint
    // (`[tile.x - w/2 .. tile.x + w/2]`). Anchoring the region at `tile.x` would
    // shift it half a tile down-right of the marker. For a region-only interactable
    // (no tile) the pure builder's already-centered region shape is used directly.
    const { x, y, width, height } = tile
      ? {
          x: Number(tile.x ?? 0) - Number(tile.width ?? this._gridSize()) / 2,
          y: Number(tile.y ?? 0) - Number(tile.height ?? this._gridSize()) / 2,
          width: Number(tile.width ?? region.shape?.width ?? this._gridSize()),
          height: Number(tile.height ?? region.shape?.height ?? this._gridSize())
        }
      : {
          x: Number(region.shape?.x ?? 0),
          y: Number(region.shape?.y ?? 0),
          width: Number(region.shape?.width ?? this._gridSize()),
          height: Number(region.shape?.height ?? this._gridSize())
        };

    let regionDoc = null;
    try {
      const [created] = await scene.createEmbeddedDocuments('Region', [{
        name: region.name,
        shapes: [{ type: 'rectangle', x, y, width, height }],
        behaviors: [{ type: 'fabricate.interactable', system: behaviorSystem }]
      }]);
      regionDoc = created ?? null;
    } catch (_error) {
      regionDoc = null;
    }
    if (!regionDoc) {
      this._notifySpawnFailure();
      return null;
    }

    const behavior = this._firstInteractableBehavior(regionDoc);
    const regionUuid = typeof regionDoc?.uuid === 'string' ? regionDoc.uuid : null;
    const behaviorId = behavior?.id ?? behavior?._id ?? null;

    // Region-only (no marker): the pure builder returns `tile: null` for
    // `visualMode:'none'`. The behaviour already carries `linkedVisual.mode='none'`
    // + `presentation.hidden=true`, so there is NO Tile to create, no orphan, and
    // no linked-visual ref to write back — the Region itself is the interactable.
    if (!tile) {
      return regionDoc;
    }

    // Create the linked Tile carrying the reverse flags. On failure, delete the
    // orphan Region so we never leave a region without its intended marker.
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
          flags: { fabricate }
        };
        const TileDocument = globalThis.foundry?.documents?.TileDocument
          ?? globalThis.CONFIG?.Tile?.documentClass;
        if (TileDocument?.create) {
          tileDoc = await TileDocument.create(tileData, { parent: scene }) ?? null;
        } else if (scene.createEmbeddedDocuments) {
          const [created] = await scene.createEmbeddedDocuments('Tile', [tileData]);
          tileDoc = created ?? null;
        }
      } catch (_error) {
        tileDoc = null;
      }
    }

    if (!tileDoc) {
      // Roll back the orphan Region so the failed spawn leaves no trace.
      try { await regionDoc.delete?.(); } catch (_error) { /* tolerate. */ }
      this._notifySpawnFailure();
      return null;
    }

    // Write the linked-visual ref back onto the behaviour. If THIS fails the
    // interactable still works region-only; we just keep the orphan Tile (it
    // points back at the region via its own flags) rather than tearing down a
    // working interactable.
    const tileUuid = typeof tileDoc?.uuid === 'string' ? tileDoc.uuid : null;
    if (behavior?.update && tileUuid) {
      try {
        await behavior.update({ system: { linkedVisual: { uuid: tileUuid, documentName: 'Tile' } } });
      } catch (_error) {
        // Defensive: a working region-only interactable is acceptable.
      }
    }

    return regionDoc;
  }

  /**
   * Resolve the first `fabricate.interactable` behaviour on a freshly-created
   * Region document.
   *
   * @param {object} regionDoc
   * @returns {object|null}
   */
  _firstInteractableBehavior(regionDoc) {
    const behaviors = regionDoc?.behaviors;
    const list = Array.isArray(behaviors?.contents)
      ? behaviors.contents
      : (typeof behaviors?.values === 'function' ? Array.from(behaviors.values()) : (Array.isArray(behaviors) ? behaviors : []));
    return list.find((b) => isInteractableRegionBehavior(b)) ?? list[0] ?? null;
  }

  _notifySpawnFailure() {
    globalThis.ui?.notifications?.warn?.(
      globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.SpawnFailed')
      ?? 'Failed to place the Fabricate interactable on the canvas.'
    );
  }

  // --- Activation: region enter / exit ---------------------------------------

  /**
   * `fabricate.interactable` `tokenEnter` seam (runs on every client). Shows the
   * prompt on the MOVER's client AND on a non-GM OWNING player's client (see
   * {@link _shouldPromptForEnter}) when the behaviour is `regionEnter`-triggered
   * and currently eligible. A GM dragging a player's token prompts BOTH the GM and
   * that player; a player's autonomous move does NOT spam the GM.
   *
   * @param {object} event   The region-behaviour event ({ user, data:{ token } }).
   * @param {object} behavior  The triggering behaviour (the handler's `this`).
   */
  onRegionEnter(event, behavior) {
    const system = readInteractableBehaviorSystem(behavior);
    if (!system) return;
    if (system.activation?.trigger !== 'regionEnter') return;

    const token = this._eventToken(event);
    if (!this._shouldPromptForEnter(event, token)) return;

    const now = Number(globalThis.game?.time?.worldTime || 0);
    const eligibility = evaluateActivationEligibility(system, { now, isGM: globalThis.game?.user?.isGM === true });
    if (!eligibility.eligible) return;

    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return;
    const actorId = token?.actor?.id ?? token?.actorId ?? null;

    const PromptApp = this._getPromptAppClass?.();
    void PromptApp?.show?.({
      behaviorRef: `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`,
      name: system.name || '',
      promptText: system.presentation?.promptText ?? null,
      onInteract: () => this._requestActivation(behavior, { actorId, userId: globalThis.game?.user?.id ?? null, activationSource: 'regionEnter' })
    });
  }

  /**
   * `fabricate.interactable` `tokenExit` seam: dismiss the prompt for this region
   * UNCONDITIONALLY (no mover gate). `PromptApp.dismiss(ref)` is ref-matched and a
   * no-op when this client is not showing that region's prompt — so whichever
   * client(s) showed the prompt dismiss it on the token's exit, regardless of who
   * moves it out. This fixes the stale-prompt case where the GM staged a player's
   * token in the region and the player walks it out (the GM/player showing the
   * prompt must drop it even though they did not move the token).
   *
   * @param {object} event
   * @param {object} behavior
   */
  onRegionExit(_event, behavior) {
    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return;
    const PromptApp = this._getPromptAppClass?.();
    void PromptApp?.dismiss?.(`${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`);
  }

  /**
   * `controlToken` re-trigger: when a player CONTROLS a token already standing in
   * an eligible interactable region (Foundry's `tokenEnter` never fired for an
   * already-inside token), raise the prompt. No-op on release (`controlled` false).
   *
   * @param {object} tokenPlaceable  The controlled token placeable.
   * @param {boolean} controlled
   */
  _onControlToken(tokenPlaceable, controlled) {
    if (controlled !== true) return;
    this._promptForTokenInsideRegion(tokenPlaceable);
  }

  /**
   * Keybinding "interact here": raise the prompt for the currently-controlled
   * token standing in an eligible interactable region.
   */
  _interactHere() {
    const controlled = globalThis.canvas?.tokens?.controlled ?? [];
    const token = (Array.isArray(controlled) ? controlled : [])[0] ?? null;
    if (!token) return;
    this._promptForTokenInsideRegion(token);
  }

  /**
   * Shared re-trigger body: hit-test the scene's interactable regions for the
   * token's center; for the first eligible behaviour, show the prompt (mirrors
   * {@link onRegionEnter} but driven by control rather than a region event).
   *
   * @param {object} tokenPlaceable
   */
  _promptForTokenInsideRegion(tokenPlaceable) {
    const tokenDoc = tokenPlaceable?.document ?? tokenPlaceable;
    if (!tokenDoc) return;
    if (!this._ownsToken(tokenDoc)) return;
    const scene = globalThis.canvas?.scene;
    const matches = interactableBehaviorsContainingToken({
      scene,
      token: tokenPlaceable,
      isInteractableBehavior: isInteractableRegionBehavior
    });
    const now = Number(globalThis.game?.time?.worldTime || 0);
    const isGM = globalThis.game?.user?.isGM === true;
    for (const { behavior } of matches) {
      const system = readInteractableBehaviorSystem(behavior);
      if (!system || system.activation?.trigger !== 'regionEnter') continue;
      if (!evaluateActivationEligibility(system, { now, isGM }).eligible) continue;
      const ref = identifyRegionBehaviorRef(behavior);
      if (!ref) continue;
      const actorId = tokenDoc?.actor?.id ?? tokenDoc?.actorId ?? null;
      const PromptApp = this._getPromptAppClass?.();
      void PromptApp?.show?.({
        behaviorRef: `${ref.sceneId}.${ref.regionId}.${ref.behaviorId}`,
        name: system.name || '',
        promptText: system.presentation?.promptText ?? null,
        onInteract: () => this._requestActivation(behavior, { actorId, userId: globalThis.game?.user?.id ?? null, activationSource: 'regionEnter' })
      });
      return; // one prompt at a time.
    }
  }

  // --- Activation: request / validate-grant / open ---------------------------

  /**
   * Build the activation request for a behaviour and either validate+grant
   * locally (active GM) or emit it over the socket for the active GM to handle.
   * When no active GM is connected, warns and aborts (no hung session).
   *
   * @param {object} behavior
   * @param {object} ctx  `{ actorId, userId, activationSource }`.
   */
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
      ts: Date.now()
    });

    if (isActiveGM()) {
      void this.validateAndGrant(request);
      return;
    }
    if (!globalThis.game?.users?.activeGM) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.NoActiveGM')
        ?? 'A GM must be online to gather here.'
      );
      return;
    }
    globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, request);
  }

  /**
   * Active-GM body for the `interactableActivate` socket route (and the local-GM
   * fast path): resolve the scene/region/behaviour, compute the validation
   * collaborators (`canControlActor`, `sourceExists`, `environmentExists`,
   * `tokenInside`), run {@link validateActivationRequest}; on pass, emit the grant
   * to the requesting user (with the resolved `activeCanvasTool` for a tool).
   * No-throw.
   *
   * @param {object} request  A validated `interactableActivate` payload.
   * @returns {Promise<boolean>} Whether a grant was emitted.
   */
  async validateAndGrant(request) {
    if (!request || typeof request !== 'object') return false;
    const behavior = this._resolveBehavior(request);
    const system = readInteractableBehaviorSystem(behavior);
    if (!system) {
      // The request resolved no behaviour system (deleted region, etc.). Tell the
      // requester WHY (generic) rather than failing silently.
      this._routeActivationDenied(request.userId, null);
      return false;
    }

    const now = Number(globalThis.game?.time?.worldTime || 0);
    // `isGM` here means the REQUESTING user's GM-override status, NOT the
    // validating GM's identity. Pass the requester's real GM flag so the
    // actor-control gate cannot be bypassed by a non-owning, non-GM player.
    // (`_userCanControlActor` already returns true for a GM requester, so the
    // net authority is identical — this is for correctness/clarity.)
    const isGM = globalThis.game?.users?.get?.(String(request.userId ?? ''))?.isGM === true;
    const canControlActor = this._userCanControlActor(request.userId, request.actorId);
    const sourceExists = this._sourceExists(system);
    const environmentExists = system.interactableType === 'gatheringTask'
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
      tokenInside
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
      const tool = this._resolutionDeps().getTool({ systemId: system.systemId, toolId: system.toolId });
      const activeCanvasTool = buildActiveCanvasTool({ systemId: system.systemId, toolId: system.toolId, tool });
      if (!activeCanvasTool) return false;
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
        ref: { sceneId: request.sceneId, regionId: request.regionId, behaviorId: request.behaviorId },
        interactableType: system.interactableType,
        environmentId: system.environmentId ?? null,
        taskId: system.taskId ?? null
      }
    };
    // The requesting user opens the session locally. When the GM IS the requester
    // (GM activated their own token), open it here (a socket emit never reaches
    // the emitter).
    if (globalThis.game?.user?.id === request.userId) {
      this.openGrant(payload);
    } else {
      globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload);
    }
    return true;
  }

  /**
   * Local-user body for the `interactableActivationGranted` socket route: open the
   * granted UI on THIS client.
   *
   *   tool          → SvelteFabricateApp.show('crafting', { activeCanvasTool }).
   *   gatheringTask → SvelteFabricateApp.show('gathering', { environmentId, taskId }).
   *
   * A gathering-task interactable is a pure (environment, task) shortcut: it opens
   * the gathering session scoped to that environment + task and reads/decrements the
   * SAME environment `nodeRuntime[taskId]` as opening gathering directly. There is
   * NO per-interactable node override.
   *
   * @param {object} payload  A validated `interactableActivationGranted` payload.
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

    if (grant.interactableType === 'tool') {
      const activeCanvasTool = grant.context?.activeCanvasTool ?? null;
      if (!activeCanvasTool) {
        return;
      }
      // A Tool station belongs to crafting; open the Crafting tab with the active
      // station tool (the Crafting tab is still a placeholder, so this shows the
      // placeholder with the active-tool chip in the header).
      void AppClass.show('crafting', { activeCanvasTool });
      return;
    }

    if (grant.interactableType === 'gatheringTask') {
      const environmentId = grant.environmentId ?? grant.context?.environmentId ?? null;
      const taskId = grant.taskId ?? grant.context?.taskId ?? null;
      if (!environmentId || !taskId) {
        return;
      }
      void AppClass.show('gathering', { environmentId, taskId });
    }
  }

  /**
   * Route an activation DENIAL back to the requesting user the same way grants are
   * routed: when the GM IS the requester (own/"as player" local request) notify
   * here directly (a socket emit never reaches the emitter); otherwise emit the
   * denied payload so the requesting player's client maps + shows the localized
   * notice. No-throw.
   *
   * @param {string|null} userId  The requesting user id.
   * @param {string|null} reason  The validation reason (mapped to a localized key).
   */
  _routeActivationDenied(userId, reason) {
    if (globalThis.game?.user?.id === userId) {
      this.notifyActivationDenied(reason);
      return;
    }
    globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
      action: INTERACTABLE_ACTIVATION_DENIED,
      userId: userId ?? null,
      reason: reason ?? null
    });
  }

  /**
   * Local-user body for the `interactableActivationDenied` socket route (and the
   * local-GM fast path): warn the user WHY their activation was rejected, using the
   * pure reason→key mapping resolved through the localizer. No-throw.
   *
   * @param {string|null} reason  A validation reason string (unknown ⇒ generic key).
   */
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

  _eventToken(event) {
    return event?.data?.token ?? event?.token ?? null;
  }

  /**
   * Region-enter prompt guard. The region handler runs on EVERY connected client;
   * this decides which client(s) show the prompt. The prompt appears for:
   *  - the user who MOVED the token (`event.user === game.user`); AND
   *  - a NON-GM player who OWNS the token (so a GM dragging a player's token
   *    prompts BOTH the GM-as-mover and the absent player's client).
   *
   * It deliberately does NOT use the GM-owns-everything ownership case: a GM
   * "owns" every token, so promoting that path would spam the GM on every
   * autonomous player move. The GM is prompted only when the GM is the mover.
   *
   * @param {object} event  The region-behaviour event ({ user, data:{ token } }).
   * @param {object} token  The triggering token (placeable or document).
   * @returns {boolean}
   */
  _shouldPromptForEnter(event, token) {
    const me = globalThis.game?.user;
    const isMover = !!(event?.user && me && String(event.user.id) === String(me.id));
    // Non-GM owner: prompt the controlling player even when someone else moved the
    // token. (Deliberately NOT the GM-owns-everything case — that would spam the
    // GM on every player move.)
    const isOwningPlayer = me?.isGM !== true && this._ownsToken(token);
    return isMover || isOwningPlayer;
  }

  /**
   * Whether THIS client's user owns/controls a token (player owns the actor or
   * GM). Tolerates the placeable + document shapes.
   *
   * @param {object} token
   * @returns {boolean}
   */
  _ownsToken(token) {
    const doc = token?.document ?? token;
    if (!doc) return false;
    if (globalThis.game?.user?.isGM === true) return true;
    if (typeof doc.isOwner === 'boolean') return doc.isOwner === true;
    const actor = doc.actor ?? null;
    if (actor && typeof actor.isOwner === 'boolean') return actor.isOwner === true;
    if (typeof token?.controlled === 'boolean') return token.controlled === true;
    return false;
  }

  _userCanControlActor(userId, actorId) {
    if (!actorId) return false;
    const actor = globalThis.game?.actors?.get?.(String(actorId));
    if (!actor) return false;
    const user = globalThis.game?.users?.get?.(String(userId ?? ''));
    if (user?.isGM === true) return true;
    if (typeof actor.testUserPermission === 'function' && user) {
      try { return actor.testUserPermission(user, 'OWNER') === true; } catch (_error) { /* fall through */ }
    }
    return false;
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
    const environments = globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    return (Array.isArray(environments) ? environments : []).some((env) => String(env?.id) === String(environmentId));
  }

  /**
   * Whether the actor's token is still inside the behaviour's region, via the V13
   * document-level `RegionDocument#testPoint({ x, y, elevation })`. The behaviour's
   * `parent` is the RegionDocument; we call its document-level `testPoint` (the
   * placeable `region.object.testPoint(point, elevation)` is deprecated in V13).
   * Defensive: returns true (do not block) when the token/region cannot be
   * resolved (the enter event itself already vouched for presence).
   *
   * @param {object} behavior
   * @param {string} actorId
   * @param {string} userId
   * @returns {boolean}
   */
  _tokenInsideRegion(behavior, actorId, _userId) {
    const region = behavior?.parent ?? null;
    if (typeof region?.testPoint !== 'function') return true; // can't locate — don't block.
    const scene = region?.parent ?? null;
    const tokens = scene?.tokens;
    const list = Array.isArray(tokens?.contents)
      ? tokens.contents
      : (typeof tokens?.values === 'function' ? Array.from(tokens.values()) : []);
    const tokenDocs = list.filter((t) => String(t?.actorId ?? t?.actor?.id ?? '') === String(actorId ?? ''));
    if (tokenDocs.length === 0) return true; // can't locate — don't block.
    for (const tokenDoc of tokenDocs) {
      const center = tokenDoc?.object?.center ?? null;
      const point = center ?? { x: Number(tokenDoc?.x ?? 0), y: Number(tokenDoc?.y ?? 0) };
      try {
        if (region.testPoint({ x: point.x, y: point.y, elevation: 0 }) === true) return true;
      } catch (_error) { /* tolerate */ }
    }
    return false;
  }

  // --- Foundry-edge helpers (placement) --------------------------------------

  _viewCenter() {
    const stageCenter = globalThis.canvas?.stage ? this._screenCenterToScene() : null;
    if (stageCenter) return stageCenter;
    const dims = globalThis.canvas?.scene?.dimensions ?? globalThis.canvas?.dimensions ?? null;
    if (dims && Number.isFinite(dims.width) && Number.isFinite(dims.height)) {
      return { x: Number(dims.width) / 2, y: Number(dims.height) / 2 };
    }
    return { x: 0, y: 0 };
  }

  _screenCenterToScene() {
    const stage = globalThis.canvas?.stage;
    const toLocal = stage?.toLocal;
    const PointClass = globalThis.PIXI?.Point;
    if (typeof toLocal !== 'function' || typeof PointClass !== 'function') return null;
    const screenW = Number(globalThis.window?.innerWidth ?? 0);
    const screenH = Number(globalThis.window?.innerHeight ?? 0);
    try {
      const local = toLocal.call(stage, new PointClass(screenW / 2, screenH / 2));
      if (local && Number.isFinite(local.x) && Number.isFinite(local.y)) {
        return { x: local.x, y: local.y };
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  _resolveIconTexture(classification) {
    const entry = classification?.entry ?? null;
    if (classification?.interactableType === 'tool') {
      const systemManager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
      const system = systemManager?.getSystem?.(classification.systemId);
      const componentId = entry?.componentId;
      const component = (system?.components ?? []).find((c) => String(c?.id ?? '') === String(componentId));
      const img = component?.img;
      if (typeof img === 'string' && img.trim()) return img.trim();
    }
    const taskImg = entry?.img;
    if (typeof taskImg === 'string' && taskImg.trim()) return taskImg.trim();
    return DEFAULT_INTERACTABLE_IMG;
  }

  /**
   * The active scene's grid size (one square). Falls back to 100.
   *
   * @returns {number}
   */
  _gridSize() {
    const size = globalThis.canvas?.scene?.grid?.size
      ?? globalThis.canvas?.grid?.size
      ?? globalThis.canvas?.dimensions?.size;
    return Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 100;
  }


  _resolutionDeps() {
    const systemManager = globalThis.game?.fabricate?.getCraftingSystemManager?.();
    return {
      getTool: ({ systemId, toolId }) => {
        const system = systemManager?.getSystem?.(systemId);
        return (system?.tools ?? []).find(tool => tool?.id === toolId) ?? null;
      },
      getTask: ({ systemId, taskId }) => {
        const tasks = this._readLibraryTasks(systemId);
        return tasks.find(task => task?.id === taskId) ?? null;
      },
      resolveItemUuidToTool: (uuid) => resolveItemUuidToTool(uuid, {
        resolveItem: (id) => globalThis.fromUuidSync?.(id) ?? null,
        getSystems: () => systemManager?.getSystems?.() ?? []
      })
    };
  }

  _readLibraryTasks(systemId) {
    if (!systemId) return [];
    const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  _dropPoint(canvas, data) {
    return {
      x: Number(data?.x ?? 0),
      y: Number(data?.y ?? 0)
    };
  }
}

/** The shared InteractableManager singleton. */
const instance = new InteractableManager();

// Expose the singleton as a static so callers use `InteractableManager.instance.register()`.
InteractableManager.instance = instance;

export { InteractableManager, parseInteractableSourceUuid };

export default InteractableManager;
