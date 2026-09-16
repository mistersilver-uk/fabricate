// Pure singleton decisions for the player `InteractionPromptApp`, in a plain `.js` module so they
// are unit-testable without the Svelte compiler. A bare `requestRef` dismisses whatever is showing;
// otherwise it must MATCH, so a stale tokenExit cannot tear down a newer prompt.

export function planPromptDismiss(liveRef, requestRef) {
  if (requestRef === undefined || requestRef === null) return true;
  return String(liveRef ?? '') === String(requestRef);
}

export function buildPromptBehaviorRef({ sceneId, regionId, behaviorId } = {}) {
  if (!sceneId || !regionId || !behaviorId) return null;
  return `${sceneId}.${regionId}.${behaviorId}`;
}
