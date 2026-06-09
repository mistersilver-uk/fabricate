/**
 * Canvas Interactable foundation.
 *
 * Singleton that wires Foundry canvas hooks to the pure interactable logic:
 *  - `dropCanvasData` intercepts a dropped Fabricate Tool / Gathering Task,
 *    suppresses the default drop, and spawns a flagged TileDocument (no actor,
 *    no sheet).
 *  - a draw-time enablement (`drawTile` + a `canvasReady` sweep) makes
 *    interactable tiles pointer-eventful for ALL users AND attaches a raw PIXI
 *    pointer listener implementing our own double-click detection (the
 *    MouseInteractionManager click-sequence never runs `_onClickLeft2` for a
 *    non-controllable tile placeable, so wrapping it is the wrong mechanism); the
 *    listener calls {@link InteractableManager#_onDoubleClick} directly. A
 *    `destroyTile` hook detaches the listener.
 *  - a one-time wrap of the V13 `MouseInteractionManager#can` permission gate
 *    permits a non-GM player's hover on an interactable tile (tiles are not
 *    natively pointer-interactive for players; the tooltip relies on this).
 *  - a one-time wrap of the Tile hover handlers shows a discoverability tooltip
 *    (tiles have no nameplate) — rendered as a canvas-native PIXI label child,
 *    NOT via the DOM TooltipManager (a Tile has no DOM element).
 *
 * All decision logic (drop classification, spawn-payload shaping, double-click
 * dispatch, permission, tooltip text) lives in the pure modules
 * `interactableResolution.js`, `interactableDispatch.js`,
 * `interactableDoubleClickWrap.js`, and `interactableTooltip.js`; the hook/wrap
 * bodies here are the thin Foundry/PIXI edge. Spawning is GM-only.
 */

import {
  classifyInteractableDrop,
  buildSpawnRequest,
  buildActiveCanvasTool,
  parseInteractableSourceUuid
} from './interactableResolution.js';
import { resolveItemUuidToTool } from './interactableItemResolution.js';
import { shouldPermitInteractableAction } from './interactableDoubleClickWrap.js';
import { buildInteractableDragPayload } from './interactableDragPayload.js';
import { buildInteractableTileFlags, isInteractableTile } from './interactableTileFlags.js';
import { interactableTooltipText } from './interactableTooltip.js';
import { showInteractableTileLabel, hideInteractableTileLabel } from './interactableTileLabel.js';
import {
  enableInteractableTilePointerEvents,
  enableInteractableTilesIn,
  detachDoubleClickPointerListener
} from './interactableTileInteractivity.js';
import { dispatchInteractableDoubleClick } from './interactableDispatch.js';
import { buildTileNodeSnapshot, createTileNodeStateAdapter } from './tileNodeStateAdapter.js';
import { emitInteractableNodeWrite, buildDepletedBehaviorApply } from './interactableSocketBridge.js';
import { resolveDropEnvironment } from './environmentResolution.js';
import { regionEnvironmentIdsAtPoint } from './regionHitTest.js';
import { promptDropEnvironment } from './environmentDialog.js';
import { getFabricateAppClass } from '../ui/appFactory.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';
import { secondsPerUnitFromCalendar } from '../systems/foundryCalendar.js';

/** Fallback tile image when no tool/task icon can be resolved. */
const DEFAULT_INTERACTABLE_IMG = 'icons/svg/item-bag.svg';

/**
 * Idempotency guards so the V13 Tile wraps are installed exactly once even if
 * `register()` runs more than once (or across hot reloads). They live at module
 * scope because the wraps mutate shared class prototypes, not a per-instance
 * binding.
 */
const HOVER_WRAP_FLAG = '_fabricateInteractableHoverWrapped';
const PERMISSION_WRAP_FLAG = '_fabricateInteractablePermissionWrapped';

