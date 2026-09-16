/**
 * `1.22.0` — lift the check-modifier catalogue up to the system and rename `byRecipe` to `bySubject`
 * (issue 1095; spec § System Check-Modifier Catalogue Migration owns the rules, the lossy downgrade
 * and why THE RUNNER'S ORDERING IS LOAD-BEARING). Pure, clone-first, idempotent, version-gated.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';

/** The same spelling at two scopes: inside `craftingCheck` before, on the system after. */
const LEGACY_CATALOGUE_KEY = 'checkModifiers';
const SYSTEM_CATALOGUE_KEY = 'checkModifiers';

/** The rule token this migration rewrites. */
const LEGACY_POLICY = 'byRecipe';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Apply the `1.22.0` transform to ONE system in place, shared with `migrateExportPayload.js`. */
export function applySystemCheckModifierCatalogue(system) {
  if (!_isPlainObject(system)) return;
  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;

  // A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED: deleting it is a REPAIR, and this pass would
  // be destroying data it cannot read. GUARDED, so an authored system-level catalogue is never
  // clobbered while the legacy key still goes and a half-migrated system converges.
  if (check && Array.isArray(check[LEGACY_CATALOGUE_KEY])) {
    if (!Array.isArray(system[SYSTEM_CATALOGUE_KEY])) {
      system[SYSTEM_CATALOGUE_KEY] = check[LEGACY_CATALOGUE_KEY];
    }
    delete check[LEGACY_CATALOGUE_KEY];
  }

  // INDEPENDENT of the move: a system may carry `byRecipe` with no catalogue at all.
  if (check && check.defaultModifierPolicy === LEGACY_POLICY) {
    check.defaultModifierPolicy = normalizeModifierPolicy(LEGACY_POLICY);
  }
}

/** Runner entry point. */
export function migrateSystemCheckModifierCatalogue(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  if (!Array.isArray(systems)) return { systems: data.systems };
  for (const system of systems) applySystemCheckModifierCatalogue(system);
  return { systems };
}
