/**
 * Migration 1.7.0: finish the Catalyst → Tool vocabulary cleanup in the settings blob.
 *
 * Two changes, applied in a single pass:
 *
 * 1. RENAME the persisted failure-consumption key `consumeCatalystsOnFail` →
 *    `breakToolsOnFail` on `system.craftingCheck.consumption` and
 *    `system.salvageCraftingCheck.consumption`. The key kept its catalyst-era name purely to
 *    avoid a persisted-key migration; it has governed Tool breakage-on-failed-check since the
 *    0.6.0 Catalyst→Tool migration. The new name matches the domain language (Tools *break*,
 *    they are not *consumed*) and the engine's `_applyToolBreakage` path.
 *
 * 2. STRIP residual dead `catalysts` arrays. The 0.6.0 migration converts catalysts to
 *    `toolIds` and deletes the inline `catalysts` array everywhere it can reach. Arrays only
 *    survive where 0.6.0 could not act — recipes pointing at a since-deleted crafting system
 *    (skipped, not migrated) and the never-authored, dead/vestigial gathering `task.catalysts`
 *    field. The engine reads only `toolIds`, so these arrays are inert dead data; this strips
 *    them so the term stops appearing in persisted worlds. Stripped sites:
 *      - `recipe.catalysts`, `recipe.steps[].catalysts`,
 *        `recipe.steps[].ingredientSets[].catalysts`, `recipe.ingredientSets[].catalysts`;
 *      - `system.components[].salvage.catalysts`;
 *      - `gatheringConfig.systems[*].tasks[*].catalysts`.
 *    (For orphaned-system recipes this is a deliberate drop of permanently-dead data — those
 *    catalysts were never converted to tools and never will be, since their system is gone.)
 *
 * Pure function: no I/O, no Foundry calls, deep-clones its inputs. Idempotent — the rename
 * guards on "old key present AND new key absent" and the strip is a `delete` of an
 * already-absent key on re-run, so a second pass is a no-op. A stale `consumeCatalystsOnFail`
 * left alongside an already-present `breakToolsOnFail` is left inert (no clobber, no drop).
 * Runs at the new highest version (1.7.0), strictly after the 0.6.0 catalyst→tool conversion.
 */

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Rename `oldKey` → `newKey` on a plain object in place, but only when `oldKey` is present
 * and `newKey` is absent (idempotent; never clobbers an existing new key).
 *
 * @param {object} obj
 * @param {string} oldKey
 * @param {string} newKey
 */
function renameKey(obj, oldKey, newKey) {
  if (!isPlainObject(obj)) return;
  if (!Object.prototype.hasOwnProperty.call(obj, oldKey)) return;
  if (Object.prototype.hasOwnProperty.call(obj, newKey)) return; // already migrated → leave stale inert
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
}

/**
 * Rename the failure-consumption key on a check's `consumption` sub-object, if present.
 *
 * @param {object} check - a craftingCheck / salvageCraftingCheck object
 */
function renameConsumptionKey(check) {
  if (!isPlainObject(check)) return;
  renameKey(check.consumption, 'consumeCatalystsOnFail', 'breakToolsOnFail');
}

/**
 * Delete a residual dead `catalysts` array from a container, if present.
 *
 * @param {object} container
 */
function stripCatalysts(container) {
  if (!isPlainObject(container)) return;
  if (Object.prototype.hasOwnProperty.call(container, 'catalysts')) {
    delete container.catalysts;
  }
}

/**
 * Run the 1.7.0 sweep over the runner's one-pass data bundle.
 *
 * @param {{ recipes?: object[], systems?: object[], gatheringConfig?: object }} data
 * @returns {{ recipes: object[], systems: object[], gatheringConfig: object }}
 */
export function migrateBreakToolsOnFail(data = {}) {
  const recipes = Array.isArray(data?.recipes) ? clone(data.recipes) : [];
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  const gatheringConfig = isPlainObject(data?.gatheringConfig) ? clone(data.gatheringConfig) : {};

  // 1. Crafting systems: rename the consumption key on both check kinds; strip residual
  //    dead salvage catalysts on every component.
  for (const system of systems) {
    if (!isPlainObject(system)) continue;
    renameConsumptionKey(system.craftingCheck);
    renameConsumptionKey(system.salvageCraftingCheck);

    const components = Array.isArray(system.components) ? system.components : null;
    if (components) {
      for (const component of components) {
        if (isPlainObject(component)) stripCatalysts(component.salvage);
      }
    }
  }

  // 2. Recipes: strip residual dead catalysts at every level (recipe, steps, both step-level
  //    and recipe-level ingredient sets). These survive only on recipes whose crafting system
  //    was missing at 0.6.0; the engine reads `toolIds`, so the arrays are inert.
  for (const recipe of recipes) {
    if (!isPlainObject(recipe)) continue;
    stripCatalysts(recipe);

    if (Array.isArray(recipe.steps)) {
      for (const step of recipe.steps) {
        stripCatalysts(step);
        if (isPlainObject(step) && Array.isArray(step.ingredientSets)) {
          for (const set of step.ingredientSets) stripCatalysts(set);
        }
      }
    }

    if (Array.isArray(recipe.ingredientSets)) {
      for (const set of recipe.ingredientSets) stripCatalysts(set);
    }
  }

  // 3. Gathering tasks: drop the never-authored, dead/vestigial `task.catalysts` field.
  const gatheringSystems = isPlainObject(gatheringConfig.systems) ? gatheringConfig.systems : null;
  if (gatheringSystems) {
    for (const gatheringSystem of Object.values(gatheringSystems)) {
      if (!isPlainObject(gatheringSystem) || !Array.isArray(gatheringSystem.tasks)) continue;
      for (const task of gatheringSystem.tasks) stripCatalysts(task);
    }
  }

  return { recipes, systems, gatheringConfig };
}
