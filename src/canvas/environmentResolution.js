/**
 * Pure environment-resolution precedence for a dropped gathering-task
 * Interactable (Phase 6).
 *
 * When a gathering task is dropped on the canvas, its environment is resolved by
 * this precedence chain:
 *
 *   1. Scene Region auto-detect — the drop point falls inside a Foundry V13 Scene
 *      Region flagged `flags.fabricate.environmentId`. No dialog; the caller emits
 *      a `ui.notifications.info` naming the resolved environment.
 *   2. Task static default — the task carries the new optional
 *      `defaultEnvironmentId` field. No dialog.
 *   3. GM dialog — neither auto-source resolved, OR an explicit override was
 *      requested (the GM held Alt during the drop), OR region detection was
 *      ambiguous (multiple flagged regions contain the point). Cancel aborts the
 *      spawn.
 *
 * Holding Alt during the drop ALWAYS forces the dialog (tiers 1 + 2 are skipped).
 *
 * This module is the PURE DECISION: it takes the candidate region hits, the task
 * default, and the modifier flag and returns a `resolution` describing which tier
 * won and whether a dialog is needed. The Foundry edges — the region point-in-
 * region hit-test, the `DialogV2` prompt, and the `ui.notifications.info` — are
 * supplied by the caller (`InteractableManager`).
 */

/**
 * Resolve the environment for a dropped gathering task.
 *
 * @param {object} args
 * @param {string[]} [args.regionEnvironmentIds]  Environment ids from every Scene
 *   Region (flagged `flags.fabricate.environmentId`) that CONTAINS the drop point.
 *   One unambiguous hit auto-resolves (tier 1); multiple hits are ambiguous and
 *   fall through to the dialog. Empty = no region hit.
 * @param {string|null} [args.defaultEnvironmentId]  The task's `defaultEnvironmentId`
 *   (tier 2), or null/empty.
 * @param {boolean} [args.forceDialog]  Alt held during drop — always go to dialog.
 * @param {(id: string) => boolean} [args.environmentExists]  Whether an env id
 *   resolves to a real environment (a stale region/default id falls through to
 *   the dialog rather than spawning into a non-existent environment).
 * @returns {{ source: 'region'|'taskDefault'|'dialog', environmentId: string|null,
 *   needsDialog: boolean, notify: boolean }}
 *   - `source`: which tier produced the decision.
 *   - `environmentId`: the auto-resolved id (region/taskDefault), else null.
 *   - `needsDialog`: the caller must prompt the GM to pick.
 *   - `notify`: emit the region-auto-resolve `ui.notifications.info` (region tier
 *     only).
 */
export function resolveDropEnvironment({
  regionEnvironmentIds = [],
  defaultEnvironmentId = null,
  forceDialog = false,
  environmentExists = () => true
} = {}) {
  const exists = (id) => typeof id === 'string' && id !== '' && environmentExists(id) === true;

  // Alt forces the GM dialog, bypassing region auto-detect and the task default.
  if (forceDialog === true) {
    return { source: 'dialog', environmentId: null, needsDialog: true, notify: false };
  }

  // Tier 1: Scene Region auto-detect. A single existing flagged region wins;
  // multiple hits are ambiguous and fall through to the dialog.
  const regionHits = (Array.isArray(regionEnvironmentIds) ? regionEnvironmentIds : [])
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => exists(id));
  const uniqueRegionHits = [...new Set(regionHits)];
  if (uniqueRegionHits.length === 1) {
    return { source: 'region', environmentId: uniqueRegionHits[0], needsDialog: false, notify: true };
  }

  // Tier 2: task static default (only when region detection was not ambiguous).
  if (uniqueRegionHits.length === 0) {
    const taskDefault = typeof defaultEnvironmentId === 'string' ? defaultEnvironmentId.trim() : '';
    if (exists(taskDefault)) {
      return { source: 'taskDefault', environmentId: taskDefault, needsDialog: false, notify: false };
    }
  }

  // Tier 3: GM dialog (neither auto-source resolved, or region was ambiguous, or
  // the region/default id was stale).
  return { source: 'dialog', environmentId: null, needsDialog: true, notify: false };
}
