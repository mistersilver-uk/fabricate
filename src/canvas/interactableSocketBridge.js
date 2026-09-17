/**
 * The Foundry glue for GM-routed interactable writes: it reads `game.users.activeGM` and
 * `game.socket`, resolves the target from a ref, and performs the write. The routing decision and
 * payload validation live in `interactableSocket.js`, testable without `game.*`.
 */

import {
  INTERACTABLE_SOCKET,
  INTERACTABLE_BEHAVIOR_UPDATE,
  INTERACTABLE_VISUAL_UPDATE,
  INTERACTABLE_VISUAL_DELETE,
  INTERACTABLE_ACTIVATE,
  INTERACTABLE_ACTIVATION_GRANTED,
  INTERACTABLE_ACTIVATION_DENIED,
  createInteractableBehaviorWriter,
  routeInteractableBehaviorMessage,
  routeInteractableActivateMessage,
  routeInteractableActivationGranted,
  routeInteractableActivationDenied,
} from './interactableSocket.js';
import {
  isInteractableRegionBehavior,
  mayApplyInteractableVisualUpdate,
  mayDeleteInteractableVisual,
  readLinkedVisualRef,
} from './regions/interactableRegionFlags.js';
import { identifyRegionBehaviorRef } from './regions/interactableRegionNodeAdapter.js';

/** Whether this client is the primary (active) GM. */
function isActiveGM() {
  return globalThis.game?.user === globalThis.game?.users?.activeGM;
}

/** The active-GM edge: `scene.regions.get(...).behaviors.get(...)`, or null. */
function resolveRegionBehavior({ sceneId, regionId, behaviorId } = {}) {
  const scene = globalThis.game?.scenes?.get?.(String(sceneId ?? ''));
  const region = scene?.regions?.get?.(String(regionId ?? ''));
  return region?.behaviors?.get?.(String(behaviorId ?? '')) ?? null;
}

/** Public resolver for the gathering service's `resolveRegionBehavior` seam (issue 302). */
export function resolveInteractableBehaviorByRef(ref) {
  try {
    return resolveRegionBehavior(ref);
  } catch {
    return null;
  }
}

/** GM-routed writer for an interactable's scoped `{ system: { node } }` by ref (issue 302). */
export function writeInteractableBehaviorNode(ref, { node } = {}) {
  if (!ref) return;
  const writer = createInteractableBehaviorWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableBehaviorUpdate,
  });
  return writer.write({
    sceneId: ref.sceneId,
    regionId: ref.regionId,
    behaviorId: ref.behaviorId,
    update: { system: { node } },
  });
}

/** The active-GM edge applying a behaviour-document update. No-throw. */
export async function applyInteractableBehaviorUpdate({
  sceneId,
  regionId,
  behaviorId,
  update,
} = {}) {
  const behavior = resolveRegionBehavior({ sceneId, regionId, behaviorId });
  if (!behavior?.update) return;
  // Ownership guard: the resolved behaviour must be a `fabricate.interactable`, since ref drift,
  // uuid reuse or a crafted payload could otherwise mutate a foreign one. Bail LOUDLY.
  if (!isInteractableRegionBehavior(behavior)) {
    console.warn(
      'Fabricate | Refused an interactable behaviour update: the resolved Region Behaviour is not a fabricate.interactable',
      { sceneId, regionId, behaviorId }
    );
    return;
  }
  try {
    await behavior.update(update);
  } catch (error) {
    console.warn('Fabricate | Interactable behaviour update failed', error);
  }
}

/** Resolve a linked visual by uuid, else by scene plus docId and documentName. */
function resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName } = {}) {
  if (visualUuid) {
    try {
      const doc = globalThis.fromUuidSync?.(String(visualUuid));
      if (doc) return doc;
    } catch {
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

/** The Foundry edge for {@link visualLinkRoundTrips}: region uuid to behaviour. No-throw. */
function resolveLinkedBehaviorForVisual(doc) {
  const ref = readLinkedVisualRef(doc);
  if (!ref) return null;
  try {
    const region = globalThis.fromUuidSync?.(String(ref.regionUuid));
    return region?.behaviors?.get?.(String(ref.behaviorId)) ?? null;
  } catch {
    return null;
  }
}

/** The active-GM edge writing a linked visual. No-throw, and a no-op when it is missing. */
export async function applyInteractableVisualUpdate({
  sceneId,
  visualUuid,
  docId,
  documentName,
  update,
} = {}) {
  const doc = resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName });
  if (!doc?.update) return;
  // Ownership guard (requirement 4): permit the provenance STAMP, which writes no core data, or a
  // core-data write only on a genuine round trip.
  const behavior = resolveLinkedBehaviorForVisual(doc);
  if (!mayApplyInteractableVisualUpdate(doc, update, behavior)) {
    console.warn(
      'Fabricate | Refused an interactable visual update: the resolved document is not a Fabricate interactable visual',
      { sceneId, visualUuid, docId, documentName }
    );
    return;
  }
  try {
    await doc.update(update);
  } catch (error) {
    console.warn('Fabricate | Interactable visual update failed', error);
  }
}

/** Terminal delete of a linked visual. No-throw, and a no-op when it is missing. */
export async function applyInteractableVisualDelete({
  sceneId,
  visualUuid,
  docId,
  documentName,
} = {}) {
  const doc = resolveLinkedVisualDoc({ sceneId, visualUuid, docId, documentName });
  if (!doc?.delete) return;
  // Ownership guard (same requirement): NEVER delete without a genuine round trip. A drifted or
  // crafted uuid, or a minted reverse flag, could otherwise resolve to a foreign document.
  const behavior = resolveLinkedBehaviorForVisual(doc);
  if (!mayDeleteInteractableVisual(doc, behavior)) {
    console.warn(
      'Fabricate | Refused an interactable visual delete: the resolved document is not a Fabricate interactable visual',
      { sceneId, visualUuid, docId, documentName }
    );
    return;
  }
  try {
    await doc.delete();
  } catch (error) {
    console.warn('Fabricate | Interactable visual delete failed', error);
  }
}

/** GM-routed UPDATE seam, exported so the relink edge routes its flag write through it too. */
export function emitInteractableVisualUpdate({ sceneId, visualUuid, documentName, update } = {}) {
  if (isActiveGM()) {
    return applyInteractableVisualUpdate({ sceneId, visualUuid, documentName, update });
  }
  return globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
    action: INTERACTABLE_VISUAL_UPDATE,
    sceneId,
    visualUuid,
    documentName,
    update,
  });
}

