/**
 * PURE drag-payload builder for the GM Interactable browser, the module's only net-new drag
 * SOURCE (`src/ui/svelte/actions/dragDrop.js` is drop-only), shaped here so the round trip
 * through `classifyInteractableDrop` is testable without a DOM or DataTransfer.
 * Foundry reads the dragged JSON from `text/plain` and augments it with scene-space coordinates,
 * so the payload carries only the discriminating `fabricate` block. The top-level `type` is
 * cosmetic: classification keys ONLY off `data.fabricate`.
 */

export const INTERACTABLE_DRAG_TYPE = 'fabricate-interactable';

/**
 * The `dropCanvasData`-compatible payload for a browser row, or null for invalid inputs.
 * `visualMode: 'none'` is carried only for the region-only variant; a normal drag omits it and
 * the drop side defaults to 'marker'.
 */
export function buildInteractableDragPayload({
  interactableType,
  systemId,
  referenceId,
  visualMode,
} = {}) {
  const sysId = typeof systemId === 'string' ? systemId.trim() : '';
  const refId = typeof referenceId === 'string' ? referenceId.trim() : '';
  if (!sysId || !refId) return null;

  // Only stamp the no-marker variant, so an ordinary drag payload is unchanged.
  const visual = visualMode === 'none' ? { visualMode: 'none' } : {};

  if (interactableType === 'tool') {
    return {
      type: INTERACTABLE_DRAG_TYPE,
      fabricate: { interactableType: 'tool', systemId: sysId, toolId: refId, ...visual },
    };
  }
  if (interactableType === 'gatheringTask') {
    return {
      type: INTERACTABLE_DRAG_TYPE,
      fabricate: { interactableType: 'gatheringTask', systemId: sysId, taskId: refId, ...visual },
    };
  }
  return null;
}

/** Serialize for `DataTransfer.setData`; `''` when unbuildable, so dragstart can decline. */
export function serializeInteractableDragPayload(params) {
  const payload = buildInteractableDragPayload(params);
  return payload ? JSON.stringify(payload) : '';
}
