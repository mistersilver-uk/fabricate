/**
 * `1.7.0` — finish the Catalyst to Tool cleanup: RENAME `consumeCatalystsOnFail` to
 * `breakToolsOnFail` on both check kinds, and STRIP the residual dead `catalysts` arrays `0.6.0`
 * could not reach. The engine reads only `toolIds`, so those arrays are inert; for an
 * orphaned-system recipe this is a deliberate drop of permanently dead data. Pure and idempotent —
 * the rename guards on "old key present AND new key absent", so no clobber and no drop.
 */

import { isPlainObject, clone, renameKey } from './migrationHelpers.js';

/** Rename the failure-consumption key on a check's `consumption` sub-object, if present. */
function renameConsumptionKey(check) {
  if (!isPlainObject(check)) return;
  renameKey(check.consumption, 'consumeCatalystsOnFail', 'breakToolsOnFail');
}

/** Delete a residual dead `catalysts` array from a container, if present. */
function stripCatalysts(container) {
  if (!isPlainObject(container)) return;
  if (Object.prototype.hasOwnProperty.call(container, 'catalysts')) {
    delete container.catalysts;
  }
}

/** Strip the dead `catalysts` array from every plain-object entry of `list`. */
function stripCatalystsFromEach(list) {
  if (!Array.isArray(list)) return;
  for (const entry of list) stripCatalysts(entry);
}

/** Migrate one system: rename on both check kinds, strip residual salvage catalysts. */
function migrateSystem(system) {
  if (!isPlainObject(system)) return;
  renameConsumptionKey(system.craftingCheck);
  renameConsumptionKey(system.salvageCraftingCheck);
  if (!Array.isArray(system.components)) return;
  for (const component of system.components) {
    if (isPlainObject(component)) stripCatalysts(component.salvage);
  }
}

/** Strip residual dead catalysts at every recipe level — recipe, steps, and both set levels. */
function stripRecipeCatalysts(recipe) {
  if (!isPlainObject(recipe)) return;
  stripCatalysts(recipe);
  stripCatalystsFromEach(recipe.ingredientSets);
  if (!Array.isArray(recipe.steps)) return;
  for (const step of recipe.steps) {
    stripCatalysts(step);
    if (isPlainObject(step)) stripCatalystsFromEach(step.ingredientSets);
  }
}

/** Drop the never-authored, vestigial `task.catalysts` field from every gathering task. */
function stripGatheringTaskCatalysts(gatheringConfig) {
  if (!isPlainObject(gatheringConfig.systems)) return;
  for (const gatheringSystem of Object.values(gatheringConfig.systems)) {
    if (isPlainObject(gatheringSystem)) stripCatalystsFromEach(gatheringSystem.tasks);
  }
}

/** Run the `1.7.0` sweep over the runner's bundle. */
export function migrateBreakToolsOnFail(data = {}) {
  const recipes = Array.isArray(data?.recipes) ? clone(data.recipes) : [];
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const gatheringConfig = isPlainObject(data?.gatheringConfig) ? clone(data.gatheringConfig) : {};

  for (const system of systems) migrateSystem(system);
  for (const recipe of recipes) stripRecipeCatalysts(recipe);
  stripGatheringTaskCatalysts(gatheringConfig);

  return { recipes, systems, gatheringConfig };
}
