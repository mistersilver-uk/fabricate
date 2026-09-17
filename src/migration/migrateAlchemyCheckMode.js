/**
 * `1.14.0` — retire the per-recipe alchemy `resultSelection.provider` for the SYSTEM-level
 * `alchemy.checkMode` (spec § Alchemy Check-Mode Migration owns the derivation). Pure, deep-clone,
 * idempotent. A former `ingredientSet` recipe with a usable simple check maps to `none` and
 * intentionally STOPS that check, `checkMode` now being the sole authority. A multi-INGREDIENT-SET
 * recipe COLLAPSES to its first set — distinct from a multi-STEP one, which stays unsupported.
 */

const VALID_CHECK_MODES = new Set(['none', 'simple', 'tiered']);

export function migrateAlchemyCheckMode(data = {}) {
  const recipes = _clone(data.recipes);
  const systems = _clone(data.systems);

  if (!Array.isArray(systems) || !Array.isArray(recipes)) {
    return {
      recipes: Array.isArray(recipes) ? recipes : data.recipes,
      systems: Array.isArray(systems) ? systems : data.systems,
    };
  }

  let collapsedMultiSetCount = 0;

  for (const system of systems) {
    if (!_isAlchemySystem(system)) continue;
    const systemRecipes = recipes.filter(
      (recipe) => _isPlainObject(recipe) && recipe.craftingSystemId === system.id
    );

    // Seed the system-level checkMode from the recipe provider reduction, unless a
    // valid checkMode is already present (idempotency).
    const alchemy = _isPlainObject(system.alchemy) ? system.alchemy : {};
    if (!VALID_CHECK_MODES.has(alchemy.checkMode)) {
      const hasCheckProvider = systemRecipes.some(
        (recipe) => recipe.resultSelection?.provider === 'check'
      );
      const hasTieredShape = systemRecipes.some(
        (recipe) => recipe.resultSelection?.provider === 'check' && _tieredGroupCount(recipe) > 1
      );
      alchemy.checkMode = hasCheckProvider ? (hasTieredShape ? 'tiered' : 'simple') : 'none';
      system.alchemy = alchemy;
    }

    // Strip the retired resultSelection + collapse multi-ingredient-set recipes.
    for (const recipe of systemRecipes) {
      if ('resultSelection' in recipe) {
        delete recipe.resultSelection;
      }
      // Only collapse flat (single-step) recipes; multi-STEP alchemy is unsupported
      // and handled by the mode-change delete path, not collapsed here.
      const hasSteps = Array.isArray(recipe.steps) && recipe.steps.length > 0;
      if (!hasSteps && Array.isArray(recipe.ingredientSets) && recipe.ingredientSets.length > 1) {
        recipe.ingredientSets = recipe.ingredientSets.slice(0, 1);
        collapsedMultiSetCount += 1;
      }
    }
  }

  if (collapsedMultiSetCount > 0) {
    console.warn(
      `Fabricate | Alchemy check-mode migration collapsed ${collapsedMultiSetCount} multi-ingredient-set alchemy recipe(s) to their first ingredient set (alchemy requires exactly one set).`
    );
  }

  return { recipes, systems };
}

/** Whether a system is in alchemy mode (accepting the legacy `cauldron` alias). */
function _isAlchemySystem(system) {
  return (
    _isPlainObject(system) &&
    (system.resolutionMode === 'alchemy' || system.resolutionMode === 'cauldron')
  );
}

/** Count of a recipe's result groups carrying a non-empty `checkOutcomeIds`. */
function _tieredGroupCount(recipe) {
  const groups = Array.isArray(recipe.resultGroups) ? recipe.resultGroups : [];
  return groups.filter(
    (group) => Array.isArray(group?.checkOutcomeIds) && group.checkOutcomeIds.length > 0
  ).length;
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
