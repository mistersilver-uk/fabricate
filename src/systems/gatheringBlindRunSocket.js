/**
 * The GM-routed blind gathering start (issue 901), shaped like `gatheringNodeSocket.js`: a player
 * cannot write the `fabricate.gatheringBlindRuns` world setting, so the active GM starts the run.
 * The payload is addressing only (environment, actor, optional interactable), never an outcome.
 * The GM re-runs the whole attempt from its own state with the server-attested sender as the
 * viewer, so every gate is re-evaluated and the task drawn GM-side; `isActorSelectable({ actor,
 * viewer: sender })` limits a forged message to what a legitimate start could do. The remaining
 * abuse is a self-inflicted drain, bounded by {@link createBlindStartRateLimiter}. The composition
 * root registers the handler and injects `game.socket.emit`, `game.users.activeGM` and the apply
 * body.
 */

import { trimString } from '../utils/scalars.js';

import { createDepletionRateLimiter } from './gatheringNodeSocket.js';

export const GATHERING_BLIND_START = 'gatheringBlindStart';

/** Blind starts one sender may request per window before the GM starts refusing. */
export const BLIND_START_RATE_LIMIT = 20;

/** Rolling window for {@link BLIND_START_RATE_LIMIT}, in milliseconds. */
export const BLIND_START_RATE_WINDOW_MS = 60_000;

function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = trimString(ref.sceneId);
  const regionId = trimString(ref.regionId);
  const behaviorId = trimString(ref.behaviorId);
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

/** The normalized payload, naming the environment and actor, or `null`. */
export function validateGatheringBlindStartPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== GATHERING_BLIND_START) return null;
  const environmentId = trimString(payload.environmentId);
  const actorUuid = trimString(payload.actorUuid);
  if (!environmentId || !actorUuid) return null;
  return {
    action: GATHERING_BLIND_START,
    environmentId,
    actorUuid,
    // An already revealed task the player targeted; the GM re-validates it, so a forged id
    // cannot address a hidden task.
    taskId: trimString(payload.taskId) || null,
    interactableRef: normalizeInteractableRef(payload.interactableRef),
  };
}

/**
 * The blind-start writer: the active GM applies locally, since an emit never reaches its
 * emitter, and any other client emits. With no active GM, `onUnroutable` gets the payload so the
 * engine shows a blocked reason rather than a run that never appears. `start` reports whether the
 * request was routed.
 */
export function createGatheringBlindStartWriter({
  isActiveGM,
  hasActiveGM = null,
  onUnroutable = null,
  emitStart,
  applyStart,
} = {}) {
  return {
    start({ environmentId, actorUuid, taskId = null, interactableRef = null } = {}) {
      const payload = validateGatheringBlindStartPayload({
        action: GATHERING_BLIND_START,
        environmentId,
        actorUuid,
        taskId,
        interactableRef,
      });
      if (!payload) return false;
      if (typeof isActiveGM === 'function' && isActiveGM() === true) {
        void applyStart?.(payload);
        return true;
      }
      if (typeof hasActiveGM === 'function' && hasActiveGM() !== true) {
        onUnroutable?.(payload);
        return false;
      }
      emitStart?.(payload);
      return true;
    },
  };
}

/**
 * Apply an inbound blind start on the active GM alone, `true` when applied. Foundry passes a
 * module socket handler the server-attested sender id as its second argument; a blank sender is
 * refused, and the sender becomes the attempt's viewer so the player's own authorization runs.
 */
export function routeGatheringBlindStartMessage(
  payload,
  { isActiveGM, senderId, applyStart, allowSender = null } = {}
) {
  const normalized = validateGatheringBlindStartPayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  const sender = authenticateBlindStartSender({ senderId, allowSender, request: normalized });
  if (!sender) return false;
  void applyStart?.({ ...normalized, senderId: sender });
  return true;
}

/** The attested sender or `''`; the rate limit runs last, so a bad message spends no budget. */
function authenticateBlindStartSender({ senderId, allowSender, request }) {
  const sender = senderId === undefined || senderId === null ? '' : String(senderId);
  if (!sender) {
    console.warn('Fabricate | Refused a blind gathering start from an unauthenticated sender', {
      environmentId: request.environmentId,
    });
    return '';
  }
  if (typeof allowSender === 'function' && allowSender(sender) !== true) {
    console.warn('Fabricate | Refused a blind gathering start: sender rate limit exceeded', {
      senderId: sender,
      environmentId: request.environmentId,
    });
    return '';
  }
  return sender;
}

/**
 * A per-sender sliding-window limiter for blind starts: the depletion channel's mechanism, but its
 * own instance and budget. In-memory on the active GM, a throttle rather than an audit log.
 */
export function createBlindStartRateLimiter({
  now,
  limit = BLIND_START_RATE_LIMIT,
  windowMs = BLIND_START_RATE_WINDOW_MS,
} = {}) {
  return createDepletionRateLimiter({ now, limit, windowMs });
}
