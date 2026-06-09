/**
 * Thin Foundry edge for GM-routed Interactable behaviour-state writes
 * (region-first model).
 *
 * The PURE routing decision (who applies, payload validation, GM-on-GM local
 * apply) lives in `interactableSocket.js`. This module is the Foundry glue: it
 * reads `game.users.activeGM` / `game.socket`, resolves the behaviour's
 * scene + region + behaviour id (and the linked-visual document), and performs
 * the actual `behavior.update(...)` / visual write. It is intentionally small so
 * the decision logic stays unit-testable without `game.*`.
 */

import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_BEHAVIOR_UPDATE,
  INTERACTABLE_VISUAL_UPDATE,
  INTERACTABLE_VISUAL_DELETE,
  INTERACTABLE_ACTIVATE,
  INTERACTABLE_ACTIVATION_GRANTED,
  createInteractableBehaviorWriter,
  routeInteractableBehaviorMessage,
  routeInteractableActivateMessage,
  routeInteractableActivationGranted
} from './interactableSocket.js';
import {
  createRegionNodeStateAdapter,
  identifyRegionBehaviorRef
} from './regions/interactableRegionNodeAdapter.js';
import { applyLinkedVisualDepleted } from './linkedVisuals/linkedInteractableVisual.js';
import { secondsPerUnitFromCalendar } from '../systems/foundryCalendar.js';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
}

/**
 * Resolve a region behaviour by scene + region + behaviour id. The active-GM
 * edge: walks `scene.regions.get(regionId).behaviors.get(behaviorId)`. Returns
 * null when any link is missing.
 *
 * @param {{ sceneId: string, regionId: string, behaviorId: string }} ref
 * @returns {object|null}
 */
function resolveRegionBehavior({ sceneId, regionId, behaviorId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
  const region = scene?.regions?.get?.(String(regionId ?? ''));
  return region?.behaviors?.get?.(String(behaviorId ?? '')) ?? null;
}

/**
 * Apply a behaviour-document update to a `fabricate.interactable` Region Behaviour
 * (the active-GM edge for `{ system: { node } }` and other behaviour writes).
 * No-throw.
 *
 * @param {{ sceneId: string, regionId: string, behaviorId: string, update: object }} args
 * @returns {Promise<void>}
 */
export async function applyInteractableBehaviorUpdate({ sceneId, regionId, behaviorId, update } = {}) {
  const behavior = resolveRegionBehavior({ sceneId, regionId, behaviorId });
  if (!behavior?.update) return;
  try {
    await behavior.update(update);
  } catch (_error) {
    // Defensive: a behaviour write must never throw into the socket handler.
  }
}

/**
 * Resolve a linked-visual document (Tile/Drawing/Token) by uuid or by
 * scene+docId+documentName. Prefers `fromUuidSync` then a scene-embedded lookup.
 *
 * @param {{ sceneId?: string, visualUuid?: string|null, docId?: string|null, documentName?: string|null }} args
 * @returns {object|null}
 */
function resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName } = {}) {
  if (visualUuid) {
    try {
      const doc = globalThis.fromUuidSync?.(String(visualUuid));
      if (doc) return doc;
    } catch (_error) {
      // fall through to the embedded lookup
    }
  }
  const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
  if (!scene || !docId) return null;
  const id = String(docId);
  if (documentName === 'Tile') return scene.tiles?.get?.(id) ?? null;
  if (documentName === 'Drawing') return scene.drawings?.get?.(id) ?? null;
  if (documentName === 'Token') return scene.tokens?.get?.(id) ?? null;
  return null;
}

/**
 * Apply a linked-visual update (the active-GM edge for reflecting depleted state
 * onto the marker). No-throw, no-op when the visual is missing.
 *
 * @param {object} args
 * @returns {Promise<void>}
 */
export async function applyInteractableVisualUpdate({ sceneId, visualUuid, docId, documentName, update } = {}) {
  const doc = resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName });
  if (!doc?.update) return;
  try {
    await doc.update(update);
  } catch (_error) {
    // Defensive: a missing/locked visual must not throw.
  }
}

/**
 * Delete a linked visual (terminal). No-throw, no-op when the visual is missing.
 *
 * @param {object} args
 * @returns {Promise<void>}
 */
export async function applyInteractableVisualDelete({ sceneId, visualUuid, docId, documentName } = {}) {
  const doc = resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName });
  if (!doc?.delete) return;
  try {
    await doc.delete();
  } catch (_error) {
    // Defensive: a missing/locked visual must not throw.
  }
}

/**
 * GM-routed linked-visual UPDATE seam: local apply on the active GM, socket emit
 * otherwise. Used both for depleted-state reflection and for reverse linked-visual
 * flag writes (relink). Standalone export so the config panel's relink edge can
 * route the reverse-flag write/clear through the same active-GM seam.
 *
 * @param {{ sceneId: string, visualUuid: string, documentName: string, update: object }} args
 * @returns {void|Promise<void>}
 */
export function emitInteractableVisualUpdate({ sceneId, visualUuid, documentName, update } = {}) {
  if (isActiveGM()) {
    return applyInteractableVisualUpdate({ sceneId, visualUuid, documentName, update });
  }
  return globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
    action: INTERACTABLE_VISUAL_UPDATE,
    sceneId,
    visualUuid,
    documentName,
    update
  });
}

/**
 * GM-routed linked-visual DELETE seam: local apply on the active GM, socket emit
 * otherwise. Standalone export so the config panel's remove/delete edges can route
 * the visual delete through the same active-GM seam.
 *
 * @param {{ sceneId: string, visualUuid: string, documentName: string }} args
 * @returns {void|Promise<void>}
 */
