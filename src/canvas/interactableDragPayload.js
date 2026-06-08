/**
 * Pure drag-payload builder for the GM Interactable browser app (Phase 7).
 *
 * The browser app's draggable rows are the only NET-NEW drag SOURCE in the
 * module: `src/ui/svelte/actions/dragDrop.js` is drop-only. A dragged row must
 * emit a `dropCanvasData`-compatible payload that round-trips through
 * `classifyInteractableDrop` (in `interactableResolution.js`) to the correct
 * `interactableType` + ids. This module shapes that payload purely so the
 * contract is unit-testable without a DOM/DataTransfer.
 *
 * Foundry's canvas drop pipeline reads the dragged JSON from the
 * `text/plain` DataTransfer entry, augments it with the scene-space `x`/`y`
 * (and modifier flags), and passes it to the `dropCanvasData` hook. So the
 * payload only needs to carry the discriminating `fabricate` block; the canvas
 * supplies the coordinates. `classifyInteractableDrop` reads `data.fabricate`
 * and expects `{ interactableType: 'tool'|'gatheringTask', systemId, toolId|taskId }`.
 *
 * A top-level `type` is included so the drag reads as a recognizable Foundry
 * drag payload, but classification keys ONLY off `data.fabricate` — the `type`
 * is cosmetic for the drop side.
 */

export const INTERACTABLE_DRAG_TYPE = 'fabricate-interactable';

/**
 * Build the `dropCanvasData`-compatible drag payload for a browser row.
 *
 * @param {object} params
 * @param {'tool'|'gatheringTask'} params.interactableType
 * @param {string} params.systemId   Owning crafting system id.
 * @param {string} params.referenceId  Library Tool id (tool) or Task id (gatheringTask).
 * @returns {{ type: string, fabricate: { interactableType: string, systemId: string,
 *   toolId?: string, taskId?: string } } | null}  Null when the inputs are invalid.
 */
export function buildInteractableDragPayload({ interactableType, systemId, referenceId } = {}) {
  const sysId = typeof systemId === 'string' ? systemId.trim() : '';
  const refId = typeof referenceId === 'string' ? referenceId.trim() : '';
  if (!sysId || !refId) return null;

  if (interactableType === 'tool') {
    return {
      type: INTERACTABLE_DRAG_TYPE,
      fabricate: { interactableType: 'tool', systemId: sysId, toolId: refId }
    };
  }
  if (interactableType === 'gatheringTask') {
    return {
      type: INTERACTABLE_DRAG_TYPE,
      fabricate: { interactableType: 'gatheringTask', systemId: sysId, taskId: refId }
    };
  }
  return null;
}

/**
 * Serialize a drag payload for `DataTransfer.setData('text/plain', …)`.
 *
 * Returns `''` for an unbuildable payload so the dragstart handler can decline
 * to start a drag.
 *
 * @param {object} params  See {@link buildInteractableDragPayload}.
 * @returns {string}
 */
export function serializeInteractableDragPayload(params) {
  const payload = buildInteractableDragPayload(params);
  return payload ? JSON.stringify(payload) : '';
}
