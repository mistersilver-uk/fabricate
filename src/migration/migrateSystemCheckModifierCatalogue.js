/**
 * `1.22.0` — lift the check-modifier catalogue up to the system and rename `byRecipe` to `bySubject`
 * (issue 1095; spec § System Check-Modifier Catalogue Migration owns the rules and the lossy
 * downgrade). Pure, clone-first, idempotent, version-gated. THE RUNNER'S ORDERING IS LOAD-BEARING,
 * and is why this can be a MOVE rather than a rescue: the normalizer is an ALLOWLIST REBUILD that no
 * longer emits the key, so a save running first would have DELETED the catalogue.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';

/** The key the catalogue used to be persisted under, inside `craftingCheck`. */
const LEGACY_CATALOGUE_KEY = 'checkModifiers';

/** Where it lives now: the system itself. */
const SYSTEM_CATALOGUE_KEY = 'checkModifiers';

/** The rule token this migration rewrites, and what it becomes. */
const LEGACY_POLICY = 'byRecipe';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply the whole `1.22.0` transform to ONE system, mutated in place. Split out so the
 * world-setting migration and `migrateExportPayload.js` share ONE derivation.
 */
export function applySystemCheckModifierCatalogue(system) {
  if (!_isPlainObject(system)) return;
  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;

  // A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED: deleting it is a REPAIR, and this migration
  // would be destroying data it has decided it cannot read, on the one path where the GM has no
  // copy left. Nothing reads it, and the allowlist rebuild drops it on the next save anyway.
  if (check && Array.isArray(check[LEGACY_CATALOGUE_KEY])) {
    // GUARDED: an authored system-level catalogue is never clobbered, while the legacy key is
    // still deleted, so a half-migrated system converges rather than carrying two.
    if (!Array.isArray(system[SYSTEM_CATALOGUE_KEY])) {
      system[SYSTEM_CATALOGUE_KEY] = check[LEGACY_CATALOGUE_KEY];
    }
    delete check[LEGACY_CATALOGUE_KEY];
  }

  // The rule rewrite is INDEPENDENT of the move: a system may carry `byRecipe` with no catalogue
  // at all, and the token must still stop being re-emitted.
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
