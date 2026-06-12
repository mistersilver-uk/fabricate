/**
 * Coordinates the "linked scene opens when an event drops" behaviour.
 *
 * Gathering attempts run on the initiating user's client (often a player), so
 * pulling players to an event's linked scene requires routing through the GM.
 * This module holds the pure, testable logic; the Foundry glue (dialog, socket
 * registration, scene.view) lives in main.js and injects the accessors below.
 */

export const EVENT_SCENE_SOCKET = 'module.fabricate';

/**
 * Reduce a list of triggered events to the unique linked scenes that should
 * prompt the GM. Events without a linkedSceneUuid are ignored; duplicate
 * scene uuids are collapsed (first event name wins).
 *
 * @param {Array<object>} events
 * @returns {Array<{ sceneUuid: string, eventName: string }>}
 */
export function collectLinkedEventScenes(events = []) {
  const seen = new Set();
  const result = [];
  for (const event of Array.isArray(events) ? events : []) {
    const sceneUuid = String(event?.linkedSceneUuid || '').trim();
    if (!sceneUuid || seen.has(sceneUuid)) continue;
    seen.add(sceneUuid);
    result.push({ sceneUuid, eventName: String(event?.name || '').trim() });
  }
  return result;
}

/**
 * Build the engine-facing trigger service. On the GM client it shows the prompt
 * directly; on a player client it emits a socket message for the GM to handle
 * (socket emits never reach the emitting client, so the branch is required).
 *
 * @param {object} deps
 * @param {() => boolean} deps.isGM
 * @param {(entry: { sceneUuid: string, eventName: string }) => void} deps.emitPrompt
 * @param {(entry: { sceneUuid: string, eventName: string }) => void} deps.showPrompt
 */
export function createEventSceneTrigger({ isGM, emitPrompt, showPrompt } = {}) {
  return {
    apply({ events } = {}) {
      const scenes = collectLinkedEventScenes(events);
      if (scenes.length === 0) return;
      const gm = typeof isGM === 'function' ? isGM() : false;
      for (const entry of scenes) {
        if (gm) {
          showPrompt?.(entry);
        } else {
          emitPrompt?.(entry);
        }
      }
    }
  };
}

/**
 * Route an inbound socket message. Pure aside from the injected side-effects.
 *
 * @param {object} payload
 * @param {object} deps
 * @param {() => string} deps.currentUserId
 * @param {() => boolean} deps.isActiveGM   Only the primary GM shows the prompt.
 * @param {(entry: { sceneUuid: string, eventName: string }) => void} deps.showPrompt
 * @param {(sceneUuid: string) => void} deps.viewSceneForSelf
 */
export function routeEventSceneSocketMessage(payload, { currentUserId, isActiveGM, showPrompt, viewSceneForSelf } = {}) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.action === 'eventScenePrompt') {
    if (typeof isActiveGM === 'function' && !isActiveGM()) return;
    showPrompt?.({ sceneUuid: payload.sceneUuid, eventName: payload.eventName });
    return;
  }
  if (payload.action === 'pullToScene') {
    const userIds = Array.isArray(payload.userIds) ? payload.userIds.map(id => String(id)) : [];
    const me = typeof currentUserId === 'function' ? String(currentUserId() || '') : '';
    if (me && userIds.includes(me)) {
      viewSceneForSelf?.(payload.sceneUuid);
    }
  }
}
