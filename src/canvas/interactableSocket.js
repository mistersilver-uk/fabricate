/**
 * PURE routing and payload validation for GM-routed interactable writes; `main.js` registers the
 * handler and injects the Foundry edges. Players cannot write Region Behaviours they do not own, so
 * behaviour and linked-visual writes emit over `module.fabricate` and only `game.users.activeGM`
 * applies them. A GM client applies its OWN write locally — a socket emit never reaches its emitter
 * — so the GM-on-GM case must branch on `isActiveGM`, exactly as `eventSceneCoordinator` does.
 */

import { trimString } from '../utils/scalars.js';

import { mayApplyNonGmBehaviorUpdate } from './regions/interactableRegionFlags.js';

export const INTERACTABLE_SOCKET = 'module.fabricate';

// The region-first actions: a behaviour `system` write, a linked-visual write or delete, and the
// activate/granted/denied pair carrying the shared activation pipeline.
export const INTERACTABLE_ACTIVATE = 'interactableActivate';
export const INTERACTABLE_ACTIVATION_GRANTED = 'interactableActivationGranted';
export const INTERACTABLE_ACTIVATION_DENIED = 'interactableActivationDenied';
export const INTERACTABLE_BEHAVIOR_UPDATE = 'interactableBehaviorUpdate';
export const INTERACTABLE_VISUAL_UPDATE = 'interactableVisualUpdate';
export const INTERACTABLE_VISUAL_DELETE = 'interactableVisualDelete';

function plainObjectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** Validate an `interactableBehaviorUpdate` payload to its normalized form, or null. */
export function validateBehaviorUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_BEHAVIOR_UPDATE) return null;
  const sceneId = trimString(payload.sceneId);
  const regionId = trimString(payload.regionId);
  const behaviorId = trimString(payload.behaviorId);
  const update = plainObjectOrNull(payload.update);
  if (!sceneId || !regionId || !behaviorId || !update) return null;
  return { action: INTERACTABLE_BEHAVIOR_UPDATE, sceneId, regionId, behaviorId, update };
}

/**
 * Validate a linked-visual update: a scene, the visual by uuid OR docId plus documentName, and an
 * `update` object. Normalized, or null.
 */
export function validateVisualUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_VISUAL_UPDATE) return null;
  const sceneId = trimString(payload.sceneId);
  const visualUuid = trimString(payload.visualUuid);
  const docId = trimString(payload.docId);
  const documentName = trimString(payload.documentName);
  const update = plainObjectOrNull(payload.update);
  if (!sceneId || !update) return null;
  if (!visualUuid && !(docId && documentName)) return null;
  return {
    action: INTERACTABLE_VISUAL_UPDATE,
    sceneId,
    visualUuid: visualUuid || null,
    docId: docId || null,
    documentName: documentName || null,
    update,
  };
}

/** Validate a terminal linked-visual delete payload. Normalized, or null. */
export function validateVisualDeletePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_VISUAL_DELETE) return null;
  const sceneId = trimString(payload.sceneId);
  const visualUuid = trimString(payload.visualUuid);
  const docId = trimString(payload.docId);
  const documentName = trimString(payload.documentName);
  if (!sceneId) return null;
  if (!visualUuid && !(docId && documentName)) return null;
  return {
    action: INTERACTABLE_VISUAL_DELETE,
    sceneId,
    visualUuid: visualUuid || null,
    docId: docId || null,
    documentName: documentName || null,
  };
}

/** Validate a player-to-GM activation request: action, target identity, requesting user. */
export function validateActivatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_ACTIVATE) return null;
  const sceneId = trimString(payload.sceneId);
  const regionId = trimString(payload.regionId);
  const behaviorId = trimString(payload.behaviorId);
  const userId = trimString(payload.userId);
  if (!sceneId || !regionId || !behaviorId || !userId) return null;
  // Pass the full payload through — it carries sourceUuid and interactableType — normalizing
  // only the routing-critical ids.
  return { ...payload, action: INTERACTABLE_ACTIVATE, sceneId, regionId, behaviorId, userId };
}

/** Validate a GM-to-player grant: the target user, the grant shape, and the request identity. */
export function validateActivationGrantedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_ACTIVATION_GRANTED) return null;
  const userId = trimString(payload.userId);
  const requestId = trimString(payload.requestId);
  const behaviorId = trimString(payload.behaviorId);
  if (!userId || (!requestId && !behaviorId)) return null;
  const grant = plainObjectOrNull(payload.grant);
  return {
    ...payload,
    action: INTERACTABLE_ACTIVATION_GRANTED,
    userId,
    requestId: requestId || null,
    behaviorId: behaviorId || null,
    grant: grant || null,
  };
}

