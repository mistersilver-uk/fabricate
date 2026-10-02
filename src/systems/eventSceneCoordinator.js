/**
 * The linked scene an event opens when it drops. Attempts run on the initiating client, often a
 * player's, so the GM is routed the prompt; the Foundry glue (dialog, socket, `scene.view`) is
 * injected.
 */

export const EVENT_SCENE_SOCKET = 'module.fabricate';

/** The unique linked scenes to prompt for, first event name winning a duplicate. */
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

/** The GM shows the prompt directly, since an emit never reaches its emitter; a player emits. */
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
    },
  };
}

/** Route an inbound message: only the active GM prompts, and each named user pulls itself. */
export function routeEventSceneSocketMessage(
  payload,
  { currentUserId, isActiveGM, showPrompt, viewSceneForSelf } = {}
) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.action === 'eventScenePrompt') {
    if (typeof isActiveGM === 'function' && !isActiveGM()) return;
    showPrompt?.({ sceneUuid: payload.sceneUuid, eventName: payload.eventName });
    return;
  }
  if (payload.action === 'pullToScene') {
    const userIds = Array.isArray(payload.userIds) ? payload.userIds.map(String) : [];
    const me = typeof currentUserId === 'function' ? String(currentUserId() || '') : '';
    if (me && userIds.includes(me)) {
      viewSceneForSelf?.(payload.sceneUuid);
    }
  }
}
