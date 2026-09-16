/**
 * `1.19.0` — delete a persisted `requirements.time.enabled === false` once, so issue 714's
 * default-on reader restores the pre-714 behaviour. Pure, idempotent, version-gated. The pre-714
 * normalizer coerced that field from an ABSENT flag and `save()` persists normalized systems, so the
 * stored `false` was never a deliberate opt-out. THE VERSION GATE IS LOAD-BEARING: the pass runs
 * once, before the GM can touch the new toggle, so a GM who later sets it OFF is never flipped back.
 */

function _clearPersistedTimeDisabled(system) {
  const time = system?.requirements?.time;
  if (!time || typeof time !== 'object') return;
  // Only the literal `false` — a persisted opt-out that predates the GM toggle. An absent
  // key already default-ons under the 714 reader, and a persisted `true` is honoured as-is.
  if (time.enabled === false) delete time.enabled;
}

export function migrateDefaultOnTimeRequirements(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  for (const system of safeSystems) {
    if (!system || typeof system !== 'object') continue;
    _clearPersistedTimeDisabled(system);
  }
  return { systems: safeSystems };
}
