/**
 * Migration-first resolution-mode change, pure and with no I/O: a recipe is MIGRATED wherever
 * possible and deleted only when a per-recipe STRUCTURAL constraint cannot be met, SYSTEM-LEVEL gaps
 * never deleting one. `resolution-modes/spec.md` § Mode Invariant owns the 6x6 matrix and
 * `destructive-changes-and-migrations/spec.md` § Change Crafting System Resolution Mode the pass.
 */

import { Recipe } from '../models/Recipe.js';
import { arrayOrEmpty, isPlainObject } from '../utils/scalars.js';

import { evaluateIterativeReadiness, needsIterativeSetup } from './iterative/iterativeReadiness.js';
import { isRecipeIncomplete } from './systemValidation.js';

// Only ALCHEMY routes via a recipe-level `resultSelection.provider`; the two routed crafting modes
// derive their basis from the system mode. A recipe leaving `iterative` follows `routedByCheck`'s
// row.
const ROUTED_MODES = new Set(['routedByIngredients', 'routedByCheck']);
const ROUTED_SOURCES = new Set([...ROUTED_MODES, 'iterative']);
const CHECK_ROUTED_SOURCES = new Set(['routedByCheck', 'iterative']);
const SEEDED_FAILURE_LINE = Object.freeze({ end: 'failure', rules: [] });
const SINGLE_GROUP_MODES = new Set(['simple', 'progressive']);

/**
 * Classify a mode change for one recipe WITHOUT mutating it, for the UI dry run that reports
 * migrate and delete counts before committing.
 */
export function classifyModeChange(recipeJSON, fromMode, toMode, system = {}) {
  return migrateRecipeForModeChange(_clone(recipeJSON), fromMode, toMode, system);
}

/**
 * Migrate one recipe for a mode change, mutating `recipeJSON` in place when a transform applies.
 * For a no-mutation dry run use {@link classifyModeChange}.
 */
export function migrateRecipeForModeChange(recipeJSON, fromMode, toMode, _system = {}) {
  if (!isPlainObject(recipeJSON)) {
    return { outcome: 'carry', recipe: recipeJSON, reasons: [] };
  }
  if (fromMode === toMode) {
    return { outcome: 'lossless', recipe: recipeJSON, reasons: ['mode unchanged'] };
  }
  if (toMode === 'iterative') return _migrateIntoIterative(recipeJSON);

  // Structural deletion: alchemy does not support multi-step recipes.
  if (toMode === 'alchemy' && _stepCount(recipeJSON) > 1) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: ['multi-step recipe cannot be migrated into alchemy mode'],
    };
  }

  // Structural deletion: narrowing into a single-group mode requires exactly one ingredient set AND
  // one success result group, which seed or clear alone cannot reshape.
  if (SINGLE_GROUP_MODES.has(toMode) && !_isOneByOne(recipeJSON)) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: [
        `recipe has multiple ingredient sets or success result groups and cannot be narrowed to ${toMode} mode`,
      ],
    };
  }

  // Migrating INTO alchemy clears any stale `resultSelection` and collapses a multi-INGREDIENT-SET
  // recipe to its first set; multi-STEP was already deleted above. The system-level `checkMode` is
  // seeded separately, and this per-recipe pass never seeds a provider (issue 554).
  if (toMode === 'alchemy') {
    const reasons = [];
    let changed = false;
    if (Array.isArray(recipeJSON.ingredientSets) && recipeJSON.ingredientSets.length > 1) {
      recipeJSON.ingredientSets = recipeJSON.ingredientSets.slice(0, 1);
      changed = true;
      reasons.push('collapsed multiple ingredient sets to the first set for alchemy mode');
    }
    if (recipeJSON.resultSelection != null) {
      recipeJSON.resultSelection = null;
      changed = true;
      reasons.push('cleared resultSelection for alchemy mode');
    }
    return {
      outcome: changed ? 'cleared' : 'lossless',
      recipe: recipeJSON,
      reasons: reasons.length > 0 ? reasons : ['no alchemy reshaping required'],
    };
  }

  // A routed target derives its basis from the system mode and never carries a `resultSelection`.
  // RI↔RC is carried verbatim; every other source has its selection dropped. Stale routing data is
  // surfaced as a re-authoring validation issue via `reconcile`, never silently mis-routed.
  if (ROUTED_MODES.has(toMode)) {
    const reconcile =
      toMode === 'routedByCheck' ||
      (toMode === 'routedByIngredients' && CHECK_ROUTED_SOURCES.has(fromMode));
    const fromRouted = ROUTED_SOURCES.has(fromMode);
    if (fromRouted) {
      // RI↔RC, and out of iterative: carry verbatim (and reconcile stale routing).
      return {
        outcome: 'carry',
        recipe: recipeJSON,
        reconcile,
        reasons: reconcile
          ? [`carried into ${toMode}; routing data must be re-authored for the new basis`]
          : ['routing carried for the new mode'],
      };
    }
    const cleared = recipeJSON.resultSelection != null;
    if (cleared) recipeJSON.resultSelection = null;
    return {
      outcome: cleared ? 'cleared' : 'carry',
      recipe: recipeJSON,
      reconcile,
      reasons: [
        cleared
          ? `cleared resultSelection for ${toMode} mode`
          : `no resultSelection to clear for ${toMode} mode`,
        ...(reconcile ? [`routing data must be re-authored for ${toMode}`] : []),
      ],
    };
  }

  // The target routes via no recipe-level provider: clear any selection so the recipe conforms.
  const reasons = [];
  if (recipeJSON.resultSelection != null) {
    recipeJSON.resultSelection = null;
    reasons.push(`cleared resultSelection for ${toMode} mode`);
  }
  const dropped = toMode === 'progressive' ? _dropFailureGroupForProgressive(recipeJSON) : null;
  if (dropped) reasons.push(dropped);
  return reasons.length > 0
    ? { outcome: 'cleared', recipe: recipeJSON, reasons }
    : { outcome: 'lossless', recipe: recipeJSON, reasons: ['no routed selection to clear'] };
}

