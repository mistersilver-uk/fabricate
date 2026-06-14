/**
 * Pure promote-region decision for the GM Manage Interactables panel (issue 335).
 *
 * "Promote region to interactable" turns an EXISTING drawn region of any shape
 * into a working `fabricate.interactable` bound to a chosen Tool or Gathering Task
 * source. This module is the PURE decision: given a chosen source
 * `{ interactableType, systemId, referenceId }` plus the resolved env (for a
 * gathering task) and a chosen marker mode, it validates the selection and builds:
 *
 *   - the behaviour `system` via the SAME {@link buildInteractableBehaviorSystem}
 *     every placement path uses (NO second builder), and
 *   - an optional marker spawn request describing the Tile/Drawing the caller
 *     should create over the region (region-only when `visualMode === 'none'`).
 *
 * It never touches Foundry: the caller (the app shell) resolves the live region,
 * attaches the behaviour via `region.createEmbeddedDocuments('RegionBehavior', …)`,
 * and — for `visualMode: 'marker'` — creates the marker via the existing
 * recreate-tile / drawing seams in `linkedInteractableVisual.js`. A gathering-task
 * promotion runs the drop-time environment-resolution precedence
 * (`environmentResolution.js`) at the edge and passes the resolved `environmentId`
 * in here.
 */

import { buildInteractableSourceUuid } from '../interactableResolution.js';

import { INTERACTABLE_TYPES } from './interactableRegionFlags.js';

/** Supported marker kinds a promotion may request (region-only ⇒ none). */
export const PROMOTE_MARKER_KINDS = Object.freeze(['Tile', 'Drawing']);

/**
 * Validate a promote source pick. PURE: confirms the chosen interactable type,
 * system id, and reference id are all present + well-formed. Returns
 * `{ valid: true }` or `{ valid: false, reason }` so the picker can surface a
 * precise message and disable the confirm action.
 *
 * @param {object} pick
 * @param {'tool'|'gatheringTask'} [pick.interactableType]
 * @param {string} [pick.systemId]
 * @param {string} [pick.referenceId]
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
export function validatePromoteSource({ interactableType, systemId, referenceId } = {}) {
  if (!INTERACTABLE_TYPES.includes(interactableType)) {
    return { valid: false, reason: 'type' };
  }
  if (typeof systemId !== 'string' || systemId.trim() === '') {
    return { valid: false, reason: 'system' };
  }
  if (typeof referenceId !== 'string' || referenceId.trim() === '') {
    return { valid: false, reason: 'reference' };
  }
  return { valid: true };
}

/**
 * Decide the promotion: validate the source, build the behaviour `system`, and
 * shape an optional marker spawn request. PURE.
 *
 * Returns `{ ok: false, reason }` when the source pick is invalid (so the caller
 * does not attach a half-formed behaviour). Otherwise returns:
 *
 *   {
 *     ok: true,
 *     behaviorSystem,                  // ready to attach as a RegionBehavior system
 *     marker: { kind, center } | null  // a marker create request, or null (region-only)
 *   }
 *
 * The marker request is `null` for `visualMode: 'none'` (region-only). For a
 * marker, `kind` is 'Tile' (default) or 'Drawing', and `center` is the region's
 * shape centre (when the caller supplied one) so the marker overlays the region.
 *
 * @param {object} params
 * @param {object} params.source                  `{ interactableType, systemId, referenceId }`.
 * @param {string} [params.name]                  Explicit display name (defaults to the source label / id at the edge).
 * @param {string} [params.environmentId]         Resolved environment (gatheringTask only).
 * @param {'marker'|'none'} [params.visualMode]   'marker' (default) ⇒ create a marker; 'none' ⇒ region-only.
 * @param {'Tile'|'Drawing'} [params.markerKind]  Which marker to create (default 'Tile').
 * @param {{ x: number, y: number }|null} [params.center]  The region's shape centre, for marker placement.
 * @param {(spawn: object) => object} params.buildBehaviorSystem  The shared behaviour-system builder
 *   (`buildInteractableBehaviorSystem`); injected so this stays Foundry-free.
 * @returns {{ ok: false, reason: string } | { ok: true, behaviorSystem: object, marker: object|null }}
 */
export function decidePromoteRegion({
  source,
  name,
  environmentId,
  visualMode = 'marker',
  markerKind = 'Tile',
  center = null,
  buildBehaviorSystem,
} = {}) {
  if (typeof buildBehaviorSystem !== 'function') {
    throw new TypeError('decidePromoteRegion requires a buildBehaviorSystem builder');
  }

  const validation = validatePromoteSource(source ?? {});
  if (!validation.valid) {
    return { ok: false, reason: validation.reason };
  }

  const { interactableType, systemId, referenceId } = source;
  const regionOnly = visualMode === 'none';
  const sourceUuid = buildInteractableSourceUuid({ interactableType, systemId, referenceId });

  const resolvedName = typeof name === 'string' ? name.trim() : '';
  const resolvedEnvironmentId =
    interactableType === 'gatheringTask' &&
    typeof environmentId === 'string' &&
    environmentId.trim() !== ''
      ? environmentId.trim()
      : undefined;

  const behaviorSystem = buildBehaviorSystem({
    interactableType,
    sourceUuid,
    systemId,
    toolId: interactableType === 'tool' ? referenceId : null,
    taskId: interactableType === 'gatheringTask' ? referenceId : null,
    environmentId: resolvedEnvironmentId,
    name: resolvedName,
    // Region-only ⇒ hidden + no marker; the builder leaves uuid/documentName null.
    presentation: regionOnly ? { hidden: true } : undefined,
    linkedVisual: regionOnly ? { mode: 'none' } : undefined,
  });

  const kind = PROMOTE_MARKER_KINDS.includes(markerKind) ? markerKind : 'Tile';
  const marker = regionOnly
    ? null
    : {
        kind,
        center:
          center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))
            ? { x: Number(center.x), y: Number(center.y) }
            : null,
      };

  return { ok: true, behaviorSystem, marker };
}
