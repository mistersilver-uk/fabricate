/**
 * Thin Foundry edge for GM-routed Interactable tile-flag writes.
 *
 * The PURE routing decision (who applies, payload validation, GM-on-GM local
 * apply) lives in `interactableSocket.js`. This module is the Foundry glue: it
 * reads `game.users.activeGM` / `game.socket`, resolves the tile's scene + id,
 * and performs the actual `tile.update(...)`. It is intentionally small so the
 * decision logic stays unit-testable without `game.*`.
 */

import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_NODE_UPDATE,
  INTERACTABLE_NODE_DELETE,
  createInteractableNodeWriter,
  createInteractableTileDeleter,
  routeInteractableSocketMessage,
  routeInteractableDeleteMessage
} from './interactableSocket.js';
import { createTileNodeStateAdapter, identifyTileRef } from './tileNodeStateAdapter.js';
import { buildDepletedBehaviorWriter } from './depletedBehavior.js';
import { secondsPerUnitFromCalendar } from '../systems/foundryCalendar.js';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
}

/**
 * Resolve a tile document's scene id + tile id, tolerating both a live
 * TileDocument (`tile.parent`, `tile.id`) and the placeable's document.
 *
 * @param {object} tile
 * @returns {{ sceneId: string, tileId: string } | null}
 */
function identifyTile(tile) {
  const tileId = tile?.id ?? tile?._id ?? null;
  const sceneId = tile?.parent?.id ?? tile?.scene?.id ?? globalThis.canvas?.scene?.id ?? null;
  if (!tileId || !sceneId) return null;
  return { sceneId: String(sceneId), tileId: String(tileId) };
}

/**
 * Apply an Interactable node-state update to a tile document. The active-GM
 * edge: looks the tile up by scene + id and writes `flags.fabricate.node`.
 *
 * @param {{ sceneId: string, tileId: string, update: object }} args
 * @returns {Promise<void>}
 */
export async function applyInteractableNodeUpdate({ sceneId, tileId, update } = {}) {
  const scene = globalThis.game?.scenes?.get?.(sceneId);
  const tile = scene?.tiles?.get?.(tileId);
  if (!tile?.update) return;
  await tile.update(update);
}

/**
 * Delete an Interactable tile (terminal delete depleted-behavior). The active-GM
 * edge: looks the tile up by scene + id and removes it. A deleted tile cannot be
 * restored by respawn — the world-time respawn pass no-ops against it because it
 * is no longer present in the scene.
 *
 * @param {{ sceneId: string, tileId: string }} args
 * @returns {Promise<void>}
 */
export async function applyInteractableTileDelete({ sceneId, tileId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(sceneId);
  const tile = scene?.tiles?.get?.(tileId);
  if (tile?.delete) {
    await tile.delete();
    return;
  }
  // Fallback for collections that only expose batch deletion.
  if (scene?.deleteEmbeddedDocuments && tileId) {
    await scene.deleteEmbeddedDocuments('Tile', [String(tileId)]);
  }
}

/**
 * Build the `({ tile, behavior, depleted }) => void` depleted-behavior writer for
 * a tile: it routes `tile.update`/`tile.delete` through the active GM (local
 * apply on the GM, socket emit otherwise), mirroring {@link emitInteractableNodeWrite}.
 * The PURE apply/revert/delete decision lives in `depletedBehavior.js`.
 *
 * @returns {(args: { tile: object, behavior: object|null, depleted: boolean }) => (void|Promise<void>)}
 */
export function buildDepletedBehaviorApply() {
  const writer = createInteractableNodeWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableNodeUpdate
  });
  const deleter = createInteractableTileDeleter({
    isActiveGM,
    emitDelete: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyDelete: applyInteractableTileDelete
  });
  return buildDepletedBehaviorWriter({
    emitUpdate: ({ sceneId, tileId, update }) => writer.write({ sceneId, tileId, update }),
    emitDelete: ({ sceneId, tileId }) => deleter.delete({ sceneId, tileId }),
    identify: (tile) => identifyTileRef(tile)
  });
}

/**
 * Build the `emitWrite(node)` seam for one tile: it merges the node into a
 * `flags.fabricate.node` tile-update and routes it through the GM (local apply
 * on the active GM, socket emit otherwise). Used by the per-tile node adapter.
 *
 * @param {object} tile The placed gathering-task tile document.
 * @returns {(node: object) => (void|Promise<void>)}
 */
export function emitInteractableNodeWrite(tile) {
  const writer = createInteractableNodeWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableNodeUpdate
  });
  return (node) => {
    const ids = identifyTile(tile);
    if (!ids) return undefined;
    return writer.write({
      sceneId: ids.sceneId,
      tileId: ids.tileId,
      update: { flags: { fabricate: { node } } }
    });
  };
}

/**
 * Rebuild a per-tile node-state adapter from a persisted `{ sceneId, tileId }`
 * ref. Used when a TIMED gathering waiting run started from a canvas tile
 * matures: the live adapter is a function object that cannot survive run-record
 * serialization, so only the ref is persisted and the adapter is reconstructed
 * here (on the active GM) so the maturity decrement lands on the tile flag.
 *
 * Returns null when the tile can no longer be resolved (e.g. it was deleted),
 * so the maturity commit falls back to the env node rather than throwing.
 *
 * @param {{ sceneId: string, tileId: string }} ref
 * @returns {object|null} A per-tile node adapter, or null when unresolvable.
 */
export function resolveTileNodeStateForRef({ sceneId, tileId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
  const tile = scene?.tiles?.get?.(String(tileId ?? ''));
  if (!tile) return null;
  return createTileNodeStateAdapter({
    tile,
    emitWrite: emitInteractableNodeWrite(tile),
    now: () => Number(globalThis.game?.time?.worldTime || 0),
    secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, globalThis.game?.time?.calendar ?? null),
    applyDepletedBehavior: buildDepletedBehaviorApply(),
    tileRef: { sceneId: String(sceneId), tileId: String(tileId) }
  });
}

/**
 * Route an inbound `module.fabricate` socket payload that carries the
 * `interactableNodeUpdate` action: only the active GM applies the tile write.
 * Called from main.js's shared `module.fabricate` socket handler (the same
 * channel the hazard coordinator uses), so this module owns the node-update
 * branch without registering a second listener. No-ops for other actions.
 *
 * @param {object} payload
 */
export function handleInteractableSocketMessage(payload) {
  if (payload?.action === INTERACTABLE_NODE_UPDATE) {
    void routeInteractableSocketMessage(payload, {
      isActiveGM,
      applyUpdate: applyInteractableNodeUpdate
    });
    return;
  }
  if (payload?.action === INTERACTABLE_NODE_DELETE) {
    void routeInteractableDeleteMessage(payload, {
      isActiveGM,
      applyDelete: applyInteractableTileDelete
    });
  }
}
