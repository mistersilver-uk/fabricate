/**
 * GM-routed behaviour-state writes for canvas Interactables (region-first model).
 *
 * Players cannot write Region Behaviours they do not own, so behaviour-state
 * mutations (the GM config panel's enable/lock/visual-link writes) and any
 * linked-visual write are not written directly by arbitrary clients. They emit an
 * action over the existing `module.fabricate` socket; only `game.users.activeGM`
 * applies the `behavior.update(...)` / linked-visual write. A GM client applies
 * its OWN write locally without round-tripping the socket (socket emits never
 * reach the emitter), so the GM-on-GM case must branch on `isActiveGM` exactly
 * like `eventSceneCoordinator`.
 *
 * NOTE: a gathering-task interactable carries NO per-interactable node pool —
 * depletion/respawn is owned by the environment's `nodeRuntime[taskId]`, so these
 * behaviour writes never carry node state.
 *
 * This module holds the PURE routing decision (who applies, payload validation);
 * `main.js` registers the socket handler and injects the thin Foundry edges
 * (`behavior.update`, `game.socket.emit`).
 */

export const INTERACTABLE_SOCKET = 'module.fabricate';

// Region-first model actions. The behaviour update routes a behaviour `system`
// write (e.g. the GM config panel's `{ system: { state } }` / linked-visual link
// edits) to the active GM; the visual update/delete write a linked
// Tile/Drawing/Token (e.g. relink reverse-flag writes); activate/granted carry the
// shared activation pipeline.
export const INTERACTABLE_ACTIVATE = 'interactableActivate';
export const INTERACTABLE_ACTIVATION_GRANTED = 'interactableActivationGranted';
export const INTERACTABLE_ACTIVATION_DENIED = 'interactableActivationDenied';
export const INTERACTABLE_BEHAVIOR_UPDATE = 'interactableBehaviorUpdate';
export const INTERACTABLE_VISUAL_UPDATE = 'interactableVisualUpdate';
export const INTERACTABLE_VISUAL_DELETE = 'interactableVisualDelete';

// ---------------------------------------------------------------------------
// Region-first model: behaviour-update + linked-visual + activation routing.
// ---------------------------------------------------------------------------

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function plainObjectOrNull(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * Validate an `interactableBehaviorUpdate` payload. Identifies a scene + region +
 * behaviour and carries an `update` object of behaviour-document changes to merge
 * (e.g. `{ system: { state } }`). Returns the normalized payload, or `null`.
 *
 * @param {object} payload
 * @returns {{ action: string, sceneId: string, regionId: string, behaviorId: string, update: object } | null}
 */
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
 * Validate a linked-visual update payload. A well-formed payload identifies a
 * scene + the linked visual (by uuid OR by docId+documentName) and carries an
 * `update` object. Returns the normalized payload, or `null`.
 *
 * @param {object} payload
 * @returns {object | null}
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
    update
  };
}

/**
 * Validate a linked-visual delete payload (terminal delete of the marker).
 * Identifies a scene + the linked visual (by uuid OR docId+documentName).
 *
 * @param {object} payload
 * @returns {object | null}
 */
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
    documentName: documentName || null
  };
}

/**
 * Validate an activation request payload (the full player → active-GM request).
 * Requires the action + scene/region/behaviour identity + the requesting user.
 *
 * @param {object} payload
 * @returns {object | null}
 */
export function validateActivatePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_ACTIVATE) return null;
  const sceneId = trimString(payload.sceneId);
  const regionId = trimString(payload.regionId);
  const behaviorId = trimString(payload.behaviorId);
  const userId = trimString(payload.userId);
  if (!sceneId || !regionId || !behaviorId || !userId) return null;
  // Pass the full payload through (it carries sourceUuid/interactableType/etc.),
  // normalizing only the routing-critical ids.
  return { ...payload, action: INTERACTABLE_ACTIVATE, sceneId, regionId, behaviorId, userId };
}

/**
 * Validate an activation-granted payload (active-GM → requesting player). Carries
 * the target user + the grant shape; identifies the request (by requestId or
 * behaviorId).
 *
 * @param {object} payload
 * @returns {object | null}
 */
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
    grant: grant || null
  };
}

/**
 * Validate an activation-denied payload (active-GM → requesting player). Carries
 * the target user + the denial `reason` (a validation reason string the receiving
 * client maps to a localized notice). Returns the normalized payload, or `null`.
 *
 * @param {object} payload
 * @returns {{ action: string, userId: string, reason: string|null } | null}
 */