/** GM-routed linked-visual DELETE seam, exported for the config panel's remove edges. */
export function emitInteractableVisualDelete({ sceneId, visualUuid, documentName } = {}) {
  if (isActiveGM()) {
    return applyInteractableVisualDelete({ sceneId, visualUuid, documentName });
  }
  return globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, {
    action: INTERACTABLE_VISUAL_DELETE,
    sceneId,
    visualUuid,
    documentName,
  });
}

/** The `emitWrite(update)` seam for one behaviour, routing a `system` update through the GM. */
export function emitInteractableBehaviorWrite(behavior) {
  const writer = createInteractableBehaviorWriter({
    isActiveGM,
    emitUpdate: (payload) => globalThis.game?.socket?.emit?.(INTERACTABLE_SOCKET, payload),
    applyUpdate: applyInteractableBehaviorUpdate,
  });
  return (update) => {
    const ref = identifyRegionBehaviorRef(behavior);
    if (!ref) return;
    return writer.write({
      sceneId: ref.sceneId,
      regionId: ref.regionId,
      behaviorId: ref.behaviorId,
      update,
    });
  };
}

/**
 * Route an inbound `module.fabricate` payload, called from main.js's shared handler so this module
 * owns its branches without a second listener.
 * SENDER AUTHENTICATION (issue 593): the server attaches a trusted, non-forgeable sender id as the
 * SECOND callback argument of a custom module broadcast, from the authenticated session rather
 * than the payload. VISUAL_UPDATE and VISUAL_DELETE are GM-only, a non-GM BEHAVIOR_UPDATE is held
 * to `system.node`, ACTIVATE asserts the requester IS the sender, GRANTED and DENIED need a GM.
 */
export function handleInteractableSocketMessage(payload, deps = {}) {
  const action = payload?.action;
  const senderId = deps.senderId ?? null;
  const senderIsGM =
    typeof deps.isSenderGM === 'function' && senderId !== null
      ? deps.isSenderGM(senderId) === true
      : false;

  // Behaviour write. A GM sender may write any field; a non-GM is held to the scoped node pool.
  if (action === INTERACTABLE_BEHAVIOR_UPDATE) {
    void routeInteractableBehaviorMessage(payload, {
      isActiveGM,
      senderIsGM,
      applyUpdate: applyInteractableBehaviorUpdate,
    });
    return;
  }

  // Linked-visual write. GM-only, so a non-GM sender can mint no reverse flag and repoint nothing.
  if (action === INTERACTABLE_VISUAL_UPDATE) {
    if (isActiveGM()) {
      if (!senderIsGM) {
        console.warn('Fabricate | Refused an interactable visual update from a non-GM sender', {
          senderId,
        });
        return;
      }
      void applyInteractableVisualUpdate(payload);
    }
    return;
  }
  if (action === INTERACTABLE_VISUAL_DELETE) {
    if (isActiveGM()) {
      if (!senderIsGM) {
        console.warn('Fabricate | Refused an interactable visual delete from a non-GM sender', {
          senderId,
        });
        return;
      }
      void applyInteractableVisualDelete(payload);
    }
    return;
  }

  // Activation request to the active GM. The router asserts `userId` matches the sender.
  if (action === INTERACTABLE_ACTIVATE) {
    if (typeof deps.validateAndGrant === 'function') {
      void routeInteractableActivateMessage(payload, {
        isActiveGM,
        senderId,
        validateAndGrant: deps.validateAndGrant,
      });
    }
    return;
  }

  // Grant to the targeted local user. GM to player, so accept only a GM sender.
  if (action === INTERACTABLE_ACTIVATION_GRANTED) {
    if (senderIsGM && typeof deps.openGrant === 'function') {
      void routeInteractableActivationGranted(payload, {
        isLocalUser: (userId) => globalThis.game?.user?.id === userId,
        openGrant: deps.openGrant,
      });
    }
    return;
  }

  // Denial to the targeted local user. GM to player, so accept only a GM sender.
  if (
    action === INTERACTABLE_ACTIVATION_DENIED &&
    senderIsGM &&
    typeof deps.notifyDenied === 'function'
  ) {
    void routeInteractableActivationDenied(payload, {
      isLocalUser: (userId) => globalThis.game?.user?.id === userId,
      notifyDenied: deps.notifyDenied,
    });
  }
}
