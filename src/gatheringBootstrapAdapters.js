/**
 * Build the selectable gathering actor adapter used by GatheringEngine.
 *
 * The engine passes an explicit viewer payload during player listing and
 * attempt flows; direct callers fall back to the current Foundry user.
 *
 * @param {object} adapters
 * @param {Function} adapters.getActors Collection getter for `game.actors`.
 * @param {Function} adapters.getCurrentUser Current Foundry user getter.
 * @param {Function} adapters.isSelectable Actor/viewer permission predicate.
 * @returns {Function} Payload-aware actor selection callback.
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
 * Evaluate a gathering formula through Foundry's Roll API when available.
 *
 * This adapter intentionally stays generic: dnd5e and pf2e expression details
 * are supplied by their actor roll data and the active Foundry Roll
 * implementation.
 *
 * Callsites:
 *  - `kind: 'check'` — gathering check evaluation.
 *  - `kind: 'gate'` — visibility/attempt gates.
 *  - `kind: 'stamina'` / `kind: 'attemptLimit'` — formula-driven economy.
 *  - `kind: 'characterModifier'` — per-row character modifier resolution
 *    (added by the gathering character modifiers feature). The extra
 *    `environment`, `task`, `row`, `hazard`, `viewer`, and `modifier` keys
 *    on the payload give macros enough context to inspect the surrounding
 *    attempt; this implementation forwards them only when the underlying
 *    Roll engine reads them as part of `actor.getRollData()`.
 *
 * @param {object} payload
 * @param {string|number} payload.expression Formula or literal number to evaluate.
 * @param {Actor} [payload.actor] Actor supplying roll data.
 * @returns {Promise<number|null>} Numeric result, or null for blank/unresolvable expressions.
 */
export async function evaluateGatheringExpression(payload = {}) {
  const expression = payload?.expression;
  if (expression === null || expression === undefined || expression === '') return null;

  const actor = payload?.actor ?? null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  if (typeof globalThis.Roll === 'function') {
    const roll = new globalThis.Roll(String(expression), rollData);
    const evaluated = typeof roll.evaluateSync === 'function'
      ? roll.evaluateSync()
      : await roll.evaluate();
    return evaluated?.total ?? evaluated?.result ?? null;
  }

  const numeric = Number(expression);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Replace any caller-supplied gathering viewer with the current Foundry user.
 *
 * Public gathering APIs use this before delegating into the module-internal
 * GatheringEngine so a macro or UI caller cannot spoof GM visibility by
 * passing a different viewer object.
 *
 * @param {object} options Gathering runtime options.
 * @param {Function} getCurrentUser Current Foundry user getter.
 * @returns {object} Options with `viewer` set to the current user.
 */
export function withCurrentGatheringViewer(options = {}, getCurrentUser = () => globalThis.game?.user) {
  return {
    ...options,
    viewer: getCurrentUser()
  };
}

/**
 * Delegate to a module-internal gathering runtime method as the current user.
 *
 * @param {object} runtime Gathering runtime instance.
 * @param {string} methodName Runtime method to call.
 * @param {object} options Method options supplied by the caller.
 * @param {Function} getCurrentUser Current Foundry user getter.
 * @returns {*} The runtime method result, if the method exists.
 */
export function callGatheringRuntimeWithCurrentViewer(runtime, methodName, options = {}, getCurrentUser = () => globalThis.game?.user) {
  return runtime?.[methodName]?.(withCurrentGatheringViewer(options, getCurrentUser));
}

/**
 * Run independent world-time processors without letting one failure prevent
 * later processors from being called.
 *
 * The returned promises are useful for tests and diagnostics; production hook
 * callers may intentionally ignore them for fire-and-forget Foundry hooks.
 *
 * @param {Array<{label: string, callback: Function}>} processors Processing callbacks.
 * @param {object} options
 * @param {Function} options.onError Error sink receiving `(label, error)`.
 * @returns {Promise<void>[]} Per-processor settlement promises.
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