/**
 * Migrating into `iterative` deletes nothing: each scope's `resultSelection` clears, each scope
 * keeps its first ingredient set, and each reserved failure group with no `producedWhen` gains the
 * failure line; `checkOutcomeIds`, `outcomeRouting` and `resultGroupId` stay, unread.
 */
function _migrateIntoIterative(recipeJSON) {
  const reasons = [];
  for (const scope of [recipeJSON, ...arrayOrEmpty(recipeJSON.steps)]) {
    if (!isPlainObject(scope)) continue;
    if (scope.resultSelection != null) {
      scope.resultSelection = null;
      reasons.push('cleared resultSelection for iterative mode');
    }
    if (Array.isArray(scope.ingredientSets) && scope.ingredientSets.length > 1) {
      scope.ingredientSets = scope.ingredientSets.slice(0, 1);
      reasons.push('collapsed multiple ingredient sets to the first set for iterative mode');
    }
    for (const group of arrayOrEmpty(scope.resultGroups)) {
      if (!_isFailureGroup(group) || arrayOrEmpty(group.producedWhen).length > 0) continue;
      group.producedWhen = [structuredClone(SEEDED_FAILURE_LINE)];
      reasons.push('seeded the failure line on the failure result set for iterative mode');
    }
  }
  return reasons.length > 0
    ? { outcome: 'cleared', recipe: recipeJSON, reasons }
    : { outcome: 'lossless', recipe: recipeJSON, reasons: ['no iterative reshaping required'] };
}

/**
 * Dry-run a mode change over a system's recipes for the confirm, never mutating its input. Every
 * field is always present: the into-`iterative` counts (`inertTierLinks`, `needsSetup`) are 0
 * otherwise, the out-of-`iterative` ones (`inertLibrary`, `incompleteAfter`) zeros, and
 * `multiStepOff` is true only into `alchemy` with Multi-step on.
 */
