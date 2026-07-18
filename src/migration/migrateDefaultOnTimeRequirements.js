/**
 * 1.19.0 — Default-on the recipe time requirement for worlds upgraded from the
 * era when `requirements.time.enabled` was persisted as a hard `false` (issue 714;
 * pure, idempotent, version-gated).
 *
 * WHY THIS EXISTS — read this before deleting it as redundant. The pre-714 normalizer
 * coerced `enabled: time.enabled === true`, and `save()` persists the NORMALIZED
 * systems. There was never a GM control to set the field true, so every system saved
 * in a world while the requirements block was live carries `requirements.time.enabled:
 * false` in STORAGE — a value that was never a deliberate opt-out, just the coercion of
 * an absent flag. The engine ignored the field entirely before 714, so those systems'
 * authored `timeRequirement` / step durations armed timed runs regardless.
 *
 * Issue 714 flips the reader to default-on (`enabled !== false`, mirroring the
 * `features.salvage` convention) so an ABSENT flag keeps time requirements running. But
 * a PERSISTED literal `false` reads as a deliberate disable under that reader, which
 * would silently switch off time gating for every upgraded world — existing timed
 * recipes would resolve instantly and the new Time toggle would render OFF everywhere,
 * the exact opposite of the default-on decision. The absent-defaults-true reasoning only
 * covers never-persisted systems; the dominant real case is present-and-false.
 *
 * This migration deletes a persisted `requirements.time.enabled === false` once, so the
 * default-on reader restores the pre-714 behaviour (time requirements apply). It is
 * strictly conservative: it touches ONLY the literal `false`. It never seeds `true`
 * (deletion re-defaults to on with no stored value, matching the retire-flag precedent
 * and avoiding JSON churn), and it never touches a persisted `true` (which the old
 * normalizer could not produce anyway).
 *
 * The version gate is load-bearing for the opt-out path: the migration runs exactly once
 * per world, before the GM can interact with the new toggle, so a GM who later sets the
 * toggle OFF (persisting a deliberate `false` under 714) is never flipped back on — the
 * migration has already retired its version by then.
 *
 * Mutated setting key: `craftingSystems` (and only it).
 *
 * Idempotent: the key is deleted, so a second run finds nothing and is a no-op. Never
 * throws — every level is guarded, and a malformed system/requirements/time is skipped
 * rather than being repaired (normalization is the normalizer's job, not this migration's).
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @returns {{ systems: Array<object> }}
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
