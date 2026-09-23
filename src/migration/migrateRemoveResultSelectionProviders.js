/**
 * `1.6.0` — remove the legacy routed result-selection providers, canonicalizing routing on `check`.
 * Pure, deep-clone, idempotent, version-gated; spec § Legacy Result-Selection Provider Removal owns
 * the rules and which arm is lossy. The dropped recipes and stripped tasks travel on a transient
 * `_removedResultSelectionProviders` field the runner captures for a one-time GM notice and strips
 * before persisting.
 */

import { isPlainObject } from './migrationHelpers.js';

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

  if (isPlainObject(gatheringConfig) && isPlainObject(gatheringConfig.systems)) {
    for (const [systemId, systemConfig] of Object.entries(gatheringConfig.systems)) {
      _migrateGatheringSystem(systemId, systemConfig, strippedGatheringTasks);
    }
  }

  return {
    recipes: Array.isArray(recipes) ? recipes : data.recipes,
    gatheringConfig: isPlainObject(gatheringConfig) ? gatheringConfig : data.gatheringConfig,
    _removedResultSelectionProviders: { droppedRollTableRecipes, strippedGatheringTasks },
  };
}

/**
 * Rewrite the recipe-level and per-step selections, recording each dropped roll-table recipe or
 * step in `dropped`.
 */
function _migrateRecipe(recipe, dropped) {
  if (!isPlainObject(recipe)) return;

  // Recipe-level container (covers routed recipe-level AND alchemy no-`steps[]`).
  if (_rewriteSelection(recipe.resultSelection)) {
    dropped.push({ recipeId: recipe.id ?? null, recipeName: recipe.name ?? null, stepId: null });
  }

  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (!isPlainObject(step)) continue;
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
 * Rewrite one `resultSelection` in place, answering whether a roll-table reference was dropped so
 * the caller can record it.
 */
function _rewriteSelection(selection) {
  if (!isPlainObject(selection)) return false;

  const wasRollTable = selection.provider === 'rollTableOutcome';
  const hadRollTableUuid = 'rollTableUuid' in selection;

  if (LEGACY_PROVIDERS.has(selection.provider)) {
    selection.provider = 'check';
  }
  // Drop the roll-table reference from every selection (the draw mechanism is gone).
  delete selection.rollTableUuid;

  return wasRollTable && hadRollTableUuid;
}

/** Strip the unsupported `resultSelection` from every routed task, recording each in `stripped`. */
function _migrateGatheringSystem(systemId, systemConfig, stripped) {
  if (!isPlainObject(systemConfig) || !Array.isArray(systemConfig.tasks)) return;
  for (const task of systemConfig.tasks) {
    if (!isPlainObject(task)) continue;
    if (!('resultSelection' in task)) continue;
    delete task.resultSelection;
    stripped.push({
      systemId,
      taskId: task.id ?? null,
      taskName: task.name ?? null,
    });
  }
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
