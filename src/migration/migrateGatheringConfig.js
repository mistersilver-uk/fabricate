/**
 * Migration 0.2.0: clear stale top-level `gatheringConfig.vocabularies.regions`.
 *
 * Pure function (no I/O, no Foundry calls), idempotent, safe to run multiple times.
 *
 * `regions` has no canonical default (unlike biomes/weather/timeOfDay which have
 * curated lists in `DEFAULT_VOCABULARIES`); the production default is `[]`. Any
 * non-empty value at the top level is residue from the E2E harness or a manual
 * setting edit. `normalizeSystemVocabularies` falls back to top-level vocab when
 * a system has none of its own, so this residue propagates into every system on
 * read. Clearing the top level restores expected behaviour for every system that
 * doesn't set its own regions list.
 */

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Return a deep-cloned gathering config with `vocabularies.regions` cleared.
 * Non-object inputs pass through unchanged. Missing `vocabularies` is left alone.
 *
 * @param {object|null|undefined} config
 * @returns {object|null|undefined}
 */
export function migrateGatheringConfig(config) {
  if (!_isPlainObject(config)) return config;

  const cloned = JSON.parse(JSON.stringify(config));
  if (_isPlainObject(cloned.vocabularies)) {
    cloned.vocabularies.regions = [];
  }
  return cloned;
}