/**
 * Resolve the V13 Tile placeable class whose hover handlers we wrap, mirroring
 * the prior token-class resolution.
 *
 * We prefer `CONFIG.Tile.objectClass` — the class Foundry actually INSTANTIATES
 * for canvas tiles — FIRST, so we wrap the most-derived live class. We then fall
 * back to the V13 base placeable `foundry.canvas.placeables.Tile`, then to a bare
 * `Tile` global, returning the first whose prototype owns `_onHoverIn` (the
 * handler the discoverability-tooltip wrap hooks).
 *
 * @returns {Function|null} The Tile class, or null when none is resolvable.
 */
function resolveTileClass() {
  const candidates = [
    globalThis.CONFIG?.Tile?.objectClass,
    globalThis.foundry?.canvas?.placeables?.Tile,
    globalThis.Tile
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'function' && typeof candidate.prototype?._onHoverIn === 'function') {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve the V13 `MouseInteractionManager` class whose `can` permission gate we
 * wrap, defensively (V13 namespace first, then a bare global).
 *
 * @returns {Function|null}
 */
function resolveMouseInteractionManagerClass() {
  const candidates = [
    globalThis.foundry?.canvas?.interaction?.MouseInteractionManager,
    globalThis.MouseInteractionManager
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'function' && typeof candidate.prototype?.can === 'function') {
      return candidate;
    }
  }
  return null;
}

/**
 * Install a one-time, idempotent wrap of the V13 Tile hover handlers so an
 * interactable tile shows a discoverability tooltip (tiles have no nameplate).
 * The "what name to show" is the pure {@link interactableTooltipText}; the
 * `_onHoverIn`/`_onHoverOut` wraps are the thin PIXI/Foundry edge. Defensive.
 */
function installInteractableHoverWrap() {
  const TileClass = resolveTileClass();
  if (!TileClass) return;
  const proto = TileClass.prototype;
  if (proto[HOVER_WRAP_FLAG] === true) return;

  const originalIn = proto._onHoverIn;
  const originalOut = proto._onHoverOut;

  if (typeof originalIn === 'function') {
    proto._onHoverIn = function wrappedOnHoverIn(...args) {
      const result = originalIn.apply(this, args);
      if (isInteractableTile(this?.document)) {
        InteractableManager.instance?._showTooltip?.(this);
      }
      return result;
    };
  }
  if (typeof originalOut === 'function') {
    proto._onHoverOut = function wrappedOnHoverOut(...args) {
      if (isInteractableTile(this?.document)) {
        InteractableManager.instance?._hideTooltip?.(this);
      }
      return originalOut.apply(this, args);
    };
  }
  proto[HOVER_WRAP_FLAG] = true;
}

/**
 * Install a one-time, idempotent wrap of the V13 `MouseInteractionManager#can`
 * permission gate so a non-GM player's hover (`hoverIn`/`hoverOut`) is PERMITTED
 * on interactable tiles (tiles are not natively pointer-interactive for players).
 * Double-click is handled by a raw `pointerdown` listener (see
 * interactableTileInteractivity.js), not this gate.
 *
 * The wrapper consults the pure {@link shouldPermitInteractableAction}: it only
 * ADDS permission for interactable tiles + the allowed actions, and otherwise
 * delegates to the original gate (so it never DENIES anything Foundry would
 * permit). Defensive: no-throw when the class/method is absent.
 */
function installInteractablePermissionWrap() {
  const ManagerClass = resolveMouseInteractionManagerClass();
  if (!ManagerClass) return;
  const proto = ManagerClass.prototype;
  if (proto[PERMISSION_WRAP_FLAG] === true) return;

  const original = proto.can;
  if (typeof original !== 'function') return;

  proto.can = function wrappedCan(action, event) {
    const placeable = this?.object;
    const permit = shouldPermitInteractableAction(action, placeable?.document, isInteractableTile);
    if (permit === true) return true;
    return original.call(this, action, event);
  };
  proto[PERMISSION_WRAP_FLAG] = true;
}

class InteractableManager {
  /**
   * @param {object} [deps]
   * @param {() => Function} [deps.getAppClass] Resolver for the Fabricate app
   *   class. Defaults to {@link getFabricateAppClass}; injectable so unit tests
   *   can pass a fake app whose `show()` records its arguments without a live
   *   Svelte/Foundry runtime.
   * @param {(args: {scene: object, point: object}) => string[]} [deps.regionEnvironmentIdsAtPoint]
   *   Scene-Region point hit-test seam (defaults to the real Foundry edge).
   * @param {(args: object) => Promise<string|null>} [deps.promptDropEnvironment]
   *   On-drop GM environment-pick dialog seam (defaults to the real DialogV2 edge).
   *   Injectable so the `_spawnGatheringTask` precedence (region → default →
   *   dialog → notify → spawn/abort) is unit-testable with fakes; production
   *   wiring resolves to the real Foundry seams unchanged.
   */
  constructor({
    getAppClass = getFabricateAppClass,
    regionEnvironmentIdsAtPoint: regionHitTest = regionEnvironmentIdsAtPoint,
    promptDropEnvironment: promptEnvironment = promptDropEnvironment
  } = {}) {
    this._registered = false;
    this._getAppClass = getAppClass;
    this._regionEnvironmentIdsAtPoint = regionHitTest;
    this._promptDropEnvironment = promptEnvironment;
    // Bind hook bodies once so they can be added/removed by identity.
    this._onDrop = this._onDrop.bind(this);
  }

  /**
   * Install canvas hooks + the V13 Tile double-click / hover / permission wraps,
   * plus the draw-time pointer-interactivity enablement for interactable tiles.
   * Idempotent — repeated calls are a no-op.
   */
  register() {
    if (this._registered) return;
    const hooks = globalThis.Hooks;
    if (hooks?.on) {
      hooks.on('dropCanvasData', this._onDrop);
      // Make interactable tiles pointer-eventful for ALL users AND attach the raw
      // PIXI double-click pointer listener. A Tile is GM scenery and is NOT in the
      // active control layer for a non-GM player, so the MouseInteractionManager
      // click-sequence never runs `_onClickLeft2` for it (hover DOES fire) — so
      // the double-click is delivered by our own pointer listener instead.
      // `drawTile` catches each tile as it is drawn; the `canvasReady` sweep
      // catches tiles drawn before this hook was installed and re-applies after a
      // scene swap; `destroyTile` detaches the listener. Both enablement paths
      // delegate to the pure-decision-gated, defensive edge.
      hooks.on('drawTile', (placeable) => enableInteractableTilePointerEvents(placeable));
      hooks.on('canvasReady', () => enableInteractableTilesIn(globalThis.canvas?.tiles?.placeables));
      hooks.on('destroyTile', (placeable) => detachDoubleClickPointerListener(placeable));
    }
    // Wrap the interaction permission so a non-GM player's hover is permitted on
    // interactable tiles (the tooltip relies on it); wrap the Tile hover so a
    // discoverability tooltip shows. Installed once, defensively, and
    // independently of Hooks availability (the prototype wraps are their own
    // concern). The double-click is delivered by the raw pointer listener above —
    // NOT by an `_onClickLeft2` wrap.
    installInteractablePermissionWrap();
    installInteractableHoverWrap();
    this._registered = true;
  }

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
    // Tool tiles carry no environment; spawn immediately. Gathering-task tiles
    // resolve their environment via the precedence chain (which may await a GM
    // dialog), so that runs in an async helper while the hook returns false
    // synchronously to suppress Foundry's default item-drop handling.
    if (classification.interactableType !== 'gatheringTask') {
      const spawnRequest = buildSpawnRequest({
        classification,
        point,
        texture: this._resolveIconTexture(classification),
        width: this._gridSize(),
        height: this._gridSize()
      });
      void this._spawnInteractable(spawnRequest);
      return false;
    }

    // Alt held during the drop forces the GM dialog (override tiers 1 + 2).
    const forceDialog = data?.altKey === true || globalThis.game?.keyboard?.isModifierActive?.('Alt') === true;
    void this._spawnGatheringTask({ classification, point, forceDialog });
    return false; // suppress Foundry's default item-drop handling.
  }

  /**
   * Click-to-place a11y fallback for the Interactable browser app.
   *
   * Drag-and-drop is a keyboard/no-pointer dead-end, so the browser also offers
   * a "Place on current scene" button per row. That button calls here. This is
   * NOT a divergent spawn path: it synthesizes the SAME `dropCanvasData` payload
   * the drag source emits (via {@link buildInteractableDragPayload}), pins it to
   * the current scene's VIEW CENTER, and routes it through {@link _onDrop} — so
   * the GM gate, drop classification, and the gathering-task env-resolution
   * precedence (region → default → dialog) are all reused identically.
   *
   * @param {object} params
   * @param {'tool'|'gatheringTask'} params.interactableType
   * @param {string} params.systemId
   * @param {string} params.referenceId  Tool id or Task id.
   * @returns {boolean} Whether the synthesized drop was recognized as a
   *   Fabricate interactable (false ⇒ unbuildable / unresolved).
   */
  placeInteractableAtViewCenter({ interactableType, systemId, referenceId } = {}) {
    const payload = buildInteractableDragPayload({ interactableType, systemId, referenceId });
    if (!payload) return false;
    const center = this._viewCenter();
    const data = { ...payload, x: center.x, y: center.y };
    // _onDrop returns false when it recognized (and handled) the drop.
    return this._onDrop(globalThis.canvas, data) === false;
  }

  /**
   * Resolve the current scene's view-center in scene-space coordinates, the
   * sensible default placement point for the click-to-place fallback. Falls back
   * to the scene dimensions' midpoint, then to the origin, when the live view
   * center is unavailable.
   *
   * @returns {{x: number, y: number}}
   */
  _viewCenter() {
    const stageCenter = globalThis.canvas?.stage
      ? this._screenCenterToScene()
      : null;
    if (stageCenter) return stageCenter;
    const dims = globalThis.canvas?.scene?.dimensions ?? globalThis.canvas?.dimensions ?? null;
    if (dims && Number.isFinite(dims.width) && Number.isFinite(dims.height)) {
      return { x: Number(dims.width) / 2, y: Number(dims.height) / 2 };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Project the viewport center (screen-space) into scene-space via the PIXI
   * stage transform, the same conversion Foundry uses for a real drop point.
   *
   * @returns {{x: number, y: number}|null}
   */
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

  /**
   * Resolve a dropped gathering task's environment via the precedence chain and
   * spawn its tile. PURE decision in {@link resolveDropEnvironment}; the region
   * hit-test, the GM dialog, and the auto-resolve notification are the thin edges
   * here. A cancelled dialog ABORTS the spawn (no tile created).
   *
   * Precedence (design.md §6): Scene Region auto-detect (region flagged
   * `flags.fabricate.environmentId`) → task `defaultEnvironmentId` → GM dialog.
   * Holding Alt during drop forces the dialog.
   *
   * @param {object} args
   * @param {object} args.classification  Result of {@link classifyInteractableDrop}.
   * @param {{x: number, y: number}} args.point  Scene-space drop point.
   * @param {boolean} args.forceDialog  Alt-override.
   * @returns {Promise<object|null>}
   */
  async _spawnGatheringTask({ classification, point, forceDialog }) {
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
      // Cancel ⇒ abort the spawn (no tile created).
      if (!environmentId) return null;
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

    const spawnRequest = buildSpawnRequest({
      classification,
      point,
      environmentId: environmentId ?? undefined,
      texture: this._resolveIconTexture(classification),
      width: this._gridSize(),
      height: this._gridSize(),
      buildNode: (entry) => buildTileNodeSnapshot(entry)
    });
    return this._spawnInteractable(spawnRequest);
  }

  /**
   * The environments of one crafting system, as `{ id, name }` rows for the drop
   * dialog + the precedence existence check. Isolated Foundry-runtime read.
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
   * Create the flagged TileDocument for a classified drop. Tiles have no actor
   * and no sheet, so all per-Interactable data lives in `flags.fabricate`
   * (including the display `name` for the hover tooltip). Snaps the drop point to
   * the grid so the tile aligns with the scene.
   *
   * @param {object} spawnRequest  Result of {@link buildSpawnRequest}.
   * @returns {Promise<object|null>} The created TileDocument, or null.
   */
  async _spawnInteractable(spawnRequest) {
    if (!spawnRequest) return null;

    const scene = globalThis.canvas?.scene;
    if (!scene) return null;

    const { fabricate } = buildInteractableTileFlags({
      interactableType: spawnRequest.interactableType,
      sourceUuid: spawnRequest.sourceUuid,
      name: spawnRequest.name,
      environmentId: spawnRequest.environmentId,
      node: spawnRequest.node
    });

    const gridSize = this._gridSize();
    const width = Number.isFinite(Number(spawnRequest.width)) && Number(spawnRequest.width) > 0
      ? Number(spawnRequest.width)
      : gridSize;
    const height = Number.isFinite(Number(spawnRequest.height)) && Number(spawnRequest.height) > 0
      ? Number(spawnRequest.height)
      : gridSize;
    const { x, y } = this._snapToGrid({ x: spawnRequest.x, y: spawnRequest.y });

    const tileData = {
      texture: { src: spawnRequest.texture || DEFAULT_INTERACTABLE_IMG },
      x,
      y,
      width,
      height,
      flags: { fabricate }
    };

    const TileDocument = globalThis.foundry?.documents?.TileDocument
      ?? globalThis.CONFIG?.Tile?.documentClass;
    if (TileDocument?.create) {
      return await TileDocument.create(tileData, { parent: scene });
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Tile', [tileData]);
      return created ?? null;
    }
    return null;
  }

  /**
   * Double-click handler. Reads the tile's interactable flags and dispatches by
   * type. The tool branch opens the Fabricate app with the station's Tool
   * injected as an `activeCanvasTool`; the gathering-task branch opens the
   * gathering tab scoped to the resolved environment + a per-tile node adapter.
   *
   * @param {object} tile  Tile document.
   */
  _onDoubleClick(tile) {
    dispatchInteractableDoubleClick(tile, {
      onTool: (descriptor) => this._handleToolDoubleClick(descriptor),
      onGatheringTask: (descriptor) => this._handleGatheringTaskDoubleClick(descriptor, tile)
    });
  }

  /**
   * Show the discoverability tooltip for a hovered interactable tile.
   *
   * A Tile has no DOM `.element` and no nameplate, so we render a canvas-native
   * PIXI text LABEL above the tile (see {@link showInteractableTileLabel}) rather
   * than handing a PIXI object to the DOM `TooltipManager.activate(...)` (which
   * expects an HTMLElement and mis-positions / throws). The "what name to show"
   * is the pure {@link interactableTooltipText} (flag name, or resolved from
   * `sourceUuid`); the PIXI label draw is the thin Foundry/PIXI edge. Renders for
   * players too (hover is permitted by the interaction wrap).
   *
   * @param {object} placeable  The Tile placeable being hovered.
   */
  _showTooltip(placeable) {
    const tile = placeable?.document;
    const text = interactableTooltipText(tile, {
      resolveName: (sourceUuid) => this._resolveSourceName(sourceUuid)
    });
    if (!text) return;
    showInteractableTileLabel(placeable, text);
  }

  /**
   * Hide the discoverability tooltip (canvas-native PIXI label) for a tile
   * leaving hover.
   *
   * @param {object} placeable
   */
  _hideTooltip(placeable) {
    hideInteractableTileLabel(placeable);
  }

  /**
   * Resolve the double-clicked Tool station's library Tool from its synthetic
   * sourceUuid (`Fabricate.<systemId>.tool.<toolId>`) and open the Fabricate app
   * with that Tool injected as a session-scoped `activeCanvasTool`. No-op when
   * the tool cannot be resolved.
   *
   * INTERIM ROUTING: opens the `gathering` tab, not `crafting`. The Svelte
   * crafting tab is still a "Coming Soon" placeholder, so routing a Tool tile
   * there would dead-end with no visible effect. Gathering is the only live
   * surface where the virtual-present tool has a visible effect today.
   *
   * @param {object} descriptor  Dispatch descriptor: `{ systemId, referenceId, ... }`.
   */
  _handleToolDoubleClick(descriptor) {
    const systemId = descriptor?.systemId ?? null;
    const toolId = descriptor?.referenceId ?? null;
    if (!systemId || !toolId) return;
    const tool = this._resolutionDeps().getTool({ systemId, toolId });
    const activeCanvasTool = buildActiveCanvasTool({ systemId, toolId, tool });
    if (!activeCanvasTool) return;
    const AppClass = this._getAppClass?.();
    void AppClass?.show?.('gathering', { activeCanvasTool });
  }

  /**
   * Open the gathering app scoped to a double-clicked gathering-task tile.
   *
   * The tile owns its OWN depletion/respawn state in `flags.fabricate.node`; a
   * per-tile {@link createTileNodeStateAdapter} is built so the engine reads/
   * writes the tile node (not `environment.nodeRuntime[taskId]`), routing writes
   * through the active GM socket. When NO active GM is connected, a player's
   * node-mutating attempt cannot be applied, so the attempt is blocked cleanly
   * with a graceful message instead of hanging.
   *
   * ENVIRONMENT RESOLUTION: the environment is resolved at DROP time (the
   * precedence chain in `_spawnGatheringTask`) and stamped onto the tile flag,
   * so here we use the flag's environmentId. The `_resolveTaskEnvironmentId`
   * lookup remains only as a defensive fallback for legacy tiles placed before
   * drop-time resolution (or whose flag was cleared).
   *
   * @param {object} descriptor Dispatch descriptor: `{ systemId, referenceId, environmentId, ... }`.
   * @param {object} tile The double-clicked tile document.
   */
  _handleGatheringTaskDoubleClick(descriptor, tile) {
    const systemId = descriptor?.systemId ?? null;
    const taskId = descriptor?.referenceId ?? null;
    if (!systemId || !taskId) return;

    // No active GM ⇒ node writes (depletion/respawn) cannot be applied. Block the
    // attempt cleanly with a graceful message rather than opening a session that
    // would hang on the first write. GMs always pass (they ARE the applier).
    if (globalThis.game?.user?.isGM !== true && !globalThis.game?.users?.activeGM) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.NoActiveGM')
        ?? 'A GM must be online to gather here.'
      );
      return;
    }

    const environmentId = descriptor?.environmentId
      ?? this._resolveTaskEnvironmentId({ systemId, taskId });
    if (!environmentId) {
      globalThis.ui?.notifications?.warn?.(
        globalThis.game?.i18n?.localize?.('FABRICATE.Canvas.Interactable.NoEnvironment')
        ?? 'This gathering point is not part of any environment yet.'
      );
      return;
    }

    const nodeStateOverride = createTileNodeStateAdapter({
      tile,
      emitWrite: emitInteractableNodeWrite(tile),
      now: () => Number(globalThis.game?.time?.worldTime || 0),
      secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, globalThis.game?.time?.calendar ?? null),
      // Enact the depleted-behavior tile visual (swap-image / terminal delete)
      // whenever the attempt writes the node, routed through the same active-GM
      // socket path as the node write itself.
      applyDepletedBehavior: buildDepletedBehaviorApply()
    });

    const AppClass = this._getAppClass?.();
    void AppClass?.show?.('gathering', { environmentId, taskId, nodeStateOverride });
  }

  /**
   * Resolve the first environment whose composition includes a gathering task,
   * as the defensive double-click fallback when the tile carries no resolved
   * environmentId (drop-time resolution now stamps it via the precedence chain in
   * `_spawnGatheringTask`).
   *
   * @param {object} args
   * @param {string} args.systemId
   * @param {string} args.taskId
   * @returns {string|null}
   */
  _resolveTaskEnvironmentId({ systemId, taskId }) {
    const environments = globalThis.game?.fabricate?.getGatheringEnvironmentStore?.()?.list?.() ?? [];
    for (const environment of Array.isArray(environments) ? environments : []) {
      if (String(environment?.craftingSystemId ?? '') !== String(systemId)) continue;
      const enabled = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
      const forced = Array.isArray(environment?.forcedTaskIds) ? environment.forcedTaskIds.map(String) : [];
      const ids = new Set([...enabled, ...forced]);
      // Automatic-mode environments may compose this task by matching even without
      // an explicit id list; fall back to the first environment in the system when
      // no explicit composition references it.
      if (ids.has(String(taskId))) return String(environment.id);
    }
    // Fallback: the first environment in the same crafting system.
    const first = (Array.isArray(environments) ? environments : []).find(
      (environment) => String(environment?.craftingSystemId ?? '') === String(systemId)
    );
    return first?.id ?? null;
  }

  // --- Foundry-edge helpers. ---

  /**
   * Resolve the tile image path for a classified drop from the tool's managed
   * component img / the task's img, falling back to a sensible default. Isolated
   * Foundry/library read.
   *
   * @param {object} classification  Result of {@link classifyInteractableDrop}.
   * @returns {string}
   */
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
   * Resolve a source name from a synthetic sourceUuid for the hover tooltip when
   * the tile flag carries no `name` (defensive / legacy tiles). Isolated
   * Foundry/library read.
   *
   * @param {string} sourceUuid
   * @returns {string|null}
   */
  _resolveSourceName(sourceUuid) {
    const parsed = parseInteractableSourceUuid(sourceUuid);
    if (!parsed) return null;
    const deps = this._resolutionDeps();
    if (parsed.interactableType === 'tool') {
      const tool = deps.getTool({ systemId: parsed.systemId, toolId: parsed.referenceId });
      const label = typeof tool?.label === 'string' ? tool.label.trim() : '';
      return label || null;
    }
    const task = deps.getTask({ systemId: parsed.systemId, taskId: parsed.referenceId });
    const name = typeof task?.name === 'string' ? task.name.trim() : '';
    return name || null;
  }

  /**
   * The active scene's grid size (one square), the default tile dimension. Falls
   * back to 100 when no scene/grid is available.
   *
   * @returns {number}
   */
  _gridSize() {
    const size = globalThis.canvas?.scene?.grid?.size
      ?? globalThis.canvas?.grid?.size
      ?? globalThis.canvas?.dimensions?.size;
    return Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 100;
  }

  /**
   * Snap a scene-space point to the top-left of its grid square so a placed tile
   * aligns with the scene grid. Falls back to the raw point when no grid snap is
   * available.
   *
   * @param {{x: number, y: number}} point
   * @returns {{x: number, y: number}}
   */
  _snapToGrid({ x, y } = {}) {
    const px = Number(x ?? 0);
    const py = Number(y ?? 0);
    const size = this._gridSize();
    if (!Number.isFinite(size) || size <= 0) return { x: px, y: py };
    return {
      x: Math.floor(px / size) * size,
      y: Math.floor(py / size) * size
    };
  }

  /**
   * Build the injected resolution adapters from the live Fabricate runtime.
   * Kept thin so {@link classifyInteractableDrop} stays pure/testable.
   *
   * @returns {object}
   */
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
      // Map a dropped Foundry Item uuid to a crafting-system Tool by matching the
      // item against each tool's managed-component source refs. The Foundry edges
      // (sync uuid resolution, system enumeration) are isolated here; the matching
      // strategy itself is the pure injected resolver.
      resolveItemUuidToTool: (uuid) => resolveItemUuidToTool(uuid, {
        resolveItem: (id) => globalThis.fromUuidSync?.(id) ?? null,
        getSystems: () => systemManager?.getSystems?.() ?? []
      })
    };
  }

  /**
   * Read gathering library tasks for a system from the persisted gathering config.
   * Isolated Foundry-setting read; the classifier consumes the result purely.
   *
   * @param {string} systemId
   * @returns {object[]}
   */
  _readLibraryTasks(systemId) {
    if (!systemId) return [];
    const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
    const tasks = config?.systems?.[systemId]?.tasks;
    return Array.isArray(tasks) ? tasks : [];
  }

  /**
   * Resolve a scene-space drop point from the canvas event data.
   *
   * @param {object} canvas
   * @param {object} data
   * @returns {{x: number, y: number}}
   */
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
