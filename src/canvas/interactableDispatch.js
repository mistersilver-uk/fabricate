/**
 * Pure double-click dispatch routing for canvas Interactables.
 *
 * `_onDoubleClick` on the InteractableManager reads a tile's interactable flags
 * and routes by type. The ROUTING DECISION (what handler to call and the payload
 * it receives) is pure and lives here, so unit tests can exercise it without a
 * live Foundry canvas or PIXI interaction events.
 *
 * The routes resolve to the app-open behavior:
 *   - tool          → SvelteFabricateApp.show('gathering', { activeCanvasTool })
 *   - gatheringTask → SvelteFabricateApp.show('gathering', { environmentId, … })
 */

import { readInteractableTileFlags } from './interactableTileFlags.js';
import { parseInteractableSourceUuid } from './interactableResolution.js';

/**
 * Compute the dispatch descriptor for a double-clicked tile, or `null` when the
 * tile is not a Fabricate Interactable (so the hook can no-op).
 *
 * @param {object} tile   Tile document or plain object carrying `flags.fabricate`.
 * @returns {{ interactableType: 'tool'|'gatheringTask', sourceUuid: string,
 *   systemId: string|null, referenceId: string|null, environmentId: string|null,
 *   node: object|null } | null}
 */
export function describeInteractableDispatch(tile) {
  const flags = readInteractableTileFlags(tile);
  if (!flags) return null;
  const parsed = parseInteractableSourceUuid(flags.sourceUuid);
  return {
    interactableType: flags.interactableType,
    sourceUuid: flags.sourceUuid,
    systemId: parsed?.systemId ?? null,
    referenceId: parsed?.referenceId ?? null,
    environmentId: flags.environmentId ?? null,
    node: flags.node ?? null
  };
}

/**
 * Route a double-clicked interactable tile to the matching injected handler.
 *
 * Pure aside from the injected side-effecting handlers. Returns the descriptor
 * that was dispatched (or `null` when the tile is not an interactable / no
 * handler matched), so callers/tests can assert the routing decision.
 *
 * @param {object} tile
 * @param {object} handlers
 * @param {(descriptor: object) => void} [handlers.onTool]
 * @param {(descriptor: object) => void} [handlers.onGatheringTask]
 * @returns {object|null} The dispatched descriptor, or null.
 */
export function dispatchInteractableDoubleClick(tile, { onTool, onGatheringTask } = {}) {
  const descriptor = describeInteractableDispatch(tile);
  if (!descriptor) return null;

  if (descriptor.interactableType === 'tool') {
    onTool?.(descriptor);
    return descriptor;
  }
  if (descriptor.interactableType === 'gatheringTask') {
    onGatheringTask?.(descriptor);
    return descriptor;
  }
  return null;
}
