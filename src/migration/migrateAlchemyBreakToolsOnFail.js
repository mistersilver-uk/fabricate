/**
 * `1.35.0` — issue 2100 ruling "add switch, keep old default": before this release a failed
 * simple/tiered alchemy check force-broke every required tool regardless of
 * `craftingCheck.consumption.breakToolsOnFail`. Now that the setting genuinely gates alchemy
 * breakage, an existing alchemy system with no explicit value would silently switch from
 * always-break to never-break. Stamp `breakToolsOnFail = true` on every existing alchemy system
 * that has not already authored the field, so its behaviour does not change. A NEW system still
 * gets the normal default (`false`), because it never carried the old always-break behaviour.
 */

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

const ALCHEMY_CHECK_MODES = new Set(['simple', 'tiered']);

/** An "alchemy system" for this migration: alchemy is the active resolution mode, or the system
 * still carries an alchemy check-mode config (e.g. left behind by a mode switch). */
function isAlchemySystem(system) {
  if (system.resolutionMode === 'alchemy') return true;
  return isPlainObject(system.alchemy) && ALCHEMY_CHECK_MODES.has(system.alchemy.checkMode);
}

/** Apply the stamp to ONE system, mutated in place; a no-op once the field is explicitly set. */
export function applyAlchemyBreakToolsOnFailDefault(system) {
  if (!isPlainObject(system)) return;
  if (!isAlchemySystem(system)) return;
  if (!isPlainObject(system.craftingCheck)) system.craftingCheck = {};
  if (!isPlainObject(system.craftingCheck.consumption)) system.craftingCheck.consumption = {};
  const consumption = system.craftingCheck.consumption;
  if (Object.prototype.hasOwnProperty.call(consumption, 'breakToolsOnFail')) return;
  consumption.breakToolsOnFail = true;
}

/** Runner entry point. */
export function migrateAlchemyBreakToolsOnFail(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  if (!Array.isArray(systems)) return { systems: data.systems };

  forEachSystem(systems, (system) => applyAlchemyBreakToolsOnFailDefault(system));

  return { systems };
}
