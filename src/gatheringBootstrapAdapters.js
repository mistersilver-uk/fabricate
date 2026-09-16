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
    canAttempt({ environment, actor } = {}) {
      const sceneUuid = environment?.sceneUuid;
      if (!sceneUuid) return { allowed: true };

      const currentScene = getCurrentScene?.() ?? null;
      if (!currentScene || currentScene.uuid !== sceneUuid) {
        return { allowed: false, code: 'SCENE_TOKEN_BLOCKED', messageKey: 'FABRICATE.Gathering.Blocked.SceneMissing' };
      }

      const token = actor?.getActiveTokens?.(false, true)?.find(token =>
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

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function defaultWorldTimeProcessorError(label, error) {
  console.error(`Fabricate | ${label} world-time processing failed:`, error);
}