/** Validate a GM-to-player denial: the target user and the reason the client localizes. */
export function validateActivationDeniedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_ACTIVATION_DENIED) return null;
  const userId = trimString(payload.userId);
  if (!userId) return null;
  const reason = trimString(payload.reason);
  return { action: INTERACTABLE_ACTIVATION_DENIED, userId, reason: reason || null };
}

/**
 * The behaviour-update router: the active GM applies locally, since an emit never reaches its
 * emitter; every other client emits for the active GM to apply.
 */
export function createInteractableBehaviorWriter({ isActiveGM, emitUpdate, applyUpdate } = {}) {
  return {
    write({ sceneId, regionId, behaviorId, update } = {}) {
      const payload = validateBehaviorUpdatePayload({
        action: INTERACTABLE_BEHAVIOR_UPDATE,
        sceneId,
        regionId,
        behaviorId,
        update,
      });
      if (!payload) return;
      const gm = typeof isActiveGM === 'function' ? isActiveGM() === true : false;
      if (gm) {
        return applyUpdate?.({
          sceneId: payload.sceneId,
          regionId: payload.regionId,
          behaviorId: payload.behaviorId,
          update: payload.update,
        });
      }
      return emitUpdate?.(payload);
    },
  };
}

/**
 * Route an inbound behaviour update. Only the active GM applies, and the write is authenticated
 * against the server-attested socket SENDER (issue 593): a GM sender may write any field, a non-GM
 * sender's `update` must pass the `system.node`-only allowlist, so a non-GM can never forge
 * `system.linkedVisual` or reach `system.state`, presentation or marker config. A refused non-GM
 * write bails LOUDLY so it is observable.
 */
export function routeInteractableBehaviorMessage(
  payload,
  { isActiveGM, senderIsGM, applyUpdate } = {}
) {
  const normalized = validateBehaviorUpdatePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  // Sender authentication: a non-GM may write only the interactable's own scoped node pool.
  if (senderIsGM !== true && !mayApplyNonGmBehaviorUpdate(normalized.update)) {
    console.warn(
      'Fabricate | Refused an interactable behaviour update from a non-GM sender: only system.node writes are permitted',
      {
        sceneId: normalized.sceneId,
        regionId: normalized.regionId,
        behaviorId: normalized.behaviorId,
      }
    );
    return false;
  }
  applyUpdate?.({
    sceneId: normalized.sceneId,
    regionId: normalized.regionId,
    behaviorId: normalized.behaviorId,
    update: normalized.update,
  });
  return true;
}

/**
 * Route an inbound activation request: only the active GM validates and grants, through the
 * `validateAndGrant` collaborator that owns the Foundry edges.
 * Sender authentication (issue 593): the request's `userId` MUST equal the server-attested
 * `senderId`, so one player cannot request activation as another.
 */
export function routeInteractableActivateMessage(
  payload,
  { isActiveGM, senderId, validateAndGrant } = {}
) {
  const normalized = validateActivatePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  // Impersonation guard, FAIL-CLOSED: an absent or blank senderId is unauthenticated and
  // rejected, matching the not-GM handling on the behaviour and visual edges. Real Foundry always
  // attaches the second-argument senderId; a raw crafted emit does not.
  const sender = senderId === undefined || senderId === null ? '' : String(senderId);
  if (!sender || normalized.userId !== sender) {
    console.warn(
      'Fabricate | Refused an interactable activation request: payload userId does not match the authenticated sender',
      { userId: normalized.userId, senderId: sender }
    );
    return false;
  }
  validateAndGrant?.(normalized);
  return true;
}

/** Route an inbound grant: only the targeted local user opens it, through `openGrant`. */
export function routeInteractableActivationGranted(payload, { isLocalUser, openGrant } = {}) {
  const normalized = validateActivationGrantedPayload(payload);
  if (!normalized) return false;
  if (typeof isLocalUser === 'function' && isLocalUser(normalized.userId) !== true) return false;
  openGrant?.(normalized);
  return true;
}

/** Route an inbound denial: only the targeted local user is notified, through `notifyDenied`. */
export function routeInteractableActivationDenied(payload, { isLocalUser, notifyDenied } = {}) {
  const normalized = validateActivationDeniedPayload(payload);
  if (!normalized) return false;
  if (typeof isLocalUser === 'function' && isLocalUser(normalized.userId) !== true) return false;
  notifyDenied?.(normalized.reason);
  return true;
}
