/**
 * 1.6.0 — Remove the legacy routed result-selection providers `macroOutcome` and
 * `rollTableOutcome`, canonicalizing result routing on the `check` provider (pure,
 * deep-clone, idempotent, version-gated).
 *
 * `check` is already the runtime canonical provider (recipes accept it and
 * `ResolutionModeService` folds `macroOutcome` into it); the legacy pair survives
 * only as deprecated persisted aliases. This migration rewrites persisted data so
 * the legacy providers no longer appear:
 *
 *  1. Recipes — rewrite `resultSelection.provider` `macroOutcome|rollTableOutcome →
 *     check` on the recipe-level container, on every `steps[].resultSelection`, AND
 *     on alchemy recipe-level (no-`steps[]`) recipes. `macroOutcome → check` is
 *     behaviourally equivalent (lossless). `rollTableOutcome → check` is lossy: the
 *     table-draw mechanism is gone, so `rollTableUuid` is DROPPED from every
 *     selection (the recipe/step is recorded in the recovery warning). `macroUuid`
 *     is kept.
 *  2. Gathering routed tasks — `gatheringConfig.systems[*].tasks[*]` carrying a
 *     legacy `resultSelection` lose it entirely: routed gathering becomes
 *     system-check-formula only. Each stripped task is recorded in the recovery
 *     warning so the GM can populate `gatheringCraftingCheck.routed.rollFormula`.
 *
 * Recovery warning: dropped roll-table recipes/steps and stripped gathering tasks
 * are collected into a transient `_removedResultSelectionProviders` payload on the
 * return value. The runner captures it for a one-time GM notice and strips it so it
 * is never persisted (mirrors `_migratedCatalystCount`).
 *
 * Idempotent: once no `macroOutcome`/`rollTableOutcome` provider, no `rollTableUuid`,
 * and no gathering-task `resultSelection` remain, a re-run finds nothing to transform
 * and is a no-op (and reports an empty warning payload).
 *
 * Pure: returns `{ recipes, gatheringConfig, _removedResultSelectionProviders }` and
 * performs no I/O.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @param {object} [data.gatheringConfig] Raw gatheringConfig setting.
 * @returns {{ recipes: Array<object>, gatheringConfig: object, _removedResultSelectionProviders: { droppedRollTableRecipes: Array<object>, strippedGatheringTasks: Array<object> } }}
 */

const LEGACY_PROVIDERS = new Set(['macroOutcome', 'rollTableOutcome']);

export function migrateRemoveResultSelectionProviders(data = {}) {
  const recipes = _clone(data.recipes);
  const gatheringConfig = _clone(data.gatheringConfig);

  const droppedRollTableRecipes = [];
  const strippedGatheringTasks = [];

  if (Array.isArray(recipes)) {
    for (const recipe of recipes) {
      _migrateRecipe(recipe, droppedRollTableRecipes);
    }
  }

  if (_isPlainObject(gatheringConfig) && _isPlainObject(gatheringConfig.systems)) {
    for (const [systemId, systemConfig] of Object.entries(gatheringConfig.systems)) {
      _migrateGatheringSystem(systemId, systemConfig, strippedGatheringTasks);
    }
  }

  return {
    recipes: Array.isArray(recipes) ? recipes : data.recipes,
    gatheringConfig: _isPlainObject(gatheringConfig) ? gatheringConfig : data.gatheringConfig,
    _removedResultSelectionProviders: { droppedRollTableRecipes, strippedGatheringTasks },
  };
}

/**
 * Rewrite the recipe-level and per-step result selections. Records each dropped
 * roll-table recipe/step (recipe id/name + optional step id) in `dropped`.
 * @param {object} recipe
 * @param {Array<object>} dropped
 */
function _migrateRecipe(recipe, dropped) {
  if (!_isPlainObject(recipe)) return;

  // Recipe-level container (covers routed recipe-level AND alchemy no-`steps[]`).
  if (_rewriteSelection(recipe.resultSelection)) {
    dropped.push({ recipeId: recipe.id ?? null, recipeName: recipe.name ?? null, stepId: null });
  }

  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (!_isPlainObject(step)) continue;
      if (_rewriteSelection(step.resultSelection)) {
        dropped.push({
          recipeId: recipe.id ?? null,
          recipeName: recipe.name ?? null,
          stepId: step.id ?? null,
        });
      }
    }
  }
}

/**
 * Rewrite a single `resultSelection` in place: legacy provider → `check`, drop
 * `rollTableUuid`. Returns true when a `rollTableUuid` was dropped from a
 * `rollTableOutcome` selection (so the caller can record it for recovery).
 * @param {*} selection
 * @returns {boolean} whether a roll-table reference was dropped
 */
function _rewriteSelection(selection) {
  if (!_isPlainObject(selection)) return false;

  const wasRollTable = selection.provider === 'rollTableOutcome';
  const hadRollTableUuid = 'rollTableUuid' in selection;

  if (LEGACY_PROVIDERS.has(selection.provider)) {
    selection.provider = 'check';
  }
  // Drop the roll-table reference from every selection (the draw mechanism is gone).
  delete selection.rollTableUuid;

  return wasRollTable && hadRollTableUuid;
}

/**
 * Strip the now-unsupported `resultSelection` from every routed gathering task in a
 * system config. Records each stripped task in `stripped`.
 * @param {string} systemId
 * @param {object} systemConfig
 * @param {Array<object>} stripped
 */
function _migrateGatheringSystem(systemId, systemConfig, stripped) {
  if (!_isPlainObject(systemConfig) || !Array.isArray(systemConfig.tasks)) return;
  for (const task of systemConfig.tasks) {
    if (!_isPlainObject(task)) continue;
    if (!('resultSelection' in task)) continue;
    delete task.resultSelection;
    stripped.push({
      systemId,
      taskId: task.id ?? null,
      taskName: task.name ?? null,
    });
  }
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
