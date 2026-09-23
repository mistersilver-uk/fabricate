/**
 * `1.19.0` — delete a persisted `requirements.time.enabled === false` once, so issue 714's
 * default-on reader restores the pre-714 behaviour; the stored `false` was a normalizer coercion,
 * never an opt-out. Pure, idempotent, and THE VERSION GATE IS LOAD-BEARING: it runs once, before the
 * GM can touch the new toggle, so a GM who later sets it OFF is never flipped back.
 */

import { forEachSystem } from './migrationHelpers.js';

function _clearPersistedTimeDisabled(system) {
  const time = system?.requirements?.time;
  if (!time || typeof time !== 'object') return;
  // Only the literal `false` — a persisted opt-out that predates the GM toggle. An absent
  // key already default-ons under the 714 reader, and a persisted `true` is honoured as-is.
  if (time.enabled === false) delete time.enabled;
}

export function migrateDefaultOnTimeRequirements(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  forEachSystem(safeSystems, (system) => _clearPersistedTimeDisabled(system));
  return { systems: safeSystems };
}
