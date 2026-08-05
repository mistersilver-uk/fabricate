/**
 * GM-routed ENVIRONMENT resource-node depletion (player → active GM).
 *
 * An environment's node runtime state lives in `environment.nodeRuntime[taskId]`,
 * persisted in the `fabricate.gatheringEnvironments` WORLD setting. Foundry only
 * lets a GM update a world Setting document, so a player who gathers from a
 * node-backed task cannot write the decrement themselves: the direct write rejects
 * with `User <name> lacks permission to update Setting [...]`, which surfaces as an
 * unhandled rejection and leaves the pool un-depleted. The interactable-scoped pool
 * (issue 302) already routes its write through the active GM over the shared
 * `module.fabricate` socket; this module is the equivalent for the environment scope.
 *
 * The payload deliberately carries ONLY the addressing (`environmentId` + `taskId`),
 * never a node object: the active GM recomputes "consume one unit" from its OWN
 * stored state via `GatheringNodeService#applyEnvironmentNodeDepletion`. That means
 * a forged message can do no more than what gathering the task legitimately does
 * (decrement by one), cannot restock a pool, cannot raise `max`, and cannot flip
 * `showCountsToPlayers`; it also makes two players depleting the same pool at once
 * additive instead of last-write-wins.
 *
 * ABUSE SURFACE, stated precisely. Per message, a forged request is bounded to exactly
 * what gathering the task legitimately does. In AGGREGATE it is not: the applier
 * re-checks only the node economy toggle, not whether the sender could actually reach
 * that task (scene access, realm, stamina, blocked reasons), so an authenticated user
 * could address any `(environmentId, taskId)` in the world. The residual is therefore
 * denial-of-RESOURCE, not privilege escalation, and it is recoverable — a GM can
 * rewrite `nodeRuntime` from the environment record inspector, including for a drained
 * `nonRegenerating` pool that `restockNode` refuses to top up. {@link createDepletionRateLimiter}
 * bounds the rate to human gathering speed so a loop cannot drain the world; closing
 * the gap fully would mean re-running `evaluateStart` per request, which itself writes
 * actor state (stamina seeding) and so is not a free validation.
 *
 * This module holds the PURE routing decision (payload validation, who applies,
 * GM-on-GM local apply). `main.js` registers the socket handler and injects the thin
 * Foundry edges (`game.socket.emit`, `game.users.activeGM`, the apply body).
 */

export const GATHERING_NODE_DEPLETE = 'gatheringNodeDeplete';

/** Depletions one sender may apply per window before the GM starts refusing. */
export const DEPLETION_RATE_LIMIT = 30;

/** Rolling window for {@link DEPLETION_RATE_LIMIT}, in milliseconds. */
export const DEPLETION_RATE_WINDOW_MS = 60_000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate a node-depletion payload. A well-formed payload names the environment
 * and the task whose pool loses one unit. Returns the normalized payload, or `null`.
 *
 * @param {object} payload
 * @returns {{ action: string, environmentId: string, taskId: string } | null}
 */
export function validateGatheringNodeDepletePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.action !== GATHERING_NODE_DEPLETE) return null;
  const environmentId = trimString(payload.environmentId);
  const taskId = trimString(payload.taskId);
  if (!environmentId || !taskId) return null;
  return { action: GATHERING_NODE_DEPLETE, environmentId, taskId };
}

/**
 * Build the depletion writer: the active GM applies locally (no socket round-trip,
 * because an emit never reaches the emitter); any other client emits the socket
 * message for the active GM to apply. Mirrors `createInteractableBehaviorWriter`.
 *
 * GM-LESS SESSIONS are a known limitation of any GM-relay (the issue-302 interactable
 * writer has the same characteristic): with no active GM there is nobody to apply the
 * write, and a bare socket emit carries no acknowledgement, so the decrement would
 * vanish silently. `hasActiveGM` lets the writer detect that and report it through
 * `onUnroutable` instead of emitting into the void. The gather itself still succeeds —
 * the attempt does not gate on this write — the pool simply does not deplete, which is
 * the same outcome as before but now observable. When `hasActiveGM` is not injected the
 * writer assumes a GM is reachable, preserving the plain two-branch behaviour.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {() => boolean} [deps.hasActiveGM] Whether ANY GM is connected to apply the write.
 * @param {(args: { environmentId: string, taskId: string }) => void} [deps.onUnroutable]
 *   Called instead of emitting when no active GM can apply the depletion.
 * @param {(payload: object) => void} deps.emitDeplete
 * @param {(args: { environmentId: string, taskId: string }) => (void|Promise<void>)} deps.applyDeplete
 * @returns {{ deplete: (args: { environmentId: string, taskId: string }) => (void|Promise<void>) }}
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
 * Route an inbound depletion socket message: only the active GM applies. The write
 * is authenticated against the server-attested socket SENDER — Foundry passes a
 * trusted, non-forgeable sender user id as the second callback argument of a custom
 * module socket broadcast. An absent/blank sender is treated as unauthenticated and
 * REFUSED (fail-closed), matching the interactable activation edge; real Foundry
 * always attaches it, so a legitimate request never trips this.
 *
 * Any authenticated user may request a depletion — gathering is a player action, and
 * the applier bounds the effect to one unit off the addressed pool.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {string} [deps.senderId] The server-attested socket sender's user id.
 * @param {(args: { environmentId: string, taskId: string }) => (void|Promise<void>)} deps.applyDeplete
 * @param {(senderId: string) => boolean} [deps.allowSender] Per-sender rate gate.
 * @returns {boolean} `true` when this client applied the depletion.
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
  // Rate limit LAST, so a malformed or unauthenticated message never consumes a
  // sender's budget. Optional: without the seam this stays an un-limited relay.
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
 * Build a per-sender sliding-window rate limiter for inbound depletions.
 *
 * Gathering is a deliberate, one-at-a-time player action, so a legitimate client never
 * approaches {@link DEPLETION_RATE_LIMIT} within {@link DEPLETION_RATE_WINDOW_MS}; a
 * scripted loop trying to drain every pool in the world exceeds it immediately. State
 * is per active-GM client and in-memory only — a throttle, not an audit log, and a
 * reconnecting GM starts fresh. That is appropriate for a bound whose job is to make
 * bulk abuse impractical, not impossible.
 *
 * @param {object} [deps]
 * @param {() => number} [deps.now] Millisecond clock (injected so tests need no timers).
 * @param {number} [deps.limit]
 * @param {number} [deps.windowMs]
 * @returns {(senderId: string) => boolean} True when the sender may apply one more.
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
      // Keep the trimmed window so a sustained flood stays refused rather than
      // resetting its own budget on every rejected message.
      hits.set(key, recent);
      return false;
    }
    recent.push(at);
    hits.set(key, recent);
    return true;
  };
}
