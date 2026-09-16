/**
 * Migration-first resolution-mode change, pure and with no I/O: a recipe is MIGRATED to fit the new
 * mode wherever possible and deleted only when a per-recipe STRUCTURAL constraint cannot be met.
 * `resolution-modes/spec.md` § Mode Invariant owns the normative 5x5 migratability matrix, and
 * `destructive-changes-and-migrations/spec.md` § Change Crafting System Resolution Mode the pass.
 * SYSTEM-LEVEL gaps never delete or disable a recipe here; they surface as validation issues.
 */

// Only ALCHEMY routes via a recipe-level `resultSelection.provider`; the two routed crafting modes
// derive their basis from the system mode.
const ROUTED_MODES = new Set(['routedByIngredients', 'routedByCheck']);
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
  if (!_isPlainObject(recipeJSON)) {
    return { outcome: 'carry', recipe: recipeJSON, reasons: [] };
  }
  if (fromMode === toMode) {
    return { outcome: 'lossless', recipe: recipeJSON, reasons: ['mode unchanged'] };
  }

  // Structural deletion: alchemy does not support multi-step recipes.
  if (toMode === 'alchemy' && _stepCount(recipeJSON) > 1) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: ['multi-step recipe cannot be migrated into alchemy mode'],
    };
  }

  // Structural deletion: narrowing into a single-group mode requires exactly one ingredient set AND
  // one result group, which seed or clear alone cannot reshape.
  if (SINGLE_GROUP_MODES.has(toMode) && !_isOneByOne(recipeJSON)) {
    return {
      outcome: 'delete',
      recipe: null,
      reasons: [
        `recipe has multiple ingredient sets or result groups and cannot be narrowed to ${toMode} mode`,
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
      (toMode === 'routedByIngredients' && fromMode === 'routedByCheck');
    const fromRouted = ROUTED_MODES.has(fromMode);
    if (fromRouted) {
      // RI↔RC: structurally identical, carry verbatim (and reconcile stale routing).
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
  if (recipeJSON.resultSelection != null) {
    recipeJSON.resultSelection = null;
    return {
      outcome: 'cleared',
      recipe: recipeJSON,
      reasons: [`cleared resultSelection for ${toMode} mode`],
    };
  }

  return { outcome: 'lossless', recipe: recipeJSON, reasons: ['no routed selection to clear'] };
}

/** Number of authoring steps on the recipe (0 for a flat recipe). */
function _stepCount(recipe) {
  return Array.isArray(recipe.steps) ? recipe.steps.length : 0;
}

/**
 * Whether the recipe is "1×1" — exactly one ingredient set and one result group across every scope.
 * A multi-step recipe is never 1×1: each step is its own scope and single-group modes have no steps.
 */
function _isOneByOne(recipe) {
  if (_stepCount(recipe) > 0) return false;
  const ingredientSets = Array.isArray(recipe.ingredientSets) ? recipe.ingredientSets : [];
  const resultGroups = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
  return ingredientSets.length <= 1 && resultGroups.length <= 1;
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
