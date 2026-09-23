/**
 * `1.10.0` — move a `routedByIngredients` system's optional pass/fail crafting check from the
 * `craftingCheck.routed` tier-routing slot to the shared `craftingCheck.simple` one. Pure,
 * idempotent, version-gated. Tier ids are preserved so recipe `checkTierId` references keep
 * resolving, and the routed `rollFormula` is cleared. THE GUARD ONLY EVER FILLS AN UNAUTHORED SIMPLE
 * SLOT, reading the RAW persisted shape and copying only present fields.
 */

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

export function migrateMoveRoutedByIngredientsCheck(data = {}) {
  const systems = _clone(data.systems);

  if (!Array.isArray(systems)) {
    return { systems: data.systems };
  }

  forEachSystem(systems, (system) => {
    if (system.resolutionMode !== 'routedByIngredients') return;
    _moveCheckSlot(system);
  });

  return { systems };
}

/**
 * Move one system's pass/fail config from `routed` to `simple` when the simple slot is unauthored
 * and the routed slot carries an authored formula.
 */
function _moveCheckSlot(system) {
  const check = system.craftingCheck;
  if (!isPlainObject(check)) return;

  const routed = isPlainObject(check.routed) ? check.routed : null;
  const routedFormula = typeof routed?.rollFormula === 'string' ? routed.rollFormula.trim() : '';
  if (!routed || routedFormula.length === 0) return;

  const existingSimple = isPlainObject(check.simple) ? check.simple : null;
  const simpleFormula =
    typeof existingSimple?.rollFormula === 'string' ? existingSimple.rollFormula.trim() : '';
  // Never clobber a GM-authored simple check; idempotent once simple is authored.
  if (simpleFormula.length > 0) return;

  // Build the moved simple slot from the routed slot's shared pass/fail fields,
  // preserving any fields the GM already set on the (unauthored-formula) simple slot.
  const simple = existingSimple ? { ...existingSimple } : {};
  simple.rollFormula = routed.rollFormula;
  if ('dc' in routed) simple.dc = routed.dc;
  if ('thresholdMode' in routed) simple.thresholdMode = routed.thresholdMode;
  if ('tiers' in routed) simple.tiers = routed.tiers;
  if ('checkBreakage' in routed) simple.checkBreakage = routed.checkBreakage;
  check.simple = simple;

  // Clear the moved config from the routed slot so it no longer masquerades as the
  // config source; drop the inert tier-routing fields that never applied to this mode.
  routed.rollFormula = '';
  delete routed.dc;
  delete routed.thresholdMode;
  delete routed.tiers;
  delete routed.checkBreakage;
  delete routed.type;
  delete routed.relativeOutcomes;
  delete routed.fixedOutcomes;

  console.log(
    `Fabricate | migrateMoveRoutedByIngredientsCheck: moved routedByIngredients pass/fail check ` +
      `routed → simple for system ${JSON.stringify({ id: system.id, name: system.name })}`
  );
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}
