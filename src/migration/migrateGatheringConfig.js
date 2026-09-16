/**
 * `0.2.0` — clear the stale top-level `gatheringConfig.vocabularies.regions`. Pure and idempotent.
 * `regions` has no canonical default, so any non-empty top-level value is residue — and because
 * `normalizeSystemVocabularies` falls back to top-level vocab, it propagates into every system.
 */

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** A deep-cloned config with `regions` cleared; a non-object or absent `vocabularies` passes through. */
export function migrateGatheringConfig(config) {
  if (!_isPlainObject(config)) return config;

  const cloned = JSON.parse(JSON.stringify(config));
  if (_isPlainObject(cloned.vocabularies)) {
    cloned.vocabularies.regions = [];
  }
  return cloned;
}
