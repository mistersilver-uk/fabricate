/**
 * Pure helpers for the Fabricate Interactable token flag block.
 *
 * A Fabricate Interactable is a Foundry Token (not a Tile) whose per-Interactable
 * data lives under `token.flags.fabricate`. These helpers build and read that
 * block with no Foundry globals, so the shape is unit-testable in isolation.
 *
 * Schema (see data-models spec — Interactable Token Flags):
 *   flags.fabricate = {
 *     isInteractable: true,
 *     interactableType: 'tool' | 'gatheringTask',
 *     sourceUuid: string,         // the Fabricate Tool / Gathering Task source identity
 *     environmentId?: string,     // resolved at drop (gatheringTask only)
 *     node?: object,              // gatheringTask only; per-token node state (Phase 5)
 *     nodeOriginal?: object,      // captured pre-depleted-behavior token state (Phase 6)
 *   }
 *
 * Phase 3 owns `isInteractable`, `interactableType`, `sourceUuid`, and
 * `environmentId`; `node` / `nodeOriginal` are added in later phases and are
 * round-tripped here when present so the builder stays forward-compatible.
 */

export const INTERACTABLE_TYPES = Object.freeze(['tool', 'gatheringTask']);

function coerceString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Build the `flags.fabricate` block for an Interactable token.
 *
 * Only known fields are emitted, and optional fields are omitted (not set to
 * `undefined`/`null`) so the persisted flag block stays minimal. `environmentId`
 * is only meaningful for gathering-task interactables; it is dropped for tool
 * interactables. `node` / `nodeOriginal` are round-tripped verbatim when supplied
 * (later phases populate them).
 *
 * @param {object} params
 * @param {'tool'|'gatheringTask'} params.interactableType
 * @param {string} params.sourceUuid                  Fabricate Tool / Gathering Task source identity.
 * @param {string} [params.environmentId]             Resolved environment (gatheringTask only).
 * @param {object} [params.node]                      Per-token node state (gatheringTask only; Phase 5).
 * @param {object} [params.nodeOriginal]              Captured token state (Phase 6).
 * @returns {{ fabricate: object }} The `token.flags` fragment to merge on creation.
 */
export function buildInteractableFlags({
  interactableType,
  sourceUuid,
  environmentId,
  node,
  nodeOriginal
} = {}) {
  if (!INTERACTABLE_TYPES.includes(interactableType)) {
    throw new Error(`Unknown interactableType "${interactableType}"`);
  }
  const source = coerceString(sourceUuid);
  if (!source) {
    throw new Error('buildInteractableFlags requires a non-empty sourceUuid');
  }

  const fabricate = {
    isInteractable: true,
    interactableType,
    sourceUuid: source
  };

  // environmentId only applies to gathering-task interactables.
  if (interactableType === 'gatheringTask') {
    const env = coerceString(environmentId);
    if (env) fabricate.environmentId = env;
    if (node !== undefined && node !== null) fabricate.node = node;
    if (nodeOriginal !== undefined && nodeOriginal !== null) fabricate.nodeOriginal = nodeOriginal;
  }

  return { fabricate };
}

/**
 * Read the `flags.fabricate` Interactable block from a token (document or plain
 * object). Returns `null` when the token is not a Fabricate Interactable.
 *
 * Accepts both a live `TokenDocument` (with a `flags` property) and a plain
 * object, so callers can pass either without a Foundry dependency.
 *
 * @param {object} token
 * @returns {{ isInteractable: true, interactableType: string, sourceUuid: string,
 *   environmentId?: string, node?: object, nodeOriginal?: object } | null}
 */
export function readInteractableFlags(token) {
  const block = token?.flags?.fabricate;
  if (!block || typeof block !== 'object') return null;
  if (block.isInteractable !== true) return null;
  if (!INTERACTABLE_TYPES.includes(block.interactableType)) return null;
  const sourceUuid = coerceString(block.sourceUuid);
  if (!sourceUuid) return null;

  const result = {
    isInteractable: true,
    interactableType: block.interactableType,
    sourceUuid
  };
  if (typeof block.environmentId === 'string' && block.environmentId) {
    result.environmentId = block.environmentId;
  }
  if (block.node !== undefined && block.node !== null) result.node = block.node;
  if (block.nodeOriginal !== undefined && block.nodeOriginal !== null) {
    result.nodeOriginal = block.nodeOriginal;
  }
  return result;
}

/**
 * Predicate: is this token a Fabricate Interactable?
 *
 * @param {object} token
 * @returns {boolean}
 */
export function isInteractableToken(token) {
  return readInteractableFlags(token) !== null;
}

/**
 * Read the interactable type of a token, or `null` when it is not an Interactable.
 *
 * @param {object} token
 * @returns {'tool'|'gatheringTask'|null}
 */
export function interactableTypeOf(token) {
  return readInteractableFlags(token)?.interactableType ?? null;
}
