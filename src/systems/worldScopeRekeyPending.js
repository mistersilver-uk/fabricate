/**
 * Whether a `1.30.0` re-key is still pending (issue 1363): between the migration moving component
 * and tool ids and the active-GM `remapWorldScopeIdentityFlags` later in the same `ready` tick,
 * the corpus is complete but actor references are stale, which the valid id basis cannot see. A
 * plain world-setting read, so every client withholds its destructive startup passes, and it fails
 * closed, since those passes are skippable and their deletions are not. The key mirrors
 * `SETTING_KEYS.WORLD_SCOPE_REKEY_MAP`, unimported to keep `startupPassComposition.js` UI-free;
 * `tests/world-scope-startup-prune-ordering.test.js` pins it.
 */

export const WORLD_SCOPE_REKEY_MAP_SETTING_KEY = 'worldScopeRekeyMap';

export function isPendingWorldScopeRekeyMap(rekeyMap) {
  if (!rekeyMap || typeof rekeyMap !== 'object' || Array.isArray(rekeyMap)) return false;
  return Object.keys(rekeyMap).length > 0;
}

export function hasPendingWorldScopeRekey(getSetting) {
  if (typeof getSetting !== 'function') return true;
  try {
    return isPendingWorldScopeRekeyMap(getSetting(WORLD_SCOPE_REKEY_MAP_SETTING_KEY));
  } catch {
    return true;
  }
}
