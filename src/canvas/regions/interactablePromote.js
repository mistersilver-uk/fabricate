/**
 * PURE promote-region decision for the GM Manage Interactables panel (issue 335): a chosen source
 * plus a marker mode to a behaviour `system` and an optional marker spawn request.
 * It builds the system through the SAME {@link buildInteractableBehaviorSystem} every placement
 * path uses — there is no second builder — and touches no Foundry: the app shell attaches the
 * behaviour, creates any marker, and resolves the environment before calling in.
 */

import { buildInteractableSourceUuid } from '../interactableResolution.js';

import { INTERACTABLE_TYPES } from './interactableRegionFlags.js';

/** Supported marker kinds a promotion may request (region-only ⇒ none). */
export const PROMOTE_MARKER_KINDS = Object.freeze(['Tile', 'Drawing']);

/**
 * PURE. `{ valid: true }` or `{ valid: false, reason }` for a source pick, so the picker can name
 * the problem and disable confirm.
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
 * PURE. `{ ok: false, reason }` for an invalid pick — so no half-formed behaviour is attached —
 * else `{ ok: true, behaviorSystem, marker }`. `marker` is null under `visualMode: 'none'`,
 * otherwise `{ kind, center }` at the region's shape centre so it overlays the region.
 * `buildBehaviorSystem` is injected to keep this Foundry-free.
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
    // Region-only ⇒ hidden and no marker; the builder leaves uuid/documentName null.
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
