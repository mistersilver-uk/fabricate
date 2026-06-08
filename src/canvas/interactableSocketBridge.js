/**
 * Thin Foundry edge for GM-routed Interactable token-flag writes.
 *
 * The PURE routing decision (who applies, payload validation, GM-on-GM local
 * apply) lives in `interactableSocket.js`. This module is the Foundry glue: it
 * reads `game.users.activeGM` / `game.socket`, resolves the token's scene + id,
 * and performs the actual `token.update(...)`. It is intentionally small so the
 * decision logic stays unit-testable without `game.*`.
 */

import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_NODE_UPDATE,
  INTERACTABLE_NODE_DELETE,
  createInteractableNodeWriter,
  createInteractableTokenDeleter,
  routeInteractableSocketMessage,
  routeInteractableDeleteMessage
} from './interactableSocket.js';
import { createTokenNodeStateAdapter, identifyTokenRef } from './tokenNodeStateAdapter.js';
import { buildDepletedBehaviorWriter } from './depletedBehavior.js';
import { secondsPerUnitFromCalendar } from '../systems/foundryCalendar.js';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
}

/**
 * Resolve a token document's scene id + token id, tolerating both a live
 * TokenDocument (`token.parent`, `token.id`) and the placeable's document.
 *
 * @param {object} token
 * @returns {{ sceneId: string, tokenId: string } | null}
 */
function identifyToken(token) {
  const tokenId = token?.id ?? token?._id ?? null;
  const sceneId = token?.parent?.id ?? token?.scene?.id ?? globalThis.canvas?.scene?.id ?? null;
  if (!tokenId || !sceneId) return null;
  return { sceneId: String(sceneId), tokenId: String(tokenId) };
}

/**
 * Apply an Interactable node-state update to a token document. The active-GM
 * edge: looks the token up by scene + id and writes `flags.fabricate.node`.
 *
 * @param {{ sceneId: string, tokenId: string, update: object }} args
 * @returns {Promise<void>}
 */
export async function applyInteractableNodeUpdate({ sceneId, tokenId, update } = {}) {
  const scene = globalThis.game?.scenes?.get?.(sceneId);
  const token = scene?.tokens?.get?.(tokenId);
  if (!token?.update) return;
  await token.update(update);
}

/**
 * Delete an Interactable token (terminal `deleteToken` depleted-behavior). The
 * active-GM edge: looks the token up by scene + id and removes it. A deleted
 * token cannot be restored by respawn — the world-time respawn pass no-ops
 * against it because it is no longer present in the scene.
 *
 * @param {{ sceneId: string, tokenId: string }} args
 * @returns {Promise<void>}
 */
export async function applyInteractableTokenDelete({ sceneId, tokenId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(sceneId);
  const token = scene?.tokens?.get?.(tokenId);
  if (token?.delete) {
    await token.delete();
    return;
  }
  // Fallback for collections that only expose batch deletion.
  if (scene?.deleteEmbeddedDocuments && tokenId) {
    await scene.deleteEmbeddedDocuments('Token', [String(tokenId)]);
  }
}

/**
 * Build the `(token, behavior, depleted) => void` depleted-behavior writer for a
 * token: it routes `token.update`/`token.delete` through the active GM (local
 * apply on the GM, socket emit otherwise), mirroring {@link emitInteractableNodeWrite}.
 * The PURE apply/revert/delete decision lives in `depletedBehavior.js`.
 *
 * @returns {(args: { token: object, behavior: object|null, depleted: boolean }) => (void|Promise<void>)}
 */
export function buildDepletedBehaviorApply() {
  const writer = createInteractableNodeWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableNodeUpdate
  });
  const deleter = createInteractableTokenDeleter({
    isActiveGM,
    emitDelete: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyDelete: applyInteractableTokenDelete
  });
  return buildDepletedBehaviorWriter({
    emitUpdate: ({ sceneId, tokenId, update }) => writer.write({ sceneId, tokenId, update }),
    emitDelete: ({ sceneId, tokenId }) => deleter.delete({ sceneId, tokenId }),
    identify: (token) => identifyTokenRef(token)
  });
}

/**
 * Build the `emitWrite(node)` seam for one token: it merges the node into a
 * `flags.fabricate.node` token-update and routes it through the GM (local apply
 * on the active GM, socket emit otherwise). Used by the per-token node adapter.
 *
 * @param {object} token The placed gathering-task token document.
 * @returns {(node: object) => (void|Promise<void>)}
 */
export function emitInteractableNodeWrite(token) {
  const writer = createInteractableNodeWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableNodeUpdate
  });
  return (node) => {
    const ids = identifyToken(token);
    if (!ids) return undefined;
    return writer.write({
      sceneId: ids.sceneId,
      tokenId: ids.tokenId,
      update: { flags: { fabricate: { node } } }
    });
  };
}

/**
 * Rebuild a per-token node-state adapter from a persisted `{ sceneId, tokenId }`
 * ref. Used when a TIMED gathering waiting run started from a canvas token
 * matures: the live adapter is a function object that cannot survive run-record
 * serialization, so only the ref is persisted and the adapter is reconstructed
 * here (on the active GM) so the maturity decrement lands on the token flag.
 *
 * Returns null when the token can no longer be resolved (e.g. it was deleted),
 * so the maturity commit falls back to the env node rather than throwing.
 *
 * @param {{ sceneId: string, tokenId: string }} ref
 * @returns {object|null} A per-token node adapter, or null when unresolvable.
 */
export function resolveTokenNodeStateForRef({ sceneId, tokenId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
  const token = scene?.tokens?.get?.(String(tokenId ?? ''));
  if (!token) return null;
  return createTokenNodeStateAdapter({
    token,
    emitWrite: emitInteractableNodeWrite(token),
    now: () => Number(globalThis.game?.time?.worldTime || 0),
    secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, globalThis.game?.time?.calendar ?? null),
    applyDepletedBehavior: buildDepletedBehaviorApply(),
    tokenRef: { sceneId: String(sceneId), tokenId: String(tokenId) }
  });
}

/**
 * Route an inbound `module.fabricate` socket payload that carries the
 * `interactableNodeUpdate` action: only the active GM applies the token write.
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
      applyDelete: applyInteractableTokenDelete
    });
  }
}
