/**
 * GM-routed token-flag writes for canvas Interactables.
 *
 * Players cannot write tokens they do not own, so per-token node-state mutations
 * (depletion, respawn, and — Phase 6 — depleted-behavior apply/revert) are not
 * written directly by arbitrary clients. They emit an `interactableNodeUpdate`
 * action over the existing `module.fabricate` socket; only `game.users.activeGM`
 * applies the `token.update(...)`. A GM client applies its OWN write locally
 * without round-tripping the socket (socket emits never reach the emitter), so
 * the GM-on-GM case must branch on `isActiveGM` exactly like
 * `hazardSceneCoordinator`.
 *
 * This module holds the PURE routing decision (who applies, payload validation);
 * `main.js` registers the socket handler and injects the thin Foundry edges
 * (`token.update`, `game.socket.emit`).
 */

export const INTERACTABLE_SOCKET = 'module.fabricate';
export const INTERACTABLE_NODE_UPDATE = 'interactableNodeUpdate';
export const INTERACTABLE_NODE_DELETE = 'interactableNodeDelete';

/**
 * Validate an `interactableNodeDelete` payload (terminal `deleteToken`). A
 * well-formed payload identifies a scene + token to remove. Returns the
 * normalized payload, or `null` when malformed.
 *
 * @param {object} payload
 * @returns {{ action: string, sceneId: string, tokenId: string } | null}
 */
export function validateNodeDeletePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_NODE_DELETE) return null;
  const sceneId = typeof payload.sceneId === 'string' ? payload.sceneId.trim() : '';
  const tokenId = typeof payload.tokenId === 'string' ? payload.tokenId.trim() : '';
  if (!sceneId || !tokenId) return null;
  return { action: INTERACTABLE_NODE_DELETE, sceneId, tokenId };
}

/**
 * Validate an `interactableNodeUpdate` payload. A well-formed payload identifies
 * a scene + token and carries an `update` object of token-document changes to
 * merge. Returns the normalized payload, or `null` when malformed (so the router
 * can reject it without throwing).
 *
 * @param {object} payload
 * @returns {{ action: string, sceneId: string, tokenId: string, update: object } | null}
 */
export function validateNodeUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_NODE_UPDATE) return null;
  const sceneId = typeof payload.sceneId === 'string' ? payload.sceneId.trim() : '';
  const tokenId = typeof payload.tokenId === 'string' ? payload.tokenId.trim() : '';
  const update = payload.update && typeof payload.update === 'object' && !Array.isArray(payload.update)
    ? payload.update
    : null;
  if (!sceneId || !tokenId || !update) return null;
  return { action: INTERACTABLE_NODE_UPDATE, sceneId, tokenId, update };
}

/**
 * Build the engine-facing node-write router. On the active-GM client it applies
 * the token update directly (local apply, no socket round-trip); on any other
 * client it emits the socket message for the active GM to apply.
 *
 * Mirrors `createHazardSceneTrigger`: the GM-on-GM case must apply LOCALLY
 * because a socket emit never reaches the emitting client.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM   Whether this client is the primary GM.
 * @param {(payload: object) => void} deps.emitUpdate   Emit the socket payload.
 * @param {(args: { sceneId: string, tokenId: string, update: object }) => (void|Promise<void>)} deps.applyUpdate
 *   Apply the token update locally (the Foundry `token.update` edge).
 * @returns {{ write: (args: { sceneId: string, tokenId: string, update: object }) => (void|Promise<void>) }}
 */
export function createInteractableNodeWriter({ isActiveGM, emitUpdate, applyUpdate } = {}) {
  return {
    write({ sceneId, tokenId, update } = {}) {
      const payload = validateNodeUpdatePayload({
        action: INTERACTABLE_NODE_UPDATE,
        sceneId,
        tokenId,
        update
      });
      if (!payload) return undefined;
      const gm = typeof isActiveGM === 'function' ? isActiveGM() === true : false;
      if (gm) {
        return applyUpdate?.({ sceneId: payload.sceneId, tokenId: payload.tokenId, update: payload.update });
      }
      return emitUpdate?.(payload);
    }
  };
}

/**
 * Build the token-delete router (terminal `deleteToken`). Mirrors
 * {@link createInteractableNodeWriter}: the active GM deletes locally; any other
 * client emits the socket message for the active GM to apply.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(payload: object) => void} deps.emitDelete
 * @param {(args: { sceneId: string, tokenId: string }) => (void|Promise<void>)} deps.applyDelete
 * @returns {{ delete: (args: { sceneId: string, tokenId: string }) => (void|Promise<void>) }}
 */
export function createInteractableTokenDeleter({ isActiveGM, emitDelete, applyDelete } = {}) {
  return {
    delete({ sceneId, tokenId } = {}) {
      const payload = validateNodeDeletePayload({ action: INTERACTABLE_NODE_DELETE, sceneId, tokenId });
      if (!payload) return undefined;
      const gm = typeof isActiveGM === 'function' ? isActiveGM() === true : false;
      if (gm) {
        return applyDelete?.({ sceneId: payload.sceneId, tokenId: payload.tokenId });
      }
      return emitDelete?.(payload);
    }
  };
}

/**
 * Route an inbound `module.fabricate` socket message for the node-update action.
 * Pure aside from the injected `applyUpdate` side-effect. Only the active GM
 * applies; non-GM clients (and a stale GM that is not the primary) ignore it.
 * Malformed payloads are dropped. Returns `true` when the update was applied,
 * `false` otherwise (so callers/tests can assert the routing decision).
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(args: { sceneId: string, tokenId: string, update: object }) => (void|Promise<void>)} deps.applyUpdate
 * @returns {boolean}
 */
export function routeInteractableSocketMessage(payload, { isActiveGM, applyUpdate } = {}) {
  const normalized = validateNodeUpdatePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  applyUpdate?.({ sceneId: normalized.sceneId, tokenId: normalized.tokenId, update: normalized.update });
  return true;
}

/**
 * Route an inbound `module.fabricate` socket message for the node-DELETE action
 * (terminal `deleteToken`). Only the active GM applies. Returns `true` when the
 * delete was applied, `false` otherwise.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(args: { sceneId: string, tokenId: string }) => (void|Promise<void>)} deps.applyDelete
 * @returns {boolean}
 */
export function routeInteractableDeleteMessage(payload, { isActiveGM, applyDelete } = {}) {
  const normalized = validateNodeDeletePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  applyDelete?.({ sceneId: normalized.sceneId, tokenId: normalized.tokenId });
  return true;
}
