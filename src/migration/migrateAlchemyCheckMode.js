/**
 * 1.14.0 — Retire the per-recipe alchemy `resultSelection.provider` in favour of the
 * SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`), best-effort per
 * system (pure, deep-clone, idempotent).
 *
 * Alchemy was the only resolution mode that still routed via a per-recipe
 * `resultSelection.provider` (`ingredientSet` | `check`). This migration derives a
 * single system-level check mode from the system's alchemy recipes and strips the
 * retired per-recipe selection:
 *
 *  1. Per ALCHEMY system (`resolutionMode === 'alchemy'`, incl. the legacy
 *     `'cauldron'` alias), reduce over its recipes:
 *       - `hasCheckProvider` = any recipe with `resultSelection.provider === 'check'`;
 *       - `hasTieredShape`   = any such `check` recipe carrying MORE THAN ONE result
 *         group with a non-empty `checkOutcomeIds` (the tiered routing shape).
 *     Seed `alchemy.checkMode = hasCheckProvider ? (hasTieredShape ? 'tiered' :
 *     'simple') : 'none'`, but only when the system does not already carry a valid
 *     `checkMode` (idempotency — a former `ingredientSet`-provider recipe with a
 *     usable simple check that maps to `none` intentionally stops running that check;
 *     `checkMode` is now the sole authority).
 *  2. Strip `resultSelection` from EVERY alchemy recipe (recipe-level; alchemy
 *     recipes are single-step).
 *  3. Collapse any multi-INGREDIENT-SET alchemy recipe to its first set (alchemy now
 *     requires exactly one set) with a single `console.warn`. This is DISTINCT from a
 *     multi-STEP alchemy recipe, which stays unsupported and is handled by the
 *     mode-change delete path, not collapsed here. Stale `checkOutcomeIds` on a
 *     Tiered→Simple/None reduction are left intact (inert, preserved for round-trip).
 *
 * Idempotent: once no alchemy `resultSelection` remains and each alchemy system has a
 * `checkMode`, a re-run finds nothing to transform (no mutation, no duplicate warn,
 * stable `checkMode`).
 *
 * Pure: returns `{ recipes, systems }` and performs no I/O beyond the one warn.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @param {Array<object>} [data.systems] Raw crafting systems setting.
 * @returns {{ recipes: Array<object>, systems: Array<object> }}
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
