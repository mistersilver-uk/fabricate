/**
 * GM-routed BLIND gathering start (player → active GM), issue 901.
 *
 * A blind timed run's secret state — the drawn task, its start-time snapshot and
 * its provisional node reservation — lives in the `fabricate.gatheringBlindRuns`
 * WORLD setting, and Foundry lets only a GM update a world Setting document. A
 * player therefore cannot start such a run themselves: the write rejects with
 * `User <name> lacks permission to update Setting [...]`. Worse, if the player
 * DID own the state, they could forge it — which is the defect issue 901 fixes.
 *
 * This module is the routing decision for that relay, deliberately shaped like
 * {@link module:systems/gatheringNodeSocket} (issue 983) rather than as a second,
 * novel mechanism: validate the payload, decide who applies it, and let the
 * active GM apply locally without a socket round-trip.
 *
 * ADDRESSING ONLY. The payload carries the environment and the acting actor and
 * NOTHING about the outcome: no task id, no weights, no node counts. The active
 * GM re-runs the whole attempt from its OWN state, with the server-attested
 * SENDER as the viewer, so every gate the player would have faced (actor
 * ownership, scene presence, visibility, tools, stamina, node availability
 * including outstanding reservations) is re-evaluated GM-side and the task is
 * drawn GM-side. A forged message can therefore do no more than starting a
 * gather legitimately does, for an actor the sender is already authorized to use
 * — `isActorSelectable({ actor, viewer: sender })` is what enforces that, and it
 * is evaluated against the attested sender, never against a payload field.
 *
 * ABUSE SURFACE, stated precisely: an authenticated user can ask the GM to start
 * blind attempts for actors they own, as fast as they can emit. That is a
 * self-inflicted resource drain (their own stamina, their own node reservations)
 * rather than privilege escalation, and {@link createBlindStartRateLimiter}
 * bounds it to human gathering speed.
 *
 * `main.js` registers the socket handler and injects the Foundry edges
 * (`game.socket.emit`, `game.users.activeGM`, the apply body).
 */

import { createDepletionRateLimiter } from './gatheringNodeSocket.js';

export const GATHERING_BLIND_START = 'gatheringBlindStart';

/** Blind starts one sender may request per window before the GM starts refusing. */
export const BLIND_START_RATE_LIMIT = 20;

/** Rolling window for {@link BLIND_START_RATE_LIMIT}, in milliseconds. */
export const BLIND_START_RATE_WINDOW_MS = 60_000;

function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteractableRef(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const sceneId = trimString(ref.sceneId);
  const regionId = trimString(ref.regionId);
  const behaviorId = trimString(ref.behaviorId);
  if (!sceneId || !regionId || !behaviorId) return null;
  return { sceneId, regionId, behaviorId };
}

/**
 * Validate a blind-start payload. A well-formed payload names the environment
 * and the acting actor, plus the optional scene-interactable scope. Returns the
 * normalized payload, or `null`.
 *
 * @param {object} payload
 * @returns {{ action: string, environmentId: string, actorUuid: string,
 *   taskId: string|null, interactableRef: object|null } | null}
 */
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
    // A discovered blind task the player targeted explicitly. Not a secret — the
    // player already had it revealed — and the GM re-validates it against the
    // environment before starting, so a forged id cannot address a hidden task.
    taskId: trimString(payload.taskId) || null,
    interactableRef: normalizeInteractableRef(payload.interactableRef),
  };
}

/**
 * Build the blind-start writer: the active GM applies locally (no socket
 * round-trip, because an emit never reaches the emitter); any other client emits
 * for the active GM to apply. Mirrors `createGatheringNodeDepletionWriter`.
 *
 * GM-LESS SESSIONS are the known limitation of any GM-relay. With no active GM
 * there is nobody to write the world setting and a bare emit carries no
 * acknowledgement, so the start would vanish silently. `hasActiveGM` lets the
 * writer detect that and report it through `onUnroutable`, which the engine
 * turns into a visible blocked reason — better than a run that never appears.
 *
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {() => boolean} [deps.hasActiveGM]
 * @param {(args: object) => void} [deps.onUnroutable]
 * @param {(payload: object) => void} deps.emitStart
 * @param {(args: object) => (void|Promise<void>)} deps.applyStart
 * @returns {{ start: (args: object) => boolean }} `start` reports whether the
 *   request was routed (emitted or applied) at all.
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
 * Route an inbound blind-start socket message: only the active GM applies. The
 * request is authenticated against the server-attested socket SENDER — Foundry
 * passes a trusted, non-forgeable sender user id as the second callback argument
 * of a custom module socket broadcast. An absent/blank sender is treated as
 * unauthenticated and REFUSED (fail-closed).
 *
 * The sender id is handed to the applier as the VIEWER for the attempt, so the
 * GM re-runs the player's own authorization rather than its own.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => boolean} deps.isActiveGM
 * @param {string} [deps.senderId]
 * @param {(args: object) => (void|Promise<void>)} deps.applyStart
 * @param {(senderId: string) => boolean} [deps.allowSender]
 * @returns {boolean} `true` when this client applied the start.
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

/**
 * Resolve the attested sender of a blind-start request, or `''` when it must be
 * refused. Rate limiting runs LAST so a malformed or unauthenticated message
 * never consumes a sender's budget.
 *
 * @param {object} args
 * @returns {string} The sender id, or `''` when refused.
 */
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
 * Build a per-sender sliding-window rate limiter for inbound blind starts.
 *
 * The sliding-window mechanism is REUSED from the node-depletion channel rather
 * than copied — a second copy would fail the duplication gate — but this is its
 * own INSTANCE with its own budget and its own bounds, so a burst of gathers
 * cannot starve a legitimate start through one shared allowance. State is per
 * active-GM client and in-memory only: a throttle, not an audit log.
 *
 * @param {object} [deps]
 * @param {() => number} [deps.now]
 * @param {number} [deps.limit]
 * @param {number} [deps.windowMs]
 * @returns {(senderId: string) => boolean}
 */
export function createBlindStartRateLimiter({
  now,
  limit = BLIND_START_RATE_LIMIT,
  windowMs = BLIND_START_RATE_WINDOW_MS,
} = {}) {
  return createDepletionRateLimiter({ now, limit, windowMs });
}
