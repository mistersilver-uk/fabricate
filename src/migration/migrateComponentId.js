/**
 * T-040: Data Migration for systemItemId -> componentId
 *
 * Pure functions that operate on raw JSON arrays (no I/O, no Foundry calls).
 * Safe to run multiple times -- idempotent.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Rename systemItemId -> componentId on a single object (catalyst or result).
 * - If componentId already exists: preserve it, delete systemItemId.
 * - If only systemItemId exists: copy it to componentId, delete systemItemId.
 * - If neither exists: no-op.
 * Mutates the object in place (caller must have already deep-cloned).
 */
function _migrateId(obj) {
  if (obj == null || typeof obj !== 'object') return;
  if ('systemItemId' in obj) {
    if (!('componentId' in obj) || obj.componentId == null) {
      obj.componentId = obj.systemItemId;
    }
    delete obj.systemItemId;
  }
}

/**
 * Migrate a catalyst entry (has systemItemId -> componentId).
 */
function _migrateCatalyst(cat) {
  _migrateId(cat);
  return cat;
}

/**
 * Migrate a result entry (has systemItemId -> componentId).
 */
function _migrateResult(result) {
  _migrateId(result);
  return result;
}

/**
 * Migrate an ingredient entry recursively.
 * Handles:
 *  - top-level systemItemId -> componentId
 *  - match.systemItemId -> match.componentId
 *  - match.type: "systemItem" -> "component"
 *  - alternatives[] (recursive)
 */
function _migrateIngredient(ing) {
  if (ing == null || typeof ing !== 'object') return ing;

  // Top-level id rename
  _migrateId(ing);

  // match object
  if (ing.match && typeof ing.match === 'object') {
    if ('systemItemId' in ing.match) {
      if (!('componentId' in ing.match) || ing.match.componentId == null) {
        ing.match.componentId = ing.match.systemItemId;
      }
      delete ing.match.systemItemId;
    }
    if (ing.match.type === 'systemItem') {
      ing.match.type = 'component';
    }
  }

  // Recurse into alternatives
  if (Array.isArray(ing.alternatives)) {
    ing.alternatives = ing.alternatives.map(_migrateIngredient);
  }

  return ing;
}

/**
 * Migrate all catalysts in an array.
 */
function _migrateCatalysts(catalysts) {
  if (!Array.isArray(catalysts)) return catalysts;
  return catalysts.map(_migrateCatalyst);
}

/**
 * Migrate all results in a resultGroups array.
 */
function _migrateResultGroups(resultGroups) {
  if (!Array.isArray(resultGroups)) return resultGroups;
  return resultGroups.map((rg) => {
    if (rg && Array.isArray(rg.results)) {
      rg.results = rg.results.map(_migrateResult);
    }
    return rg;
  });
}

/**
 * Migrate a flat results array (top-level recipe.results[]).
 */
function _migrateResults(results) {
  if (!Array.isArray(results)) return results;
  return results.map(_migrateResult);
}

/**
 * Migrate ingredients in an ingredientSet.
 * Handles: ingredientGroups[].options[], ingredients[]
 */
function _migrateIngredientSet(set) {
  if (set == null || typeof set !== 'object') return set;

  if (Array.isArray(set.ingredients)) {
    set.ingredients = set.ingredients.map(_migrateIngredient);
  }

  if (Array.isArray(set.ingredientGroups)) {
    set.ingredientGroups = set.ingredientGroups.map((group) => {
      if (group && Array.isArray(group.options)) {
        group.options = group.options.map(_migrateIngredient);
      }
      return group;
    });
  }

  if (Array.isArray(set.catalysts)) {
    set.catalysts = _migrateCatalysts(set.catalysts);
  }

  return set;
}

/**
 * Migrate a single step object.
 */
function _migrateStep(step) {
  if (step == null || typeof step !== 'object') return step;

  if (Array.isArray(step.catalysts)) {
    step.catalysts = _migrateCatalysts(step.catalysts);
  }

  if (Array.isArray(step.resultGroups)) {
    step.resultGroups = _migrateResultGroups(step.resultGroups);
  }

  if (Array.isArray(step.ingredientSets)) {
    step.ingredientSets = step.ingredientSets.map(_migrateIngredientSet);
  }

  return step;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Migrate an array of raw recipe JSON objects.
 * Returns a new deep-cloned and migrated array.
 * @param {Array} recipes
 * @returns {Array}
 */
export function migrateRecipes(recipes) {
  if (!Array.isArray(recipes)) return recipes;

  return JSON.parse(JSON.stringify(recipes)).map((recipe) => {
    if (recipe == null || typeof recipe !== 'object') return recipe;

    // Top-level catalysts
    if (Array.isArray(recipe.catalysts)) {
      recipe.catalysts = _migrateCatalysts(recipe.catalysts);
    }

    // Top-level resultGroups
    if (Array.isArray(recipe.resultGroups)) {
      recipe.resultGroups = _migrateResultGroups(recipe.resultGroups);
    }

    // Top-level results (flat array variant)
    if (Array.isArray(recipe.results)) {
      recipe.results = _migrateResults(recipe.results);
    }

    // ingredientSets (and their nested catalysts/ingredients)
    if (Array.isArray(recipe.ingredientSets)) {
      recipe.ingredientSets = recipe.ingredientSets.map(_migrateIngredientSet);
    }

    // steps
    if (Array.isArray(recipe.steps)) {
      recipe.steps = recipe.steps.map(_migrateStep);
    }

    return recipe;
  });
}

/**
 * Migrate an array of raw crafting system JSON objects.
 * Returns a new deep-cloned and migrated array.
 * @param {Array} systems
 * @returns {Array}
 */
export function migrateCraftingSystems(systems) {
  if (!Array.isArray(systems)) return systems;

  return JSON.parse(JSON.stringify(systems)).map((system) => {
    if (system == null || typeof system !== 'object') return system;

    // Rename managedItems -> components
    if ('managedItems' in system) {
      if (!('components' in system) || system.components == null) {
        system.components = system.managedItems;
      }
      delete system.managedItems;
    }

    // Migrate salvage fields on each component
    const componentList = system.components;
    if (Array.isArray(componentList)) {
      system.components = componentList.map((component) => {
        if (component == null || typeof component !== 'object') return component;
        if (component.salvage && typeof component.salvage === 'object') {
          if (Array.isArray(component.salvage.catalysts)) {
            component.salvage.catalysts = _migrateCatalysts(component.salvage.catalysts);
          }
          if (Array.isArray(component.salvage.resultGroups)) {
            component.salvage.resultGroups = _migrateResultGroups(component.salvage.resultGroups);
          }
        }
        return component;
      });
    }

    return system;
  });
}

/**
 * Convenience wrapper that migrates both recipes and systems.
 * @param {Array} recipes
 * @param {Array} systems
 * @returns {{ recipes: Array, systems: Array }}
 */
export function runComponentIdMigration(recipes, systems) {
  return {
    recipes: migrateRecipes(recipes),
    systems: migrateCraftingSystems(systems),
  };
}
