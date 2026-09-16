/**
 * `1.8.0` — remove the deprecated check-source mechanisms from persisted systems, and the orphaned
 * recipe-level result-selection macro paired with them. Pure, deep-cloning and idempotent.
 * A check is now usable iff it carries an authored roll formula for its mode, so the
 * macro-as-source and built-in adapter fields are stripped from all three check blocks — while
 * `simple.macroUuid`, the live dynamic-DC macro, is deliberately PRESERVED.
 */

import { isPlainObject, clone } from './migrationHelpers.js';

const DEAD_ROOT_FIELDS = [
  'macroUuid',
  'successMacroUuid',
  'failureMacroUuid',
  'checkSource',
  'builtIn',
];

/**
 * Delete the deprecated ROOT-level check-source fields from one check, leaving `enabled`, `mode`,
 * `consumption` and the three sub-objects intact.
 */
function stripDeadCheckFields(check) {
  if (!isPlainObject(check)) return;
  for (const field of DEAD_ROOT_FIELDS) {
    if (Object.hasOwn(check, field)) {
      delete check[field];
    }
  }
}

/** Migrate one system: strip the dead check-source fields from all three checks. */
function migrateSystem(system) {
  if (!isPlainObject(system)) return;
  stripDeadCheckFields(system.craftingCheck);
  stripDeadCheckFields(system.salvageCraftingCheck);
  stripDeadCheckFields(system.gatheringCraftingCheck);
}

/** Delete the orphaned `macroUuid` from one `resultSelection`; every other field is left. */
function stripResultSelectionMacroUuid(selection) {
  if (!isPlainObject(selection)) return;
  if (Object.hasOwn(selection, 'macroUuid')) {
    delete selection.macroUuid;
  }
}

/** Migrate one recipe: strip that field from the recipe-level container and every step. */
function migrateRecipe(recipe) {
  if (!isPlainObject(recipe)) return;
  stripResultSelectionMacroUuid(recipe.resultSelection);
  if (Array.isArray(recipe.steps)) {
    for (const step of recipe.steps) {
      if (isPlainObject(step)) stripResultSelectionMacroUuid(step.resultSelection);
    }
  }
}

/** Run the `1.8.0` sweep over the runner's bundle. */
export function migrateRemoveLegacyCheckSources(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  for (const system of systems) migrateSystem(system);

  const recipes = Array.isArray(data?.recipes) ? clone(data.recipes) : [];
  for (const recipe of recipes) migrateRecipe(recipe);

  return { systems, recipes };
}