export function emitInteractableVisualDelete({ sceneId, visualUuid, documentName } = {}) {
  if (isActiveGM()) {
    return applyInteractableVisualDelete({ sceneId, visualUuid, documentName });
  }
  return globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
    action: INTERACTABLE_VISUAL_DELETE,
    sceneId,
    visualUuid,
    documentName
  });
}

/**
 * Build the GM-routed linked-visual depleted applier seam:
 * `({ behaviorSystem, depleted }) => void`. It reflects the behaviour's depleted
 * state onto the linked visual, routing the visual update/delete through the
 * active GM (local apply on the GM, socket emit otherwise).
 *
 * @returns {(args: { behaviorSystem: object, depleted: boolean }) => (void|Promise<void>)}
 */
export function buildLinkedVisualApply() {
  return ({ behaviorSystem, depleted } = {}) => applyLinkedVisualDepleted({
    behaviorSystem,
    depleted,
    emitVisualUpdate: emitInteractableVisualUpdate,
    emitVisualDelete: emitInteractableVisualDelete
  });
}

/**
 * Build the `emitWrite(update)` seam for one region behaviour: it identifies the
 * behaviour ref and routes the `{ system: { node } }` (or other) update through
 * the GM (local apply on the active GM, socket emit otherwise). Used by the
 * region node adapter.
 *
 * @param {object} behavior The live `fabricate.interactable` Region Behaviour.
 * @returns {(update: object) => (void|Promise<void>)}
 */
export function emitInteractableBehaviorWrite(behavior) {
  const writer = createInteractableBehaviorWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableBehaviorUpdate
  });
  return (update) => {
    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return undefined;
    return writer.write({
      sceneId: ref.sceneId,
      regionId: ref.regionId,
      behaviorId: ref.behaviorId,
      update
    });
  };
}

/**
 * Rebuild a region behaviour node-state adapter from a persisted
 * `{ sceneId, regionId, behaviorId }` ref. Used when a TIMED gathering waiting
 * run started from a placed interactable REGION matures: the adapter cannot
 * survive run-record serialization, so it is reconstructed here (on the active
 * GM) so the maturity decrement lands on the behaviour `system.node`.
 *
 * Returns null when the behaviour can no longer be resolved.
 *
 * @param {{ sceneId: string, regionId: string, behaviorId: string }} ref
 * @returns {object|null}
 */
export function resolveRegionNodeStateForRef({ sceneId, regionId, behaviorId } = {}) {
  const behavior = resolveRegionBehavior({ sceneId, regionId, behaviorId });
  if (!behavior) return null;
  return createRegionNodeStateAdapter({
    behavior,
    emitWrite: emitInteractableBehaviorWrite(behavior),
    now: () => Number(globalThis.game?.time?.worldTime || 0),
    secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, globalThis.game?.time?.calendar ?? null),
    applyLinkedVisual: buildLinkedVisualApply(),
    ref: { sceneId: String(sceneId), regionId: String(regionId), behaviorId: String(behaviorId) }
  });
}

/**
 * Node-ref resolver injected into the gathering engine as
 * `resolveTileNodeState`. The engine treats the ref as opaque
 * (`economyEvidence.tileNodeRef`); to avoid rippling into the engine /
 * run-records, the seam name is kept while the payload is the region ref
 * `{ sceneId, regionId, behaviorId }`. (The legacy tile ref `{ sceneId, tileId }`
 * no longer occurs — there is no released tile-click data.)
 *
 * @param {object} ref
 * @returns {object|null}
 */
export function resolveInteractableNodeStateForRef(ref = {}) {
  if (ref && ref.regionId && ref.behaviorId) {
    return resolveRegionNodeStateForRef(ref);
  }
  return null;
}

/**
 * Route an inbound `module.fabricate` socket payload for the region-first
 * Interactable actions: only the active GM applies the behaviour/visual write;
 * activation requests route to validate+grant; grants route to the targeted local
 * user. Called from main.js's shared `module.fabricate` socket handler (the same
 * channel the hazard coordinator uses), so this module owns these branches without
 * registering a second listener. No-ops for other actions.
 *
 * @param {object} payload
 */
export function handleInteractableSocketMessage(payload, deps = {}) {
  const action = payload?.action;

  // Region-first behaviour write (player → active GM `{ system: { node } }`).
  if (action === INTERACTABLE_BEHAVIOR_UPDATE) {
    void routeInteractableBehaviorMessage(payload, {
      isActiveGM,
      applyUpdate: applyInteractableBehaviorUpdate
    });
    return;
  }

  // Linked-visual depleted reflection (active GM applies; local apply for the
  // emitting GM is handled by the writer, so the inbound branch is GM-gated).
  if (action === INTERACTABLE_VISUAL_UPDATE) {
    if (isActiveGM()) void applyInteractableVisualUpdate(payload);
    return;
  }
  if (action === INTERACTABLE_VISUAL_DELETE) {
    if (isActiveGM()) void applyInteractableVisualDelete(payload);
    return;
  }

  // Activation request → active GM validates + grants. The validate/grant body is
  // injected (filled in by Phase 1c); the dispatch + active-GM gate live here.
  if (action === INTERACTABLE_ACTIVATE) {
    if (typeof deps.validateAndGrant === 'function') {
      void routeInteractableActivateMessage(payload, {
        isActiveGM,
        validateAndGrant: deps.validateAndGrant
      });
    }
    return;
  }

  // Activation granted → the targeted local user opens the session. The open body
  // is injected (Phase 1c).
  if (action === INTERACTABLE_ACTIVATION_GRANTED) {
    if (typeof deps.openGrant === 'function') {
      void routeInteractableActivationGranted(payload, {
        isLocalUser: (userId) => globalThis.game?.user?.id === userId,
        openGrant: deps.openGrant
      });
    }
  }
}