export function validateActivationDeniedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== INTERACTABLE_ACTIVATION_DENIED) return null;
  const userId = trimString(payload.userId);
  if (!userId) return null;
  const reason = trimString(payload.reason);
  return { action: INTERACTABLE_ACTIVATION_DENIED, userId, reason: reason || null };
}

/**
 * Build the behaviour-update router: the active GM applies the behaviour update
 * locally (no socket round-trip, because an emit never reaches the emitter); any
 * other client emits the socket message for the active GM to apply.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(payload: object) => void} deps.emitUpdate
 * @param {(args: { sceneId: string, regionId: string, behaviorId: string, update: object }) => (void|Promise<void>)} deps.applyUpdate
 * @returns {{ write: (args: { sceneId: string, regionId: string, behaviorId: string, update: object }) => (void|Promise<void>) }}
 */
export function createInteractableBehaviorWriter({ isActiveGM, emitUpdate, applyUpdate } = {}) {
  return {
    write({ sceneId, regionId, behaviorId, update } = {}) {
      const payload = validateBehaviorUpdatePayload({
        action: INTERACTABLE_BEHAVIOR_UPDATE,
        sceneId,
        regionId,
        behaviorId,
        update
      });
      if (!payload) return undefined;
      const gm = typeof isActiveGM === 'function' ? isActiveGM() === true : false;
      if (gm) {
        return applyUpdate?.({
          sceneId: payload.sceneId,
          regionId: payload.regionId,
          behaviorId: payload.behaviorId,
          update: payload.update
        });
      }
      return emitUpdate?.(payload);
    }
  };
}

/**
 * Route an inbound behaviour-update socket message: only the active GM applies.
 * Returns `true` when applied, `false` otherwise.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(args: { sceneId: string, regionId: string, behaviorId: string, update: object }) => (void|Promise<void>)} deps.applyUpdate
 * @returns {boolean}
 */
export function routeInteractableBehaviorMessage(payload, { isActiveGM, applyUpdate } = {}) {
  const normalized = validateBehaviorUpdatePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  applyUpdate?.({
    sceneId: normalized.sceneId,
    regionId: normalized.regionId,
    behaviorId: normalized.behaviorId,
    update: normalized.update
  });
  return true;
}

/**
 * Route an inbound activation request: only the active GM validates + grants. The
 * `validateAndGrant` collaborator performs the full validation checklist + emits
 * the grant (it owns the Foundry edges). Returns `true` when handled by the GM.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {(request: object) => (void|Promise<void>)} deps.validateAndGrant
 * @returns {boolean}
 */
export function routeInteractableActivateMessage(payload, { isActiveGM, validateAndGrant } = {}) {
  const normalized = validateActivatePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  validateAndGrant?.(normalized);
  return true;
}

/**
 * Route an inbound activation-granted message: only the targeted local user opens
 * the granted UI. The `openGrant` collaborator opens the session on this client.
 * Returns `true` when this client opened the grant, `false` otherwise.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {(userId: string) => boolean} deps.isLocalUser
 * @param {(grant: object) => (void|Promise<void>)} deps.openGrant
 * @returns {boolean}
 */
export function routeInteractableActivationGranted(payload, { isLocalUser, openGrant } = {}) {
  const normalized = validateActivationGrantedPayload(payload);
  if (!normalized) return false;
  if (typeof isLocalUser === 'function' && isLocalUser(normalized.userId) !== true) return false;
  openGrant?.(normalized);
  return true;
}

/**
 * Route an inbound activation-denied message: only the targeted local user is
 * notified WHY the activation was rejected. The `notifyDenied` collaborator shows
 * the localized warning on this client. Mirrors {@link routeInteractableActivationGranted}.
 * Returns `true` when this client notified the user, `false` otherwise.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {(userId: string) => boolean} deps.isLocalUser
 * @param {(reason: string|null) => (void|Promise<void>)} deps.notifyDenied
 * @returns {boolean}
 */
export function routeInteractableActivationDenied(payload, { isLocalUser, notifyDenied } = {}) {
  const normalized = validateActivationDeniedPayload(payload);
  if (!normalized) return false;
  if (typeof isLocalUser === 'function' && isLocalUser(normalized.userId) !== true) return false;
  notifyDenied?.(normalized.reason);
  return true;
}
