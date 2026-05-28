/**
 * Coordinates the "linked scene opens when a hazard drops" behaviour.
 *
 * Gathering attempts run on the initiating user's client (often a player), so
 * pulling players to a hazard's linked scene requires routing through the GM.
 * This module holds the pure, testable logic; the Foundry glue (dialog, socket
 * registration, scene.view) lives in main.js and injects the accessors below.
 */

export const HAZARD_SCENE_SOCKET = 'module.fabricate';

/**
 * Reduce a list of triggered hazards to the unique linked scenes that should
 * prompt the GM. Hazards without a linkedSceneUuid are ignored; duplicate
 * scene uuids are collapsed (first hazard name wins).
 *
 * @param {Array<object>} hazards
 * @returns {Array<{ sceneUuid: string, hazardName: string }>}
 */
export function collectLinkedHazardScenes(hazards = []) {
  const seen = new Set();
  const result = [];
  for (const hazard of Array.isArray(hazards) ? hazards : []) {
    const sceneUuid = String(hazard?.linkedSceneUuid || '').trim();
    if (!sceneUuid || seen.has(sceneUuid)) continue;
    seen.add(sceneUuid);
    result.push({ sceneUuid, hazardName: String(hazard?.name || '').trim() });
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
 * @param {(entry: { sceneUuid: string, hazardName: string }) => void} deps.emitPrompt
 * @param {(entry: { sceneUuid: string, hazardName: string }) => void} deps.showPrompt
 */
export function createHazardSceneTrigger({ isGM, emitPrompt, showPrompt } = {}) {
  return {
    apply({ hazards } = {}) {
      const scenes = collectLinkedHazardScenes(hazards);
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
 * @param {(entry: { sceneUuid: string, hazardName: string }) => void} deps.showPrompt
 * @param {(sceneUuid: string) => void} deps.viewSceneForSelf
 */
export function routeHazardSceneSocketMessage(payload, { currentUserId, isActiveGM, showPrompt, viewSceneForSelf } = {}) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.action === 'hazardScenePrompt') {
    if (typeof isActiveGM === 'function' && !isActiveGM()) return;
    showPrompt?.({ sceneUuid: payload.sceneUuid, hazardName: payload.hazardName });
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
