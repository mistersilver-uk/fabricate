/**
 * Migration 1.8.0: remove the deprecated "check source" mechanisms from persisted
 * crafting systems.
 *
 * A crafting/salvage/gathering check is now "usable" iff it carries an authored roll
 * formula for its resolution mode (`simple.rollFormula` / `routed.rollFormula` /
 * `progressive.rollFormula`). The legacy mechanisms — running a macro to produce the
 * check result, and the built-in game-system adapter — are gone, along with their
 * persisted fields. This migration strips the dead root-level fields from each of the
 * three check objects on every system:
 *
 *   - `macroUuid`         (the macro-as-check-source; the live dynamic-DC macro lives
 *                          on `simple.macroUuid` and is intentionally PRESERVED)
 *   - `successMacroUuid`
 *   - `failureMacroUuid`
 *   - `checkSource`       (and its `'builtIn'` value)
 *   - `builtIn`           (the `{ability, skill, dc, advantage}` adapter config)
 *
 * Applied to `system.craftingCheck`, `system.salvageCraftingCheck`, and
 * `system.gatheringCraftingCheck`. The `enabled` flag and the simple/routed/progressive
 * sub-objects (including `simple.macroUuid`, the dynamic-DC macro) are untouched.
 *
 * Pure function: no I/O, no Foundry calls, deep-clones its input. Idempotent — each
 * field removal is a `delete` of an already-absent key on re-run, so a second pass is a
 * no-op. Runs at the new highest version (1.8.0), strictly after every earlier check
 * migration.
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
 * Delete the deprecated root-level check-source fields from one check object, leaving
 * `enabled`, `mode`, `consumption`, and the simple/routed/progressive sub-objects intact.
 * `simple.macroUuid` (the dynamic-DC macro) is never touched because it is nested under
 * `simple`, not at the check root.
 *
 * @param {object} check - a craftingCheck / salvageCraftingCheck / gatheringCraftingCheck object (mutated)
 */
function stripDeadCheckFields(check) {
  if (!isPlainObject(check)) return;
  for (const field of DEAD_ROOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(check, field)) {
      delete check[field];
    }
  }
}

/**
 * Migrate one crafting system: strip the dead check-source fields from all three checks.
 *
 * @param {object} system - raw crafting-system object (mutated)
 */
function migrateSystem(system) {
  if (!isPlainObject(system)) return;
  stripDeadCheckFields(system.craftingCheck);
  stripDeadCheckFields(system.salvageCraftingCheck);
  stripDeadCheckFields(system.gatheringCraftingCheck);
}

/**
 * Run the 1.8.0 sweep over the runner's one-pass data bundle.
 *
 * @param {{ systems?: object[] }} data
 * @returns {{ systems: object[] }}
 */
export function migrateRemoveLegacyCheckSources(data = {}) {
  const systems = Array.isArray(data?.systems) ? clone(data.systems) : [];
  for (const system of systems) migrateSystem(system);
  return { systems };
}
