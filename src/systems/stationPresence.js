/**
 * Per-call views through which an activated canvas Tool station counts as present (issue 2265).
 * A view is `Object.create` over the shared object with own overrides, so neither function writes
 * to the shared engine or recipe manager and a station never outlives the call that carried it.
 */

function stationIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id !== '') : [];
}

/** The `{ systemId, componentIds, toolIds }` payload, or null when it names no crafting system. */
export function normalizeStationPresence(presentTools) {
  if (!presentTools || typeof presentTools !== 'object' || Array.isArray(presentTools)) return null;
  const { systemId } = presentTools;
  if (typeof systemId !== 'string' || systemId === '') return null;
  return Object.freeze({
    systemId,
    componentIds: Object.freeze(stationIds(presentTools.componentIds)),
    toolIds: Object.freeze(stationIds(presentTools.toolIds)),
  });
}

/**
 * `recipeManager` itself without a station; otherwise a view whose Tool consults substitute the
 * station wherever the caller's `presentTools` is null or absent. A caller's own payload wins.
 */
export function withStationPresence(recipeManager, presentTools) {
  const station = normalizeStationPresence(presentTools);
  if (!recipeManager || !station) return recipeManager;
  const filled = (options) =>
    options?.presentTools == null ? { ...options, presentTools: station } : options;
  const view = Object.create(recipeManager);
  view.resolveToolStates = function resolveToolStates(recipe, tools, sourceActors, options) {
    return recipeManager.resolveToolStates.call(this, recipe, tools, sourceActors, filled(options));
  };
  view.evaluateCraftability = function evaluateCraftability(sourceActors, recipe, options) {
    return recipeManager.evaluateCraftability.call(this, sourceActors, recipe, filled(options));
  };
  return view;
}

/** `engine` itself without a station; otherwise a view whose `recipeManager` is the station view. */
export function engineWithStationPresence(engine, presentTools) {
  const recipeManager = withStationPresence(engine?.recipeManager, presentTools);
  if (!engine || recipeManager === engine.recipeManager) return engine;
  const view = Object.create(engine);
  view.recipeManager = recipeManager;
  return view;
}
