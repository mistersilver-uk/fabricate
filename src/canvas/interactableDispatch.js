/**
 * Pure double-click dispatch routing for canvas Interactables.
 *
 * `_onDoubleClick` on the InteractableManager reads a token's interactable flags
 * and routes by type. The ROUTING DECISION (what handler to call and the payload
 * it receives) is pure and lives here, so unit tests can exercise it without a
 * live Foundry canvas or PIXI interaction events.
 *
 * Phase 3 wires the routes to injected stub handlers (log/no-op). Phases 4 and 5
 * replace those handlers with the real app-open behavior:
 *   - tool          → SvelteFabricateApp.show('crafting', { activeCanvasTool })   (Phase 4)
 *   - gatheringTask → SvelteFabricateApp.show('gathering', { environmentId, … })  (Phase 5)
 */

import { readInteractableFlags } from './interactableTokenFlags.js';
import { parseInteractableSourceUuid } from './interactableResolution.js';

/**
 * Compute the dispatch descriptor for a double-clicked token, or `null` when the
 * token is not a Fabricate Interactable (so the hook can no-op).
 *
 * @param {object} token   Token document or plain object carrying `flags.fabricate`.
 * @returns {{ interactableType: 'tool'|'gatheringTask', sourceUuid: string,
 *   systemId: string|null, referenceId: string|null, environmentId: string|null,
 *   node: object|null } | null}
 */
export function describeInteractableDispatch(token) {
  const flags = readInteractableFlags(token);
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
 * Route a double-clicked interactable token to the matching injected handler.
 *
 * Pure aside from the injected side-effecting handlers. Returns the descriptor
 * that was dispatched (or `null` when the token is not an interactable / no
 * handler matched), so callers/tests can assert the routing decision.
 *
 * @param {object} token
 * @param {object} handlers
 * @param {(descriptor: object) => void} [handlers.onTool]
 * @param {(descriptor: object) => void} [handlers.onGatheringTask]
 * @returns {object|null} The dispatched descriptor, or null.
 */
export function dispatchInteractableDoubleClick(token, { onTool, onGatheringTask } = {}) {
  const descriptor = describeInteractableDispatch(token);
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
