/**
 * The GM-routed environment node depletion: `environment.nodeRuntime` lives in the
 * `fabricate.gatheringEnvironments` world setting, which a player cannot update, so the active GM
 * applies the decrement, as issue 302 does for interactable pools. The payload is addressing only;
 * `GatheringNodeService#applyEnvironmentNodeDepletion` recomputes one unit from GM state, so a
 * forged message can only take one unit and concurrent depletions add up. In aggregate the applier
 * re-checks only the economy toggle, not reachability, leaving a recoverable denial of resource,
 * bounded by {@link createDepletionRateLimiter}. The composition root registers the handler and
 * injects `game.socket.emit`, `game.users.activeGM` and the apply body.
 */

import { trimString } from '../utils/scalars.js';

export const GATHERING_NODE_DEPLETE = 'gatheringNodeDeplete';

/** Depletions one sender may apply per window before the GM starts refusing. */
export const DEPLETION_RATE_LIMIT = 30;

/** Rolling window for {@link DEPLETION_RATE_LIMIT}, in milliseconds. */
export const DEPLETION_RATE_WINDOW_MS = 60_000;

/** The normalized payload naming the environment and task, or `null`. */
export function validateGatheringNodeDepletePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== GATHERING_NODE_DEPLETE) return null;
  const environmentId = trimString(payload.environmentId);
  const taskId = trimString(payload.taskId);
  if (!environmentId || !taskId) return null;
  return { action: GATHERING_NODE_DEPLETE, environmentId, taskId };
}

/**
 * The depletion writer: the active GM applies locally, since an emit never reaches its emitter,
 * and any other client emits. With no active GM, `onUnroutable` is called instead: the gather
 * succeeds and only the pool does not deplete. Without `hasActiveGM` a GM is assumed.
 */
export function createGatheringNodeDepletionWriter({
  isActiveGM,
  hasActiveGM = null,
  onUnroutable = null,
  emitDeplete,
  applyDeplete,
} = {}) {
  return {
    deplete({ environmentId, taskId } = {}) {
      const payload = validateGatheringNodeDepletePayload({
        action: GATHERING_NODE_DEPLETE,
        environmentId,
        taskId,
      });
      if (!payload) return;
      const gm = typeof isActiveGM === 'function' ? isActiveGM() === true : false;
      if (gm) {
        return applyDeplete?.({ environmentId: payload.environmentId, taskId: payload.taskId });
      }
      if (typeof hasActiveGM === 'function' && hasActiveGM() !== true) {
        onUnroutable?.({ environmentId: payload.environmentId, taskId: payload.taskId });
        return;
      }
      return emitDeplete?.(payload);
    },
  };
}

/**
 * Apply an inbound depletion on the active GM alone, `true` when applied. Foundry passes a module
 * socket handler the server-attested sender id as its second argument, and a blank sender is
 * refused; any authenticated user may deplete, as gathering is a player action.
 */
export function routeGatheringNodeDepleteMessage(
  payload,
  { isActiveGM, senderId, applyDeplete, allowSender = null } = {}
) {
  const normalized = validateGatheringNodeDepletePayload(payload);
  if (!normalized) return false;
  if (typeof isActiveGM === 'function' && isActiveGM() !== true) return false;
  const sender = senderId === undefined || senderId === null ? '' : String(senderId);
  if (!sender) {
    console.warn('Fabricate | Refused a gathering node depletion from an unauthenticated sender', {
      environmentId: normalized.environmentId,
      taskId: normalized.taskId,
    });
    return false;
  }
  // Last, so a bad message spends no budget; without the seam the relay is unlimited.
  if (typeof allowSender === 'function' && allowSender(sender) !== true) {
    console.warn('Fabricate | Refused a gathering node depletion: sender rate limit exceeded', {
      senderId: sender,
      environmentId: normalized.environmentId,
      taskId: normalized.taskId,
    });
    return false;
  }
  applyDeplete?.({ environmentId: normalized.environmentId, taskId: normalized.taskId });
  return true;
}

/**
 * A per-sender sliding-window limiter, `true` while a sender may apply one more. In-memory on the
 * active GM and reset by a reconnect: it makes bulk abuse impractical, not impossible.
 */
export function createDepletionRateLimiter({
  now = () => Date.now(),
  limit = DEPLETION_RATE_LIMIT,
  windowMs = DEPLETION_RATE_WINDOW_MS,
} = {}) {
  const hits = new Map();
  return (senderId) => {
    const key = String(senderId ?? '');
    if (!key) return false;
    const at = Number(now());
    const recent = (hits.get(key) ?? []).filter((stamp) => at - stamp < windowMs);
    if (recent.length >= limit) {
      // Keep the trimmed window, or a sustained flood would reset its own budget.
      hits.set(key, recent);
      return false;
    }
    recent.push(at);
    hits.set(key, recent);
    return true;
  };
}
