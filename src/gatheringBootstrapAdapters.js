import { sceneRegionUuidsContainingToken } from './canvas/regionHitTest.js';
import { arrayOrEmpty as normalizeList } from './utils/scalars.js';

/**
 * The selectable gathering actor adapter GatheringEngine uses; the engine passes an explicit viewer,
 * direct callers falling back to the current user.
 */
export function createGatheringSelectableActorsGetter({
  getActors,
  getCurrentUser,
  isSelectable
} = {}) {
  return function getGatheringSelectableActors({ viewer = getCurrentUser?.() ?? null } = {}) {
    return normalizeFoundryCollection(getActors?.())
      .filter(actor => isSelectable?.(actor, viewer) === true);
  };
}

/**
 * A token's scene UUID across the shapes V13 adapters present: production TokenDocuments expose
 * `parent`, while tests and compatibility callers may still pass `scene`.
 */
export function getTokenSceneUuid(token) {
  return token?.parent?.uuid
    ?? token?.scene?.uuid
    ?? token?.document?.parent?.uuid
    ?? null;
}

/**
 * The scene-link gate: an attemptability gate rather than a listing filter, so a failure returns a
 * blocked result the player app can localize. It restricts EVERY user including GMs, additively
 * with the region and stamina gates.
 */
export function createGatheringSceneAccess({ getCurrentScene } = {}) {
  return {
    canAttempt({ environment, actor, viewer = null } = {}) {
      const sceneUuid = environment?.sceneUuid;
      if (!sceneUuid) return { allowed: true };

      // The REQUESTING viewer's scene (issue 1912): a player's start is evaluated on the active GM's
      // client, whose own canvas says nothing about where the player is.
      const currentScene = getCurrentScene?.(viewer) ?? null;
      if (!currentScene || currentScene.uuid !== sceneUuid) {
        return { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.SceneMissing' };
      }

      const token = getActorTokensOnScenes(actor, [currentScene]).find(token =>
        getTokenSceneUuid(token) === sceneUuid
      ) ?? null;
      if (!token) {
        return { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.TokenMissing' };
      }

      return { allowed: true };
    }
  };
}

/**
 * The scene a gathering VIEWER is looking at, for the scene gate above. A remote viewer's scene is
 * `User#viewedScene`, which Foundry keeps current on every client through the user-activity socket;
 * the local user, a viewer that has broadcast no scene, and one naming a scene that is gone all fall
 * back to this client's current scene, the pre-1912 answer.
 */
export function resolveViewerScene({ viewer, currentUser, scenes, currentScene } = {}) {
  const fallback = () => currentScene?.() ?? null;
  if (!viewer?.viewedScene || (currentUser?.id && viewer.id === currentUser.id)) return fallback();
  return scenes?.get?.(viewer.viewedScene) ?? fallback();
}

/**
 * An actor's concrete token documents on `scenes`, or on EVERY scene when none are named, whatever
 * scene this client views (issue 1912). `Actor#getActiveTokens` is scoped to `canvas.scene`, so it
 * is only the fallback for adapters that lack `getDependentTokens`; production prefers the latter,
 * unlinked tokens included and synthetic ones excluded, exactly as `getActiveTokens(false, true)` does.
 */
export function getActorTokensOnScenes(actor, scenes = null) {
  const wanted = scenes ? normalizeList(scenes).filter(Boolean) : null;
  if (typeof actor?.getDependentTokens === 'function') {
    const options = { linked: false, concreteOnly: true };
    if (wanted) options.scenes = wanted;
    return normalizeList(actor.getDependentTokens(options));
  }
  const active = normalizeList(actor?.getActiveTokens?.(false, true));
  if (!wanted) return active;
  const sceneUuids = new Set(wanted.map(scene => scene?.uuid).filter(Boolean));
  return active.filter(token => sceneUuids.has(getTokenSceneUuid(token)));
}

/**
 * The Scene Region UUIDs a party's travel marker sits inside, over the travel actor's tokens on
 * every scene — never the canvas alone, since the active GM evaluates a player's start while
 * viewing whatever scene it likes (issue 1912). Foundry's AUTHORITATIVE `TokenDocument#regions`
 * membership is preferred, free of the move-animation lag that makes position hit-testing report
 * the region just left; the hit-test runs only for a token whose membership is unavailable.
 */
export function senseTravelMarkerRegions({ actor, hitTest = sceneRegionUuidsContainingToken } = {}) {
  const uuids = new Set();
  for (const token of getActorTokensOnScenes(actor)) {
    const memberRegions = token?.regions;
    let matched = false;
    if (memberRegions && typeof memberRegions[Symbol.iterator] === 'function') {
      for (const region of memberRegions) {
        if (region?.uuid) { uuids.add(String(region.uuid)); matched = true; }
      }
    }
    if (matched) continue;
    const scene = token?.parent ?? token?.scene ?? null;
    for (const uuid of hitTest({ scene, token })) uuids.add(uuid);
  }
  return uuids;
}

/**
 * Evaluate a gathering formula through Foundry's Roll API, deliberately system-generic: dnd5e and
 * pf2e detail comes from the actor's roll data. Rolls are non-interactive. `kind` names the callsite
 * (`check`, `gate`, `stamina`, `attemptLimit`, `characterModifier`), and the extra per-row keys reach
 * a macro only where the Roll engine reads `actor.getRollData()`.
 */
export async function evaluateGatheringExpression(payload = {}) {
  const expression = payload?.expression;
  if (expression === null || expression === undefined || expression === '') return null;

  const actor = payload?.actor ?? null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  if (typeof globalThis.Roll === 'function') {
    const roll = new globalThis.Roll(String(expression), rollData);
    // Async, not `evaluateSync()`, which rejects dice — and `allowInteractive: false`, so an
    // automated gathering roll never surfaces a manual roll-fulfilment dialog.
    const evaluated = await roll.evaluate({ allowInteractive: false });
    return evaluated?.total ?? evaluated?.result ?? null;
  }

  const numeric = Number(expression);
  return Number.isFinite(numeric) ? numeric : null;
}

/** Replace any caller-supplied viewer with the current Foundry user, so GM visibility cannot be spoofed. */
export function withCurrentGatheringViewer(options = {}, getCurrentUser = () => globalThis.game?.user) {
  return {
    ...options,
    viewer: getCurrentUser()
  };
}

/** Delegate to a module-internal gathering runtime method as the current user. */
export function callGatheringRuntimeWithCurrentViewer(runtime, methodName, options = {}, getCurrentUser = () => globalThis.game?.user) {
  return runtime?.[methodName]?.(withCurrentGatheringViewer(options, getCurrentUser));
}

/**
 * Run independent world-time processors so one failure cannot stop the rest; the promises are
 * returned for tests and a fire-and-forget hook caller may ignore them.
 */
export function processWorldTimeCallbacksSafely(processors = [], { onError = defaultWorldTimeProcessorError } = {}) {
  return normalizeList(processors).map(({ label = 'Unknown', callback } = {}) => {
    try {
      return Promise.resolve(callback?.()).catch(error => {
        onError(label, error);
      });
    } catch (error) {
      onError(label, error);
      return Promise.resolve();
    }
  });
}

function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

function defaultWorldTimeProcessorError(label, error) {
  console.error(`Fabricate | ${label} world-time processing failed:`, error);
}