export function summarizeModeChange(recipes, fromMode, toMode, system = {}) {
  const into = fromMode !== toMode && toMode === 'iterative';
  const out = fromMode !== toMode && fromMode === 'iterative';
  const summary = {
    migrated: 0,
    deleted: [],
    droppedIngredientSets: [],
    droppedFailureSets: [],
    inertTierLinks: 0,
    needsSetup: 0,
    inertLibrary: {
      counters: out ? arrayOrEmpty(system?.iterative?.counters).length : 0,
      actions: out ? arrayOrEmpty(system?.iterative?.actions).length : 0,
    },
    incompleteAfter: 0,
    multiStepOff: toMode === 'alchemy' && system?.features?.multiStepRecipes === true,
  };
  const iterativeSystem = { ...system, resolutionMode: 'iterative' };
  for (const recipe of recipes ?? []) {
    const source = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
    const name = source?.name || source?.id;
    const { outcome, recipe: next } = classifyModeChange(source, fromMode, toMode, system);
    if (outcome === 'delete') {
      summary.deleted.push(name);
      continue;
    }
    summary.migrated += 1;
    summary.droppedIngredientSets.push(..._droppedIngredientSets(name, source, next));
    if (_hasFailureGroup(source) && !_hasFailureGroup(next)) summary.droppedFailureSets.push(name);
    if (into) {
      summary.inertTierLinks += _tierLinkCount(next);
      if (needsIterativeSetup(evaluateIterativeReadiness(iterativeSystem, [next]))) {
        summary.needsSetup += 1;
      }
    }
    if (out && isRecipeIncomplete(Recipe.fromJSON(structuredClone(next)), next, toMode)) {
      summary.incompleteAfter += 1;
    }
  }
  return summary;
}

/** One `{ recipe, step, sets }` entry per scope that lost a set; a flat scope's `step` is null. */
function _droppedIngredientSets(name, source, next) {
  const scopes = [
    [source, next, null],
    ...arrayOrEmpty(source?.steps).map((step, index) => [step, next?.steps?.[index], index]),
  ];
  return scopes.flatMap(([before, after, step]) => {
    const keptIds = new Set(arrayOrEmpty(after?.ingredientSets).map((set) => set?.id));
    const sets = arrayOrEmpty(before?.ingredientSets).flatMap((set, index) =>
      keptIds.has(set?.id) ? [] : [{ name: set?.name, index }]
    );
    return sets.length > 0 ? [{ recipe: name, step, sets }] : [];
  });
}

/** The `ResultGroup.checkOutcomeIds` entries across every scope, which `iterative` never reads. */
function _tierLinkCount(recipe) {
  return [recipe, ...arrayOrEmpty(recipe?.steps)]
    .flatMap((scope) => arrayOrEmpty(scope?.resultGroups))
    .reduce((count, group) => count + arrayOrEmpty(group?.checkOutcomeIds).length, 0);
}

/** Number of authoring steps on the recipe (0 for a flat recipe). */
function _stepCount(recipe) {
  return Array.isArray(recipe.steps) ? recipe.steps.length : 0;
}

/**
 * Whether the recipe is "1×1" — exactly one ingredient set and one success result group across
 * every scope; the reserved failure group is not counted. A multi-step recipe is never 1×1: each
 * step is its own scope and single-group modes have no steps.
 */
function _isOneByOne(recipe) {
  if (_stepCount(recipe) > 0) return false;
  const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
  const resultGroups = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
  return ingredientSets.length <= 1 && resultGroups.filter((g) => !_isFailureGroup(g)).length <= 1;
}

const _isFailureGroup = (group) => group?.role === 'failure';

const _hasFailureGroup = (recipe) =>
  Array.isArray(recipe?.resultGroups) && recipe.resultGroups.some(_isFailureGroup);

/** `progressive` has no failure set: remove every one, returning the reason or `null`. */
function _dropFailureGroupForProgressive(recipeJSON) {
  if (!_hasFailureGroup(recipeJSON)) return null;
  recipeJSON.resultGroups = recipeJSON.resultGroups.filter((group) => !_isFailureGroup(group));
  return 'dropped the failure result set for progressive mode';
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
