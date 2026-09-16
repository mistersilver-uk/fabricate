/**
 * The PURE environment-resolution precedence for a dropped gathering task: an unambiguous
 * Fabricate-flagged Scene Region containing the drop point, else the task's
 * `defaultEnvironmentId`, else a GM dialog whose cancel aborts the spawn.
 * Holding Alt during the drop ALWAYS forces the dialog, skipping both automatic tiers.
 * It returns which tier won and whether a dialog is needed; the hit-test, the `DialogV2` prompt
 * and the notification are the caller's edges.
 */

/**
 * Resolve the environment for a dropped gathering task, returning
 * `{ source, environmentId, needsDialog, notify }`. A stale region or default id — one
 * `environmentExists` rejects — falls through to the dialog rather than spawning into an
 * environment that is not there.
 */
export function resolveDropEnvironment({
  regionEnvironmentIds = [],
  defaultEnvironmentId = null,
  forceDialog = false,
  environmentExists = () => true,
} = {}) {
  const exists = (id) => typeof id === 'string' && id !== '' && environmentExists(id) === true;

  // Alt forces the GM dialog, bypassing region auto-detect and the task default.
  if (forceDialog === true) {
    return { source: 'dialog', environmentId: null, needsDialog: true, notify: false };
  }

  // Tier 1: a single existing flagged region wins; multiple hits are ambiguous.
  const regionHits = (Array.isArray(regionEnvironmentIds) ? regionEnvironmentIds : [])
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => exists(id));
  const uniqueRegionHits = [...new Set(regionHits)];
  if (uniqueRegionHits.length === 1) {
    return {
      source: 'region',
      environmentId: uniqueRegionHits[0],
      needsDialog: false,
      notify: true,
    };
  }

  // Tier 2: task static default (only when region detection was not ambiguous).
  if (uniqueRegionHits.length === 0) {
    const taskDefault = typeof defaultEnvironmentId === 'string' ? defaultEnvironmentId.trim() : '';
    if (exists(taskDefault)) {
      return {
        source: 'taskDefault',
        environmentId: taskDefault,
        needsDialog: false,
        notify: false,
      };
    }
  }

  // Tier 3: GM dialog.
  return { source: 'dialog', environmentId: null, needsDialog: true, notify: false };
}
