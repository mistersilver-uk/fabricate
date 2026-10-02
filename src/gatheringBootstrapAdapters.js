import { sceneRegionUuidsContainingToken } from './canvas/regionHitTest.js';
import { arrayOrEmpty as normalizeList } from './utils/scalars.js';

/** The engine passes an explicit viewer; direct callers fall back to the current user. */
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
 * An attemptability gate, not a listing filter, so a failure is a localizable block. It binds every
 * user, GMs included, alongside the region and stamina gates.
 */
export function createGatheringSceneAccess({ getCurrentScene } = {}) {
  return {
    canAttempt({ environment, actor, viewer = null } = {}) {
      const sceneUuid = environment?.sceneUuid;
      if (!sceneUuid) return { allowed: true };

      // The requesting viewer's scene (issue 1912): the active GM evaluates a player's start.
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
 * A remote viewer's `User#viewedScene`, which Foundry keeps current on every client through the
 * user-activity socket. The local user, or a viewer with no or a deleted scene, gets this client's.
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
 * unlinked tokens included. `concreteOnly` (14.365+, ignored on V13) drops synthetic tokens as
 * `getActiveTokens(false, true)` does.
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
 * System-generic: system detail comes from the actor's roll data, and rolls are non-interactive.
 * `kind` names the callsite; the extra per-row keys reach only a macro reading `getRollData()`.
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

/** The current user replaces any caller viewer, so GM visibility cannot be spoofed. */
export function withCurrentGatheringViewer(options = {}, getCurrentUser = () => globalThis.game?.user) {
  return {
    ...options,
    viewer: getCurrentUser()
  };
}

export function callGatheringRuntimeWithCurrentViewer(runtime, methodName, options = {}, getCurrentUser = () => globalThis.game?.user) {
  return runtime?.[methodName]?.(withCurrentGatheringViewer(options, getCurrentUser));
}

/** One failure cannot stop the rest; the promises are returned for tests. */
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
