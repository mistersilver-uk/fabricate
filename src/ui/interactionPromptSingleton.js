/**
 * PURE singleton decisions for the player {@link InteractionPromptApp}.
 *
 * Kept in a plain `.js` module (no Svelte/ApplicationV2 import chain) so the
 * show/dismiss singleton logic is unit-testable under `node:test` without the
 * Svelte compiler — the `.svelte.js` app shell imports these.
 */

/**
 * Should a `dismiss(requestRef)` close the live prompt whose ref is `liveRef`?
 *
 * A bare/undefined `requestRef` always dismisses (an explicit "close whatever is
 * showing"); otherwise only when it MATCHES `liveRef`, so a stale tokenExit for a
 * region the player already left does not tear down a newer prompt.
 *
 * @param {string|null} liveRef     The ref the live prompt is showing.
 * @param {string|undefined|null} requestRef  The ref the dismiss targets.
 * @returns {boolean}
 */
export function planPromptDismiss(liveRef, requestRef) {
  if (requestRef === undefined || requestRef === null) return true;
  return String(liveRef ?? '') === String(requestRef);
}

/**
 * Build the stable behaviour-ref key (the prompt singleton key) from a
 * `{ sceneId, regionId, behaviorId }` ref. Returns null when incomplete.
 *
 * @param {{ sceneId?: string, regionId?: string, behaviorId?: string }} ref
 * @returns {string|null}
 */
export function buildPromptBehaviorRef({ sceneId, regionId, behaviorId } = {}) {
  if (!sceneId || !regionId || !behaviorId) return null;
  return `${sceneId}.${regionId}.${behaviorId}`;
}
