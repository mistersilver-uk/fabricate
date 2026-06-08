/**
 * Canvas Interactable foundation (Phase 3).
 *
 * Singleton that wires Foundry canvas hooks to the pure interactable logic:
 *  - `dropCanvasData` intercepts a dropped Fabricate Tool / Gathering Task,
 *    suppresses the default drop, and spawns a flagged UNLINKED token against the
 *    single backing actor.
 *  - `canvasReady` / token-draw hooks attach a PIXI double-click (`clickLeft2`)
 *    handler to each interactable placeable.
 *  - double-click reads the token's interactable flags and dispatches by type.
 *
 * All decision logic (drop classification, spawn-payload shaping, double-click
 * routing) lives in the pure modules `interactableResolution.js` and
 * `interactableDispatch.js`; the hook bodies here are the thin Foundry/PIXI edge.
 * Spawning is GM-only.
 */

import {
  classifyInteractableDrop,
  buildSpawnRequest,
  buildActiveCanvasTool,
  parseInteractableSourceUuid
} from './interactableResolution.js';
import { buildInteractableFlags, isInteractableToken } from './interactableTokenFlags.js';
import { dispatchInteractableDoubleClick } from './interactableDispatch.js';
import { ensureInteractableActor } from './interactableActor.js';
import { getFabricateAppClass } from '../ui/appFactory.js';
import { getSetting, SETTING_KEYS } from '../config/settings.js';

const DOUBLE_CLICK_FLAG = '_fabricateInteractableBound';

class InteractableManager {
  /**
   * @param {object} [deps]
   * @param {() => Function} [deps.getAppClass] Resolver for the Fabricate app
   *   class. Defaults to {@link getFabricateAppClass}; injectable so unit tests
   *   can pass a fake app whose `show()` records its arguments without a live
   *   Svelte/Foundry runtime.
   */
  constructor({ getAppClass = getFabricateAppClass } = {}) {
    this._registered = false;
    this._getAppClass = getAppClass;
    // Bind hook bodies once so they can be added/removed by identity.
    this._onDrop = this._onDrop.bind(this);
    this._attachListeners = this._attachListeners.bind(this);
    this._onTokenDrawn = this._onTokenDrawn.bind(this);
  }

  /**
   * Install canvas hooks. Idempotent — repeated calls are a no-op.
   */
  register() {
    if (this._registered) return;
    const hooks = globalThis.Hooks;
    if (!hooks?.on) return;
    hooks.on('dropCanvasData', this._onDrop);
    hooks.on('canvasReady', this._attachListeners);
    // Re-attach the double-click handler for tokens created after canvasReady.
    hooks.on('drawToken', this._onTokenDrawn);
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
    const spawnRequest = buildSpawnRequest({ classification, point });
    void this._spawnInteractable(spawnRequest);
    return false; // suppress Foundry's default item-drop handling.
  }

  /**
   * Create the flagged, unlinked TokenDocument for a classified drop.
   *
   * @param {object} spawnRequest  Result of {@link buildSpawnRequest}.
   * @returns {Promise<object|null>} The created TokenDocument, or null.
   */
  async _spawnInteractable(spawnRequest) {
    if (!spawnRequest) return null;
    const actor = await ensureInteractableActor();
    if (!actor) return null;

    const scene = globalThis.canvas?.scene;
    if (!scene) return null;

    const { fabricate } = buildInteractableFlags({
      interactableType: spawnRequest.interactableType,
      sourceUuid: spawnRequest.sourceUuid,
      environmentId: spawnRequest.environmentId
    });

    const tokenData = {
      name: actor.name,
      actorId: actor.id,
      actorLink: false, // unlinked: all real data is in the token flags.
      x: spawnRequest.x,
      y: spawnRequest.y,
      flags: { fabricate }
    };

    const TokenDocument = globalThis.foundry?.documents?.TokenDocument
      ?? globalThis.CONFIG?.Token?.documentClass;
    if (TokenDocument?.create) {
      return await TokenDocument.create(tokenData, { parent: scene });
    }
    if (scene.createEmbeddedDocuments) {
      const [created] = await scene.createEmbeddedDocuments('Token', [tokenData]);
      return created ?? null;
    }
    return null;
  }

  /**
   * `canvasReady` handler: attach the double-click handler to every interactable
   * placeable currently on the token layer.
   */
  _attachListeners() {
    const placeables = globalThis.canvas?.tokens?.placeables ?? [];
    for (const placeable of placeables) {
      this._attachDoubleClick(placeable);
    }
  }

  /**
   * `drawToken` handler: attach to a single placeable as it is (re)drawn.
   *
   * @param {object} placeable
   */
  _onTokenDrawn(placeable) {
    this._attachDoubleClick(placeable);
  }

  /**
   * Attach a PIXI `clickLeft2` (double-click) handler to an interactable
   * placeable, once. No-op for non-interactable tokens.
   *
   * @param {object} placeable  A canvas Token placeable.
   */
  _attachDoubleClick(placeable) {
    const document = placeable?.document;
    if (!document || !isInteractableToken(document)) return;
    if (placeable[DOUBLE_CLICK_FLAG]) return;
    if (typeof placeable.on !== 'function') return;
    placeable.on('clickLeft2', () => this._onDoubleClick(document));
    placeable[DOUBLE_CLICK_FLAG] = true;
  }

  /**
   * Double-click handler. Reads the token's interactable flags and dispatches by
   * type. The tool branch opens the Fabricate app with the station's Tool
   * injected as an `activeCanvasTool` (Phase 4); the gathering-task branch is
   * still the Phase-3 stub (Phase 5).
   *
   * @param {object} token  Token document.
   */
  _onDoubleClick(token) {
    dispatchInteractableDoubleClick(token, {
      onTool: (descriptor) => this._handleToolDoubleClick(descriptor),
      onGatheringTask: (descriptor) => this._handleGatheringTaskDoubleClick(descriptor)
    });
  }

  /**
   * Resolve the double-clicked Tool station's library Tool from its synthetic
   * sourceUuid (`Fabricate.<systemId>.tool.<toolId>`) and open the Fabricate app
   * with that Tool injected as a session-scoped `activeCanvasTool`. No-op when
   * the tool cannot be resolved.
   *
   * INTERIM ROUTING: opens the `gathering` tab, not `crafting`. The Svelte
   * crafting tab is still a "Coming Soon" placeholder (FabricateAppRoot falls
   * through to the placeholder shell for every non-gathering tab), so routing a
   * Tool token there would dead-end with no visible effect. Gathering is the
   * only live surface where the virtual-present tool has a visible effect today.
   * The injected `activeCanvasTool` context is tab-agnostic on the app instance,
   * so revisit this to route to (or offer a choice of) crafting once that tab
   * ships. See OpenSpec design.md §4.
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
   * Phase 5 replaces this with
   * `SvelteFabricateApp.show('gathering', { environmentId, taskId, nodeStateOverride })`.
   * @param {object} descriptor
   */
  _handleGatheringTaskDoubleClick(descriptor) {
    console.log('Fabricate | Gathering task interactable double-clicked', descriptor);
  }

  // --- Foundry-edge helpers. ---

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
      // Phase 4+ may map a dropped component Item uuid to a Tool; unresolved for now.
      resolveItemUuidToTool: () => null
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
